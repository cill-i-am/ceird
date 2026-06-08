import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { APP_ORIGIN } from "../test-urls";
import { waitForSubmitHydration } from "./wait-for-submit-hydration";

export class LocationAccessPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly skip: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", {
      exact: true,
      name: "Location access",
    });
    this.skip = page.getByRole("button", { name: "Skip for now" });
  }

  async expectLoaded() {
    await Promise.all([
      expect(this.page).toHaveURL(`${APP_ORIGIN}/location-access`, {
        timeout: 15_000,
      }),
      expect(this.heading).toBeVisible({ timeout: 15_000 }),
      waitForSubmitHydration(this.page),
    ]);
  }

  async skipForNow() {
    await this.expectLoaded();
    await Promise.all([
      this.page.waitForURL((url) => url.pathname !== "/location-access", {
        timeout: 20_000,
      }),
      this.skip.click(),
    ]);
  }
}

export async function skipLocationAccessIfPresent(page: Page) {
  if (new URL(page.url()).pathname !== "/location-access") {
    return;
  }

  await new LocationAccessPage(page).skipForNow();
}

export async function skipLocationAccessBeforeExpectedPage(
  page: Page,
  matchesExpectedPage: (url: URL) => boolean,
  options?: {
    readonly timeout?: number;
  }
) {
  const currentUrl = new URL(page.url());

  if (
    currentUrl.pathname !== "/location-access" &&
    !matchesExpectedPage(currentUrl)
  ) {
    await page.waitForURL(
      (url) => url.pathname === "/location-access" || matchesExpectedPage(url),
      { timeout: options?.timeout ?? 20_000 }
    );
  }

  await skipLocationAccessIfPresent(page);
}
