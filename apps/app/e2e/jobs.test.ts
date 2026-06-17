import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { markUserEmailVerified } from "./helpers/email-verification";
import { createTestPassword } from "./helpers/test-account";
import { CreateOrganizationPage } from "./pages/create-organization-page";
import { JobsPage } from "./pages/jobs-page";
import { SignupPage } from "./pages/signup-page";

const JOBS_FLOW_TIMEOUT_MS = 120_000;
const WORKSPACE_HOME_TIMEOUT_MS = 20_000;

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

async function signUpAndCreateOrganization(page: Page) {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const email = createTestEmail("jobs-e2e");
  const password = createTestPassword();

  await signupPage.goto();
  await signupPage.name.fill("Taylor Example");
  await signupPage.email.fill(email);
  await signupPage.password.fill(password);
  await signupPage.submit.click();
  await markUserEmailVerified(email);

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill("Acme Field Ops");
  await createOrganizationPage.submit.click();
  await createOrganizationPage.skipInviteStep();

  await expect(page).toHaveURL(/\/$/, {
    timeout: WORKSPACE_HOME_TIMEOUT_MS,
  });
  await expect(page.getByRole("main", { name: "Workspace home" })).toBeVisible({
    timeout: WORKSPACE_HOME_TIMEOUT_MS,
  });
}

test.describe("jobs route cutover", () => {
  test.setTimeout(JOBS_FLOW_TIMEOUT_MS);

  test("points command navigation at the realtime Jobs route", async ({
    page,
  }) => {
    const jobsPage = new JobsPage(page);

    await signUpAndCreateOrganization(page);
    await runCommandBarAction(page, "Go to Jobs");

    await jobsPage.expectLoaded();
    await jobsPage.expectRealtimeState();
  });

  test("redirects the old Jobs workspace preview URL to Jobs", async ({
    page,
  }) => {
    const jobsPage = new JobsPage(page);

    await signUpAndCreateOrganization(page);
    await page.goto("/jobs-workspace?query=relay&status=blocked");

    await jobsPage.expectLoaded({
      search: /(?=.*query=relay)(?=.*status=blocked)/,
    });
  });
});

async function runCommandBarAction(page: Page, label: string) {
  const commandBar = page.getByRole("dialog", { name: "Command bar" });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.keyboard.press("ControlOrMeta+K");

    try {
      await expect(commandBar).toBeVisible({
        timeout: 1000,
      });
      break;
    } catch {
      // Retry until the client-side command hotkey has hydrated.
    }
  }

  await expect(commandBar).toBeVisible();
  const option = page.getByRole("option", { exact: true, name: label });
  await option.click();
  await expect(option).toBeHidden();
}
