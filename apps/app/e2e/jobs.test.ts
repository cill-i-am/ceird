import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { markUserEmailVerified } from "./helpers/email-verification";
import { createTestPassword } from "./helpers/test-account";
import { CreateOrganizationPage } from "./pages/create-organization-page";
import { JobDetailSheet, JobsCreateSheet, JobsPage } from "./pages/jobs-page";
import { SignupPage } from "./pages/signup-page";

const JOBS_FLOW_TIMEOUT_MS = 240_000;
const JOB_ACTIVITY_TIMEOUT_MS = 30_000;
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

test.describe("jobs flow", () => {
  test.setTimeout(JOBS_FLOW_TIMEOUT_MS);

  test("supports global and route-specific command bar actions", async ({
    page,
  }) => {
    const jobsPage = new JobsPage(page);

    await signUpAndCreateOrganization(page);
    await runCommandBarAction(page, "Go to Jobs");

    await jobsPage.expectLoaded();
    await runCommandBarAction(page, "Switch to map view");

    await expect(page.getByTestId("jobs-coverage-panel")).toBeVisible();
    await expect(page.getByRole("button", { name: "List" })).toBeVisible();
  });

  test("supports the core jobs happy path from intake through reopen", async ({
    page,
  }) => {
    const jobsPage = new JobsPage(page);
    const createSheet = new JobsCreateSheet(page);
    const detailSheet = new JobDetailSheet(page);
    const jobTitle = `Replace boiler relay ${randomUUID().slice(0, 8)}`;
    const siteName = `North depot ${randomUUID().slice(0, 4)}`;
    const contactName = `Pat Caller ${randomUUID().slice(0, 4)}`;
    const labelName = `Urgent relay ${randomUUID().slice(0, 4)}`;
    const comment = "Crew inspected the panel and isolated the failed relay.";
    const visitNote =
      "Second trip to fit the replacement relay and verify startup.";

    await signUpAndCreateOrganization(page);

    await jobsPage.openFromHome();
    await jobsPage.openCreateSheet();

    await createSheet.expectOpen();
    await createSheet.title.fill(jobTitle);
    await createSheet.choosePriorityOption("High");
    await createSheet.chooseSiteOption("Create a new site");
    await createSheet.siteName.fill(siteName);
    await createSheet.siteLocation.fill("D1");
    await expect(createSheet.siteLocationStatus).toContainText(
      "Unverified location"
    );
    await createSheet.closeSiteDialog();
    await createSheet.createInlineContact(contactName);
    await createSheet.submit.click();

    await jobsPage.expectLoaded();
    await expect(jobsPage.createdJobNotice(jobTitle)).toBeVisible();
    await expect(jobsPage.jobCard(jobTitle)).toBeVisible();

    await jobsPage.openJob(jobTitle);
    await detailSheet.expectOpen(jobTitle);
    await detailSheet.openPanel("Status");
    await expect(detailSheet.pickStatusChange).toBeDisabled();
    await expect(
      detailSheet.root.getByText(siteName, { exact: true }).first()
    ).toBeVisible();
    await expect(
      detailSheet.root.getByText(contactName, { exact: true }).first()
    ).toBeVisible();

    await detailSheet.openPanel("Comment");
    await detailSheet.commentBody.fill(comment);
    await detailSheet.addComment.click();
    await expect(detailSheet.commentItem(comment)).toBeVisible();

    await detailSheet.openPanel("Status");
    await detailSheet.chooseStatusOption("In progress");
    const inProgressResponse = waitForJobTransitionResponse(page);
    await detailSheet.applyStatusChange.click();
    const inProgressResult = await inProgressResponse;
    expect(inProgressResult.ok()).toBe(true);
    await expect(
      detailSheet.root.getByText("In progress", { exact: true })
    ).toBeVisible();
    await expect(
      detailSheet.root.getByText(/changed status from New to In progress/)
    ).toBeVisible({ timeout: JOB_ACTIVITY_TIMEOUT_MS });

    await detailSheet.openPanel("Visit");
    await detailSheet.visitDate.fill("2026-04-24");
    await detailSheet.chooseVisitDurationOption("2 hours");
    await detailSheet.visitNote.fill(visitNote);
    await detailSheet.logVisit.click();
    await expect(detailSheet.visitItem(visitNote)).toBeVisible();
    await expect(detailSheet.root.getByText("2h logged")).toBeVisible();

    await detailSheet.openPanel("Status");
    await detailSheet.chooseStatusOption("Completed");
    const completedResponse = waitForJobTransitionResponse(page);
    await detailSheet.applyStatusChange.click();
    const completedResult = await completedResponse;
    expect(completedResult.ok()).toBe(true);
    await expect(
      detailSheet.root.getByText(/changed status from In progress to Completed/)
    ).toBeVisible({ timeout: JOB_ACTIVITY_TIMEOUT_MS });
    if (!(await detailSheet.reopenJob.isVisible())) {
      await detailSheet.openPanel("Status");
    }
    await expect(detailSheet.reopenJob).toBeVisible();

    const reopenResponse = waitForJobReopenResponse(page);
    await detailSheet.reopenJob.click();
    const reopenResult = await reopenResponse;
    expect(reopenResult.ok()).toBe(true);
    await expect(
      detailSheet.root.getByText("In progress", { exact: true })
    ).toBeVisible();
    if (!(await detailSheet.pickStatusChange.isVisible())) {
      await detailSheet.openPanel("Status");
    }
    await expect(detailSheet.pickStatusChange).toBeDisabled();

    const labelAssignmentResponse = waitForJobLabelAssignmentResponse(page);
    await detailSheet.createAndAssignLabel(labelName);
    const labelAssignmentResult = await labelAssignmentResponse;
    expect(labelAssignmentResult.ok()).toBe(true);
    await expect(
      detailSheet.root.getByText(labelName, { exact: true })
    ).toBeVisible();
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

function waitForJobTransitionResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/jobs\/[^/]+\/transitions$/.test(new URL(response.url()).pathname),
    { timeout: JOB_ACTIVITY_TIMEOUT_MS }
  );
}

function waitForJobReopenResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/jobs\/[^/]+\/reopen$/.test(new URL(response.url()).pathname),
    { timeout: JOB_ACTIVITY_TIMEOUT_MS }
  );
}

function waitForJobLabelAssignmentResponse(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/jobs\/[^/]+\/labels$/.test(new URL(response.url()).pathname),
    { timeout: JOB_ACTIVITY_TIMEOUT_MS }
  );
}
