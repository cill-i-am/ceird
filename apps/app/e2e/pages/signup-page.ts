import type { Locator, Page } from "@playwright/test";

import { waitForSubmitHydration } from "./wait-for-submit-hydration";

export class SignupPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto("/signup");
    await this.page.waitForFunction(() => Boolean(window.__TSR_ROUTER__));
    await waitForSubmitHydration(this.page);
  }

  get heading(): Locator {
    return this.page.locator('[data-slot="card-title"]', {
      hasText: "Create an account",
    });
  }

  get name(): Locator {
    return this.page.getByLabel("Name", { exact: true });
  }

  get email(): Locator {
    return this.page.getByLabel("Email", { exact: true });
  }

  get password(): Locator {
    return this.page.locator("#password");
  }

  get confirmPassword(): Locator {
    return this.page.getByLabel("Confirm password", { exact: true });
  }

  get submit(): Locator {
    return this.page.getByRole("button", { name: "Sign up" });
  }

  get alerts(): Locator {
    return this.page.getByRole("alert");
  }
}
