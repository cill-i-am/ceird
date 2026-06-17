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
  await expect(page).toHaveURL(/\/organization\/settings$/, {
    timeout: AUTHENTICATED_HOME_TIMEOUT_MS,
  });
  await expect(
    page.getByRole("heading", { name: "Organization settings" })
  ).toBeVisible({
    timeout: AUTHENTICATED_HOME_TIMEOUT_MS,
  });
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

test("an organization admin can manage labels from the realtime settings tab", async ({
  page,
}) => {
  test.setTimeout(ORGANIZATION_SETTINGS_FLOW_TIMEOUT_MS);

  const labelName = `Access issue ${randomUUID().slice(0, 4)}`;
  const updatedLabelName = `Waiting on parts ${randomUUID().slice(0, 4)}`;

  await signUpAndCreateOrganization(page, {
    emailPrefix: "org-labels",
    organizationName: "Acme Field Ops",
    ownerName: "Settings Owner",
  });

  await openSettingsFromAccountMenu(page);
  await page.getByRole("link", { name: /open labels/i }).click();
  await expect(page).toHaveURL(/\/organization\/settings\/labels$/, {
    timeout: AUTHENTICATED_HOME_TIMEOUT_MS,
  });
  await expect(page.getByRole("heading", { name: "Labels" })).toBeVisible({
    timeout: AUTHENTICATED_HOME_TIMEOUT_MS,
  });
  await expect(page.getByText("Realtime ready")).toBeVisible({
    timeout: ORGANIZATION_SETTINGS_FLOW_TIMEOUT_MS,
  });
  await expect(page.getByText("No labels yet")).toBeVisible();

  await page.getByLabel("New label name").fill(labelName);
  await Promise.all([
    waitForLabelMutation(page, "POST"),
    page.getByRole("button", { name: /create/i }).click(),
  ]);
  await expect(page.getByRole("status")).toContainText(
    "Label created and confirmed by realtime sync."
  );
  await expect(page.getByText(labelName, { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: `Open actions for ${labelName}` })
    .click();
  await page.getByRole("menuitem", { name: "Edit label" }).click();
  await page.getByLabel(`Rename ${labelName}`).fill(updatedLabelName);
  await Promise.all([
    waitForLabelMutation(page, "PATCH"),
    page.getByRole("button", { name: `Save ${labelName}` }).click(),
  ]);
  await expect(page.getByRole("status")).toContainText(
    "Label renamed and confirmed by realtime sync."
  );
  await expect(page.getByText(updatedLabelName, { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: `Open actions for ${updatedLabelName}` })
    .click();
  await page.getByRole("menuitem", { name: "Archive label" }).click();
  await Promise.all([
    waitForLabelMutation(page, "DELETE"),
    page.getByRole("button", { name: "Archive label" }).click(),
  ]);
  await expect(page.getByRole("status")).toContainText(
    "Label archived and removed after realtime confirmation."
  );
  await expect(page.getByText(updatedLabelName, { exact: true })).toBeHidden();
  await expect(page.getByText("No labels yet")).toBeVisible();
});

function waitForLabelMutation(page: Page, method: "DELETE" | "PATCH" | "POST") {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      /^\/labels(?:\/[^/]+)?$/.test(new URL(response.url()).pathname) &&
      response.status() < 400
  );
}
