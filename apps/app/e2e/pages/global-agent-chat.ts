import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const AGENT_CHAT_TIMEOUT_MS = 30_000;

export class GlobalAgentChatPage {
  readonly drawer: Locator;
  readonly launcher: Locator;
  readonly message: Locator;
  readonly page: Page;
  readonly send: Locator;

  constructor(page: Page) {
    this.page = page;
    this.launcher = page.getByRole("button", { name: "Ask Ceird" });
    this.drawer = page.getByRole("dialog", { name: "Ask Ceird" });
    this.message = this.drawer.getByRole("textbox", {
      name: "Message Ask Ceird",
    });
    this.send = this.drawer.getByRole("button", { name: "Send" });
  }

  async expectLauncherReady() {
    await expect(this.launcher).toBeVisible({ timeout: AGENT_CHAT_TIMEOUT_MS });
  }

  async open() {
    await this.expectLauncherReady();
    await expect(async () => {
      await this.launcher.click();
      await expect(this.launcher).toHaveAttribute("aria-expanded", "true", {
        timeout: 1000,
      });
    }).toPass({ timeout: AGENT_CHAT_TIMEOUT_MS });
    await expect(this.drawer).toBeVisible({ timeout: AGENT_CHAT_TIMEOUT_MS });
    await expect(this.message).toBeVisible({ timeout: AGENT_CHAT_TIMEOUT_MS });
  }
}
