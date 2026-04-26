import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { APP_ORIGIN } from "../test-urls";

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
    await expect(this.page).toHaveURL(`${APP_ORIGIN}/members`);
    await expect(this.heading).toBeVisible();
    await this.page.waitForFunction(() => {
      const submitButton = document.querySelector('button[type="submit"]');

      return (
        submitButton !== null &&
        Object.keys(submitButton).some(
          (key) =>
            key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")
        )
      );
    });
  }

  pendingInvitation(email: string): Locator {
    return this.page.getByText(email, { exact: true });
  }
}
