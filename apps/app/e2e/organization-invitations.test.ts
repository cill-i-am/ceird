import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { LoginPage } from "./pages/login-page";
import { MembersPage } from "./pages/members-page";
import { SignupPage } from "./pages/signup-page";
import { API_ORIGIN, APP_ORIGIN } from "./test-urls";

type CookieJar = Map<string, string>;

const INVITATION_UI_TIMEOUT_MS = 30_000;

type InvitationActionState = "ready" | "signed-out" | "switch-account";

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

async function expectVisibleWithPageSnapshot(
  page: Page,
  locator: Locator,
  description: string,
  timeout = 5000
) {
  try {
    await expect(locator).toBeVisible({ timeout });
  } catch (error) {
    const bodyText = await page
      .locator("body")
      .textContent({ timeout: 1000 })
      .catch(() => "[body text unavailable]");

    throw new Error(
      `${description} was not visible at ${page.url()}. Page text: ${(bodyText ?? "[body text unavailable]").slice(0, 1500)}`,
      { cause: error }
    );
  }
}

function getSwitchAccountButton(page: Page) {
  return page
    .getByRole("button")
    .filter({ hasText: "Sign out and try another account" });
}

async function getInvitationActionState(page: Page) {
  if (
    await page
      .getByRole("button", { name: "Accept invitation" })
      .isVisible()
      .catch(() => false)
  ) {
    return "ready" as const;
  }

  if (
    await page
      .locator("body")
      .getByText("Sign out and try another account")
      .isVisible()
      .catch(() => false)
  ) {
    return "switch-account" as const;
  }

  if (
    await page
      .getByRole("link", { name: "Sign in" })
      .isVisible()
      .catch(() => false)
  ) {
    return "signed-out" as const;
  }

  return null;
}

async function waitForInvitationActionState(
  page: Page
): Promise<InvitationActionState> {
  const deadline = Date.now() + INVITATION_UI_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const state = await getInvitationActionState(page);

    if (state) {
      return state;
    }

    await page.waitForTimeout(250);
  }

  await expectVisibleWithPageSnapshot(
    page,
    page.getByRole("button", { name: "Accept invitation" }),
    "Invitation accept action",
    1
  );

  return "ready";
}

async function ensureInvitationAcceptAction(
  page: Page,
  invitationId: string,
  email: string,
  password: string
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await waitForInvitationActionState(page);

    if (state === "ready") {
      const acceptInvitationButton = page.getByRole("button", {
        name: "Accept invitation",
      });
      await expectVisibleWithPageSnapshot(
        page,
        acceptInvitationButton,
        "Invitation accept action",
        1
      );

      return acceptInvitationButton;
    }

    if (state === "switch-account") {
      const switchAccountButton = getSwitchAccountButton(page);

      await expectVisibleWithPageSnapshot(
        page,
        switchAccountButton,
        "Invitation switch-account action",
        INVITATION_UI_TIMEOUT_MS
      );
      await switchAccountButton.click();
    } else {
      await page.getByRole("link", { name: "Sign in" }).click();
    }

    const loginPage = new LoginPage(page);
    await expect(page).toHaveURL(
      `${APP_ORIGIN}/login?invitation=${invitationId}`
    );
    await loginPage.email.fill(email);
    await loginPage.password.fill(password);
    await loginPage.submit.click();
    await expect(page).toHaveURL(
      `${APP_ORIGIN}/accept-invitation/${invitationId}`
    );
  }

  const acceptInvitationButton = page.getByRole("button", {
    name: "Accept invitation",
  });
  await expectVisibleWithPageSnapshot(
    page,
    acceptInvitationButton,
    "Invitation accept action",
    INVITATION_UI_TIMEOUT_MS
  );

  return acceptInvitationButton;
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

  expect(response.ok()).toBeTruthy();

  return response;
}

async function authenticatePageContext(
  request: APIRequestContext,
  page: Page,
  input: {
    readonly email: string;
    readonly password: string;
  }
) {
  const cookieJar = new Map<string, string>();

  await sendAuthRequest(request, "/sign-in/email", {
    body: {
      email: input.email,
      password: input.password,
    },
    cookieJar,
    forwardedFor: createForwardedFor(),
  });

  await page.context().clearCookies();
  await page.context().addCookies(
    [...cookieJar.entries()].map(([name, value]) => ({
      name,
      url: APP_ORIGIN,
      value,
    }))
  );
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
  await sendAuthRequest(request, "/organization/create", {
    body: {
      name: "Acme Field Ops",
      slug: createTestSlug("acme-field-ops"),
    },
    cookieJar,
    forwardedFor,
  });
}

async function login(page: Page, email: string, password: string) {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.email.fill(email);
  await loginPage.password.fill(password);
  await loginPage.submit.click();

  await expectAuthenticatedHome(page);
}

async function getInvitationIdForEmail(
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

  expect(response.ok()).toBeTruthy();
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

  expect(invitation).toBeDefined();
  if (!invitation) {
    throw new Error(`Expected a pending invitation for ${email}`);
  }

  return invitation.id;
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
  await seedOwnerOrganization(request, {
    email: ownerEmail,
    password: ownerPassword,
  });
  await login(page, ownerEmail, ownerPassword);
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

  await expect(page.getByText(`Invitation sent to ${email}.`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(membersPage.pendingInvitation(email)).toBeVisible({
    timeout: 15_000,
  });

  return await getInvitationIdForEmail(request, page, email);
}

test.describe("organization invitations", () => {
  test.describe.configure({ mode: "serial" });

  test("a new user can sign up from the invitation and accept it", async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(90_000);

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
        `${APP_ORIGIN}/accept-invitation/${invitationId}`
      );
      await authenticatePageContext(request, invitedPage, {
        email: invitedEmail,
        password: "password123",
      });
      await invitedPage.goto(`/accept-invitation/${invitationId}`);

      const acceptInvitationButton = await ensureInvitationAcceptAction(
        invitedPage,
        invitationId,
        invitedEmail,
        "password123"
      );
      await acceptInvitationButton.click();

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
      const invitedLoginPage = new LoginPage(invitedPage);

      await invitedPage.goto(`/accept-invitation/${invitationId}`);
      await invitedPage.getByRole("link", { name: "Sign in" }).click();

      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/login?invitation=${invitationId}`
      );
      await invitedLoginPage.email.fill(invitedEmail);
      await invitedLoginPage.password.fill(invitedPassword);
      await invitedLoginPage.submit.click();

      await expect(invitedPage).toHaveURL(
        `${APP_ORIGIN}/accept-invitation/${invitationId}`
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
      const invitedLoginPage = new LoginPage(invitedPage);

      await invitedPage.goto(`/accept-invitation/${invitationId}`);
      await invitedPage.getByRole("link", { name: "Sign in" }).click();
      await invitedLoginPage.email.fill(invitedEmail);
      await invitedLoginPage.password.fill(invitedPassword);
      await invitedLoginPage.submit.click();
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
      const invitedLoginPage = new LoginPage(invitedPage);

      await invitedLoginPage.goto();
      await invitedLoginPage.email.fill(wrongAccountEmail);
      await invitedLoginPage.password.fill(wrongAccountPassword);
      await invitedLoginPage.submit.click();
      await expect(invitedPage).toHaveURL(`${APP_ORIGIN}/create-organization`);

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
      await expect(invitedLoginPage.heading).toBeVisible();
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
