import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import type { ProductActorId } from "@ceird/identity-core";
import type {
  ActivityIdType,
  CommentIdType,
  ContactIdType,
  JobActivityEventType,
  JobActivityPayload,
  JobCollaborator,
  JobCollaboratorIdType,
  JobPriority,
  JobStatus,
  UserIdType,
  VisitIdType,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import type { SiteIdType } from "@ceird/sites-core";

import type {
  JobCommentEdgeRow,
  JobContactSummaryRow,
  JobLabelAssignmentRow,
  JobsWorkspaceActivityRow,
  JobsWorkspaceCommentRow,
  JobsWorkspaceJobRow,
  JobsWorkspaceMemberActorSummaryRow,
  JobsWorkspaceProductActorRow,
  JobsWorkspaceVisitRow,
  JobSiteSummaryRow,
} from "#/features/jobs/jobs-data-plane";
import {
  deriveJobsWorkspaceDetail,
  deriveJobsWorkspaceVisibleRows,
} from "#/features/jobs/jobs-data-plane";

export interface JobsWorkspacePerformanceFixtureCounts {
  readonly comments: number;
  readonly contacts: number;
  readonly jobs: number;
  readonly labels: number;
  readonly labelsPerJob: number;
  readonly memberActors: number;
  readonly sites: number;
}

export interface JobsWorkspacePerformanceHarnessOptions {
  readonly counts: JobsWorkspacePerformanceFixtureCounts;
  readonly initialElectricReadyLatencyMs?: number | undefined;
  readonly iterations: number;
  readonly outputPath?: string | undefined;
}

export interface JobsWorkspacePerformanceHarnessResult {
  readonly budget: {
    readonly detailOpenTargetMs: number;
    readonly initialElectricReadyBlockerMs: number;
    readonly initialElectricReadyTargetP95Ms: number;
    readonly interactionTargetMs: readonly [number, number];
  };
  readonly cases: readonly JobsWorkspacePerformanceCaseResult[];
  readonly collectionQueryChangeFindings: readonly string[];
  readonly cpu: {
    readonly systemMicros: number;
    readonly userMicros: number;
  };
  readonly dataset: JobsWorkspacePerformanceFixtureCounts & {
    readonly jobLabelAssignments: number;
  };
  readonly detailTransitions: readonly JobsWorkspacePerformanceCaseResult[];
  readonly initialElectricReadyLatencyMs?: number | null | undefined;
  readonly initialElectricReadyLatencySource:
    | "provided-stage-or-browser-evidence"
    | "not-recorded-no-approved-stage";
  readonly liveQueryRecomputations: readonly JobsWorkspacePerformanceCaseResult[];
  readonly memory: {
    readonly afterHeapUsedBytes: number;
    readonly beforeHeapUsedBytes: number;
    readonly deltaHeapUsedBytes: number;
    readonly rssBytes: number;
  };
  readonly metadata: {
    readonly generatedAt: string;
    readonly iterations: number;
    readonly node: string;
    readonly prd: string;
    readonly project: string;
    readonly sourceIssue: string;
  };
}

export interface JobsWorkspacePerformanceCaseResult {
  readonly budgetMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly minMs: number;
  readonly name: string;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly pass: boolean;
  readonly rows?: number | undefined;
  readonly samples: readonly number[];
}

interface JobsWorkspacePerformanceFixture {
  readonly activity: readonly JobsWorkspaceActivityRow[];
  readonly actors: readonly JobsWorkspaceProductActorRow[];
  readonly collaborators: readonly JobCollaborator[];
  readonly comments: readonly JobsWorkspaceCommentRow[];
  readonly contacts: readonly JobContactSummaryRow[];
  readonly jobComments: readonly JobCommentEdgeRow[];
  readonly jobLabelAssignments: readonly JobLabelAssignmentRow[];
  readonly jobs: readonly JobsWorkspaceJobRow[];
  readonly labels: readonly Label[];
  readonly memberActorSummaries: readonly JobsWorkspaceMemberActorSummaryRow[];
  readonly sites: readonly JobSiteSummaryRow[];
  readonly visits: readonly JobsWorkspaceVisitRow[];
}

const DEFAULT_COUNTS = {
  comments: 10_000,
  contacts: 1250,
  jobs: 5000,
  labels: 100,
  labelsPerJob: 3,
  memberActors: 75,
  sites: 1000,
} as const satisfies JobsWorkspacePerformanceFixtureCounts;

const JOB_STATUSES = [
  "new",
  "triaged",
  "in_progress",
  "blocked",
  "completed",
  "canceled",
] as const satisfies readonly JobStatus[];
const JOB_PRIORITIES = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const satisfies readonly JobPriority[];
const STATUS_MIX = [
  "new",
  "triaged",
  "in_progress",
  "blocked",
  "completed",
  "canceled",
  "in_progress",
  "triaged",
] as const satisfies readonly JobStatus[];
const BUDGET = {
  detailOpenTargetMs: 200,
  initialElectricReadyBlockerMs: 5000,
  initialElectricReadyTargetP95Ms: 3000,
  interactionTargetMs: [100, 150] as const,
};

export function createJobsWorkspacePerformanceFixture(
  counts: JobsWorkspacePerformanceFixtureCounts
): JobsWorkspacePerformanceFixture {
  const generatedAt = Date.UTC(2026, 5, 16, 8, 0, 0);
  const labels = Array.from({ length: counts.labels }, (_, index) => {
    const updatedAt = toIso(generatedAt - index * 60_000);

    return {
      createdAt: updatedAt,
      id: labelId(index),
      name: `Label ${String(index + 1).padStart(3, "0")}`,
      updatedAt,
    } satisfies Label;
  });
  const sites = Array.from({ length: counts.sites }, (_, index) => {
    const latitude = 53.3498 + (index % 40) / 1000;
    const longitude = -6.2603 - (index % 40) / 1000;

    return {
      displayLocation: `Depot ${index + 1}, Dublin`,
      formattedAddress: `${index + 1} Yard Road, Dublin`,
      hasUsableCoordinates: index % 7 !== 0,
      id: siteId(index),
      latitude,
      locationProvider: index % 7 === 0 ? undefined : "google_places",
      locationStatus: index % 7 === 0 ? "unverified" : "google_resolved",
      longitude,
      name: `Site ${String(index + 1).padStart(4, "0")}`,
      updatedAt: toIso(generatedAt - index * 90_000),
    } satisfies JobSiteSummaryRow;
  });
  const contacts = Array.from({ length: counts.contacts }, (_, index) => ({
    email: `contact-${index + 1}@example.com`,
    id: contactId(index),
    name: `Contact ${String(index + 1).padStart(4, "0")}`,
    phone: `+3531555${String(index).padStart(4, "0")}`,
    updatedAt: toIso(generatedAt - index * 75_000),
  })) satisfies readonly JobContactSummaryRow[];
  const memberActorSummaries = Array.from(
    { length: counts.memberActors },
    (_, index) => ({
      displayDetail: index % 3 === 0 ? "Coordinator" : "Member",
      displayName: `Member ${String(index + 1).padStart(3, "0")}`,
      id: actorId(index),
      kind: "member",
      userId: userId(index),
    })
  ) satisfies readonly JobsWorkspaceMemberActorSummaryRow[];
  const actors = memberActorSummaries.map(
    ({ displayDetail, displayName, id, kind }) => ({
      displayDetail,
      displayName,
      id,
      kind,
    })
  ) satisfies readonly JobsWorkspaceProductActorRow[];
  const jobs = Array.from({ length: counts.jobs }, (_, index) => {
    const status = STATUS_MIX[index % STATUS_MIX.length] ?? "new";
    const updatedAt = toIso(generatedAt - index * 120_000);

    return {
      assigneeId:
        index % 4 === 0 ? userId(index % counts.memberActors) : undefined,
      blockedReason: status === "blocked" ? "Waiting on access" : undefined,
      completedAt: status === "completed" ? updatedAt : undefined,
      contactId: contactId(index % counts.contacts),
      coordinatorId:
        index % 5 === 0
          ? userId((index + 17) % counts.memberActors)
          : undefined,
      createdAt: toIso(generatedAt - index * 180_000),
      createdByUserId: userId(index + 3),
      id: workItemId(index),
      kind: "job",
      priority: JOB_PRIORITIES[index % JOB_PRIORITIES.length] ?? "none",
      siteId: siteId(index % counts.sites),
      status,
      title: `${jobTitlePrefix(index)} ${String(index + 1).padStart(5, "0")}`,
      updatedAt,
    } satisfies JobsWorkspaceJobRow;
  });
  const jobLabelAssignments = jobs.flatMap((job, jobIndex) =>
    Array.from({ length: counts.labelsPerJob }, (_, labelIndex) => {
      const assignedLabel = labelId(
        (jobIndex * counts.labelsPerJob + labelIndex) % counts.labels
      );

      return {
        createdAt: job.createdAt,
        id: `${job.id}:${assignedLabel}`,
        labelId: assignedLabel,
        workItemId: job.id,
      } satisfies JobLabelAssignmentRow;
    })
  );
  const comments = Array.from({ length: counts.comments }, (_, index) => ({
    actorId: actorId(index % counts.memberActors),
    authorUserId: userId(index % counts.memberActors),
    body: `Comment ${index + 1} for performance detail fixture`,
    createdAt: toIso(generatedAt - index * 45_000),
    id: commentId(index),
    updatedAt: toIso(generatedAt - index * 45_000),
  })) satisfies readonly JobsWorkspaceCommentRow[];
  const jobComments = comments.map((comment, index) => {
    const commentWorkItemId = workItemId(index % counts.jobs);

    return {
      commentId: comment.id,
      createdAt: comment.createdAt,
      id: `${commentWorkItemId}:${comment.id}`,
      workItemId: commentWorkItemId,
    } satisfies JobCommentEdgeRow;
  });
  const activity = Array.from(
    { length: Math.min(counts.jobs * 2, 10_000) },
    (_, index) => {
      const eventType = activityEventType(index);

      return {
        actorId: actorId(index % counts.memberActors),
        actorUserId: userId(index % counts.memberActors),
        createdAt: toIso(generatedAt - index * 30_000),
        eventType,
        id: activityId(index),
        payload: activityPayload(eventType, index),
        workItemId: workItemId(index % counts.jobs),
      } satisfies JobsWorkspaceActivityRow;
    }
  ) satisfies readonly JobsWorkspaceActivityRow[];
  const visits = Array.from(
    { length: Math.min(counts.jobs, 5000) },
    (_, index) => ({
      authorUserId: userId((index + 9) % counts.memberActors),
      createdAt: toIso(generatedAt - index * 150_000),
      durationMinutes: 30 + (index % 6) * 30,
      id: visitId(index),
      note: `Visit note ${index + 1}`,
      visitDate: toIsoDate(generatedAt - index * 86_400_000),
      workItemId: workItemId(index),
    })
  ) satisfies readonly JobsWorkspaceVisitRow[];
  const collaborators = Array.from(
    { length: Math.min(counts.jobs, 2500) },
    (_, index) => ({
      accessLevel: index % 2 === 0 ? "read" : "comment",
      createdAt: toIso(generatedAt - index * 160_000),
      id: collaboratorId(index),
      roleLabel: index % 2 === 0 ? "Client" : "Inspector",
      subjectType: "user",
      updatedAt: toIso(generatedAt - index * 160_000),
      userId: userId((index + 33) % counts.memberActors),
      workItemId: workItemId(index),
    })
  ) satisfies readonly JobCollaborator[];

  return {
    activity,
    actors,
    collaborators,
    comments,
    contacts,
    jobComments,
    jobLabelAssignments,
    jobs,
    labels,
    memberActorSummaries,
    sites,
    visits,
  };
}

export async function runJobsWorkspacePerformanceHarness(
  options: JobsWorkspacePerformanceHarnessOptions
): Promise<JobsWorkspacePerformanceHarnessResult> {
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const fixture = createJobsWorkspacePerformanceFixture(options.counts);
  const listCases = [
    measureCase({
      budgetMs: BUDGET.interactionTargetMs[1],
      iterations: options.iterations,
      name: "list.default-active.updated-desc",
      run: () =>
        deriveJobsWorkspaceVisibleRows({
          contacts: fixture.contacts,
          jobs: fixture.jobs,
          labelAssignments: fixture.jobLabelAssignments,
          labels: fixture.labels,
          options: { sort: "updated-desc", status: "active" },
          sites: fixture.sites,
        }).length,
    }),
    measureCase({
      budgetMs: BUDGET.interactionTargetMs[1],
      iterations: options.iterations,
      name: "list.search.site-contact-label",
      run: () =>
        deriveJobsWorkspaceVisibleRows({
          contacts: fixture.contacts,
          jobs: fixture.jobs,
          labelAssignments: fixture.jobLabelAssignments,
          labels: fixture.labels,
          options: {
            query: "contact 0001",
            sort: "updated-desc",
            status: "all",
          },
          sites: fixture.sites,
        }).length,
    }),
    measureCase({
      budgetMs: BUDGET.interactionTargetMs[1],
      iterations: options.iterations,
      name: "list.filter.label.blocked",
      run: () =>
        deriveJobsWorkspaceVisibleRows({
          contacts: fixture.contacts,
          jobs: fixture.jobs,
          labelAssignments: fixture.jobLabelAssignments,
          labels: fixture.labels,
          options: {
            labelId: labelId(7),
            sort: "updated-desc",
            status: "blocked",
          },
          sites: fixture.sites,
        }).length,
    }),
    measureCase({
      budgetMs: BUDGET.interactionTargetMs[1],
      iterations: options.iterations,
      name: "list.sort.priority",
      run: () =>
        deriveJobsWorkspaceVisibleRows({
          contacts: fixture.contacts,
          jobs: fixture.jobs,
          labelAssignments: fixture.jobLabelAssignments,
          labels: fixture.labels,
          options: { sort: "priority", status: "active" },
          sites: fixture.sites,
        }).length,
    }),
  ];
  const selectedJobIds = [
    workItemId(0),
    workItemId(Math.floor(options.counts.jobs / 2)),
    workItemId(options.counts.jobs - 1),
  ];
  const detailTransitions = selectedJobIds.map((selectedJobId) =>
    measureCase({
      budgetMs: BUDGET.detailOpenTargetMs,
      iterations: options.iterations,
      name: `detail.open.${selectedJobId}`,
      run: () =>
        deriveJobsWorkspaceDetail({
          activity: fixture.activity,
          actors: fixture.actors,
          collaborators: fixture.collaborators,
          comments: fixture.comments,
          contacts: fixture.contacts,
          jobComments: fixture.jobComments,
          jobs: fixture.jobs,
          labelAssignments: fixture.jobLabelAssignments,
          labels: fixture.labels,
          memberActorSummaries: fixture.memberActorSummaries,
          selectedJobId,
          sites: fixture.sites,
          visits: fixture.visits,
        })?.commentCount ?? 0,
    })
  );
  const liveQueryRecomputations = [
    measureCase({
      budgetMs: BUDGET.interactionTargetMs[1],
      iterations: options.iterations,
      name: "recompute.after-job-title-update",
      run: () =>
        deriveJobsWorkspaceVisibleRows({
          contacts: fixture.contacts,
          jobs: replaceOneJob(fixture.jobs, 100, {
            title: "Emergency access repair live update",
            updatedAt: new Date().toISOString(),
          }),
          labelAssignments: fixture.jobLabelAssignments,
          labels: fixture.labels,
          options: {
            query: "emergency access",
            sort: "updated-desc",
            status: "active",
          },
          sites: fixture.sites,
        }).length,
    }),
    measureCase({
      budgetMs: BUDGET.interactionTargetMs[1],
      iterations: options.iterations,
      name: "recompute.after-label-assignment-update",
      run: () =>
        deriveJobsWorkspaceVisibleRows({
          contacts: fixture.contacts,
          jobs: fixture.jobs,
          labelAssignments: [
            ...fixture.jobLabelAssignments,
            {
              createdAt: new Date().toISOString(),
              id: `${workItemId(100)}:${labelId(
                Math.min(options.counts.labels - 1, 99)
              )}`,
              labelId: labelId(Math.min(options.counts.labels - 1, 99)),
              workItemId: workItemId(100),
            },
          ],
          labels: fixture.labels,
          options: {
            labelId: labelId(Math.min(options.counts.labels - 1, 99)),
            sort: "updated-desc",
            status: "all",
          },
          sites: fixture.sites,
        }).length,
    }),
  ];
  const memoryAfter = process.memoryUsage();
  const cpuAfter = process.cpuUsage(cpuBefore);
  const result = {
    budget: BUDGET,
    cases: listCases,
    collectionQueryChangeFindings: deriveCollectionQueryFindings([
      ...listCases,
      ...detailTransitions,
      ...liveQueryRecomputations,
    ]),
    cpu: {
      systemMicros: cpuAfter.system,
      userMicros: cpuAfter.user,
    },
    dataset: {
      ...options.counts,
      jobLabelAssignments: fixture.jobLabelAssignments.length,
    },
    detailTransitions,
    initialElectricReadyLatencyMs:
      options.initialElectricReadyLatencyMs ?? null,
    initialElectricReadyLatencySource:
      options.initialElectricReadyLatencyMs === undefined
        ? "not-recorded-no-approved-stage"
        : "provided-stage-or-browser-evidence",
    liveQueryRecomputations,
    memory: {
      afterHeapUsedBytes: memoryAfter.heapUsed,
      beforeHeapUsedBytes: memoryBefore.heapUsed,
      deltaHeapUsedBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      rssBytes: memoryAfter.rss,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      iterations: options.iterations,
      node: process.version,
      prd: "https://linear.app/tskr/document/realtime-jobs-surface-prd-caad9f2d7f69",
      project: "Realtime Jobs Surface",
      sourceIssue:
        "https://linear.app/tskr/issue/TSK-236/afk-add-jobs-live-query-performance-harness",
    },
  } satisfies JobsWorkspacePerformanceHarnessResult;

  if (options.outputPath) {
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  return result;
}

function measureCase({
  budgetMs,
  iterations,
  name,
  run,
}: {
  readonly budgetMs: number;
  readonly iterations: number;
  readonly name: string;
  readonly run: () => number;
}): JobsWorkspacePerformanceCaseResult {
  const samples: number[] = [];
  let rows = 0;

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    rows = run();
    samples.push(roundMs(performance.now() - startedAt));
  }

  const sortedSamples = samples.toSorted((left, right) => left - right);
  const meanMs = roundMs(
    samples.reduce((total, sample) => total + sample, 0) / samples.length
  );
  const p95Ms = percentile(sortedSamples, 0.95);

  return {
    budgetMs,
    maxMs: sortedSamples.at(-1) ?? 0,
    meanMs,
    minMs: sortedSamples[0] ?? 0,
    name,
    p50Ms: percentile(sortedSamples, 0.5),
    p95Ms,
    pass: p95Ms <= budgetMs,
    rows,
    samples,
  };
}

function percentile(sortedSamples: readonly number[], percentileValue: number) {
  if (sortedSamples.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedSamples.length - 1,
    Math.ceil(sortedSamples.length * percentileValue) - 1
  );

  return sortedSamples[index] ?? 0;
}

function deriveCollectionQueryFindings(
  cases: readonly JobsWorkspacePerformanceCaseResult[]
): readonly string[] {
  const failed = cases.filter((testCase) => !testCase.pass);

  if (failed.length === 0) {
    return [
      "Synthetic local derivation stayed within TSK-200 interaction/detail budgets; stage Electric ready latency still needs browser evidence before cutover.",
    ];
  }

  return failed.map(
    (testCase) =>
      `${testCase.name} exceeded ${testCase.budgetMs}ms p95 with ${testCase.p95Ms}ms; inspect collection query shape, per-row search text construction, label assignment indexing, and detail lookup maps before Jobs cutover.`
  );
}

function replaceOneJob(
  jobs: readonly JobsWorkspaceJobRow[],
  index: number,
  patch: Partial<JobsWorkspaceJobRow>
): readonly JobsWorkspaceJobRow[] {
  return jobs.map((job, currentIndex) =>
    currentIndex === index ? { ...job, ...patch } : job
  );
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function activityPayload(
  eventType: JobActivityEventType,
  index: number
): JobActivityPayload {
  if (eventType === "label_added") {
    return {
      eventType,
      labelId: labelId(index % DEFAULT_COUNTS.labels),
      labelName: `Label ${String((index % DEFAULT_COUNTS.labels) + 1).padStart(3, "0")}`,
    };
  }

  if (eventType === "priority_changed") {
    return {
      eventType,
      fromPriority: "low",
      toPriority: JOB_PRIORITIES[index % JOB_PRIORITIES.length] ?? "medium",
    };
  }

  const toStatus = JOB_STATUSES[index % JOB_STATUSES.length] ?? "triaged";

  return {
    eventType: "status_changed",
    fromStatus: "new",
    toStatus,
  };
}

function activityEventType(index: number): JobActivityEventType {
  if (index % 5 === 0) {
    return "label_added";
  }

  if (index % 3 === 0) {
    return "priority_changed";
  }

  return "status_changed";
}

function jobTitlePrefix(index: number): string {
  if (index % 11 === 0) {
    return "Emergency access repair";
  }

  if (index % 7 === 0) {
    return "Follow up inspection";
  }

  if (index % 5 === 0) {
    return "Blocked site visit";
  }

  return "Routine maintenance job";
}

function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function toIsoDate(epochMs: number): string {
  return toIso(epochMs).slice(0, 10);
}

function actorId(index: number): ProductActorId {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` as ProductActorId;
}

function activityId(index: number): ActivityIdType {
  return `activity_${String(index).padStart(6, "0")}` as ActivityIdType;
}

function collaboratorId(index: number): JobCollaboratorIdType {
  return `collaborator_${String(index).padStart(6, "0")}` as JobCollaboratorIdType;
}

function commentId(index: number): CommentIdType {
  return `comment_${String(index).padStart(6, "0")}` as CommentIdType;
}

function contactId(index: number): ContactIdType {
  return `contact_${String(index).padStart(5, "0")}` as ContactIdType;
}

function labelId(index: number): LabelIdType {
  return `label_${String(index).padStart(4, "0")}` as LabelIdType;
}

function siteId(index: number): SiteIdType {
  return `site_${String(index).padStart(5, "0")}` as SiteIdType;
}

function userId(index: number): UserIdType {
  return `user_${String(index).padStart(4, "0")}` as UserIdType;
}

function visitId(index: number): VisitIdType {
  return `visit_${String(index).padStart(6, "0")}` as VisitIdType;
}

function workItemId(index: number): WorkItemIdType {
  return `job_${String(index).padStart(6, "0")}` as WorkItemIdType;
}

function parseHarnessOptions(
  argv: readonly string[]
): JobsWorkspacePerformanceHarnessOptions {
  const options = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (!arg?.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? argv[index + 1];

    if (inlineValue === undefined) {
      index += 1;
    }
    if (rawKey && value !== undefined) {
      options.set(rawKey, value);
    }
  }

  return {
    counts: {
      comments: parsePositiveInt(
        options.get("comments"),
        DEFAULT_COUNTS.comments
      ),
      contacts: parsePositiveInt(
        options.get("contacts"),
        DEFAULT_COUNTS.contacts
      ),
      jobs: parsePositiveInt(options.get("jobs"), DEFAULT_COUNTS.jobs),
      labels: parsePositiveInt(options.get("labels"), DEFAULT_COUNTS.labels),
      labelsPerJob: parsePositiveInt(
        options.get("labels-per-job"),
        DEFAULT_COUNTS.labelsPerJob
      ),
      memberActors: parsePositiveInt(
        options.get("member-actors"),
        DEFAULT_COUNTS.memberActors
      ),
      sites: parsePositiveInt(options.get("sites"), DEFAULT_COUNTS.sites),
    },
    initialElectricReadyLatencyMs: parseOptionalNumber(
      options.get("initial-ready-ms") ??
        process.env.JOBS_WORKSPACE_INITIAL_READY_MS
    ),
    iterations: parsePositiveInt(options.get("iterations"), 15),
    outputPath: options.get("output") ?? process.env.JOBS_WORKSPACE_PERF_OUTPUT,
  };
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative number, received ${value}`);
  }

  return parsed;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received ${value}`);
  }

  return parsed;
}

async function main() {
  const result = await runJobsWorkspacePerformanceHarness(
    parseHarnessOptions(process.argv.slice(2))
  );
  const serialized = JSON.stringify(result, null, 2);

  process.stdout.write(`${serialized}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "## Jobs Workspace Performance Harness",
        "",
        `- Dataset: ${result.dataset.jobs} jobs, ${result.dataset.sites} sites, ${result.dataset.labels} labels, ${result.dataset.jobLabelAssignments} job-label assignments, ${result.dataset.comments} comments`,
        `- Initial Electric ready latency: ${result.initialElectricReadyLatencyMs ?? "not recorded"} (${result.initialElectricReadyLatencySource})`,
        `- Failing cases: ${
          [
            ...result.cases,
            ...result.detailTransitions,
            ...result.liveQueryRecomputations,
          ]
            .filter((testCase) => !testCase.pass)
            .map((testCase) => testCase.name)
            .join(", ") || "none"
        }`,
        "",
      ].join("\n"),
      "utf8"
    );
  }
}

if (process.argv[1]?.endsWith("jobs-workspace-performance-harness.ts")) {
  await main();
}
