import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export class CreateOrganizationPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly name: Locator;
  readonly slug: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('[data-slot="card-title"]', {
      hasText: "Create your organization",
    });
    this.name = page.getByLabel("Organization name");
    this.slug = page.getByLabel("Organization slug");
    this.submit = page.getByRole("button", { name: /create organization/i });
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(/\/create-organization$/);
    await expect(this.heading).toBeVisible();
  }
}
