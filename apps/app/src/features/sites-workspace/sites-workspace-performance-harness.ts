import type { JobListItem } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type { SiteOption } from "@ceird/sites-core";

import { deriveSitesWorkspaceVisibleRows } from "./sites-workspace-data-plane";
import type {
  SiteActiveJobSummaryElectricRow,
  SiteLabelAssignmentElectricRow,
  SitesWorkspaceFilter,
  SitesWorkspaceSort,
} from "./sites-workspace-data-plane";

const DEFAULT_FIXTURE = {
  jobs: 5000,
  labels: 100,
  labelsPerSite: 3,
  sites: 1000,
} as const;
const LOCAL_INTERACTION_TARGET_MS = 150;
const DETAIL_OPEN_TARGET_MS = 200;
const ELECTRIC_READY_TARGET_MS = 3000;
const ELECTRIC_READY_BLOCKER_MS = 5000;
const DEFAULT_ITERATIONS = 25;
const DEFAULT_WARMUP_ITERATIONS = 5;

interface NodeProcessLike {
  readonly argv?: readonly string[];
  readonly env?: Record<string, string | undefined>;
  readonly memoryUsage?: () => NodeMemoryUsage;
  readonly cpuUsage?: (previous?: NodeCpuUsage) => NodeCpuUsage;
  readonly stdout?: {
    readonly write: (chunk: string) => void;
  };
}

interface NodeCpuUsage {
  readonly system: number;
  readonly user: number;
}

interface NodeMemoryUsage {
  readonly arrayBuffers?: number;
  readonly external: number;
  readonly heapTotal: number;
  readonly heapUsed: number;
  readonly rss: number;
}

interface SitesWorkspacePerformanceFixture {
  readonly activeJobSummaries: readonly SiteActiveJobSummaryElectricRow[];
  readonly labels: readonly Label[];
  readonly relatedJobs: readonly JobListItem[];
  readonly siteLabelAssignments: readonly SiteLabelAssignmentElectricRow[];
  readonly sites: readonly SiteOption[];
}

export interface SitesWorkspacePerformanceBudget {
  readonly detailOpenTargetMs: number;
  readonly electricReadyBlockerMs: number;
  readonly electricReadyTargetMs: number;
  readonly localInteractionTargetMs: number;
}

export interface SitesWorkspacePerformanceMetric {
  readonly maxMs: number;
  readonly meanMs: number;
  readonly minMs: number;
  readonly name: string;
  readonly p95Ms: number;
  readonly samples: readonly number[];
  readonly targetMs: number;
}

export interface SitesWorkspacePerformanceReport {
  readonly budget: SitesWorkspacePerformanceBudget;
  readonly cpu: {
    readonly systemMs: number | null;
    readonly userMs: number | null;
  };
  readonly electricReadyLatencyMs: number | null;
  readonly fixture: {
    readonly activeJobSummaries: number;
    readonly jobs: number;
    readonly labelAssignments: number;
    readonly labels: number;
    readonly labelsPerSite: number;
    readonly sites: number;
  };
  readonly generatedAt: string;
  readonly interactions: readonly SitesWorkspacePerformanceMetric[];
  readonly memory: {
    readonly afterHeapUsedMb: number | null;
    readonly beforeHeapUsedMb: number | null;
    readonly deltaHeapUsedMb: number | null;
  };
  readonly recomputation: readonly {
    readonly inputRows: number;
    readonly name: string;
    readonly outputRows: number;
  }[];
  readonly recommendations: readonly string[];
  readonly source: "synthetic-local";
}

export function runSitesWorkspacePerformanceHarness(input?: {
  readonly electricReadyLatencyMs?: number | null | undefined;
  readonly iterations?: number | undefined;
  readonly now?: () => string;
}): SitesWorkspacePerformanceReport {
  const processLike = getProcessLike();
  const iterations = input?.iterations ?? DEFAULT_ITERATIONS;
  const fixture = createSitesWorkspacePerformanceFixture(DEFAULT_FIXTURE);
  const beforeMemory = processLike?.memoryUsage?.();
  const beforeCpu = processLike?.cpuUsage?.();
  const detailSiteId = selectDetailSiteId(fixture);
  const interactions = measureSitesWorkspaceInteractions({
    detailSiteId,
    fixture,
    iterations,
  });
  const afterCpu =
    beforeCpu === undefined ? undefined : processLike?.cpuUsage?.(beforeCpu);
  const afterMemory = processLike?.memoryUsage?.();
  const electricReadyLatencyMs = input?.electricReadyLatencyMs ?? null;
  const budget = {
    detailOpenTargetMs: DETAIL_OPEN_TARGET_MS,
    electricReadyBlockerMs: ELECTRIC_READY_BLOCKER_MS,
    electricReadyTargetMs: ELECTRIC_READY_TARGET_MS,
    localInteractionTargetMs: LOCAL_INTERACTION_TARGET_MS,
  } satisfies SitesWorkspacePerformanceBudget;

  return {
    budget,
    cpu: formatCpuUsage(afterCpu),
    electricReadyLatencyMs,
    fixture: {
      activeJobSummaries: fixture.activeJobSummaries.length,
      jobs: fixture.relatedJobs.length,
      labelAssignments: fixture.siteLabelAssignments.length,
      labels: fixture.labels.length,
      labelsPerSite: DEFAULT_FIXTURE.labelsPerSite,
      sites: fixture.sites.length,
    },
    generatedAt: input?.now?.() ?? new Date().toISOString(),
    interactions,
    memory: formatMemoryUsage({ afterMemory, beforeMemory }),
    recomputation: createRecomputationSummary({ detailSiteId, fixture }),
    recommendations: createRecommendations({
      budget,
      electricReadyLatencyMs,
      interactions,
    }),
    source: "synthetic-local",
  };
}

function measureSitesWorkspaceInteractions({
  detailSiteId,
  fixture,
  iterations,
}: {
  readonly detailSiteId: string;
  readonly fixture: SitesWorkspacePerformanceFixture;
  readonly iterations: number;
}) {
  return [
    measureInteraction({
      iterations,
      name: "list.label-join.name-sort",
      run: () =>
        deriveRows(fixture, {
          filter: "all",
          query: "",
          sort: "name",
        }),
      targetMs: LOCAL_INTERACTION_TARGET_MS,
    }),
    measureInteraction({
      iterations,
      name: "search.label-and-location",
      run: () =>
        deriveRows(fixture, {
          filter: "all",
          query: "label 042 dublin",
          sort: "name",
        }),
      targetMs: LOCAL_INTERACTION_TARGET_MS,
    }),
    measureInteraction({
      iterations,
      name: "filter.active-jobs",
      run: () =>
        deriveRows(fixture, {
          filter: "with-active-jobs",
          query: "",
          sort: "active-jobs",
        }),
      targetMs: LOCAL_INTERACTION_TARGET_MS,
    }),
    measureInteraction({
      iterations,
      name: "filter.needs-location",
      run: () =>
        deriveRows(fixture, {
          filter: "needs-location",
          query: "",
          sort: "updated",
        }),
      targetMs: LOCAL_INTERACTION_TARGET_MS,
    }),
    measureInteraction({
      iterations,
      name: "active-job-summary-update",
      run: () =>
        deriveRows(
          {
            ...fixture,
            activeJobSummaries: updateActiveJobSummary(
              fixture.activeJobSummaries,
              detailSiteId
            ),
          },
          {
            filter: "with-active-jobs",
            query: "",
            sort: "active-jobs",
          }
        ),
      targetMs: LOCAL_INTERACTION_TARGET_MS,
    }),
    measureInteraction({
      iterations,
      name: "detail-transition.related-jobs",
      run: () => {
        const rows = deriveRows(fixture, {
          filter: "all",
          query: "",
          sort: "name",
        });

        return rows.find((row) => row.site.id === detailSiteId);
      },
      targetMs: DETAIL_OPEN_TARGET_MS,
    }),
  ];
}

function createRecomputationSummary({
  detailSiteId,
  fixture,
}: {
  readonly detailSiteId: string;
  readonly fixture: SitesWorkspacePerformanceFixture;
}) {
  const inputRows = countInputRows(fixture);

  return [
    {
      inputRows,
      name: "list.label-join.name-sort",
      outputRows: deriveRows(fixture, {
        filter: "all",
        query: "",
        sort: "name",
      }).length,
    },
    {
      inputRows,
      name: "active-job-summary-update",
      outputRows: deriveRows(
        {
          ...fixture,
          activeJobSummaries: updateActiveJobSummary(
            fixture.activeJobSummaries,
            detailSiteId
          ),
        },
        {
          filter: "with-active-jobs",
          query: "",
          sort: "active-jobs",
        }
      ).length,
    },
    {
      inputRows,
      name: "detail-transition.related-jobs",
      outputRows:
        deriveRows(fixture, {
          filter: "all",
          query: "",
          sort: "name",
        }).find((row) => row.site.id === detailSiteId)?.relatedJobs.length ?? 0,
    },
  ];
}

function formatCpuUsage(cpu: NodeCpuUsage | undefined) {
  return {
    systemMs: cpu === undefined ? null : roundToOneDecimal(cpu.system / 1000),
    userMs: cpu === undefined ? null : roundToOneDecimal(cpu.user / 1000),
  };
}

function formatMemoryUsage({
  afterMemory,
  beforeMemory,
}: {
  readonly afterMemory: NodeMemoryUsage | undefined;
  readonly beforeMemory: NodeMemoryUsage | undefined;
}) {
  return {
    afterHeapUsedMb: toMegabytes(afterMemory?.heapUsed),
    beforeHeapUsedMb: toMegabytes(beforeMemory?.heapUsed),
    deltaHeapUsedMb:
      beforeMemory === undefined || afterMemory === undefined
        ? null
        : toMegabytes(afterMemory.heapUsed - beforeMemory.heapUsed),
  };
}

function selectDetailSiteId(fixture: SitesWorkspacePerformanceFixture) {
  const detailSiteId = fixture.sites.at(37)?.id ?? fixture.sites[0]?.id;

  if (detailSiteId === undefined) {
    throw new Error(
      "Sites workspace performance fixture did not create sites."
    );
  }

  return detailSiteId;
}

function createSitesWorkspacePerformanceFixture({
  jobs,
  labels,
  labelsPerSite,
  sites,
}: {
  readonly jobs: number;
  readonly labels: number;
  readonly labelsPerSite: number;
  readonly sites: number;
}): SitesWorkspacePerformanceFixture {
  const createdLabels = Array.from({ length: labels }, (_, index) =>
    createLabel(index)
  );
  const createdSites = Array.from({ length: sites }, (_, index) =>
    createSite(index)
  );
  const siteLabelAssignments = createdSites.flatMap((site, siteIndex) =>
    Array.from({ length: labelsPerSite }, (_, offset) =>
      createSiteLabelAssignment({
        label: getFixtureItem(
          createdLabels,
          (siteIndex * labelsPerSite + offset) % labels,
          "label"
        ),
        site,
      })
    )
  );
  const relatedJobs = Array.from({ length: jobs }, (_, index) =>
    createRelatedJob({
      index,
      site: getFixtureItem(createdSites, index % sites, "site"),
    })
  );
  const activeJobCountBySiteId = new Map<string, number>();

  for (const job of relatedJobs) {
    if (job.siteId === undefined || !isActiveJobStatus(job.status)) {
      continue;
    }

    activeJobCountBySiteId.set(
      job.siteId,
      (activeJobCountBySiteId.get(job.siteId) ?? 0) + 1
    );
  }

  return {
    activeJobSummaries: createdSites.map((site, index) => ({
      activeJobCount: activeJobCountBySiteId.get(site.id) ?? 0,
      highestActiveJobPriority: index % 17 === 0 ? "urgent" : "medium",
      organizationId: "org_sites_perf",
      siteId: site.id,
      updatedAt: timestamp(index),
    })),
    labels: createdLabels,
    relatedJobs,
    siteLabelAssignments,
    sites: createdSites,
  };
}

function createRecommendations({
  budget,
  electricReadyLatencyMs,
  interactions,
}: {
  readonly budget: SitesWorkspacePerformanceBudget;
  readonly electricReadyLatencyMs: number | null;
  readonly interactions: readonly SitesWorkspacePerformanceMetric[];
}) {
  const recommendations: string[] = [];

  if (electricReadyLatencyMs === null) {
    recommendations.push(
      "Initial Electric ready latency was not measured in the synthetic local harness; run the Playwright stage harness against the agreed seeded stage before cutover."
    );
  } else if (electricReadyLatencyMs > budget.electricReadyBlockerMs) {
    recommendations.push(
      "Initial Electric ready latency exceeds the 5s blocker threshold; reduce shape size, add narrower projections, or defer cutover."
    );
  } else if (electricReadyLatencyMs > budget.electricReadyTargetMs) {
    recommendations.push(
      "Initial Electric ready latency misses the 3s target; record an explicit follow-up before cutover."
    );
  }

  for (const interaction of interactions) {
    if (interaction.p95Ms <= interaction.targetMs) {
      continue;
    }

    recommendations.push(
      `${interaction.name} p95 ${interaction.p95Ms}ms exceeds ${interaction.targetMs}ms; inspect the Sites visible-row projection and consider indexed derived state before cutover.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Synthetic projection timings are within the TSK-200 local interaction targets; stage Electric ready latency remains the cutover gate."
    );
  }

  return recommendations;
}

function deriveRows(
  fixture: SitesWorkspacePerformanceFixture,
  options: {
    readonly filter: SitesWorkspaceFilter;
    readonly query: string;
    readonly sort: SitesWorkspaceSort;
  }
) {
  return deriveSitesWorkspaceVisibleRows({
    activeJobSummaries: fixture.activeJobSummaries,
    filter: options.filter,
    labels: fixture.labels,
    query: options.query,
    relatedJobs: fixture.relatedJobs,
    siteLabelAssignments: fixture.siteLabelAssignments,
    sites: fixture.sites,
    sort: options.sort,
  });
}

function measureInteraction<Output>({
  iterations,
  name,
  run,
  targetMs,
}: {
  readonly iterations: number;
  readonly name: string;
  readonly run: () => Output;
  readonly targetMs: number;
}): SitesWorkspacePerformanceMetric {
  const samples: number[] = [];

  for (let index = 0; index < DEFAULT_WARMUP_ITERATIONS; index += 1) {
    const output = run();

    if (output === undefined) {
      throw new Error(`${name} did not produce output.`);
    }
  }

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const output = run();

    if (output === undefined) {
      throw new Error(`${name} did not produce output.`);
    }

    samples.push(roundToOneDecimal(performance.now() - startedAt));
  }

  return {
    maxMs: Math.max(...samples),
    meanMs: roundToOneDecimal(
      samples.reduce((total, sample) => total + sample, 0) / samples.length
    ),
    minMs: Math.min(...samples),
    name,
    p95Ms: percentile(samples, 0.95),
    samples,
    targetMs,
  };
}

function updateActiveJobSummary(
  summaries: readonly SiteActiveJobSummaryElectricRow[],
  siteId: string
) {
  return summaries.map((summary) =>
    summary.siteId === siteId
      ? {
          ...summary,
          activeJobCount: summary.activeJobCount + 1,
          highestActiveJobPriority: "urgent" as const,
          updatedAt: "2026-06-16T12:00:00.000Z",
        }
      : summary
  );
}

function countInputRows(fixture: SitesWorkspacePerformanceFixture) {
  return (
    fixture.activeJobSummaries.length +
    fixture.labels.length +
    fixture.relatedJobs.length +
    fixture.siteLabelAssignments.length +
    fixture.sites.length
  );
}

function createLabel(index: number) {
  return {
    createdAt: timestamp(index),
    id: uuid("10000000", index),
    name: `Label ${index.toString().padStart(3, "0")}`,
    updatedAt: timestamp(index),
  } as Label;
}

function createSite(index: number) {
  const hasUsableCoordinates = index % 5 !== 0;
  const city = index % 2 === 0 ? "Dublin" : "Cork";

  return {
    accessNotes:
      index % 7 === 0
        ? `Access gate ${index.toString().padStart(4, "0")}`
        : undefined,
    displayLocation: `${city} Yard ${index.toString().padStart(4, "0")}`,
    formattedAddress: `${index} Harbour Road, ${city}`,
    hasUsableCoordinates,
    id: uuid("20000000", index),
    labels: [],
    locationStatus: hasUsableCoordinates ? "validated" : "unverified",
    name: `Site ${index.toString().padStart(4, "0")}`,
    updatedAt: timestamp(index),
  } as unknown as SiteOption;
}

function createSiteLabelAssignment({
  label,
  site,
}: {
  readonly label: Label;
  readonly site: SiteOption;
}): SiteLabelAssignmentElectricRow {
  return {
    createdAt: "2026-06-01T00:00:00.000Z",
    labelId: label.id,
    organizationId: "org_sites_perf",
    siteId: site.id,
  };
}

function createRelatedJob({
  index,
  site,
}: {
  readonly index: number;
  readonly site: SiteOption;
}) {
  const statuses = [
    "new",
    "scheduled",
    "in_progress",
    "completed",
    "canceled",
  ] as const;
  const priorities = ["low", "medium", "high", "urgent"] as const;

  return {
    createdAt: timestamp(index),
    id: uuid("30000000", index),
    kind: "job",
    labels: [],
    priority: priorities[index % priorities.length],
    siteId: site.id,
    status: statuses[index % statuses.length],
    title: `Work item ${index.toString().padStart(5, "0")}`,
    updatedAt: timestamp(index + 5000),
  } as unknown as JobListItem;
}

function isActiveJobStatus(status: string) {
  return status !== "completed" && status !== "canceled";
}

function percentile(samples: readonly number[], value: number) {
  const sorted = samples.toSorted((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * value) - 1
  );

  return sorted[index] ?? 0;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function timestamp(offset: number) {
  const day = (offset % 28) + 1;
  const hour = offset % 24;

  return `2026-06-${day.toString().padStart(2, "0")}T${hour
    .toString()
    .padStart(2, "0")}:00:00.000Z`;
}

function toMegabytes(bytes: number | undefined) {
  return bytes === undefined ? null : roundToOneDecimal(bytes / 1024 / 1024);
}

function uuid(prefix: string, index: number) {
  const tail = index.toString(16).padStart(12, "0").slice(-12);

  return `${prefix}-0000-4000-8000-${tail}`;
}

function getFixtureItem<Item>(
  items: readonly Item[],
  index: number,
  name: string
) {
  const item = items[index];

  if (item === undefined) {
    throw new Error(`Missing ${name} fixture item at index ${index}.`);
  }

  return item;
}

function getProcessLike() {
  return "process" in globalThis
    ? (globalThis.process as NodeProcessLike | undefined)
    : undefined;
}

const processLike = getProcessLike();
const currentScriptPath = processLike?.argv?.[1];

if (currentScriptPath?.endsWith("sites-workspace-performance-harness.ts")) {
  const iterationsValue = processLike?.env?.SITES_WORKSPACE_PERF_ITERATIONS;
  const iterations =
    iterationsValue === undefined ? undefined : Number(iterationsValue);
  const report = runSitesWorkspacePerformanceHarness({
    iterations:
      iterations === undefined || Number.isNaN(iterations)
        ? undefined
        : iterations,
  });

  processLike?.stdout?.write(`${JSON.stringify(report, null, 2)}\n`);
}
