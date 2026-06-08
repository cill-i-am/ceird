import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { markUserEmailVerified } from "./helpers/email-verification";
import { createTestPassword } from "./helpers/test-account";
import { CreateOrganizationPage } from "./pages/create-organization-page";
import { skipLocationAccessBeforeExpectedPage } from "./pages/location-access-page";
import { SignupPage } from "./pages/signup-page";
import { waitForLocatorHydration } from "./pages/wait-for-submit-hydration";

const ORGANIZATION_SETTINGS_FLOW_TIMEOUT_MS = 90_000;
const AUTHENTICATED_HOME_TIMEOUT_MS = 30_000;

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

async function expectAuthenticatedHome(page: Page) {
  const workspaceHome = page.getByRole("main", { name: "Workspace home" });

  await skipLocationAccessBeforeExpectedPage(
    page,
    (url) => url.pathname === "/",
    { timeout: AUTHENTICATED_HOME_TIMEOUT_MS }
  );
  await expect(page).toHaveURL(/\/$/, {
    timeout: AUTHENTICATED_HOME_TIMEOUT_MS,
  });
  await expect(workspaceHome).toBeVisible({
    timeout: AUTHENTICATED_HOME_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("link", { exact: true, name: "Jobs" })
  ).toBeVisible({
    timeout: AUTHENTICATED_HOME_TIMEOUT_MS,
  });
}

async function openAccountMenu(page: Page) {
  const trigger = page.getByRole("button", { name: /settings owner/i });

  await expect(trigger).toBeVisible({
    timeout: AUTHENTICATED_HOME_TIMEOUT_MS,
  });
  await waitForLocatorHydration(trigger);
  await trigger.click();
}

async function openSettingsFromAccountMenu(page: Page) {
  await openAccountMenu(page);
  await page
    .getByRole("menuitem", { name: "Organization settings" })
    .click({ timeout: AUTHENTICATED_HOME_TIMEOUT_MS });
  await expect(page).toHaveURL(/\/organization\/settings$/);
}

async function signUpAndCreateOrganization(
  page: Page,
  {
    emailPrefix,
    organizationName,
    ownerName,
  }: {
    readonly emailPrefix: string;
    readonly organizationName: string;
    readonly ownerName: string;
  }
) {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const password = createTestPassword();
  const email = createTestEmail(emailPrefix);

  await signupPage.goto();
  await signupPage.name.fill(ownerName);
  await signupPage.email.fill(email);
  await signupPage.password.fill(password);
  await signupPage.submit.click();
  await markUserEmailVerified(email);

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill(organizationName);
  await createOrganizationPage.submit.click();
  await createOrganizationPage.skipInviteStep();
  await expectAuthenticatedHome(page);
}

test("an organization admin can update the organization name from account settings", async ({
  page,
}) => {
  test.setTimeout(ORGANIZATION_SETTINGS_FLOW_TIMEOUT_MS);

  const initialOrganizationName = "Acme Field Ops";
  const updatedOrganizationName = "Northwind Field Ops";

  await signUpAndCreateOrganization(page, {
    emailPrefix: "org-settings",
    organizationName: initialOrganizationName,
    ownerName: "Settings Owner",
  });

  await openSettingsFromAccountMenu(page);
  await expect(
    page.getByRole("heading", { name: "Organization settings" })
  ).toBeVisible();
  await expect(page.getByLabel("Organization name")).toHaveValue(
    initialOrganizationName
  );

  await page.getByLabel("Organization name").fill(updatedOrganizationName);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/organization/update") &&
        response.status() < 400
    ),
    page.getByRole("button", { name: "Save changes" }).click(),
  ]);
  await expect(page.getByRole("status")).toContainText("Organization updated.");
  await expect(page.getByLabel("Organization name")).toHaveValue(
    updatedOrganizationName
  );

  await page.reload();
  await expect(page.getByLabel("Organization name")).toHaveValue(
    updatedOrganizationName
  );
});
