import { randomUUID } from "node:crypto";

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { CreateOrganizationPage } from "../pages/create-organization-page";
import { skipLocationAccessBeforeExpectedPage } from "../pages/location-access-page";
import { SignupPage } from "../pages/signup-page";
import { markUserEmailVerified } from "./email-verification";
import { createTestPassword } from "./test-account";

const WORKSPACE_HOME_TIMEOUT_MS = 20_000;

function createTestEmail(prefix: string): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

function createTestSlug(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

async function expectAuthenticatedHome(page: Page) {
  const workspaceHome = page.getByRole("main", { name: "Workspace home" });

  await skipLocationAccessBeforeExpectedPage(
    page,
    (url) => url.pathname === "/",
    { timeout: WORKSPACE_HOME_TIMEOUT_MS }
  );
  await expect(page).toHaveURL(/\/$/, {
    timeout: WORKSPACE_HOME_TIMEOUT_MS,
  });
  await expect(workspaceHome).toBeVisible({
    timeout: WORKSPACE_HOME_TIMEOUT_MS,
  });
  await expect(workspaceHome.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Jobs" })
  ).toBeVisible();
}

export async function createSignedInOrganization(
  page: Page,
  input?: {
    readonly email?: string;
    readonly organizationName?: string;
    readonly password?: string;
    readonly userName?: string;
  }
) {
  const signupPage = new SignupPage(page);
  const createOrganizationPage = new CreateOrganizationPage(page);
  const email = input?.email ?? createTestEmail("e2e-user");
  const password = input?.password ?? createTestPassword();
  const organizationName =
    input?.organizationName ?? createTestSlug("ceird-e2e");

  await signupPage.goto();
  await signupPage.name.fill(input?.userName ?? "Taylor Example");
  await signupPage.email.fill(email);
  await signupPage.password.fill(password);
  await signupPage.submit.click();
  await markUserEmailVerified(email);

  await createOrganizationPage.expectLoaded();
  await createOrganizationPage.name.fill(organizationName);
  await createOrganizationPage.submit.click();
  await createOrganizationPage.skipInviteStep();
  await expectAuthenticatedHome(page);

  return {
    email,
    password,
  };
}
