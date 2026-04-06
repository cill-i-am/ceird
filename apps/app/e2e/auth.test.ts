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
  await expect(page).toHaveURL("http://localhost:4173/");
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
  await expect(page.getByText("Start simple, ship quickly.")).toHaveCount(0);
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
      documentRequests.filter((url) => url === "http://localhost:4173/")
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
    const signupPage = new SignupPage(page);
    const createOrganizationPage = new CreateOrganizationPage(page);
    const email = createTestEmail("signup");

    await signupPage.goto();
    await signupPage.name.fill("Taylor Example");
    await signupPage.email.fill(email);
    await signupPage.password.fill("password123");
    await signupPage.confirmPassword.fill("password123");
    await signupPage.submit.click();

    await createOrganizationPage.expectLoaded();
    await createOrganizationPage.name.fill("Acme Field Ops");
    await createOrganizationPage.slug.fill(createTestSlug("acme-field-ops"));
    await createOrganizationPage.submit.click();

    await expectAuthenticatedHome(page);
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
});
