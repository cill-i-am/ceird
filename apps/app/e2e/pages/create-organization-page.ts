import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { APP_ORIGIN } from "../test-urls";
import { skipLocationAccessBeforeExpectedPage } from "./location-access-page";
import { waitForSubmitHydration } from "./wait-for-submit-hydration";

export class CreateOrganizationPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly inviteHeading: Locator;
  readonly name: Locator;
  readonly skipInvites: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Create your team",
    });
    this.inviteHeading = page.getByRole("heading", {
      exact: true,
      level: 1,
      name: "Invite members",
    });
    this.name = page.getByLabel("Team name");
    this.skipInvites = page.getByRole("button", { name: "Skip for now" });
    this.submit = page.getByRole("button", {
      exact: true,
      name: "Create team",
    });
  }

  async expectLoaded() {
    await skipLocationAccessBeforeExpectedPage(
      this.page,
      (url) => url.pathname === "/create-organization",
      { timeout: 15_000 }
    );

    await Promise.all([
      expect(this.page).toHaveURL(`${APP_ORIGIN}/create-organization`, {
        timeout: 15_000,
      }),
      expect(this.heading).toBeVisible({ timeout: 15_000 }),
      waitForSubmitHydration(this.page),
    ]);
  }

  async skipInviteStep() {
    await expect(this.inviteHeading).toBeVisible({ timeout: 15_000 });
    await this.skipInvites.click();
  }
}
