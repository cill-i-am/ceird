import { appendFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

import { createSignedInOrganization } from "./helpers/auth-session";
import { LoginPage } from "./pages/login-page";
import { readOptionalEnv } from "./test-origins";

const SHOULD_RUN_STAGE_HARNESS = process.env.SITES_WORKSPACE_PERF_STAGE === "1";
const READY_TIMEOUT_MS = 60_000;
const INTERACTION_TARGET_MS = 150;
const DETAIL_TARGET_MS = 200;

interface BrowserSitesWorkspaceMetric {
  readonly durationMs: number;
  readonly name: string;
  readonly targetMs: number;
}

interface BrowserSitesWorkspaceReport {
  readonly browserMemory: {
    readonly usedJSHeapSizeMb: number | null;
  };
  readonly generatedAt: string;
  readonly initialElectricReadyLatencyMs: number | null;
  readonly interactions: readonly BrowserSitesWorkspaceMetric[];
  readonly rowCountObserved: number;
  readonly source: "playwright-stage";
  readonly status: "ready" | "unavailable";
}

test.describe("Sites workspace live-query performance harness", () => {
  test.skip(
    !SHOULD_RUN_STAGE_HARNESS,
    "Set SITES_WORKSPACE_PERF_STAGE=1 with a prepared Electric stage to run the Sites workspace browser harness."
  );
  test.setTimeout(180_000);

  test("records Electric ready latency and live workspace interactions", async ({
    page,
  }, testInfo) => {
    await signInForSitesWorkspacePerformance(page);

    const startedAt = performance.now();
    await page.goto("/sites-workspace");
    const readyAlert = page.getByRole("heading", {
      name: "Live Sites read model ready",
    });
    const unavailableAlert = page.getByRole("heading", {
      name: "Realtime sites unavailable",
    });
    const status = await waitForReadyOrUnavailable({
      readyAlert,
      unavailableAlert,
    });
    const initialElectricReadyLatencyMs =
      status === "ready" ? Math.round(performance.now() - startedAt) : null;
    const rowButtons = page.locator("button[aria-pressed]");
    const rowCountObserved = await rowButtons.count();
    const interactions =
      status === "ready" && rowCountObserved > 0
        ? await measureSitesWorkspaceInteractions(page)
        : [];
    const report = {
      browserMemory: await readBrowserMemory(page),
      generatedAt: new Date().toISOString(),
      initialElectricReadyLatencyMs,
      interactions,
      rowCountObserved,
      source: "playwright-stage",
      status,
    } satisfies BrowserSitesWorkspaceReport;

    await attachSitesWorkspacePerformanceReport(testInfo, report);

    expect(status).toBe("ready");
    expect(
      initialElectricReadyLatencyMs,
      "Initial Electric ready latency should stay below the TSK-200 5s blocker threshold."
    ).not.toBeNull();
    expect(
      initialElectricReadyLatencyMs ?? Number.POSITIVE_INFINITY
    ).toBeLessThanOrEqual(5000);

    if (process.env.SITES_WORKSPACE_PERF_EXPECT_SEEDED === "1") {
      expect(rowCountObserved).toBeGreaterThanOrEqual(1000);
    }

    for (const metric of interactions) {
      expect(metric.durationMs, `${metric.name} duration`).toBeLessThanOrEqual(
        metric.targetMs
      );
    }
  });
});

async function signInForSitesWorkspacePerformance(page: Page) {
  const email = readOptionalEnv("SITES_WORKSPACE_PERF_EMAIL");
  const password = readOptionalEnv("SITES_WORKSPACE_PERF_PASSWORD");

  if (email !== undefined && password !== undefined) {
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.email.fill(email);
    await loginPage.password.fill(password);
    await loginPage.submit.click();
    await expect(
      page.getByRole("main", { name: "Workspace home" })
    ).toBeVisible({ timeout: 30_000 });
    return;
  }

  await createSignedInOrganization(page, {
    organizationName: "Sites Workspace Performance",
  });
}

async function waitForReadyOrUnavailable({
  readyAlert,
  unavailableAlert,
}: {
  readonly readyAlert: ReturnType<Page["getByRole"]>;
  readonly unavailableAlert: ReturnType<Page["getByRole"]>;
}) {
  await expect
    .poll(
      async () => {
        if (await readyAlert.isVisible()) {
          return "ready";
        }

        if (await unavailableAlert.isVisible()) {
          return "unavailable";
        }

        return "connecting";
      },
      { timeout: READY_TIMEOUT_MS }
    )
    .not.toBe("connecting");

  return (await readyAlert.isVisible()) ? "ready" : "unavailable";
}

async function measureSitesWorkspaceInteractions(page: Page) {
  const searchInput = page.getByLabel("Search sites workspace");
  const sortSelect = page.getByLabel("Sort");
  const rows = page.locator("button[aria-pressed]");

  return [
    await measureBrowserInteraction({
      action: async () => {
        await searchInput.fill("label");
      },
      name: "search.label",
      page,
      targetMs: INTERACTION_TARGET_MS,
    }),
    await measureBrowserInteraction({
      action: async () => {
        await page.getByRole("button", { name: "Active jobs" }).click();
      },
      name: "filter.active-jobs",
      page,
      targetMs: INTERACTION_TARGET_MS,
    }),
    await measureBrowserInteraction({
      action: async () => {
        await sortSelect.selectOption("updated");
      },
      name: "sort.updated",
      page,
      targetMs: INTERACTION_TARGET_MS,
    }),
    await measureBrowserInteraction({
      action: async () => {
        await rows.first().click();
      },
      name: "detail-transition",
      page,
      targetMs: DETAIL_TARGET_MS,
    }),
  ];
}

async function measureBrowserInteraction({
  action,
  name,
  page,
  targetMs,
}: {
  readonly action: () => Promise<void>;
  readonly name: string;
  readonly page: Page;
  readonly targetMs: number;
}) {
  const startedAt = performance.now();

  await action();
  await page.waitForTimeout(0);

  return {
    durationMs: Math.round(performance.now() - startedAt),
    name,
    targetMs,
  } satisfies BrowserSitesWorkspaceMetric;
}

function readBrowserMemory(page: Page) {
  return page.evaluate(() => {
    const performanceWithMemory = performance as Performance & {
      readonly memory?: {
        readonly usedJSHeapSize: number;
      };
    };
    const usedJSHeapSize = performanceWithMemory.memory?.usedJSHeapSize;

    return {
      usedJSHeapSizeMb:
        usedJSHeapSize === undefined
          ? null
          : Math.round((usedJSHeapSize / 1024 / 1024) * 10) / 10,
    };
  });
}

async function attachSitesWorkspacePerformanceReport(
  testInfo: TestInfo,
  report: BrowserSitesWorkspaceReport
) {
  await testInfo.attach("sites-workspace-performance.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });

  if (process.env.DATA_PLANE_PERF_OUTPUT) {
    await appendFile(
      process.env.DATA_PLANE_PERF_OUTPUT,
      `${JSON.stringify({
        projectName: testInfo.project.name,
        repeatEachIndex: testInfo.repeatEachIndex,
        retry: testInfo.retry,
        title: testInfo.title,
        ...report,
      })}\n`,
      "utf8"
    );
  }
}
