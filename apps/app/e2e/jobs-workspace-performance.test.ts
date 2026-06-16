import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

import { readOptionalEnv } from "./test-origins";
import { APP_ORIGIN, TENANT_ORIGIN } from "./test-urls";

interface JobsWorkspaceBrowserSnapshot {
  readonly detail?: {
    readonly commentCount?: number | undefined;
    readonly graphCounts: {
      readonly activity: number;
      readonly actors: number;
      readonly collaborators: number;
      readonly comments: number;
      readonly jobComments: number;
      readonly memberActorSummaries: number;
      readonly visits: number;
    };
    readonly health: JobsWorkspaceHealthSnapshot;
    readonly isReady: boolean;
    readonly selectedJobId?: string | undefined;
  };
  readonly list: {
    readonly graphCounts: {
      readonly contacts: number;
      readonly jobLabelAssignments: number;
      readonly jobs: number;
      readonly labels: number;
      readonly sites: number;
    };
    readonly health: JobsWorkspaceHealthSnapshot;
    readonly isReady: boolean;
    readonly rows: readonly {
      readonly id: string;
      readonly labelCount: number;
      readonly priority: string;
      readonly siteId?: string | undefined;
      readonly status: string;
      readonly title: string;
    }[];
  };
  readonly measuredAt: number;
}

interface JobsWorkspaceHealthSnapshot {
  readonly initialReadyLatencyMs?: number | undefined;
  readonly status: string;
  readonly subscriptionName?: string | undefined;
}

interface JobsWorkspaceStageEvidence {
  readonly generatedAt: string;
  readonly initialElectricReadyLatencyMs: number;
  readonly interactions: readonly BrowserInteractionMetric[];
  readonly prd: string;
  readonly project: string;
  readonly route: string;
  readonly detailRowCounts?: NonNullable<
    JobsWorkspaceBrowserSnapshot["detail"]
  >["graphCounts"];
  readonly rowCounts: JobsWorkspaceBrowserSnapshot["list"]["graphCounts"];
  readonly sourceIssue: string;
  readonly stage: {
    readonly appOrigin: string;
    readonly tenantOrigin?: string | undefined;
  };
}

interface BrowserInteractionMetric {
  readonly durationMs: number;
  readonly name: string;
  readonly rows?: number | undefined;
}

const REQUIRED_ENV = process.env.JOBS_WORKSPACE_STAGE_PERF_REQUIRED === "1";
const STORAGE_STATE = readOptionalEnv("JOBS_WORKSPACE_STAGE_STORAGE_STATE");
const OUTPUT_PATH = readOptionalEnv("JOBS_WORKSPACE_STAGE_PERF_OUTPUT");
const STAGE_ORIGIN = TENANT_ORIGIN ?? APP_ORIGIN;
const EXPECTED_COUNTS = {
  contacts: readExpectedCount("JOBS_WORKSPACE_EXPECTED_MIN_CONTACTS", 1),
  jobLabelAssignments: readExpectedCount(
    "JOBS_WORKSPACE_EXPECTED_MIN_JOB_LABEL_ASSIGNMENTS",
    15_000
  ),
  jobs: readExpectedCount("JOBS_WORKSPACE_EXPECTED_MIN_JOBS", 5000),
  labels: readExpectedCount("JOBS_WORKSPACE_EXPECTED_MIN_LABELS", 100),
  sites: readExpectedCount("JOBS_WORKSPACE_EXPECTED_MIN_SITES", 1000),
};
const READY_TIMEOUT_MS = readExpectedCount(
  "JOBS_WORKSPACE_STAGE_READY_TIMEOUT_MS",
  60_000
);

test.describe("jobs workspace stage performance evidence", () => {
  test.setTimeout(120_000);
  test.skip(
    !REQUIRED_ENV && STORAGE_STATE === undefined,
    "Set JOBS_WORKSPACE_STAGE_PERF_REQUIRED=1 and JOBS_WORKSPACE_STAGE_STORAGE_STATE to collect seeded stage evidence."
  );
  test.use(STORAGE_STATE ? { storageState: STORAGE_STATE } : {});

  test("records Electric ready latency and representative browser timings", async ({
    page,
  }, testInfo) => {
    if (STORAGE_STATE === undefined) {
      throw new Error(
        "JOBS_WORKSPACE_STAGE_STORAGE_STATE is required. Provide a Playwright storage state file for an already signed-in seeded stage account; this harness does not create accounts, organizations, or seed data."
      );
    }

    const route = `${STAGE_ORIGIN}/jobs-workspace?perfHarness=jobs-workspace`;
    const interactions: BrowserInteractionMetric[] = [];

    await page.goto(route);
    const initialReady = await waitForJobsWorkspaceReady(page);
    assertSeededShape(initialReady);
    expect(
      initialReady.list.health.initialReadyLatencyMs,
      "Jobs workspace list health must report Electric initial ready latency."
    ).toEqual(expect.any(Number));

    const [firstRow] = initialReady.list.rows;
    expect(
      firstRow,
      "Seeded stage must expose at least one visible job"
    ).toBeDefined();

    const searchToken = firstRow?.title.split(/\s+/).find(Boolean) ?? "";
    if (searchToken.length > 0) {
      interactions.push(
        await measureBrowserInteraction(
          "jobs-workspace.search",
          page,
          async () => {
            await page.getByLabel("Search live jobs").fill(searchToken);
            const snapshot = await waitForJobsWorkspaceReady(page);

            return snapshot.list.rows.length;
          }
        )
      );
      await page.getByRole("button", { name: /Clear/ }).click();
      await waitForJobsWorkspaceReady(page);
    }

    interactions.push(
      await measureBrowserInteraction(
        "jobs-workspace.status-filter",
        page,
        async () => {
          await page.getByRole("button", { exact: true, name: "All" }).click();
          const snapshot = await waitForJobsWorkspaceReady(page);

          return snapshot.list.rows.length;
        }
      )
    );

    interactions.push(
      await measureBrowserInteraction(
        "jobs-workspace.sort-priority",
        page,
        async () => {
          await page.getByLabel("Sort jobs").selectOption("priority");
          const snapshot = await waitForJobsWorkspaceReady(page);

          return snapshot.list.rows.length;
        }
      )
    );

    const labelSelect = page.getByLabel("Filter by label");
    const labelOptions = await labelSelect.locator("option").count();
    if (labelOptions > 1) {
      interactions.push(
        await measureBrowserInteraction(
          "jobs-workspace.label-filter",
          page,
          async () => {
            const labelValue = await labelSelect
              .locator("option")
              .nth(1)
              .getAttribute("value");
            expect(labelValue).toBeTruthy();
            await labelSelect.selectOption(labelValue ?? "");
            const snapshot = await waitForJobsWorkspaceReady(page);

            return snapshot.list.rows.length;
          }
        )
      );
      await page.getByRole("button", { name: /Clear/ }).click();
      await waitForJobsWorkspaceReady(page);
    }

    interactions.push(
      await measureBrowserInteraction(
        "jobs-workspace.detail-open",
        page,
        async () => {
          await page
            .getByRole("button", { name: /^Open detail for / })
            .first()
            .click();
          const snapshot = await waitForJobsWorkspaceDetailReady(page);

          return snapshot.detail?.commentCount ?? 0;
        }
      )
    );

    const finalSnapshot = await readJobsWorkspaceSnapshot(page);
    const evidence: JobsWorkspaceStageEvidence = {
      generatedAt: new Date().toISOString(),
      initialElectricReadyLatencyMs:
        initialReady.list.health.initialReadyLatencyMs ?? 0,
      interactions,
      prd: "Realtime Jobs Surface PRD",
      project: "Realtime Jobs Surface",
      route,
      ...(finalSnapshot.detail === undefined
        ? {}
        : { detailRowCounts: finalSnapshot.detail.graphCounts }),
      rowCounts: finalSnapshot.list.graphCounts,
      sourceIssue: "TSK-236",
      stage: {
        appOrigin: APP_ORIGIN,
        ...(TENANT_ORIGIN === undefined ? {} : { tenantOrigin: TENANT_ORIGIN }),
      },
    };

    await attachJobsWorkspaceStageEvidence(testInfo, evidence);
  });
});

async function waitForJobsWorkspaceReady(
  page: Page
): Promise<JobsWorkspaceBrowserSnapshot> {
  await page.waitForFunction(
    () => {
      const snapshot = (
        window as typeof window & {
          readonly __CEIRD_JOBS_WORKSPACE_PERF__?:
            | JobsWorkspaceBrowserSnapshot
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
    { timeout: READY_TIMEOUT_MS }
  );

  return readJobsWorkspaceSnapshot(page);
}

async function waitForJobsWorkspaceDetailReady(
  page: Page
): Promise<JobsWorkspaceBrowserSnapshot> {
  await page.waitForFunction(
    () =>
      (
        window as typeof window & {
          readonly __CEIRD_JOBS_WORKSPACE_PERF__?:
            | JobsWorkspaceBrowserSnapshot
            | undefined;
        }
      ).__CEIRD_JOBS_WORKSPACE_PERF__?.detail?.isReady === true,
    undefined,
    { timeout: READY_TIMEOUT_MS }
  );

  return readJobsWorkspaceSnapshot(page);
}

function readJobsWorkspaceSnapshot(
  page: Page
): Promise<JobsWorkspaceBrowserSnapshot> {
  return page.evaluate(() => {
    const snapshot = (
      window as typeof window & {
        readonly __CEIRD_JOBS_WORKSPACE_PERF__?:
          | JobsWorkspaceBrowserSnapshot
          | undefined;
      }
    ).__CEIRD_JOBS_WORKSPACE_PERF__;

    if (snapshot === undefined) {
      throw new Error(
        "Jobs workspace performance snapshot was not published. Navigate with ?perfHarness=jobs-workspace."
      );
    }

    return snapshot;
  });
}

async function measureBrowserInteraction(
  name: string,
  page: Page,
  action: () => Promise<number | undefined>
): Promise<BrowserInteractionMetric> {
  const startedAt = await page.evaluate(() => performance.now());
  const rows = await action();
  const finishedAt = await page.evaluate(() => performance.now());

  return {
    durationMs: Math.round(finishedAt - startedAt),
    name,
    ...(rows === undefined ? {} : { rows }),
  };
}

function assertSeededShape(snapshot: JobsWorkspaceBrowserSnapshot) {
  for (const [name, expected] of Object.entries(EXPECTED_COUNTS)) {
    const actual =
      snapshot.list.graphCounts[
        name as keyof JobsWorkspaceBrowserSnapshot["list"]["graphCounts"]
      ];

    expect(
      actual,
      `Seeded Jobs workspace ${name} count must be >= ${expected}. ` +
        "Use an already prepared TSK-200-shaped stage/account; this harness does not seed provider data."
    ).toBeGreaterThanOrEqual(expected);
  }
}

async function attachJobsWorkspaceStageEvidence(
  testInfo: TestInfo,
  evidence: JobsWorkspaceStageEvidence
) {
  const body = JSON.stringify(evidence, null, 2);

  await testInfo.attach("jobs-workspace-stage-performance.json", {
    body,
    contentType: "application/json",
  });

  if (OUTPUT_PATH) {
    await mkdir(dirname(OUTPUT_PATH), { recursive: true });
    await writeFile(OUTPUT_PATH, `${body}\n`, "utf8");
  }
}

function readExpectedCount(name: string, fallback: number): number {
  const value = readOptionalEnv(name);

  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}
