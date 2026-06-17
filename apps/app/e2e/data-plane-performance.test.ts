import { expect, test } from "@playwright/test";

import { createSignedInOrganization } from "./helpers/auth-session";
import {
  attachPerformanceMetrics,
  expectNoPerformanceFailures,
  measureVisibleInteraction,
} from "./helpers/performance";

test.describe("data-plane browser performance", () => {
  test.setTimeout(120_000);

  test("loads jobs and sites flows without extra failed data requests", async ({
    page,
  }, testInfo) => {
    await createSignedInOrganization(page, {
      organizationName: "Data Plane E2E",
    });

    const metrics = [
      await measureVisibleInteraction({
        action: () =>
          page.getByRole("link", { exact: true, name: "Jobs" }).click(),
        name: "jobs.route",
        page,
        visible: page.getByRole("heading", { level: 1, name: "Jobs" }),
      }),
    ];

    const newJobButton = page.getByRole("button", {
      exact: true,
      name: "New job",
    });
    await expect(newJobButton).toBeEnabled({ timeout: 60_000 });

    metrics.push(
      await measureVisibleInteraction({
        action: () => newJobButton.click(),
        name: "jobs.workspace-create",
        page,
        visible: page.getByLabel("New job title"),
      })
    );

    await page.goBack();

    metrics.push(
      await measureVisibleInteraction({
        action: () =>
          page.getByRole("link", { exact: true, name: "Sites" }).click(),
        name: "sites.route",
        page,
        visible: page.getByRole("heading", { level: 1, name: "Sites" }),
      })
    );

    await expect(
      page.getByText("Live Sites read model ready", { exact: true })
    ).toBeVisible({ timeout: 60_000 });

    const newSiteButton = page.getByRole("button", { name: /new site/i });
    await expect(newSiteButton).toBeEnabled({ timeout: 60_000 });

    metrics.push(
      await measureVisibleInteraction({
        action: () => newSiteButton.click(),
        name: "sites.workspace-create",
        page,
        visible: page.getByRole("form", { name: "Create site" }),
      })
    );

    expectNoPerformanceFailures(metrics);
    await attachPerformanceMetrics(testInfo, metrics);
  });
});
