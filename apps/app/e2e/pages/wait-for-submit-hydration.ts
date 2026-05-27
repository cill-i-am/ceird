import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

function hasReactHydrationMarker(element: Element) {
  return Object.keys(element).some(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")
  );
}

export async function waitForLocatorHydration(locator: Locator) {
  await expect
    .poll(
      async () => {
        try {
          return await locator.first().evaluate(hasReactHydrationMarker);
        } catch {
          return false;
        }
      },
      {
        timeout: 15_000,
      }
    )
    .toBe(true);
}

export async function waitForSubmitHydration(page: Page) {
  await waitForLocatorHydration(page.locator('button[type="submit"]').first());
}
