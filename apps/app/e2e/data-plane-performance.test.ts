import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { createSignedInOrganization } from "./helpers/auth-session";
import {
  attachPerformanceMetrics,
  expectNoPerformanceFailures,
  measureVisibleInteraction,
} from "./helpers/performance";

test.describe("data-plane browser performance", () => {
  test.setTimeout(420_000);

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

    await enableJobsWorkspacePerfHarness(page);
    await waitForJobsWorkspaceReady(page);

    const newJobButton = page.getByRole("button", {
      exact: true,
      name: "New job",
    });
    await expect(newJobButton).toBeEnabled({ timeout: 180_000 });

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
    ).toBeVisible({ timeout: 180_000 });

    const newSiteButton = page.getByRole("button", { name: /new site/i });
    await expect(newSiteButton).toBeEnabled({ timeout: 180_000 });

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

async function enableJobsWorkspacePerfHarness(page: Page) {
  const url = new URL(page.url());
  url.searchParams.set("perfHarness", "jobs-workspace");

  await page.goto(url.toString());
  await expect(
    page.getByRole("heading", { level: 1, name: "Jobs" })
  ).toBeVisible({ timeout: 30_000 });
}

async function waitForJobsWorkspaceReady(page: Page) {
  await page.waitForFunction(
    () => {
      const snapshot = (
        window as typeof window & {
          readonly __CEIRD_JOBS_WORKSPACE_PERF__?:
            | {
                readonly list: {
                  readonly health: {
                    readonly initialReadyLatencyMs?: number | undefined;
                    readonly status: string;
                  };
                  readonly isReady: boolean;
                };
              }
            | undefined;
        }
      ).__CEIRD_JOBS_WORKSPACE_PERF__;

      return (
        snapshot?.list.isReady === true &&
        snapshot.list.health.status === "ready" &&
        snapshot.list.health.initialReadyLatencyMs !== undefined
      );
    },
    undefined,
    { timeout: 180_000 }
  );
}
