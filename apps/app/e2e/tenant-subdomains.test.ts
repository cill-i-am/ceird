import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

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
import { readPlaywrightDatabaseUrl } from "./test-urls";

type CookieJar = Map<string, string>;

const ORGANIZATION_NAME = "Preview Tenant Health";
const apiRequire = createRequire(
  new URL("../../api/package.json", import.meta.url)
);

interface PgQueryResult<T> {
  readonly rows: T[];
}

interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T>(
    text: string,
    values?: readonly unknown[]
  ): Promise<PgQueryResult<T>>;
}

type PgClientConstructor = new (options: {
  readonly connectionString: string;
}) => PgClient;

const { Client: PgClient } = apiRequire("pg") as {
  readonly Client: PgClientConstructor;
};

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

  return `tenant-health-${randomUUID()}@example.com`;
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

async function ensureTenantOrganizationMembership(input: {
  readonly email: string;
  readonly organizationSlug: string;
}) {
  const client = new PgClient({
    connectionString: readPlaywrightDatabaseUrl(),
  });

  await client.connect();

  try {
    const organizationResult = await client.query<{ readonly id: string }>(
      `select id
       from organization
       where slug = $1
       limit 1`,
      [input.organizationSlug]
    );
    const organizationId = organizationResult.rows[0]?.id;

    if (!organizationId) {
      return null;
    }

    const userResult = await client.query<{ readonly id: string }>(
      `select id
       from "user"
       where email = $1
       limit 1`,
      [input.email]
    );
    const userId = userResult.rows[0]?.id;

    if (!userId) {
      throw new Error(`Expected tenant test user ${input.email} to exist.`);
    }

    await client.query(
      `insert into member (id, organization_id, user_id, role, created_at)
       values ($1, $2, $3, 'owner', now())
       on conflict (organization_id, user_id) do update
       set role = excluded.role`,
      [randomUUID(), organizationId, userId]
    );

    return organizationId;
  } finally {
    await client.end();
  }
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

  if (!signupResponse.ok()) {
    throw new Error(
      `Auth request /sign-up/email failed with ${signupResponse.status()}: ${await signupResponse.text()}`
    );
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

  if (!createOrganizationResponse.ok()) {
    const existingOrganizationId = await ensureTenantOrganizationMembership({
      email,
      organizationSlug,
    });

    if (!existingOrganizationId) {
      throw new Error(
        `Auth request /organization/create failed with ${createOrganizationResponse.status()}: ${await createOrganizationResponse.text()}`
      );
    }

    await sendAuthRequest(request, "/organization/set-active", {
      body: {
        organizationId: existingOrganizationId,
      },
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

  await createAuthenticatedOrganizationSession(request, page);
  await page.goto(TENANT_ORIGIN);

  await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(TENANT_ORIGIN)}`));
  const workspaceHome = page.getByRole("main", { name: "Workspace home" });

  await expect(workspaceHome).toBeVisible({ timeout: 20_000 });
  await expect(
    workspaceHome.getByRole("heading", { level: 1, name: "Home" })
  ).toBeVisible();
});
