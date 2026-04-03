import type { Locator, Page } from "@playwright/test";

export class LoginPage {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto("/login");
    await this.page.waitForFunction(() => Boolean(window.__TSR_ROUTER__));
    await this.page.waitForTimeout(1000);
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
