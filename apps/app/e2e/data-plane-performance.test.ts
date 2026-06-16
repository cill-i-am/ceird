import { test } from "@playwright/test";

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
      await measureVisibleInteraction({
        action: () =>
          page.getByRole("button", { exact: true, name: "New job" }).click(),
        name: "jobs.workspace-create",
        page,
        visible: page.getByLabel("New job title"),
      }),
    ];

    await page.goBack();

    metrics.push(
      await measureVisibleInteraction({
        action: () =>
          page.getByRole("link", { exact: true, name: "Sites" }).click(),
        name: "sites.route",
        page,
        visible: page.getByRole("heading", { level: 1, name: "Sites" }),
      }),
      await measureVisibleInteraction({
        action: () =>
          page
            .locator("header")
            .getByRole("link", { name: "New site" })
            .click(),
        name: "sites.create-sheet",
        page,
        visible: page.getByRole("dialog", { name: "New site" }),
      })
    );

    expectNoPerformanceFailures(metrics);
    await attachPerformanceMetrics(testInfo, metrics);
  });
});
