import type { Page } from "@playwright/test";

export async function waitForSubmitHydration(page: Page) {
  await page.waitForFunction(() => {
    const submitButton = document.querySelector('button[type="submit"]');

    return (
      submitButton !== null &&
      Object.keys(submitButton).some(
        (key) =>
          key.startsWith("__reactFiber$") || key.startsWith("__reactProps$")
      )
    );
  });
}
