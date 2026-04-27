import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { CreateOrganizationPage } from "./pages/create-organization-page";
import { SignupPage } from "./pages/signup-page";

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function createTestSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function expectAuthenticatedHome(page: Page) {
  const workspaceHome = page.getByRole("main", { name: "Workspace home" });

  await expect(page).toHaveURL(/\/$/);
  await expect(workspaceHome).toBeVisible();
  await expect(
    workspaceHome.getByRole("link", { name: "Open jobs" })
  ).toBeVisible();
}

async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: /settings owner/i }).click();
}

async function openSettingsFromAccountMenu(page: Page) {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Organization settings" }).click();
  await expect(page).toHaveURL(/\/organization\/settings$/);
}

test("an organization admin can update the organization name from account settings", async ({
  page,
}) => {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const email = createTestEmail("org-settings");
  const password = "password123";
  const initialOrganizationName = "Acme Field Ops";
  const updatedOrganizationName = "Northwind Field Ops";

  await signupPage.goto();
  await signupPage.name.fill("Settings Owner");
  await signupPage.email.fill(email);
  await signupPage.password.fill(password);
  await signupPage.confirmPassword.fill(password);
  await signupPage.submit.click();

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill(initialOrganizationName);
  await createOrganizationPage.slug.fill(createTestSlug("acme-field-ops"));
  await createOrganizationPage.submit.click();
  await expectAuthenticatedHome(page);

  await openSettingsFromAccountMenu(page);
  await expect(
    page.getByRole("heading", { name: "Organization settings" })
  ).toBeVisible();
  await expect(page.getByLabel("Organization name")).toHaveValue(
    initialOrganizationName
  );

  await page.getByLabel("Organization name").fill(updatedOrganizationName);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Organization updated.");
  await expect(page.getByLabel("Organization name")).toHaveValue(
    updatedOrganizationName
  );

  await page.reload();
  await expect(page.getByLabel("Organization name")).toHaveValue(
    updatedOrganizationName
  );
});
