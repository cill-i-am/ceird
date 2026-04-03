import { expect, test } from "@playwright/test";

import { LoginPage } from "./pages/login-page";
import { SignupPage } from "./pages/signup-page";

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
});
