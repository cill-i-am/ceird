import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { APP_ORIGIN } from "../test-urls";
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
    this.heading = page.locator('[data-slot="card-title"]', {
      hasText: "Create your team",
    });
    this.inviteHeading = page.locator('[data-slot="card-title"]', {
      hasText: "Invite members",
    });
    this.name = page.getByLabel("Team name");
    this.skipInvites = page.getByRole("button", { name: "Skip for now" });
    this.submit = page.getByRole("button", { name: /create team/i });
  }

  async expectLoaded() {
    await Promise.all([
      expect(this.page).toHaveURL(`${APP_ORIGIN}/create-organization`),
      expect(this.heading).toBeVisible(),
      waitForSubmitHydration(this.page),
    ]);
  }

  async skipInviteStep() {
    await expect(this.inviteHeading).toBeVisible();
    await this.skipInvites.click();
  }
}
