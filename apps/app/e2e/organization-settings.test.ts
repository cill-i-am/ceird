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

async function signUpAndCreateOrganization(
  page: Page,
  {
    emailPrefix,
    organizationName,
    ownerName,
    slugPrefix,
  }: {
    readonly emailPrefix: string;
    readonly organizationName: string;
    readonly ownerName: string;
    readonly slugPrefix: string;
  }
) {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const password = "password123";

  await signupPage.goto();
  await signupPage.name.fill(ownerName);
  await signupPage.email.fill(createTestEmail(emailPrefix));
  await signupPage.password.fill(password);
  await signupPage.confirmPassword.fill(password);
  await signupPage.submit.click();

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill(organizationName);
  await createOrganizationPage.slug.fill(createTestSlug(slugPrefix));
  await createOrganizationPage.submit.click();
  await expectAuthenticatedHome(page);
}

async function chooseCommandOption(page: Page, optionLabel: string) {
  const option = page.getByRole("option", {
    exact: true,
    name: optionLabel,
  });

  await option.click();
  await expect(option).toBeHidden();
}

async function runCommandBarAction(page: Page, label: string) {
  await page.keyboard.press("ControlOrMeta+K");
  await chooseCommandOption(page, label);
}

test("an organization admin can update the organization name from account settings", async ({
  page,
}) => {
  const initialOrganizationName = "Acme Field Ops";
  const updatedOrganizationName = "Northwind Field Ops";

  await signUpAndCreateOrganization(page, {
    emailPrefix: "org-settings",
    organizationName: initialOrganizationName,
    ownerName: "Settings Owner",
    slugPrefix: "acme-field-ops",
  });

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

test("organization settings service areas and rate cards feed sites and job filters", async ({
  page,
}) => {
  const serviceAreaName = "North Dublin";
  const updatedServiceAreaDescription = "Northside priority work";
  const updatedServiceAreaName = "North Dublin Core";
  const siteName = `North Dublin depot ${randomUUID().slice(0, 4)}`;

  await signUpAndCreateOrganization(page, {
    emailPrefix: "org-settings-config",
    organizationName: "Dublin Field Ops",
    ownerName: "Settings Owner",
    slugPrefix: "dublin-field-ops",
  });

  await openSettingsFromAccountMenu(page);

  await page.getByLabel("New service area name").fill(serviceAreaName);
  await page.getByLabel("New service area description").fill("Northside work");
  await page.getByRole("button", { name: "Add service area" }).click();
  await expect(
    page.getByRole("article", { name: `Service area ${serviceAreaName}` })
  ).toBeVisible();

  const serviceArea = page.getByRole("article", {
    name: `Service area ${serviceAreaName}`,
  });
  await serviceArea
    .getByRole("button", { name: `Edit ${serviceAreaName}` })
    .click();
  await serviceArea
    .getByLabel(`Area name for ${serviceAreaName}`)
    .fill(updatedServiceAreaName);
  await serviceArea
    .getByLabel(`Description for ${serviceAreaName}`)
    .fill(updatedServiceAreaDescription);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/service-areas/") &&
        response.status() < 400
    ),
    serviceArea
      .getByRole("button", { name: `Save ${serviceAreaName}` })
      .click(),
  ]);
  await expect(
    page.getByRole("article", {
      name: `Service area ${updatedServiceAreaName}`,
    })
  ).toContainText(updatedServiceAreaDescription);

  await page.getByRole("button", { name: "Add line" }).click();
  await expect(page.getByLabel("Kind for line 1")).toHaveValue("labour");
  await page.getByLabel("Name for line 1").fill("Labour");
  await page.getByLabel("Value for line 1").fill("85");
  await page.getByLabel("Unit for line 1").fill("hour");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/rate-cards") &&
        response.status() < 400
    ),
    page.getByRole("button", { name: "Save rate card" }).click(),
  ]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Organization settings" })
  ).toBeVisible();
  await expect(
    page.getByRole("article", {
      name: `Service area ${updatedServiceAreaName}`,
    })
  ).toContainText(updatedServiceAreaDescription);
  await expect(page.getByLabel("Name for line 1")).toHaveValue("Labour");
  await expect(page.getByLabel("Kind for line 1")).toHaveValue("labour");
  await expect(page.getByLabel("Value for line 1")).toHaveValue("85");
  await expect(page.getByLabel("Unit for line 1")).toHaveValue("hour");

  await page.getByLabel("Kind for line 1").selectOption("callout");
  await page.getByLabel("Name for line 1").fill("Priority callout");
  await page.getByLabel("Value for line 1").fill("110");
  await page.getByLabel("Unit for line 1").fill("visit");
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/rate-cards/") &&
        response.status() < 400
    ),
    page.getByRole("button", { name: "Save rate card" }).click(),
  ]);
  await page.reload();
  await expect(page.getByLabel("Name for line 1")).toHaveValue(
    "Priority callout"
  );
  await expect(page.getByLabel("Kind for line 1")).toHaveValue("callout");
  await expect(page.getByLabel("Value for line 1")).toHaveValue("110");
  await expect(page.getByLabel("Unit for line 1")).toHaveValue("visit");

  await runCommandBarAction(page, "Go to Sites");
  await expect(page).toHaveURL(/\/sites$/);
  await runCommandBarAction(page, "Create site");
  await expect(page).toHaveURL(/\/sites\/new$/);
  await expect(page.getByRole("dialog", { name: "New site" })).toBeVisible();
  await page.getByLabel("Site name").fill(siteName);
  await page.getByLabel("Service area").click();
  await chooseCommandOption(page, updatedServiceAreaName);
  await page.getByLabel("Address line 1").fill("42 North Road");
  await page.getByLabel("County").fill("Dublin");
  await page.getByLabel("Eircode").fill("D01 F5P2");
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page).toHaveURL(/\/sites$/);
  await expect(page.getByRole("status")).toContainText(siteName);
  await expect(page.getByRole("link", { name: siteName })).toBeVisible();
  await expect(
    page.getByText(updatedServiceAreaName, { exact: true })
  ).toBeVisible();

  await runCommandBarAction(page, "Go to Jobs");
  await expect(page).toHaveURL(/\/jobs$/);
  await page.getByRole("button", { name: /More filter: More/ }).click();
  await expect(
    page.getByRole("option", {
      name: `Service area: ${updatedServiceAreaName}`,
    })
  ).toBeVisible();
});
