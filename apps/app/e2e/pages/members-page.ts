import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { APP_ORIGIN } from "../test-urls";
import { waitForSubmitHydration } from "./wait-for-submit-hydration";

export class MembersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly email: Locator;
  readonly role: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", {
      level: 1,
      name: "Members",
    });
    this.email = page.getByLabel("Email", { exact: true });
    this.role = page.getByLabel("Role", { exact: true });
    this.submit = page.getByRole("button", { name: "Send invite" });
  }

  async goto() {
    await this.page.goto("/members");
    await this.expectLoaded();
  }

  async openFromNavigation() {
    await this.page.getByRole("link", { name: "Members", exact: true }).click();
    await this.expectLoaded();
  }

  async expectLoaded() {
    await Promise.all([
      expect(this.page).toHaveURL(`${APP_ORIGIN}/members`),
      expect(this.heading).toBeVisible(),
      waitForSubmitHydration(this.page),
    ]);
  }

  pendingInvitation(email: string): Locator {
    return this.page.getByText(email, { exact: true });
  }
}
