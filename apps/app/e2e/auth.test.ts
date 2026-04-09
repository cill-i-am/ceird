import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { CreateOrganizationPage } from "./pages/create-organization-page";
import { LoginPage } from "./pages/login-page";
import { SignupPage } from "./pages/signup-page";

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function createTestSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function expectAuthenticatedHome(page: Page) {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
  await expect(page.getByText("Start simple, ship quickly.")).toHaveCount(0);
}

async function signUpAndCreateOrganization(
  page: Page,
  options?: {
    readonly email?: string;
    readonly name?: string;
    readonly organizationName?: string;
    readonly organizationSlugPrefix?: string;
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
  await signupPage.confirmPassword.fill(password);
  await signupPage.submit.click();

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill(
    options?.organizationName ?? "Acme Field Ops"
  );
  await createOrganizationPage.slug.fill(
    createTestSlug(options?.organizationSlugPrefix ?? "acme-field-ops")
  );
  await createOrganizationPage.submit.click();

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

    await expect(loginPage.alerts).toContainText(
      "Expected a string at least 8 character(s) long"
    );
  });

  test("signup shows password mismatch inline", async ({ page }) => {
    const signupPage = new SignupPage(page);

    await signupPage.goto();
    await expect(signupPage.heading).toBeVisible();
    await signupPage.name.fill("Taylor Example");
    await signupPage.name.blur();
    await signupPage.email.fill("person@example.com");
    await signupPage.email.blur();
    await signupPage.password.fill("password123");
    await signupPage.password.blur();
    await signupPage.confirmPassword.fill("password124");
    await signupPage.confirmPassword.blur();
    await signupPage.submit.click();

    await expect(signupPage.alerts).toContainText("Passwords must match");
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
      organizationSlugPrefix: "verification-banner-org",
    });

    const banner = page.getByRole("region", {
      name: "Email verification reminder",
    });

    await expect(banner).toBeVisible();
    await expect(banner).toContainText(
      `${email} is not verified yet. Check your inbox for the verification link, or request another email.`
    );
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
      organizationSlugPrefix: "verification-resend-org",
    });

    const banner = page.getByRole("region", {
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
      "http://127.0.0.1:3001/api/auth/sign-up/email",
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
    await createOrganizationPage.slug.fill(createTestSlug("field-services"));
    await createOrganizationPage.submit.click();

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
    await signupPage.confirmPassword.fill(password);
    await signupPage.submit.click();

    await createOrganizationPage.expectLoaded();
    await createOrganizationPage.name.fill("Existing Org Team");
    await createOrganizationPage.slug.fill(createTestSlug("existing-org-team"));
    await createOrganizationPage.submit.click();

    await expectAuthenticatedHome(page);
    await page.context().clearCookies();

    await loginPage.goto();
    await loginPage.email.fill(email);
    await loginPage.password.fill(password);
    await loginPage.submit.click();

    await expectAuthenticatedHome(page);
    await expect(page).not.toHaveURL(/\/create-organization$/);
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
        "Your email address is verified. You can continue in the app or sign in again if needed."
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
        hasText: "Verification link invalid",
      })
    ).toBeVisible();
    await expect(
      page.getByText(
        "This verification link is invalid or has expired. Request a fresh verification email from the app."
      )
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to login" })
    ).toHaveAttribute("href", "/login");
  });
});
