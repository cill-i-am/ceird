import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

import { MembersPage } from "./pages/members-page";
import { SignupPage } from "./pages/signup-page";
import { API_ORIGIN, APP_ORIGIN, readPlaywrightDatabaseUrl } from "./test-urls";

type CookieJar = Map<string, string>;

const INVITATION_FLOW_TIMEOUT_MS = 90_000;
const INVITATION_UI_TIMEOUT_MS = 30_000;
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

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function createTestSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function createForwardedFor() {
  const octets = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 200 + 20)
  );

  return octets.join(".");
}

async function expectAuthenticatedHome(page: Page) {
  const workspaceHome = page.getByRole("main", { name: "Workspace home" });

  await expect(page).toHaveURL(`${APP_ORIGIN}/`, { timeout: 20_000 });
  await expect(workspaceHome).toBeVisible({ timeout: 15_000 });
  await expect(workspaceHome.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Jobs" })
  ).toBeVisible();
  await expect(
    workspaceHome.getByRole("link", { exact: true, name: "Invite teammate" })
  ).toBeVisible();
}

async function getCookieHeader(page: Page) {
  const cookies = await page.context().cookies();

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
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

async function sendAuthRequest(
  request: APIRequestContext,
  routePath: string,
  options?: {
    readonly body?: Record<string, unknown>;
    readonly cookieJar?: CookieJar;
    readonly forwardedFor?: string;
    readonly method?: "GET" | "POST";
    readonly origin?: string;
  }
) {
  const headers: Record<string, string> = {
    accept: "application/json",
    origin: options?.origin ?? APP_ORIGIN,
  };

  if (options?.body) {
    headers["content-type"] = "application/json";
  }

  if (options?.cookieJar && options.cookieJar.size > 0) {
    headers.cookie = [...options.cookieJar.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  if (options?.forwardedFor) {
    headers["x-forwarded-for"] = options.forwardedFor;
  }

  const response = await request.fetch(`${API_ORIGIN}/api/auth${routePath}`, {
    method: options?.method ?? (options?.body ? "POST" : "GET"),
    headers,
    data: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (options?.cookieJar) {
    updateCookieJarFromResponse(options.cookieJar, response);
  }

  if (!response.ok()) {
    throw new Error(
      `Auth request ${routePath} failed with ${response.status()}: ${await response.text()}`
    );
  }

  return response;
}

async function syncCookieJarToPage(page: Page, cookieJar: CookieJar) {
  const cookies = [...cookieJar.entries()].flatMap(([name, value]) => [
    {
      name,
      url: APP_ORIGIN,
      value,
    },
    {
      name,
      url: API_ORIGIN,
      value,
    },
  ]);

  await page.context().addCookies(cookies);
}

async function createCookieJarFromPage(page: Page) {
  const cookieJar = new Map<string, string>();

  for (const cookie of await page.context().cookies()) {
    cookieJar.set(cookie.name, cookie.value);
  }

  return cookieJar;
}

async function signInInvitationContext(
  request: APIRequestContext,
  page: Page,
  email: string,
  password: string
) {
  const cookieJar = await createSignedInCookieJar(request, email, password);

  await page.context().clearCookies();
  await syncCookieJarToPage(page, cookieJar);
}

async function createSignedInCookieJar(
  request: APIRequestContext,
  email: string,
  password: string
) {
  const cookieJar = new Map<string, string>();

  await sendAuthRequest(request, "/sign-in/email", {
    body: {
      email,
      password,
    },
    cookieJar,
    forwardedFor: createForwardedFor(),
  });

  return cookieJar;
}

async function markUserEmailVerified(email: string) {
  const client = new PgClient({
    connectionString: readPlaywrightDatabaseUrl(),
  });

  await client.connect();

  try {
    const result = await client.query<{ readonly id: string }>(
      `update "user"
       set email_verified = true
       where email = $1
       returning id`,
      [email]
    );

    if (!result.rows[0]) {
      throw new Error(`Expected to verify test user ${email}`);
    }
  } finally {
    await client.end();
  }
}

async function acceptInvitationWithCurrentSession(
  request: APIRequestContext,
  page: Page,
  invitationId: string
) {
  const cookieJar = await createCookieJarFromPage(page);

  const acceptInvitationResponse = await sendAuthRequest(
    request,
    "/organization/accept-invitation",
    {
      body: {
        invitationId,
      },
      cookieJar,
    }
  );
  const acceptInvitationPayload = (await acceptInvitationResponse.json()) as {
    readonly member?: {
      readonly organizationId?: unknown;
    };
  };
  const acceptedOrganizationId = acceptInvitationPayload.member?.organizationId;

  if (typeof acceptedOrganizationId !== "string") {
    throw new TypeError(
      "Expected accepted invitation response to include an organization id."
    );
  }

  await sendAuthRequest(request, "/organization/set-active", {
    body: {
      organizationId: acceptedOrganizationId,
    },
    cookieJar,
  });
  await syncCookieJarToPage(page, cookieJar);
}

async function seedUser(
  request: APIRequestContext,
  input: {
    readonly email: string;
    readonly password: string;
    readonly name: string;
  }
) {
  await sendAuthRequest(request, "/sign-up/email", {
    body: {
      email: input.email,
      name: input.name,
      password: input.password,
    },
    cookieJar: new Map(),
    forwardedFor: createForwardedFor(),
  });
}

async function seedOwnerOrganization(
  request: APIRequestContext,
  input: {
    readonly email: string;
    readonly password: string;
  }
) {
  const forwardedFor = createForwardedFor();
  const cookieJar = new Map<string, string>();

  await sendAuthRequest(request, "/sign-up/email", {
    body: {
      email: input.email,
      name: "Owner Example",
      password: input.password,
    },
    cookieJar,
    forwardedFor,
  });
  const organizationResponse = await sendAuthRequest(
    request,
    "/organization/create",
    {
      body: {
        name: "Acme Field Ops",
        slug: createTestSlug("acme-field-ops"),
      },
      cookieJar,
      forwardedFor,
    }
  );
  const organizationPayload = (await organizationResponse.json()) as {
    readonly id?: unknown;
  };

  if (typeof organizationPayload.id !== "string") {
    throw new TypeError(
      "Expected created organization response to include an id."
    );
  }

  return organizationPayload.id;
}

async function findInvitationIdForEmail(
  request: APIRequestContext,
  page: Page,
  email: string
) {
  const cookie = await getCookieHeader(page);
  const response = await request.get(
    `${API_ORIGIN}/api/auth/organization/list-invitations`,
    {
      headers: {
        accept: "application/json",
        cookie,
      },
    }
  );

  if (!response.ok()) {
    return null;
  }

  const invitations = (await response.json()) as {
    email: string;
    id: string;
    status: string;
  }[];

  const invitation = invitations.find(
    (currentInvitation) =>
      currentInvitation.email === email &&
      currentInvitation.status === "pending"
  );

  return invitation?.id ?? null;
}

async function getInvitationIdForEmail(
  request: APIRequestContext,
  page: Page,
  email: string
) {
  let invitationId: string | null = null;

  await expect
    .poll(
      async () => {
        invitationId = await findInvitationIdForEmail(request, page, email);

        return invitationId;
      },
      {
        message: `pending invitation for ${email}`,
        timeout: 15_000,
      }
    )
    .not.toBeNull();

  if (!invitationId) {
    throw new Error(`Expected a pending invitation for ${email}`);
  }

  return invitationId;
}

async function expectPublicInvitationPreviewReady(
  request: APIRequestContext,
  invitationId: string
) {
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${API_ORIGIN}/api/public/invitations/${encodeURIComponent(invitationId)}/preview`,
          {
            headers: {
              accept: "application/json",
            },
          }
        );

        if (!response.ok()) {
          return null;
        }

        return (await response.json()) as {
          readonly organizationName?: string;
        } | null;
      },
      {
        message: "public invitation preview is ready",
        timeout: 15_000,
      }
    )
    .toMatchObject({
      organizationName: "Acme Field Ops",
    });
}

async function createOwnerOrganization(
  request: APIRequestContext,
  page: Page,
  ownerEmail: string,
  ownerPassword: string
) {
  const organizationId = await seedOwnerOrganization(request, {
    email: ownerEmail,
    password: ownerPassword,
  });
  const ownerCookieJar = await createSignedInCookieJar(
    request,
    ownerEmail,
    ownerPassword
  );

  await sendAuthRequest(request, "/organization/set-active", {
    body: {
      organizationId,
    },
    cookieJar: ownerCookieJar,
    forwardedFor: createForwardedFor(),
  });
  await page.context().clearCookies();
  await syncCookieJarToPage(page, ownerCookieJar);
  await page.goto("/");
  await expectAuthenticatedHome(page);
}

async function createExistingUser(
  request: APIRequestContext,
  email: string,
  password: string,
  name = "Existing Invitee"
) {
  await seedUser(request, {
    email,
    password,
    name,
  });
  await markUserEmailVerified(email);
}

async function inviteMemberFromMembersPage(
  page: Page,
  request: APIRequestContext,
  email: string
) {
  const membersPage = new MembersPage(page);
  await membersPage.openFromNavigation();
  await membersPage.openInviteDialog();
  await membersPage.email.fill(email);
  await membersPage.submit.click();

  const invitationId = await getInvitationIdForEmail(request, page, email);

  await expect(membersPage.pendingInvitation(email)).toBeVisible({
    timeout: 15_000,
  });

  return invitationId;
}

test.describe("organization invitations", () => {
  test.describe.configure({
    mode: "serial",
    timeout: INVITATION_FLOW_TIMEOUT_MS,
  });

  test("a new user can sign up from the invitation and accept it", async ({
    browser,
    page,
    request,
  }) => {
    const ownerEmail = createTestEmail("invite-owner");
    const ownerPassword = "password123";
    const invitedEmail = createTestEmail("invitee-signup");

    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);

    const invitationId = await inviteMemberFromMembersPage(
      page,
      request,
      invitedEmail
    );
    await expectPublicInvitationPreviewReady(request, invitationId);
    // The isolated browser context has to exist before the invited page can be opened.
    // react-doctor-disable-next-line
    const invitedContext = await browser.newContext();
    try {
      const invitedPage = await invitedContext.newPage();
      const invitedSignupPage = new SignupPage(invitedPage);

      await invitedPage.goto(`/accept-invitation/${invitationId}`);
      await expect(
        invitedPage.getByRole("heading", { name: "Join Acme Field Ops" })
      ).toBeVisible({ timeout: INVITATION_UI_TIMEOUT_MS });
      await expect(
        invitedPage.getByRole("link", { name: "Sign in" })
      ).toBeVisible();
      await expect(
        invitedPage.getByRole("link", { name: "Create account" })
      ).toBeVisible();
      await invitedPage.getByRole("link", { name: "Create account" }).click();

      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/signup?invitation=${invitationId}`
      );
      await invitedSignupPage.name.fill("Invited Example");
      await invitedSignupPage.email.fill(invitedEmail);
      await invitedSignupPage.password.fill("password123");
      await invitedSignupPage.submit.click();

      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/accept-invitation/${invitationId}`,
        { timeout: INVITATION_UI_TIMEOUT_MS }
      );
      await markUserEmailVerified(invitedEmail);
      await signInInvitationContext(
        request,
        invitedPage,
        invitedEmail,
        "password123"
      );
      await acceptInvitationWithCurrentSession(
        request,
        invitedPage,
        invitationId
      );
      await invitedPage.goto("/");

      await expectAuthenticatedHome(invitedPage);
    } finally {
      await invitedContext.close();
    }
  });

  test("an existing user can sign in from the invitation and accept it", async ({
    browser,
    page,
    request,
  }) => {
    const ownerEmail = createTestEmail("invite-owner-existing");
    const ownerPassword = "password123";
    const invitedEmail = createTestEmail("invitee-login");
    const invitedPassword = "password123";

    await createExistingUser(request, invitedEmail, invitedPassword);

    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);

    const invitationId = await inviteMemberFromMembersPage(
      page,
      request,
      invitedEmail
    );
    // The isolated browser context has to exist before the invited page can be opened.
    // react-doctor-disable-next-line
    const invitedContext = await browser.newContext();
    try {
      const invitedPage = await invitedContext.newPage();

      await invitedPage.goto(`/accept-invitation/${invitationId}`);
      await invitedPage.getByRole("link", { name: "Sign in" }).click();

      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/login?invitation=${invitationId}`
      );

      await signInInvitationContext(
        request,
        invitedPage,
        invitedEmail,
        invitedPassword
      );
      await invitedPage.goto(`/accept-invitation/${invitationId}`);
      await invitedPage
        .getByRole("button", { name: "Accept invitation" })
        .click();

      await expectAuthenticatedHome(invitedPage);
    } finally {
      await invitedContext.close();
    }
  });

  test("a non-admin member cannot access the members page", async ({
    browser,
    page,
    request,
  }) => {
    const ownerEmail = createTestEmail("invite-owner-member-access");
    const ownerPassword = "password123";
    const invitedEmail = createTestEmail("invitee-member-access");
    const invitedPassword = "password123";

    await createExistingUser(request, invitedEmail, invitedPassword);
    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);

    const invitationId = await inviteMemberFromMembersPage(
      page,
      request,
      invitedEmail
    );

    // The isolated browser context has to exist before the invited page can be opened.
    // react-doctor-disable-next-line
    const invitedContext = await browser.newContext();
    try {
      const invitedPage = await invitedContext.newPage();

      await signInInvitationContext(
        request,
        invitedPage,
        invitedEmail,
        invitedPassword
      );
      await invitedPage.goto(`/accept-invitation/${invitationId}`);
      await invitedPage
        .getByRole("button", { name: "Accept invitation" })
        .click();

      await expectAuthenticatedHome(invitedPage);
      await expect(
        invitedPage.getByRole("link", { name: "Members", exact: true })
      ).not.toBeVisible();
      await invitedPage.goto("/members");
      await expectAuthenticatedHome(invitedPage);
      await expect(
        invitedPage.getByRole("button", { name: "Send invite" })
      ).not.toBeVisible();
    } finally {
      await invitedContext.close();
    }
  });

  test("the invite flow preserves continuation through forgot-password", async ({
    browser,
    page,
    request,
  }) => {
    const ownerEmail = createTestEmail("invite-owner-forgot-password");
    const ownerPassword = "password123";
    const invitedEmail = createTestEmail("invitee-forgot-password");
    const invitedPassword = "password123";

    await createExistingUser(request, invitedEmail, invitedPassword);
    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);

    const invitationId = await inviteMemberFromMembersPage(
      page,
      request,
      invitedEmail
    );

    // The isolated browser context has to exist before the invited page can be opened.
    // react-doctor-disable-next-line
    const invitedContext = await browser.newContext();
    try {
      const invitedPage = await invitedContext.newPage();

      await invitedPage.goto(`/accept-invitation/${invitationId}`);
      await invitedPage.getByRole("link", { name: "Sign in" }).click();
      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/login?invitation=${invitationId}`
      );

      await invitedPage.getByRole("link", { name: "Forgot password?" }).click();
      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/forgot-password?invitation=${invitationId}`
      );

      const backToLogin = invitedPage.getByRole("link", {
        name: "Back to login",
      });
      await expect(backToLogin).toHaveAttribute(
        "href",
        `/login?invitation=${invitationId}`
      );

      await backToLogin.click();
      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/login?invitation=${invitationId}`
      );
    } finally {
      await invitedContext.close();
    }
  });

  test("the invite page lets a signed-in wrong account recover by switching accounts", async ({
    browser,
    page,
    request,
  }) => {
    const ownerEmail = createTestEmail("invite-owner-wrong-account");
    const ownerPassword = "password123";
    const invitedEmail = createTestEmail("invitee-wrong-account");
    const invitedPassword = "password123";
    const wrongAccountEmail = createTestEmail("wrong-account");
    const wrongAccountPassword = "password123";

    await createExistingUser(
      request,
      invitedEmail,
      invitedPassword,
      "Invited User"
    );
    await createExistingUser(
      request,
      wrongAccountEmail,
      wrongAccountPassword,
      "Wrong Account"
    );
    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);

    const invitationId = await inviteMemberFromMembersPage(
      page,
      request,
      invitedEmail
    );

    const invitedContext = await browser.newContext();
    try {
      const invitedPage = await invitedContext.newPage();

      await signInInvitationContext(
        request,
        invitedPage,
        wrongAccountEmail,
        wrongAccountPassword
      );
      await invitedPage.goto(`/accept-invitation/${invitationId}`);
      await expect(
        invitedPage.getByText(
          /This invitation is unavailable\. Sign in with the invited email address or ask for a fresh invite\./i
        )
      ).toBeVisible();
      await invitedPage
        .getByRole("button", { name: "Sign out and try another account" })
        .click();

      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/login?invitation=${invitationId}`
      );
      await expect(
        invitedPage.locator('[data-slot="card-title"]', { hasText: "Sign in" })
      ).toBeVisible();
    } finally {
      await invitedContext.close();
    }
  });

  test("the members page shows a load error instead of an empty invitation state when listing fails", async ({
    page,
    request,
  }) => {
    const ownerEmail = createTestEmail("invite-owner-load-error");
    const ownerPassword = "password123";

    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);
    await page.route(
      "**/api/auth/organization/list-invitations**",
      async (route) => {
        await route.fulfill({
          status: 500,
          body: JSON.stringify({
            error: {
              message: "Forced failure for e2e coverage",
            },
          }),
          contentType: "application/json",
        });
      }
    );

    const membersPage = new MembersPage(page);
    await membersPage.openFromNavigation();

    await expect(
      page.getByText(
        /We couldn't load invitations right now\. Please try again\./i
      )
    ).toBeVisible();
    await expect(
      page.getByText("No pending invitations yet.")
    ).not.toBeVisible();

    await page.unroute("**/api/auth/organization/list-invitations**");
  });
});
