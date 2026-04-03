import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { LoginPage } from "./pages/login-page";
import { SignupPage } from "./pages/signup-page";

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

test.describe("auth pages", () => {
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

  test("signup redirects to the app shell after success", async ({ page }) => {
    const signupPage = new SignupPage(page);
    const email = createTestEmail("signup");

    await signupPage.goto();
    await signupPage.name.fill("Taylor Example");
    await signupPage.email.fill(email);
    await signupPage.password.fill("password123");
    await signupPage.confirmPassword.fill("password123");
    await signupPage.submit.click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Start simple, ship quickly.")).toBeVisible();
  });

  test("login redirects to the app shell after success", async ({
    page,
    request,
  }) => {
    const email = createTestEmail("login");
    const password = "password123";
    const loginPage = new LoginPage(page);
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

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Start simple, ship quickly.")).toBeVisible();
  });
});
