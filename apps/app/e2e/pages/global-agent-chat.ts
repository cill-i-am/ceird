import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { waitForLocatorHydration } from "./wait-for-submit-hydration";

const AGENT_CHAT_TIMEOUT_MS = 30_000;
const GLOBAL_AGENT_CHAT_OPEN_EVENT = "ceird:agent-chat-open";

interface AgentChatOpenState {
  readonly clickError?: string;
  readonly drawerCount: number;
  readonly drawerVisible: boolean;
  readonly elementsAtLauncherCenter: readonly string[];
  readonly launcherEnabled: boolean;
  readonly launcherExpanded: string | null;
  readonly launcherHydrated: boolean;
  readonly launcherVisible: boolean;
  readonly preparingTextVisible: boolean;
}

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
    await expect
      .poll(
        async () => {
          const state = await this.tryOpenAndReadState();

          return state.drawerVisible && state.launcherExpanded === "true"
            ? "open"
            : `closed ${JSON.stringify(state)}`;
        },
        {
          timeout: AGENT_CHAT_TIMEOUT_MS,
        }
      )
      .toBe("open");
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

  private async tryOpenAndReadState() {
    let clickError: string | undefined;

    try {
      await this.launcher.click({ timeout: 2500 });
    } catch (error: unknown) {
      clickError = error instanceof Error ? error.message : String(error);
    }

    await this.openThroughSharedShellEventIfClosed();

    return await this.readOpenState(clickError);
  }

  private async readOpenState(
    clickError: string | undefined
  ): Promise<AgentChatOpenState> {
    const launcherBox = await this.launcher.boundingBox();
    const elementsAtLauncherCenter =
      launcherBox === null
        ? []
        : await this.page.evaluate(
            ({ x, y }) =>
              document
                .elementsFromPoint(x, y)
                .slice(0, 5)
                .map((element) =>
                  [
                    element.tagName.toLowerCase(),
                    element.getAttribute("role"),
                    element.getAttribute("aria-label"),
                    element.textContent
                      ?.trim()
                      .replaceAll(/\s+/g, " ")
                      .slice(0, 80),
                  ]
                    .filter(Boolean)
                    .join(":")
                ),
            {
              x: launcherBox.x + launcherBox.width / 2,
              y: launcherBox.y + launcherBox.height / 2,
            }
          );

    return {
      ...(clickError === undefined ? {} : { clickError }),
      drawerCount: await this.drawer.count(),
      drawerVisible: await this.drawer.isVisible(),
      elementsAtLauncherCenter,
      launcherEnabled: await this.launcher.isEnabled(),
      launcherExpanded: await this.launcher.getAttribute("aria-expanded"),
      launcherHydrated: await this.launcher.evaluate((element) =>
        Object.keys(element).some(
          (key) =>
            key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")
        )
      ),
      launcherVisible: await this.launcher.isVisible(),
      preparingTextVisible: await this.page
        .getByText("Preparing workspace context")
        .isVisible(),
    };
  }
}
