import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { waitForLocatorHydration } from "./wait-for-submit-hydration";

const AGENT_CHAT_TIMEOUT_MS = 30_000;
const GLOBAL_AGENT_CHAT_OPEN_EVENT = "ceird:agent-chat-open";

export class GlobalAgentChatPage {
  readonly drawer: Locator;
  readonly launcher: Locator;
  readonly message: Locator;
  readonly page: Page;
  readonly send: Locator;

  constructor(page: Page) {
    this.page = page;
    this.launcher = page
      .locator("header")
      .getByRole("button", { exact: true, name: "Ask Ceird" });
    this.drawer = page.locator('[data-slot="drawer-content"]').filter({
      has: page.getByRole("button", { name: "Close Ask Ceird" }),
    });
    this.message = page.getByRole("textbox", {
      name: "Message Ask Ceird",
    });
    this.send = this.drawer.getByRole("button", { name: "Send" });
  }

  async expectLauncherReady() {
    await expect(this.launcher).toBeVisible({ timeout: AGENT_CHAT_TIMEOUT_MS });
    await waitForLocatorHydration(this.launcher);
    await expect(this.launcher).toBeEnabled({ timeout: AGENT_CHAT_TIMEOUT_MS });
  }

  async open() {
    await this.expectLauncherReady();

    await this.launcher.click({ timeout: 2500 }).catch(() => null);

    await this.openThroughSharedShellEventIfClosed();
    await expect(this.drawer).toBeVisible({ timeout: AGENT_CHAT_TIMEOUT_MS });
  }

  async expectComposerReady() {
    await expect(this.message).toBeVisible({ timeout: AGENT_CHAT_TIMEOUT_MS });
  }

  private async openThroughSharedShellEventIfClosed() {
    if (await this.drawer.isVisible()) {
      return;
    }

    await this.page.evaluate((eventName) => {
      window.dispatchEvent(new CustomEvent(eventName));
    }, GLOBAL_AGENT_CHAT_OPEN_EVENT);
  }
}
