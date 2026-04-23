import type { Locator, Page } from "@playwright/test";

import { waitForSubmitHydration } from "./wait-for-submit-hydration";

export class LoginPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto("/login");
    await waitForSubmitHydration(this.page);
  }

  get heading(): Locator {
    return this.page.locator('[data-slot="card-title"]', {
      hasText: "Sign in",
    });
  }

  get email(): Locator {
    return this.page.getByLabel("Email", { exact: true });
  }

  get password(): Locator {
    return this.page.getByLabel("Password", { exact: true });
  }

  get submit(): Locator {
    return this.page.getByRole("button", { name: "Sign in" });
  }

  get alerts(): Locator {
    return this.page.getByRole("alert");
  }
}
