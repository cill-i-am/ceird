import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { CreateOrganizationPage } from "./pages/create-organization-page";
import { JobDetailSheet, JobsCreateSheet, JobsPage } from "./pages/jobs-page";
import { SignupPage } from "./pages/signup-page";

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function createTestSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function signUpAndCreateOrganization(page: Page) {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const email = createTestEmail("jobs-e2e");
  const password = "password123";

  await signupPage.goto();
  await signupPage.name.fill("Taylor Example");
  await signupPage.email.fill(email);
  await signupPage.password.fill(password);
  await signupPage.confirmPassword.fill(password);
  await signupPage.submit.click();

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill("Acme Field Ops");
  await createOrganizationPage.slug.fill(createTestSlug("acme-field-ops"));
  await createOrganizationPage.submit.click();

  await expect(
    page.getByRole("main", { name: "Workspace home" })
  ).toBeVisible();
}

test.describe("jobs flow", () => {
  test.setTimeout(60_000);

  test("supports global and route-specific command bar actions", async ({
    page,
  }) => {
    const jobsPage = new JobsPage(page);

    await signUpAndCreateOrganization(page);
    await runCommandBarAction(page, "Go to Jobs");

    await jobsPage.expectLoaded();
    await runCommandBarAction(page, "Switch to map view");

    await expect(page.getByTestId("jobs-coverage-panel")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Map" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
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
    const blockedReason = "Waiting on the replacement relay to arrive";
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
    await createSheet.siteAddressLine1.fill("1 Main Street");
    await createSheet.siteCounty.fill("Dublin");
    await createSheet.siteEircode.fill("D02 X285");
    await createSheet.closeSiteDialog();
    await createSheet.createInlineContact(contactName);
    await createSheet.submit.click();

    await jobsPage.expectLoaded();
    await expect(page.getByRole("status")).toContainText(jobTitle);
    await expect(jobsPage.jobCard(jobTitle)).toBeVisible();

    await jobsPage.openJob(jobTitle);
    await detailSheet.expectOpen(jobTitle);
    await expect(detailSheet.pickStatusChange).toBeDisabled();
    await expect(
      detailSheet.root.getByText(siteName, { exact: true }).first()
    ).toBeVisible();
    await expect(
      detailSheet.root.getByText(contactName, { exact: true }).first()
    ).toBeVisible();

    await detailSheet.commentBody.fill(comment);
    await detailSheet.addComment.click();
    await expect(detailSheet.commentItem(comment)).toBeVisible();

    await detailSheet.chooseStatusOption("In progress");
    await detailSheet.applyStatusChange.click();
    await expect(
      detailSheet.root.getByText("In progress", { exact: true })
    ).toBeVisible();

    await detailSheet.chooseStatusOption("Blocked");
    await detailSheet.blockedReason.fill(blockedReason);
    await detailSheet.applyStatusChange.click();
    await expect(
      detailSheet.root.getByText("Blocked reason", { exact: true })
    ).toBeVisible();
    await expect(
      detailSheet.root.getByText(blockedReason, { exact: true })
    ).toBeVisible();

    await detailSheet.chooseStatusOption("In progress");
    await detailSheet.applyStatusChange.click();
    await expect(
      detailSheet.root.getByText("In progress", { exact: true })
    ).toBeVisible();
    await expect(
      detailSheet.root.getByText("Blocked reason", { exact: true })
    ).not.toBeVisible();

    await detailSheet.visitDate.fill("2026-04-24");
    await detailSheet.chooseVisitDurationOption("2 hours");
    await detailSheet.visitNote.fill(visitNote);
    await detailSheet.logVisit.click();
    await expect(detailSheet.visitItem(visitNote)).toBeVisible();
    await expect(detailSheet.root.getByText("2h logged")).toBeVisible();

    await detailSheet.chooseStatusOption("Completed");
    await detailSheet.applyStatusChange.click();
    await expect(detailSheet.reopenJob).toBeVisible();

    await detailSheet.reopenJob.click();
    await expect(
      detailSheet.root.getByText("In progress", { exact: true })
    ).toBeVisible();
    await expect(detailSheet.pickStatusChange).toBeDisabled();
  });
});

async function runCommandBarAction(page: Page, label: string) {
  await page.keyboard.press("ControlOrMeta+K");
  const option = page.getByRole("option", { exact: true, name: label });
  await option.click();
  await expect(option).toBeHidden();
}
