import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

import { markUserEmailVerified } from "./helpers/email-verification";
import { createTestPassword } from "./helpers/test-account";
import {
  API_ORIGIN,
  APP_ORIGIN,
  deriveTenantOrganizationSlug,
  TENANT_ORIGIN,
  USE_PACKAGE_LOCAL_SERVER,
} from "./test-origins";

type CookieJar = Map<string, string>;

const ORGANIZATION_NAME = "Preview Tenant Health";

test.skip(
  USE_PACKAGE_LOCAL_SERVER,
  "tenant subdomains are disabled for package-local server mode"
);
test.skip(
  !TENANT_ORIGIN,
  "PLAYWRIGHT_TENANT_URL is required for tenant subdomain e2e"
);

function createTenantHealthEmail() {
  if (!TENANT_ORIGIN) {
    throw new Error("PLAYWRIGHT_TENANT_URL is required.");
  }

  const tenantHash = createHash("sha256")
    .update(TENANT_ORIGIN)
    .digest("hex")
    .slice(0, 12);

  return `tenant-health-${tenantHash}@example.com`;
}

function createForwardedFor() {
  const octets = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 200 + 20)
  );

  return octets.join(".");
}

function updateCookieJarFromResponse(
  cookieJar: CookieJar,
  response: Awaited<ReturnType<APIRequestContext["fetch"]>>
) {
  for (const header of response.headersArray()) {
    if (header.name.toLowerCase() !== "set-cookie") {
      continue;
    }

    const [cookie] = header.value.split(";", 1);

    if (!cookie) {
      continue;
    }

    const [name, value] = cookie.split("=", 2);

    if (!name || value === undefined) {
      continue;
    }

    cookieJar.set(name, value);
  }
}

async function fetchAuthRequest(
  request: APIRequestContext,
  routePath: string,
  options: {
    readonly body?: Record<string, unknown>;
    readonly cookieJar: CookieJar;
    readonly forwardedFor: string;
  }
) {
  const headers: Record<string, string> = {
    accept: "application/json",
    origin: APP_ORIGIN,
    "x-forwarded-for": options.forwardedFor,
  };

  if (options.body) {
    headers["content-type"] = "application/json";
  }

  if (options.cookieJar.size > 0) {
    headers.cookie = [...options.cookieJar.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  const response = await request.fetch(`${API_ORIGIN}/api/auth${routePath}`, {
    method: options.body ? "POST" : "GET",
    headers,
    data: options.body ? JSON.stringify(options.body) : undefined,
  });

  updateCookieJarFromResponse(options.cookieJar, response);

  return response;
}

async function sendAuthRequest(
  request: APIRequestContext,
  routePath: string,
  options: {
    readonly body?: Record<string, unknown>;
    readonly cookieJar: CookieJar;
    readonly forwardedFor: string;
  }
) {
  const response = await fetchAuthRequest(request, routePath, options);

  if (!response.ok()) {
    throw new Error(
      `Auth request ${routePath} failed with ${response.status()}: ${await response.text()}`
    );
  }

  return response;
}

async function createAuthenticatedOrganizationSession(
  request: APIRequestContext,
  page: Page
) {
  if (!TENANT_ORIGIN) {
    throw new Error("PLAYWRIGHT_TENANT_URL is required.");
  }

  const cookieJar = new Map<string, string>();
  const forwardedFor = createForwardedFor();
  const email = createTenantHealthEmail();
  const organizationSlug = deriveTenantOrganizationSlug(TENANT_ORIGIN);
  const password = createTestPassword("CeirdTenantE2E");

  const signupResponse = await fetchAuthRequest(request, "/sign-up/email", {
    body: {
      email,
      name: "Tenant Example",
      password,
    },
    cookieJar,
    forwardedFor,
  });
  const didCreateUser = signupResponse.ok();

  if (!didCreateUser) {
    cookieJar.clear();
    await sendAuthRequest(request, "/sign-in/email", {
      body: {
        email,
        password,
      },
      cookieJar,
      forwardedFor,
    });
  }
  await markUserEmailVerified(email);

  const createOrganizationResponse = await fetchAuthRequest(
    request,
    "/organization/create",
    {
      body: {
        name: ORGANIZATION_NAME,
        slug: organizationSlug,
      },
      cookieJar,
      forwardedFor,
    }
  );

  if (didCreateUser && !createOrganizationResponse.ok()) {
    throw new Error(
      `Auth request /organization/create failed with ${createOrganizationResponse.status()}: ${await createOrganizationResponse.text()}`
    );
  }

  if (!didCreateUser && !createOrganizationResponse.ok()) {
    await sendAuthRequest(request, "/get-session", {
      cookieJar,
      forwardedFor,
    });
  }

  await page.context().addCookies(
    [...cookieJar.entries()].flatMap(([name, value]) => [
      { name, url: APP_ORIGIN, value },
      { name, url: API_ORIGIN, value },
      { name, url: TENANT_ORIGIN, value },
    ])
  );
}

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

test("created organization can be opened on the tenant host", async ({
  page,
  request,
}) => {
  if (!TENANT_ORIGIN) {
    throw new Error("PLAYWRIGHT_TENANT_URL is required.");
  }

  const organizationSlug = deriveTenantOrganizationSlug(TENANT_ORIGIN);
  await createAuthenticatedOrganizationSession(request, page);
  await page.goto(TENANT_ORIGIN);

  await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(TENANT_ORIGIN)}`));
  const workspaceHome = page.getByRole("main", { name: "Workspace home" });

  await expect(workspaceHome).toBeVisible({ timeout: 20_000 });
  await expect(
    workspaceHome.getByText(`${ORGANIZATION_NAME} / @${organizationSlug}`, {
      exact: true,
    })
  ).toBeVisible();
});
