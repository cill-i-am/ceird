import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const JOBS_ROUTE_TIMEOUT_MS = 30_000;

export class JobsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newJobButton: Locator;
  readonly unavailableState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", {
      level: 1,
      name: "Jobs",
    });
    this.newJobButton = page.getByRole("button", { name: "New job" });
    this.unavailableState = page.getByText("Realtime jobs are unavailable");
  }

  async openFromHome() {
    await this.page.getByRole("link", { exact: true, name: "Jobs" }).click();
    await this.expectLoaded();
  }

  async expectLoaded(options: { readonly search?: RegExp } = {}) {
    await Promise.all([
      expect(this.page).toHaveURL(
        options.search
          ? new RegExp(`/jobs\\?${options.search.source}`)
          : /\/jobs$/,
        {
          timeout: JOBS_ROUTE_TIMEOUT_MS,
        }
      ),
      expect(this.heading).toBeVisible({ timeout: JOBS_ROUTE_TIMEOUT_MS }),
    ]);
  }

  async expectRealtimeState() {
    await expect(
      this.newJobButton.or(this.unavailableState).first()
    ).toBeVisible({
      timeout: JOBS_ROUTE_TIMEOUT_MS,
    });
  }
}
