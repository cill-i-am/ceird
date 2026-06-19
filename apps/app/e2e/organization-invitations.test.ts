import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import {
  appendOrganizationSlugSuffix,
  decodeAcceptedOrganizationId,
  decodePublicInvitationPreview,
  InviteOrganizationMemberResponseSchema,
  OrganizationId,
  OrganizationInvitationListResponseSchema,
  OrganizationNameSchema,
  OrganizationRole,
  OrganizationSlugSchema,
} from "@ceird/identity-core";
import { expect, test } from "@playwright/test";
import type {
  APIRequestContext,
  Page,
  Response as PlaywrightResponse,
} from "@playwright/test";
import { Schema } from "effect";

import { createTestPassword } from "./helpers/test-account";
import { skipLocationAccessBeforeExpectedPage } from "./pages/location-access-page";
import { LoginPage } from "./pages/login-page";
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
const decodeOrganizationInvitationListResponse = Schema.decodeUnknownSync(
  OrganizationInvitationListResponseSchema
);
const decodeInviteOrganizationMemberResponse = Schema.decodeUnknownSync(
  InviteOrganizationMemberResponseSchema
);
const CreatedOrganizationResponseSchema = Schema.Struct({
  id: OrganizationId,
  members: Schema.Array(
    Schema.Struct({
      organizationId: OrganizationId,
      role: OrganizationRole,
    }).annotate({
      parseOptions: { onExcessProperty: "error" },
    })
  ),
  name: OrganizationNameSchema,
  slug: OrganizationSlugSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
const decodeCreatedOrganizationResponse = Schema.decodeUnknownSync(
  CreatedOrganizationResponseSchema
);

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function createTestSlug(prefix: string): string {
  return appendOrganizationSlugSuffix(prefix, randomUUID().slice(0, 12));
}

function createForwardedFor() {
  const octets = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 200 + 20)
  );

  return octets.join(".");
}

async function expectAuthenticatedHome(page: Page) {
  const workspaceHome = page.getByRole("main", { name: "Workspace home" });

  await skipLocationAccessBeforeExpectedPage(
    page,
    (url) => url.pathname === "/",
    { timeout: 20_000 }
  );
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await expect(workspaceHome).toBeVisible({ timeout: 15_000 });
  await expect(workspaceHome.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Jobs" })
  ).toBeVisible();
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
  const acceptedOrganizationId = decodeAcceptedOrganizationId(
    await acceptInvitationResponse.json()
  );

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
  await markUserEmailVerified(input.email);
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
  const organizationPayload = decodeCreatedOrganizationResponse(
    await organizationResponse.json()
  );

  return organizationPayload.id;
}

async function expectPublicInvitationPreviewReady(
  request: APIRequestContext,
  invitationId: string
) {
  await expect
    .poll(
      async () => {
        let response: Awaited<ReturnType<APIRequestContext["get"]>>;

        try {
          response = await request.get(
            `${API_ORIGIN}/api/public/invitations/${encodeURIComponent(invitationId)}/preview`,
            {
              headers: {
                accept: "application/json",
              },
            }
          );
        } catch {
          return null;
        }

        if (!response.ok()) {
          return null;
        }

        return decodePublicInvitationPreview(await response.json());
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

function isInviteOrganizationMemberResponse(response: PlaywrightResponse) {
  const url = new URL(response.url());

  return (
    response.request().method() === "POST" &&
    url.origin === API_ORIGIN &&
    url.pathname === "/organization/invitations"
  );
}

async function waitForInviteOrganizationMemberResponse(page: Page) {
  const response = await page.waitForResponse(
    isInviteOrganizationMemberResponse,
    {
      timeout: 15_000,
    }
  );

  if (!response.ok()) {
    const text = await readResponseText(response);

    throw new Error(
      `Organization invite request failed with ${response.status()}: ${text}`
    );
  }

  const body: unknown = await response.json();

  return decodeInviteOrganizationMemberResponse(body).invitation;
}

async function readResponseText(response: PlaywrightResponse) {
  try {
    return await response.text();
  } catch (error) {
    return error instanceof Error
      ? `response body unavailable: ${error.message}`
      : "response body unavailable";
  }
}

async function listCurrentOrganizationInvitations(
  request: APIRequestContext,
  page: Page
) {
  const cookieJar = await createCookieJarFromPage(page);
  const response = await request.fetch(
    `${API_ORIGIN}/organization/invitations`,
    {
      headers: {
        accept: "application/json",
        cookie: [...cookieJar.entries()]
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
        origin: APP_ORIGIN,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(
      `Organization invitation list failed with ${response.status()}: ${await response.text()}`
    );
  }

  const body: unknown = await response.json();

  return decodeOrganizationInvitationListResponse(body).invitations;
}

async function getInvitationFromIdentityContract(
  request: APIRequestContext,
  page: Page,
  email: string
) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const invitations = await listCurrentOrganizationInvitations(request, page);
    const invitation = invitations.find(
      (item) => item.email === email && item.status === "pending"
    );

    if (invitation !== undefined) {
      return invitation;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Expected a pending identity invitation for ${email}`);
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
  request: APIRequestContext,
  page: Page,
  email: string
) {
  const membersPage = new MembersPage(page);
  await membersPage.openFromNavigation();
  await membersPage.openInviteDialog();
  await membersPage.email.fill(email);
  const inviteResponsePromise = waitForInviteOrganizationMemberResponse(page);
  await membersPage.submit.click();
  const invitation = await inviteResponsePromise;
  const listedInvitation = await getInvitationFromIdentityContract(
    request,
    page,
    email
  );

  expect(invitation.email).toBe(email);
  expect(invitation.status).toBe("pending");
  expect(listedInvitation.id).toBe(invitation.id);
  expect(listedInvitation.email).toBe(invitation.email);
  expect(listedInvitation.status).toBe(invitation.status);

  await expect(membersPage.pendingInvitation(email)).toBeVisible({
    timeout: 15_000,
  });

  return invitation.id;
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
    const ownerPassword = createTestPassword("CeirdInviteOwner");
    const invitedEmail = createTestEmail("invitee-signup");
    const invitedPassword = createTestPassword("CeirdInviteeSignup");

    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);

    const invitationId = await inviteMemberFromMembersPage(
      request,
      page,
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
      await invitedSignupPage.password.fill(invitedPassword);
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
        invitedPassword
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
    const ownerPassword = createTestPassword("CeirdInviteOwner");
    const invitedEmail = createTestEmail("invitee-login");
    const invitedPassword = createTestPassword("CeirdInviteeLogin");

    await createExistingUser(request, invitedEmail, invitedPassword);

    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);

    const invitationId = await inviteMemberFromMembersPage(
      request,
      page,
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

      const invitedLoginPage = new LoginPage(invitedPage);
      await invitedLoginPage.email.fill(invitedEmail);
      await invitedLoginPage.password.fill(invitedPassword);
      await invitedLoginPage.submit.click();

      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/accept-invitation/${invitationId}`,
        { timeout: INVITATION_UI_TIMEOUT_MS }
      );
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
    const ownerPassword = createTestPassword("CeirdInviteOwner");
    const invitedEmail = createTestEmail("invitee-member-access");
    const invitedPassword = createTestPassword("CeirdInviteeMember");

    await createExistingUser(request, invitedEmail, invitedPassword);
    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);

    const invitationId = await inviteMemberFromMembersPage(
      request,
      page,
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
    const ownerPassword = createTestPassword("CeirdInviteOwner");
    const invitedEmail = createTestEmail("invitee-forgot-password");
    const invitedPassword = createTestPassword("CeirdInviteeForgot");

    await createExistingUser(request, invitedEmail, invitedPassword);
    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);

    const invitationId = await inviteMemberFromMembersPage(
      request,
      page,
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
    const ownerPassword = createTestPassword("CeirdInviteOwner");
    const invitedEmail = createTestEmail("invitee-wrong-account");
    const invitedPassword = createTestPassword("CeirdInviteeWrong");
    const wrongAccountEmail = createTestEmail("wrong-account");
    const wrongAccountPassword = createTestPassword("CeirdWrongAccount");

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
      request,
      page,
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
    const ownerPassword = createTestPassword("CeirdInviteOwner");

    await createOwnerOrganization(request, page, ownerEmail, ownerPassword);
    await page.route("**/organization/invitations**", async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({
          error: {
            message: "Forced failure for e2e coverage",
          },
        }),
        contentType: "application/json",
      });
    });

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

    await page.unroute("**/organization/invitations**");
  });
});
