import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { CreateOrganizationPage } from "./pages/create-organization-page";
import { LoginPage } from "./pages/login-page";
import { SignupPage } from "./pages/signup-page";
import { waitForSubmitHydration } from "./pages/wait-for-submit-hydration";
import { API_ORIGIN, readPlaywrightDatabaseUrl } from "./test-urls";

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

async function expectAuthenticatedHome(page: Page) {
  const workspaceHome = page.getByRole("main", { name: "Workspace home" });

  await expect(page).toHaveURL(/\/$/);
  await expect(workspaceHome).toBeVisible({ timeout: 15_000 });
  await expect(workspaceHome.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Jobs" })
  ).toBeVisible();
  await expect(
    workspaceHome.getByRole("link", { exact: true, name: "Invite teammate" })
  ).toBeVisible();
}

async function findPasswordResetToken(email: string): Promise<string | null> {
  const client = new PgClient({
    connectionString: readPlaywrightDatabaseUrl(),
  });

  await client.connect();

  try {
    const result = await client.query<{ readonly identifier: string }>(
      `select verification.identifier
       from verification
       inner join "user" on "user".id = verification.value
       where "user".email = $1
         and verification.identifier like 'reset-password:%'
       order by verification.created_at desc
       limit 1`,
      [email]
    );
    const identifier = result.rows[0]?.identifier;

    return identifier?.startsWith("reset-password:")
      ? identifier.slice("reset-password:".length)
      : null;
  } finally {
    await client.end();
  }
}

async function signUpAndCreateOrganization(
  page: Page,
  options?: {
    readonly email?: string;
    readonly name?: string;
    readonly organizationName?: string;
    readonly password?: string;
  }
) {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const email = options?.email ?? createTestEmail("signup");
  const password = options?.password ?? "password123";

  await signupPage.goto();
  await signupPage.name.fill(options?.name ?? "Taylor Example");
  await signupPage.email.fill(email);
  await signupPage.password.fill(password);
  await signupPage.submit.click();

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill(
    options?.organizationName ?? "Acme Field Ops"
  );
  await createOrganizationPage.submit.click();
  await createOrganizationPage.skipInviteStep();

  await expectAuthenticatedHome(page);

  return {
    email,
    password,
  };
}

test.describe("auth pages", () => {
  test("redirects unauthenticated users from / to /login", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(new LoginPage(page).heading).toBeVisible();
  });

  test("redirects unauthenticated client-side transitions from / to /login", async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    const documentRequests: string[] = [];

    page.on("request", (request) => {
      if (request.resourceType() === "document") {
        documentRequests.push(request.url());
      }
    });

    await loginPage.goto();
    await page.waitForFunction(() => Boolean(window.__TSR_ROUTER__));
    await page.evaluate(async () => {
      const router = (
        window as Window & {
          __TSR_ROUTER__?: {
            navigate: (options: { to: string }) => Promise<unknown>;
          };
        }
      ).__TSR_ROUTER__;

      if (!router) {
        throw new Error("Expected TanStack Router to be available");
      }

      await router.navigate({ to: "/" });
    });

    await expect(page).toHaveURL(/\/login$/);
    await expect(loginPage.heading).toBeVisible();
    expect(
      documentRequests.filter((url) => new URL(url).pathname === "/")
    ).toHaveLength(0);
  });

  test("login shows inline validation after submit", async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await expect(loginPage.heading).toBeVisible();
    await loginPage.email.fill("person@example.com");
    await loginPage.email.blur();
    await loginPage.password.fill("short");
    await loginPage.password.blur();
    await loginPage.submit.click();

    await expect(loginPage.alerts).toContainText("Use at least 8 characters.");
  });

  test("signup shows password length validation inline", async ({ page }) => {
    const signupPage = new SignupPage(page);

    await signupPage.goto();
    await expect(signupPage.heading).toBeVisible();
    await signupPage.name.fill("Taylor Example");
    await signupPage.name.blur();
    await signupPage.email.fill("person@example.com");
    await signupPage.email.blur();
    await signupPage.password.fill("short");
    await signupPage.password.blur();
    await signupPage.submit.click();

    await expect(signupPage.alerts).toContainText("Use at least 8 characters.");
  });

  test("signup creates an org before entering the app", async ({ page }) => {
    await signUpAndCreateOrganization(page);
  });

  test("shows an email verification reminder for unverified users in the app shell", async ({
    page,
  }) => {
    const { email } = await signUpAndCreateOrganization(page, {
      email: createTestEmail("verification-banner"),
      organizationName: "Verification Banner Org",
    });

    const banner = page.getByRole("alert", {
      name: "Email verification reminder",
    });

    await expect(banner).toBeVisible();
    await expect(banner).toContainText(`${email} is not verified yet.`);
    await expect(
      banner.getByRole("button", { name: "Resend verification email" })
    ).toBeVisible();
  });

  test("lets an unverified user request another verification email from the app shell", async ({
    page,
  }) => {
    await signUpAndCreateOrganization(page, {
      email: createTestEmail("verification-resend"),
      organizationName: "Verification Resend Org",
    });

    const banner = page.getByRole("alert", {
      name: "Email verification reminder",
    });
    const resendButton = banner.getByRole("button", {
      name: "Resend verification email",
    });

    await resendButton.click();

    await expect(
      banner.getByText("Another verification email has been requested.")
    ).toBeVisible();
    await expect(
      banner.getByRole("button", { name: "Resend verification email" })
    ).toBeVisible();
  });

  test("login creates an org before entering the app", async ({
    page,
    request,
  }) => {
    const email = createTestEmail("login");
    const password = "password123";
    const loginPage = new LoginPage(page);
    const createOrganizationPage = new CreateOrganizationPage(page);
    const response = await request.post(
      `${API_ORIGIN}/api/auth/sign-up/email`,
      {
        data: {
          email,
          name: "Taylor Example",
          password,
        },
      }
    );

    expect(response.ok()).toBeTruthy();

    await loginPage.goto();
    await loginPage.email.fill(email);
    await loginPage.password.fill(password);
    await loginPage.submit.click();

    await createOrganizationPage.expectLoaded();
    await createOrganizationPage.name.fill("Field Services Team");
    await createOrganizationPage.submit.click();
    await createOrganizationPage.skipInviteStep();

    await expectAuthenticatedHome(page);
  });

  test("login skips onboarding when the user already belongs to an org", async ({
    page,
  }) => {
    const email = createTestEmail("existing-org-login");
    const password = "password123";
    const signupPage = new SignupPage(page);
    const createOrganizationPage = new CreateOrganizationPage(page);
    const loginPage = new LoginPage(page);

    await signupPage.goto();
    await signupPage.name.fill("Taylor Example");
    await signupPage.email.fill(email);
    await signupPage.password.fill(password);
    await signupPage.submit.click();

    await createOrganizationPage.expectLoaded();
    await createOrganizationPage.name.fill("Existing Org Team");
    await createOrganizationPage.submit.click();
    await createOrganizationPage.skipInviteStep();

    await expectAuthenticatedHome(page);
    await page.context().clearCookies();

    await loginPage.goto();
    await loginPage.email.fill(email);
    await loginPage.password.fill(password);
    await loginPage.submit.click();

    await expectAuthenticatedHome(page);
    await expect(page).not.toHaveURL(/\/create-organization$/);
  });

  test("password reset request and completion updates credentials", async ({
    page,
    request,
  }) => {
    const email = createTestEmail("password-reset");
    const oldPassword = "password123";
    const newPassword = "new-password-123";
    const loginPage = new LoginPage(page);
    const createOrganizationPage = new CreateOrganizationPage(page);
    const response = await request.post(
      `${API_ORIGIN}/api/auth/sign-up/email`,
      {
        data: {
          email,
          name: "Taylor Example",
          password: oldPassword,
        },
      }
    );

    expect(response.ok()).toBeTruthy();

    await page.goto("/forgot-password");
    await waitForSubmitHydration(page);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your email" })
    ).toBeVisible();
    await expect(
      page.getByText(
        "If an account exists for that email, the newest reset link is on its way."
      )
    ).toBeVisible();

    let resetToken: string | null = null;

    await expect
      .poll(
        async () => {
          resetToken = await findPasswordResetToken(email);

          return resetToken;
        },
        {
          timeout: 10_000,
        }
      )
      .not.toBeNull();

    if (!resetToken) {
      throw new Error("Expected password reset token to be persisted");
    }

    await page.goto(`/reset-password?token=${resetToken}`);
    await waitForSubmitHydration(page);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await loginPage.email.fill(email);
    await loginPage.password.fill(oldPassword);
    await loginPage.submit.click();
    await expect(loginPage.alerts).toContainText(
      "We couldn't sign you in. Check your email and password and try again."
    );

    await loginPage.email.fill(email);
    await loginPage.password.fill(newPassword);
    await loginPage.submit.click();
    await createOrganizationPage.expectLoaded();
  });

  test("verify-email shows the success state when status=success", async ({
    page,
  }) => {
    await page.goto("/verify-email?status=success");

    await expect(page).toHaveURL(/\/verify-email\?status=success$/);
    await expect(
      page.locator('[data-slot="card-title"]', { hasText: "Email verified" })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Your email address is verified. You can continue safely.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to the app" })
    ).toHaveAttribute("href", "/");
  });

  test("verify-email shows the invalid-link state for expired or invalid links", async ({
    page,
  }) => {
    await page.goto("/verify-email?error=INVALID_TOKEN");

    await expect(page).toHaveURL(/\/verify-email\?/);
    await expect
      .poll(() => {
        const url = new URL(page.url());

        return {
          error: url.searchParams.get("error"),
          status: url.searchParams.get("status"),
        };
      })
      .toEqual({
        error: "INVALID_TOKEN",
        status: "invalid-token",
      });
    await expect(
      page.locator('[data-slot="card-title"]', {
        hasText: "Verification link expired",
      })
    ).toBeVisible();
    await expect(
      page.getByText(
        "Use the newest email verification link, or return to sign in and request a fresh one.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to login" })
    ).toHaveAttribute("href", "/login");
  });
});
