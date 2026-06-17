import type { OrganizationId, UserId } from "@ceird/identity-core";
import type {
  AddJobCommentResponse,
  CommentIdType,
  ContactIdType,
  Job,
  JobDetailWriteResponse,
  JobListCursorType,
  JobListItem,
  JobListResponse,
  JobWriteResponse,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import type { SiteIdType } from "@ceird/sites-core";
import { QueryClient } from "@tanstack/react-query";
import { Effect, Exit } from "effect";
import { afterEach, vi } from "vitest";

import { createDataPlaneCollectionHealth } from "#/data-plane/collection-health";
import type { DataPlaneElectricSyncError } from "#/data-plane/electric-collection";
import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { getDataPlaneSessionKey } from "#/data-plane/session";
import type { runBrowserAppApiRequest } from "#/features/api/app-api-client";

import {
  aggregateJobsWorkspaceReadModelHealth,
  createJobsWorkspaceCommandRunner,
  createJobsWorkspaceCommentCommandRunner,
  createJobsWorkspaceReadModelContracts,
  createJobsWorkspaceReadModelHealth,
  deriveJobsWorkspaceDetail,
  deriveJobsWorkspaceVisibleRows,
  createJobsListSeed,
  createJobsListScope,
  getOrCreateJobsWorkspaceReadModelState,
  getOrCreateJobsCollectionState,
  jobsCollectionId,
  jobsCollectionKey,
  toJobActivityElectricRow,
  toJobCollaboratorElectricRow,
  toJobCommentEdgeRow,
  toJobCommentElectricRow,
  toJobContactSummaryRow,
  toJobListItemElectricRow,
  toJobLabelAssignmentRow,
  toJobSiteSummaryRow,
  toJobVisitElectricRow,
  toProductActivityActorElectricRow,
  toProductMemberActorSummaryElectricRow,
  toJobsWorkspaceJobElectricRow,
  toJobsWorkspaceJobRow,
} from "./jobs-data-plane";
import type { JobLabelAssignmentRow } from "./jobs-data-plane";

const appApiMock = vi.hoisted(() => ({
  runBrowserAppApiRequest:
    vi.fn<() => Effect.Effect<unknown, unknown, never>>(),
}));

vi.mock(import("#/features/api/app-api-client"), () => ({
  runBrowserAppApiRequest:
    appApiMock.runBrowserAppApiRequest as unknown as typeof runBrowserAppApiRequest,
}));

describe("jobs data plane", () => {
  afterEach(() => {
    appApiMock.runBrowserAppApiRequest.mockReset();
    vi.unstubAllEnvs();
  });

  const scope = createOrganizationDataScope({
    organizationId: "org_123" as OrganizationId,
    role: "owner",
    userId: "user_123",
  });

  const job = {
    assignees: [],
    contacts: [],
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "job_123",
    kind: "job",
    labels: [],
    priority: "medium",
    status: "open",
    title: "Inspect boiler",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } as unknown as JobListItem;

  it("uses organization scoped jobs collection identity", () => {
    expect(jobsCollectionKey(scope)).toStrictEqual([
      "jobs",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
      "list",
      "cursor",
      "initial",
      "limit",
      50,
      "status",
      "all",
      "assignee",
      "all",
      "coordinator",
      "all",
      "priority",
      "all",
      "label",
      "all",
      "site",
      "all",
      "search",
      "",
      "sort",
      "updated-desc",
    ]);
    expect(jobsCollectionId(scope)).toBe(
      "organization:org_123:user:user_123:role:owner:jobs:list:cursor:initial:limit:50:status:all:assignee:all:coordinator:all:priority:all:label:all:site:all:search::sort:updated-desc"
    );
  });

  it("creates paged-query jobs seed envelopes for route loaders", () => {
    const response = {
      items: [job],
      nextCursor: "cursor-two" as JobListCursorType,
    } satisfies JobListResponse;
    const listScope = createJobsListScope({
      limit: 25,
      query: "boiler",
      status: "active",
    });

    expect(createJobsListSeed(scope, response, listScope, 1000)).toMatchObject({
      collection: "jobs",
      completeness: {
        filters: [
          { field: "status", operator: "eq", value: "active" },
          { field: "query", operator: "search", value: "boiler" },
        ],
        mode: "paged-query",
        page: {
          hasNextPage: true,
          limit: 25,
          type: "cursor",
        },
        queryName: "jobs.list",
      },
      data: [job],
      queryKey: jobsCollectionKey(scope, listScope),
      requestStartedAt: 1000,
    });
  });

  it("reuses collection state through the data-plane registry", () => {
    const queryClient = new QueryClient();
    const session = {
      mutationJournal: createDataPlaneMutationJournal(),
      queryClient,
      registry: new Map<string, unknown>(),
      scope,
    };

    const first = getOrCreateJobsCollectionState({
      initialJobs: [job],
      listScope: createJobsListScope({ limit: 25, status: "active" }),
      queryClient,
      scope,
      session,
    });
    const second = getOrCreateJobsCollectionState({
      initialJobs: [],
      listScope: createJobsListScope({ limit: 25, status: "active" }),
      queryClient,
      scope,
      session,
    });

    expect(first).toBe(second);
    expect(
      session.registry.has(
        jobsCollectionId(
          scope,
          createJobsListScope({ limit: 25, status: "active" })
        )
      )
    ).toBeTruthy();
    expect(getDataPlaneSessionKey(session.scope)).toBe(
      "organization:org_123:user:user_123:role:owner"
    );
  });

  it("keeps jobs on Query Collection by default even when sync origin is configured", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });

    expect(state.collection.id).toBe(jobsCollectionId(scope));
    expect(state.health.current).toMatchObject({
      collection: "jobs",
      collectionId: jobsCollectionId(scope),
      fallbackReason: "sync-disabled",
      source: "query",
      status: "fallback-active",
    });
  });

  it("can opt the jobs canary into the public Sync Worker jobs shape", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });

    expect(state.collection.id).toBe(`${jobsCollectionId(scope)}:electric`);
    expect(state.health.current).toMatchObject({
      collection: "jobs",
      collectionId: `${jobsCollectionId(scope)}:electric`,
      source: "electric",
      status: "connecting",
      subscriptionName: "jobs",
    });
  });

  it("falls back to loader-seeded Query data when VITE_SYNC_ORIGIN is missing", () => {
    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        runtime: {
          isBrowser: true,
        },
      },
    });

    expect(state.collection.id).toBe(jobsCollectionId(scope));
    expect(state.health.current).toMatchObject({
      collection: "jobs",
      collectionId: `${jobsCollectionId(scope)}:electric`,
      disabledReason: "missing-sync-origin",
      fallbackReason: "missing-sync-origin",
      source: "electric",
      status: "fallback-active",
    });
  });

  it("does not create browser-only jobs Electric state during server render", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        runtime: {
          isBrowser: false,
        },
      },
    });

    expect(state.collection.id).toBe(jobsCollectionId(scope));
    expect(state.health.current).toMatchObject({
      collection: "jobs",
      collectionId: `${jobsCollectionId(scope)}:electric`,
      disabledReason: "server-render",
      fallbackReason: "server-render",
      source: "electric",
      status: "fallback-active",
    });
  });

  it("keeps the jobs route collection usable when sync origin is unavailable", () => {
    const electricCollection = makeTestCollection([job], {
      id: `${jobsCollectionId(scope)}:electric`,
    });
    const health = createDataPlaneCollectionHealth({
      collection: "jobs",
      collectionId: `${jobsCollectionId(scope)}:electric`,
      source: "electric",
      status: "connecting",
      subscriptionName: "jobs",
    });
    let onSyncError: ((error: DataPlaneElectricSyncError) => void) | undefined;

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        createElectricCollection: (_contract, options) => {
          ({ onSyncError } = options);

          return {
            collection: electricCollection,
            health,
            shapeUrl: "https://sync.codex.ceird.localhost/v1/shapes/jobs",
            status: "enabled",
          };
        },
        runtime: { isBrowser: true },
      },
    });

    const error = makeElectricError({
      kind: "server",
      message: "electric_container_unavailable",
      status: 503,
    });
    health.markUnavailable(error);
    onSyncError?.(error);

    expect(state.health.current).toMatchObject({
      fallbackReason: "sync-unavailable",
      lastError: {
        kind: "server",
        retryable: true,
        status: 503,
      },
      source: "electric",
      status: "fallback-active",
    });
    expect(state.collection.id).toBe(jobsCollectionId(scope));
  });

  it("reports jobs Electric initial readiness latency", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(11_000)
      .mockReturnValue(11_000);

    const state = getOrCreateJobsCollectionState({
      initialJobs: [job],
      queryClient: new QueryClient(),
      scope,
      sync: {
        electricEnabled: true,
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
          now,
        },
      },
    });

    readElectricLifecycle(state.collection).setStatus("loading");
    readElectricLifecycle(state.collection).markReady();

    expect(state.health.current).toMatchObject({
      initialReadyLatencyMs: 10_000,
      lastStatusChangeAtMs: 11_000,
      status: "ready",
    });
  });

  it("defines the Electric-native jobs workspace collection graph", () => {
    const graph = createJobsWorkspaceReadModelContracts(scope);

    expect(graph.list).toMatchObject({
      derivesFromCollections: [
        "jobs",
        "job-label-assignments",
        "labels",
        "job-sites",
        "job-contacts",
      ],
      healthCollections: [
        "jobs",
        "job-label-assignments",
        "labels",
        "job-sites",
        "job-contacts",
      ],
      requiredShapes: [
        "jobs",
        "work-item-labels",
        "labels",
        "sites",
        "contacts",
      ],
    });
    expect(graph.detail).toMatchObject({
      requiredShapes: [
        "jobs",
        "work-item-labels",
        "labels",
        "sites",
        "contacts",
        "work-item-collaborators",
        "product-activity-actors",
        "product-member-actor-summaries",
        "work-item-activity",
        "work-item-visits",
        "work-item-comments",
        "work-item-comment-bodies",
      ],
    });
    expect(graph.detail.projectionFollowUps).toStrictEqual(
      expect.arrayContaining([
        expect.stringContaining("Additional member/contact availability"),
        expect.stringContaining("site-level rollups"),
      ])
    );
    expect(graph.jobs).toMatchObject({
      collection: "jobs",
      id: "organization:org_123:user:user_123:role:owner:jobs-workspace:jobs:electric",
      shapeName: "jobs",
    });
    expect(graph.jobLabelAssignments).toMatchObject({
      collection: "job-label-assignments",
      shapeName: "work-item-labels",
    });
    expect(graph.siteSummaries).toMatchObject({
      collection: "job-sites",
      shapeName: "sites",
    });
    expect(graph.contactSummaries).toMatchObject({
      collection: "job-contacts",
      shapeName: "contacts",
    });
    expect(graph.collaborators).toMatchObject({
      collection: "job-collaborators",
      shapeName: "work-item-collaborators",
    });
    expect(graph.actors).toMatchObject({
      collection: "product-activity-actors",
      shapeName: "product-activity-actors",
    });
    expect(graph.memberActorSummaries).toMatchObject({
      collection: "product-member-actor-summaries",
      shapeName: "product-member-actor-summaries",
    });
    expect(graph.activity).toMatchObject({
      collection: "job-activity",
      shapeName: "work-item-activity",
    });
    expect(graph.visits).toMatchObject({
      collection: "job-visits",
      shapeName: "work-item-visits",
    });
    expect(graph.jobComments).toMatchObject({
      collection: "job-comments",
      shapeName: "work-item-comments",
    });
    expect(graph.comments).toMatchObject({
      collection: "job-comment-bodies",
      shapeName: "work-item-comment-bodies",
    });
    for (const contract of [
      graph.activity,
      graph.actors,
      graph.collaborators,
      graph.comments,
      graph.contactSummaries,
      graph.jobComments,
      graph.jobLabelAssignments,
      graph.jobs,
      graph.labels,
      graph.memberActorSummaries,
      graph.siteSummaries,
      graph.visits,
    ]) {
      expect(contract.completeness).toMatchObject({
        covers: { mode: "complete-tenant" },
        mode: "sync-backed",
        source: "electric",
      });
      expect(contract.shapeOptions?.params).toBeUndefined();
    }
  });

  it("reuses the Electric-native jobs workspace read model through the session registry", () => {
    const queryClient = new QueryClient();
    const session = {
      mutationJournal: createDataPlaneMutationJournal(),
      queryClient,
      registry: new Map<string, unknown>(),
      scope,
    };

    const first = getOrCreateJobsWorkspaceReadModelState({ scope, session });
    const second = getOrCreateJobsWorkspaceReadModelState({ scope, session });

    expect(first).toBe(second);
    expect(first.health.current).toMatchObject({
      collection: "jobs",
      disabledReason: "jobs: server-render",
      source: "electric",
      status: "disabled",
      subscriptionName: "jobs-workspace-list",
    });
    expect(first.collectionHealth.labels.current).toMatchObject({
      collection: "labels",
      disabledReason: "server-render",
      status: "disabled",
      subscriptionName: "labels",
    });
  });

  it("keeps the Jobs workspace read model recovering when a required join collection has a retryable outage", () => {
    const jobsHealth = createDataPlaneCollectionHealth({
      collection: "jobs",
      collectionId: "jobs",
      source: "electric",
      status: "connecting",
      subscriptionName: "jobs",
    });
    const labelsHealth = createDataPlaneCollectionHealth({
      collection: "labels",
      collectionId: "labels",
      source: "electric",
      status: "connecting",
      subscriptionName: "labels",
    });
    const assignmentsHealth = createDataPlaneCollectionHealth({
      collection: "job-label-assignments",
      collectionId: "job-label-assignments",
      source: "electric",
      status: "connecting",
      subscriptionName: "work-item-labels",
    });
    const sitesHealth = createDataPlaneCollectionHealth({
      collection: "job-sites",
      collectionId: "job-sites",
      source: "electric",
      status: "connecting",
      subscriptionName: "sites",
    });
    const contactsHealth = createDataPlaneCollectionHealth({
      collection: "job-contacts",
      collectionId: "job-contacts",
      source: "electric",
      status: "connecting",
      subscriptionName: "contacts",
    });

    jobsHealth.markReady();
    assignmentsHealth.markReady();
    sitesHealth.markReady();
    contactsHealth.markReady();
    labelsHealth.markUnavailable({
      kind: "server",
      message: "labels shape unavailable",
      retryable: true,
      status: 503,
    });

    expect(
      aggregateJobsWorkspaceReadModelHealth({
        collectionId: "jobs-workspace-list",
        snapshots: [
          jobsHealth.current,
          labelsHealth.current,
          assignmentsHealth.current,
          sitesHealth.current,
          contactsHealth.current,
        ],
      })
    ).toMatchObject({
      collection: "jobs",
      collectionId: "jobs-workspace-list",
      lastError: {
        message: "labels: labels shape unavailable",
        retryable: true,
        status: 503,
      },
      recoveryAttempts: 1,
      status: "connecting",
      subscriptionName: "jobs-workspace-list",
    });
  });

  it("keeps the Jobs workspace read model health snapshot stable between source updates", () => {
    const jobsHealth = createDataPlaneCollectionHealth({
      collection: "jobs",
      collectionId: "jobs",
      source: "electric",
      status: "connecting",
      subscriptionName: "jobs",
    });
    const labelsHealth = createDataPlaneCollectionHealth({
      collection: "labels",
      collectionId: "labels",
      source: "electric",
      status: "connecting",
      subscriptionName: "labels",
    });
    const assignmentsHealth = createDataPlaneCollectionHealth({
      collection: "job-label-assignments",
      collectionId: "job-label-assignments",
      source: "electric",
      status: "connecting",
      subscriptionName: "work-item-labels",
    });
    const sitesHealth = createDataPlaneCollectionHealth({
      collection: "job-sites",
      collectionId: "job-sites",
      source: "electric",
      status: "connecting",
      subscriptionName: "sites",
    });
    const contactsHealth = createDataPlaneCollectionHealth({
      collection: "job-contacts",
      collectionId: "job-contacts",
      source: "electric",
      status: "connecting",
      subscriptionName: "contacts",
    });
    const readModelHealth = createJobsWorkspaceReadModelHealth({
      collectionHealth: {
        contactSummaries: contactsHealth,
        jobLabelAssignments: assignmentsHealth,
        jobs: jobsHealth,
        labels: labelsHealth,
        siteSummaries: sitesHealth,
      },
      collectionId: "jobs-workspace-list",
      subscriptionName: "jobs-workspace-list",
    });
    const listener =
      vi.fn<(snapshot: ReturnType<typeof readModelHealth.markReady>) => void>();

    expect(readModelHealth.current).toBe(readModelHealth.current);

    const unsubscribe = readModelHealth.subscribe(listener);
    const initial = readModelHealth.current;
    jobsHealth.markReady();
    const afterJobsReady = readModelHealth.current;

    expect(afterJobsReady).not.toBe(initial);
    expect(readModelHealth.current).toBe(afterJobsReady);
    expect(listener).toHaveBeenLastCalledWith(afterJobsReady);

    unsubscribe();
  });

  it("keeps the Jobs workspace read model connecting until every required collection is ready", () => {
    const snapshots = [
      makeReadyHealthSnapshot("jobs", "jobs"),
      makeReadyHealthSnapshot("job-label-assignments", "work-item-labels"),
      makeReadyHealthSnapshot("job-sites", "sites"),
      makeReadyHealthSnapshot("job-contacts", "contacts"),
      createDataPlaneCollectionHealth({
        collection: "labels",
        collectionId: "labels",
        source: "electric",
        status: "connecting",
        subscriptionName: "labels",
      }).current,
    ];

    expect(
      aggregateJobsWorkspaceReadModelHealth({
        collectionId: "jobs-workspace-list",
        snapshots,
      })
    ).toMatchObject({
      status: "connecting",
      subscriptionName: "jobs-workspace-list",
    });
  });

  it("normalizes Postgres timestamptz Electric rows for Jobs workspace jobs", () => {
    expect(
      toJobsWorkspaceJobRow({
        assigneeId: null,
        blockedReason: null,
        completedAt: null,
        completedByUserId: null,
        contactId: null,
        coordinatorId: null,
        createdAt: "2026-06-16 21:12:41.802467+00",
        createdByUserId: "user_123",
        id: "019ed247-7fcb-7114-9d5c-af3e0dc7fdc2",
        kind: "job",
        priority: "none",
        siteId: null,
        status: "new",
        title: "TSK-237 realtime",
        updatedAt: "2026-06-16 21:12:41.802467+00",
      })
    ).toMatchObject({
      createdAt: "2026-06-16T21:12:41.802Z",
      id: "019ed247-7fcb-7114-9d5c-af3e0dc7fdc2",
      title: "TSK-237 realtime",
      updatedAt: "2026-06-16T21:12:41.802Z",
    });
  });

  it("allows Electric update old values to be partial Jobs workspace rows", () => {
    expect(
      toJobsWorkspaceJobElectricRow({
        priority: "none",
        updatedAt: "2026-06-17 08:34:13.1604+00",
      })
    ).toStrictEqual({
      priority: "none",
      updatedAt: "2026-06-17T08:34:13.160Z",
    });
  });

  it("allows Electric update old values to be partial legacy Jobs list rows", () => {
    expect(
      toJobListItemElectricRow({
        priority: "none",
        updatedAt: "2026-06-17 08:34:13.1604+00",
      })
    ).toStrictEqual({
      priority: "none",
      updatedAt: "2026-06-17T08:34:13.160Z",
    });
  });

  it("derives visible Jobs workspace rows from local joins, filters, search, and sort", () => {
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    const secondWorkItemId =
      "99999999-9999-4999-8999-999999999999" as WorkItemIdType;
    const labelId = "22222222-2222-4222-8222-222222222222" as LabelIdType;
    const siteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
    const contactId = "44444444-4444-4444-8444-444444444444" as ContactIdType;
    const jobs = [
      toJobsWorkspaceJobRow({
        contactId,
        createdAt: "2026-06-15T10:00:00.000Z",
        createdByUserId: "user_123",
        id: workItemId,
        kind: "job",
        priority: "high",
        siteId,
        status: "blocked",
        title: "Fit heat pump",
        updatedAt: "2026-06-15T11:00:00.000Z",
      }),
      toJobsWorkspaceJobRow({
        createdAt: "2026-06-15T09:00:00.000Z",
        createdByUserId: "user_123",
        id: secondWorkItemId,
        kind: "job",
        priority: "urgent",
        status: "completed",
        title: "Inspect boiler",
        updatedAt: "2026-06-15T12:00:00.000Z",
      }),
    ];
    const labels: readonly Label[] = [
      {
        createdAt: "2026-06-15T10:00:00.000Z",
        id: labelId,
        name: "Urgent",
        updatedAt: "2026-06-15T10:00:00.000Z",
      },
    ];
    const rows = deriveJobsWorkspaceVisibleRows({
      contacts: [
        {
          email: "ops@example.com",
          id: contactId,
          name: "Operations",
          updatedAt: "2026-06-15T10:00:00.000Z",
        },
      ],
      jobs,
      labelAssignments: [
        {
          createdAt: "2026-06-15T10:05:00.000Z",
          id: `${workItemId}:${labelId}`,
          labelId,
          workItemId,
        },
      ],
      labels,
      options: {
        labelId,
        query: "urgent",
        sort: "priority",
        status: "active",
      },
      sites: [
        {
          displayLocation: "Dublin",
          hasUsableCoordinates: false,
          id: siteId,
          locationStatus: "unverified",
          name: "Warehouse",
          updatedAt: "2026-06-15T10:00:00.000Z",
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      contact: { name: "Operations" },
      job: { id: workItemId, title: "Fit heat pump" },
      labels: [{ id: labelId, name: "Urgent" }],
      site: { name: "Warehouse" },
    });
  });

  it("derives selected Jobs workspace detail from local joins and product actors", () => {
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    const labelId = "22222222-2222-4222-8222-222222222222" as LabelIdType;
    const siteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
    const contactId = "44444444-4444-4444-8444-444444444444" as ContactIdType;
    const commentId = "55555555-5555-4555-8555-555555555555";
    const actorId = "66666666-6666-4666-8666-666666666666";
    const coordinatorActorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    const detail = deriveJobsWorkspaceDetail({
      activity: [
        toJobActivityElectricRow({
          actorId,
          actorUserId: "user_taylor",
          createdAt: "2026-06-15T10:25:00.000Z",
          eventType: "priority_changed",
          id: "77777777-7777-4777-8777-777777777777",
          payload: JSON.stringify({
            eventType: "priority_changed",
            fromPriority: "medium",
            toPriority: "high",
          }),
          workItemId,
        }),
      ],
      actors: [
        toProductActivityActorElectricRow({
          displayDetail: "Dispatch",
          displayName: "Taylor Member",
          id: actorId,
          kind: "member",
          routeHref: "/members/user_taylor",
          routeLabel: "Taylor Member",
        }),
        toProductActivityActorElectricRow({
          displayDetail: "Scheduling",
          displayName: "Jordan Coordinator",
          id: coordinatorActorId,
          kind: "member",
          routeHref: "/members/user_jordan",
          routeLabel: "Jordan Coordinator",
        }),
      ],
      collaborators: [
        toJobCollaboratorElectricRow({
          accessLevel: "comment",
          createdAt: "2026-06-15T10:20:00.000Z",
          id: "99999999-9999-4999-8999-999999999999",
          roleLabel: "Facilities",
          subjectType: "user",
          updatedAt: "2026-06-15T10:20:00.000Z",
          userId: "user_taylor",
          workItemId,
        }),
      ],
      comments: [
        toJobCommentElectricRow({
          actorId,
          body: "Ready for dispatch",
          createdAt: "2026-06-15T10:40:00.000Z",
          id: commentId,
          updatedAt: "2026-06-15T10:40:00.000Z",
        }),
      ],
      contacts: [
        toJobContactSummaryRow({
          id: contactId,
          name: "Operations",
          updatedAt: "2026-06-15T10:15:00.000Z",
        }),
      ],
      jobComments: [
        toJobCommentEdgeRow({
          commentId,
          createdAt: "2026-06-15T10:35:00.000Z",
          workItemId,
        }),
      ],
      jobs: [
        toJobsWorkspaceJobRow({
          assigneeId: "user_taylor",
          contactId,
          coordinatorId: "user_jordan",
          createdAt: "2026-06-15T10:00:00.000Z",
          createdByUserId: "user_123",
          id: workItemId,
          kind: "job",
          priority: "high",
          siteId,
          status: "blocked",
          title: "Fit heat pump",
          updatedAt: "2026-06-15T11:00:00.000Z",
        }),
      ],
      labelAssignments: [
        toJobLabelAssignmentRow({
          createdAt: "2026-06-15T10:05:00.000Z",
          labelId,
          workItemId,
        }),
      ],
      labels: [
        {
          createdAt: "2026-06-15T10:00:00.000Z",
          id: labelId,
          name: "Urgent",
          updatedAt: "2026-06-15T10:00:00.000Z",
        },
      ],
      memberActorSummaries: [
        toProductMemberActorSummaryElectricRow({
          actorId,
          displayDetail: "Dispatch",
          displayName: "Taylor Member",
          routeHref: "/members/user_taylor",
          routeLabel: "Taylor Member",
          userId: "user_taylor",
        }),
        toProductMemberActorSummaryElectricRow({
          actorId: coordinatorActorId,
          displayDetail: "Scheduling",
          displayName: "Jordan Coordinator",
          routeHref: "/members/user_jordan",
          routeLabel: "Jordan Coordinator",
          userId: "user_jordan",
        }),
      ],
      selectedJobId: workItemId,
      sites: [
        toJobSiteSummaryRow({
          displayLocation: "Dublin",
          id: siteId,
          locationStatus: "unverified",
          name: "Warehouse",
          updatedAt: "2026-06-15T10:10:00.000Z",
        }),
      ],
      visits: [
        toJobVisitElectricRow({
          authorUserId: "user_taylor",
          createdAt: "2026-06-15T10:30:00.000Z",
          durationMinutes: 60,
          id: "88888888-8888-4888-8888-888888888888",
          note: "Initial survey",
          visitDate: "2026-06-15",
          workItemId,
        }),
      ],
    });

    expect(detail).toMatchObject({
      activity: [
        {
          actor: {
            displayName: "Taylor Member",
            route: { href: "/members/user_taylor" },
          },
        },
      ],
      assignee: {
        displayName: "Taylor Member",
        userId: "user_taylor",
      },
      collaborators: [{ roleLabel: "Facilities" }],
      commentCount: 1,
      comments: [
        {
          actor: {
            displayName: "Taylor Member",
            route: { href: "/members/user_taylor" },
          },
          comment: {
            body: "Ready for dispatch",
            id: commentId,
          },
        },
      ],
      contact: { name: "Operations" },
      coordinator: {
        displayName: "Jordan Coordinator",
        userId: "user_jordan",
      },
      job: { id: workItemId, title: "Fit heat pump" },
      labels: [{ name: "Urgent" }],
      site: { name: "Warehouse" },
      visits: [{ note: "Initial survey" }],
    });
  });

  it("derives assignment summaries from member summary rows without activity actor rows", () => {
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;

    const detail = deriveJobsWorkspaceDetail({
      activity: [],
      actors: [],
      collaborators: [],
      comments: [],
      contacts: [],
      jobComments: [],
      jobs: [
        toJobsWorkspaceJobRow({
          assigneeId: "user_never_activity_assignee",
          coordinatorId: "user_never_activity_coordinator",
          createdAt: "2026-06-15T10:00:00.000Z",
          createdByUserId: "user_123",
          id: workItemId,
          kind: "job",
          priority: "high",
          status: "new",
          title: "Assigned without activity",
          updatedAt: "2026-06-15T11:00:00.000Z",
        }),
      ],
      labelAssignments: [],
      labels: [],
      memberActorSummaries: [
        toProductMemberActorSummaryElectricRow({
          actorId: "66666666-6666-4666-8666-666666666666",
          displayDetail: "Team member",
          displayName: "Never Activity Assignee",
          userId: "user_never_activity_assignee",
        }),
        toProductMemberActorSummaryElectricRow({
          actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          displayDetail: "Team member",
          displayName: "Never Activity Coordinator",
          userId: "user_never_activity_coordinator",
        }),
      ],
      selectedJobId: workItemId,
      sites: [],
      visits: [],
    });

    expect(detail).toMatchObject({
      assignee: {
        displayName: "Never Activity Assignee",
        userId: "user_never_activity_assignee",
      },
      coordinator: {
        displayName: "Never Activity Coordinator",
        userId: "user_never_activity_coordinator",
      },
      job: { id: workItemId, title: "Assigned without activity" },
    });
  });

  it("keeps create pending until the jobs collection observes the server row state", async () => {
    const jobs = createFakeCollection<ReturnType<typeof toJobsWorkspaceJobRow>>(
      (jobRow) => jobRow.id
    );
    const journal = createDataPlaneMutationJournal({
      createId: () => "mutation_1",
      now: () => 100,
    });
    const createdJob = makeJob("Install heat pump", {
      id: "11111111-1111-4111-8111-111111111121" as WorkItemIdType,
      updatedAt: "2026-06-15T13:00:00.000Z",
    });
    const response = makeJobWriteResponse(createdJob, 1201);
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.promise(() => Promise.resolve(response))
    );

    const command = createJobsWorkspaceCommandRunner({
      collections: {
        jobLabelAssignments: createFakeCollection(
          (assignment) => assignment.id
        ),
        jobs,
      },
      journal,
      timeoutMs: 100,
    }).createJob({ title: "Install heat pump" });

    expect(journal.entries()).toMatchObject([
      {
        affectedCollections: ["jobs", "job-sites", "job-contacts"],
        commandName: "jobs-workspace.create",
        status: "pending",
      },
    ]);

    globalThis.setTimeout(() => {
      jobs.upsert(makeJobsWorkspaceJobRow(createdJob));
    }, 0);
    const exit = await command;

    expect(Exit.isSuccess(exit)).toBeTruthy();
    if (Exit.isFailure(exit)) {
      throw new Error("Expected create command to succeed");
    }
    expect(exit.value).toMatchObject({
      electricObservation: {
        collection: "jobs",
        kind: "observed-change",
      },
      mutation: { txid: 1201 },
    });
    expect(journal.entries()).toMatchObject([
      {
        commandName: "jobs-workspace.create",
        status: "success",
      },
    ]);
  });

  it("records API command failures without waiting for Electric confirmation", async () => {
    const journal = createDataPlaneMutationJournal();
    const failure = new Error("Job access denied");
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.fail(failure)
    );

    const exit = await createJobsWorkspaceCommandRunner({
      collections: {
        jobLabelAssignments: createFakeCollection(
          (assignment) => assignment.id
        ),
        jobs: createFakeCollection((jobRow) => jobRow.id),
      },
      journal,
    }).updateJob("11111111-1111-4111-8111-111111111121" as WorkItemIdType, {
      priority: "high",
    });

    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(journal.entries()).toMatchObject([
      {
        commandName: "jobs-workspace.update",
        error: failure,
        status: "failure",
      },
    ]);
  });

  it("records Electric confirmation timeouts as command failures", async () => {
    const journal = createDataPlaneMutationJournal();
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.succeed(makeJobWriteResponse(makeJob("Install heat pump"), 1202))
    );

    const exit = await createJobsWorkspaceCommandRunner({
      collections: {
        jobLabelAssignments: createFakeCollection(
          (assignment) => assignment.id
        ),
        jobs: createFakeCollection((jobRow) => jobRow.id),
      },
      journal,
      timeoutMs: 1,
    }).transitionJob("11111111-1111-4111-8111-111111111121" as WorkItemIdType, {
      status: "in_progress",
    });

    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(journal.entries()[0]).toMatchObject({
      commandName: "jobs-workspace.transition",
      status: "failure",
    });
    expect(journal.entries()[0]?.error).toBeInstanceOf(Error);
  });

  it("confirms job label assignment and removal through synced assignment data", async () => {
    const workItemId = "11111111-1111-4111-8111-111111111121" as WorkItemIdType;
    const labelId = "22222222-2222-4222-8222-222222222222" as LabelIdType;
    const assignments = createFakeCollection<JobLabelAssignmentRow>(
      (assignment) => assignment.id
    );
    const commandRunner = createJobsWorkspaceCommandRunner({
      collections: {
        jobLabelAssignments: assignments,
        jobs: createFakeCollection((jobRow) => jobRow.id),
      },
      timeoutMs: 100,
    });
    const assignment = {
      createdAt: "2026-06-15T10:05:00.000Z",
      id: `${workItemId}:${labelId}`,
      labelId,
      workItemId,
    } satisfies JobLabelAssignmentRow;

    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.promise(() =>
        Promise.resolve(
          makeJobDetailWriteResponse(
            makeJob("Install heat pump", { workItemId }),
            1203
          )
        )
      )
    );
    const assignCommand = commandRunner.assignJobLabel(workItemId, { labelId });
    globalThis.setTimeout(() => {
      assignments.upsert(assignment);
    }, 0);
    const assignExit = await assignCommand;

    expect(Exit.isSuccess(assignExit)).toBeTruthy();
    if (Exit.isFailure(assignExit)) {
      throw new Error("Expected label assignment command to succeed");
    }
    expect(assignExit.value).toMatchObject({
      electricObservation: {
        collection: "job-label-assignments",
        kind: "observed-change",
      },
      mutation: { txid: 1203 },
    });

    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.promise(() =>
        Promise.resolve(
          makeJobDetailWriteResponse(
            makeJob("Install heat pump", { workItemId }),
            1204
          )
        )
      )
    );
    const removeCommand = commandRunner.removeJobLabel(workItemId, labelId);
    globalThis.setTimeout(() => {
      assignments.delete(assignment);
    }, 0);
    const removeExit = await removeCommand;

    expect(Exit.isSuccess(removeExit)).toBeTruthy();
    if (Exit.isFailure(removeExit)) {
      throw new Error("Expected label removal command to succeed");
    }
    expect(removeExit.value).toMatchObject({
      electricObservation: {
        collection: "job-label-assignments",
        kind: "observed-change",
      },
      mutation: { txid: 1204 },
    });
  });

  it("keeps add-comment pending until comment body and edge collections observe the domain row", async () => {
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    const commentId = "55555555-5555-4555-8555-555555555555" as CommentIdType;
    const actor = toProductActivityActorElectricRow({
      displayName: "Taylor Field",
      id: "77777777-7777-4777-8777-777777777777",
      kind: "member",
    });
    const journal = createDataPlaneMutationJournal({
      createId: () => "mutation_1",
    });
    const commentBodies = makeObservableCollection<
      ReturnType<typeof toJobCommentElectricRow>
    >([]);
    const commentEdges = makeObservableCollection<
      ReturnType<typeof toJobCommentEdgeRow>
    >([]);
    const apiResponse = Promise.withResolvers<AddJobCommentResponse>();
    const command = createJobsWorkspaceCommentCommandRunner({
      addComment: () => Effect.promise(() => apiResponse.promise),
      collections: {
        commentBodies,
        commentEdges,
      },
      journal,
    }).addJobComment(workItemId, { body: "Ready for dispatch" });

    expect(journal.entries()).toMatchObject([
      {
        affectedCollections: ["job-comments", "job-comment-bodies"],
        commandName: "jobs-workspace.add-comment",
        status: "pending",
      },
    ]);

    apiResponse.resolve({
      actor,
      actorId: actor.id,
      authorUserId: "user_123",
      body: "Ready for dispatch",
      createdAt: "2026-06-15T10:40:00.000Z",
      id: commentId,
      updatedByUserId: "user_123",
      workItemId,
    } as AddJobCommentResponse);
    await Promise.all([
      commentBodies.waitForSubscriber(),
      commentEdges.waitForSubscriber(),
    ]);

    commentBodies.set([
      toJobCommentElectricRow({
        actorId: actor.id,
        body: "Ready for dispatch",
        createdAt: "2026-06-15T10:40:00.000Z",
        id: commentId,
        updatedAt: "2026-06-15T10:40:00.000Z",
      }),
    ]);
    commentEdges.set([
      toJobCommentEdgeRow({
        commentId,
        createdAt: "2026-06-15T10:40:00.000Z",
        workItemId,
      }),
    ]);

    const exit = await command;

    expect(exit).toMatchObject({
      _tag: "Success",
      value: {
        electricObservation: {
          commentBody: "observed-change",
          commentEdge: "observed-change",
        },
      },
    });
    if (Exit.isFailure(exit)) {
      throw new Error("Expected comment command to succeed");
    }
    expect(exit.value).not.toHaveProperty("authorUserId");
    expect(exit.value).not.toHaveProperty("updatedByUserId");
    expect(journal.entries()[0]).toMatchObject({
      status: "success",
    });
    expect(journal.entries()[0]?.output).not.toHaveProperty("authorUserId");
    expect(journal.entries()[0]?.output).not.toHaveProperty("updatedByUserId");
  });

  it("handles synchronous comment collection confirmation notifications", async () => {
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    const commentId = "55555555-5555-4555-8555-555555555555" as CommentIdType;
    const actor = toProductActivityActorElectricRow({
      displayName: "Taylor Field",
      id: "77777777-7777-4777-8777-777777777777",
      kind: "member",
    });
    const response = {
      actor,
      actorId: actor.id,
      body: "Ready for dispatch",
      createdAt: "2026-06-15T10:40:00.000Z",
      id: commentId,
      workItemId,
    } satisfies AddJobCommentResponse;
    const command = createJobsWorkspaceCommentCommandRunner({
      addComment: () => Effect.succeed(response),
      collections: {
        commentBodies: makeSynchronouslyConfirmingCollection([
          toJobCommentElectricRow({
            actorId: actor.id,
            body: response.body,
            createdAt: response.createdAt,
            id: commentId,
            updatedAt: response.createdAt,
          }),
        ]),
        commentEdges: makeSynchronouslyConfirmingCollection([
          toJobCommentEdgeRow({
            commentId,
            createdAt: response.createdAt,
            workItemId,
          }),
        ]),
      },
      timeoutMs: 1000,
    }).addJobComment(workItemId, { body: response.body });

    await expect(command).resolves.toMatchObject({
      _tag: "Success",
      value: {
        electricObservation: {
          commentBody: "observed-change",
          commentEdge: "observed-change",
        },
      },
    });
  });

  it("maps product-safe Electric rows for the jobs workspace graph", () => {
    const workItemId = "11111111-1111-4111-8111-111111111111";
    const labelId = "22222222-2222-4222-8222-222222222222";
    const siteId = "33333333-3333-4333-8333-333333333333";
    const contactId = "44444444-4444-4444-8444-444444444444";
    const commentId = "55555555-5555-4555-8555-555555555555";
    const userId = "user_123";

    expect(
      toJobsWorkspaceJobRow({
        assigneeId: userId,
        blockedReason: null,
        completedAt: null,
        completedByUserId: null,
        contactId,
        coordinatorId: "user_456",
        createdAt: "2026-06-15T10:00:00.000Z",
        createdByUserId: userId,
        id: workItemId,
        kind: "job",
        priority: "high",
        siteId,
        status: "in_progress",
        title: "Fit heat pump",
        updatedAt: "2026-06-15T11:00:00.000Z",
      })
    ).toMatchObject({
      assigneeId: userId,
      contactId,
      coordinatorId: "user_456",
      id: workItemId,
      priority: "high",
      siteId,
      status: "in_progress",
    });
    expect(
      toJobLabelAssignmentRow({
        createdAt: "2026-06-15T10:05:00.000Z",
        labelId,
        workItemId,
      })
    ).toStrictEqual({
      createdAt: "2026-06-15T10:05:00.000Z",
      id: `${workItemId}:${labelId}`,
      labelId,
      workItemId,
    });
    expect(
      toJobSiteSummaryRow({
        accessNotes: "Gate code 1234",
        displayLocation: "Dublin",
        formattedAddress: "Dublin, Ireland",
        id: siteId,
        latitude: 53.3498,
        locationProvider: "google_places",
        locationStatus: "google_resolved",
        longitude: -6.2603,
        name: "Warehouse",
        updatedAt: "2026-06-15T10:10:00.000Z",
      })
    ).toMatchObject({
      hasUsableCoordinates: true,
      id: siteId,
      name: "Warehouse",
    });
    expect(
      toJobContactSummaryRow({
        email: "ops@example.com",
        id: contactId,
        name: "Operations",
        notes: null,
        phone: "+3531000000",
        updatedAt: "2026-06-15T10:15:00.000Z",
      })
    ).toMatchObject({
      email: "ops@example.com",
      id: contactId,
      name: "Operations",
      phone: "+3531000000",
    });
    expect(
      toJobCollaboratorElectricRow({
        accessLevel: "comment",
        createdAt: "2026-06-15T10:20:00.000Z",
        id: "66666666-6666-4666-8666-666666666666",
        roleLabel: "Facilities",
        subjectType: "user",
        updatedAt: "2026-06-15T10:20:00.000Z",
        userId,
        workItemId,
      })
    ).toMatchObject({ accessLevel: "comment", userId, workItemId });
    expect(
      toJobActivityElectricRow({
        actorId: "66666666-6666-4666-8666-666666666666",
        actorUserId: userId,
        createdAt: "2026-06-15T10:25:00.000Z",
        eventType: "priority_changed",
        id: "77777777-7777-4777-8777-777777777777",
        payload: JSON.stringify({
          eventType: "priority_changed",
          fromPriority: "medium",
          toPriority: "high",
        }),
        workItemId,
      })
    ).toMatchObject({
      actorId: "66666666-6666-4666-8666-666666666666",
      actorUserId: userId,
      eventType: "priority_changed",
      payload: {
        eventType: "priority_changed",
        fromPriority: "medium",
        toPriority: "high",
      },
    });
    expect(
      toJobVisitElectricRow({
        authorUserId: userId,
        createdAt: "2026-06-15T10:30:00.000Z",
        durationMinutes: 60,
        id: "88888888-8888-4888-8888-888888888888",
        note: "Initial survey",
        visitDate: "2026-06-15",
        workItemId,
      })
    ).toMatchObject({ durationMinutes: 60, visitDate: "2026-06-15" });
    expect(
      toJobCommentEdgeRow({
        commentId,
        createdAt: "2026-06-15T10:35:00.000Z",
        workItemId,
      })
    ).toStrictEqual({
      commentId,
      createdAt: "2026-06-15T10:35:00.000Z",
      id: `${workItemId}:${commentId}`,
      workItemId,
    });
    expect(
      toJobCommentElectricRow({
        actorId: "66666666-6666-4666-8666-666666666666",
        body: "Ready for dispatch",
        createdAt: "2026-06-15T10:40:00.000Z",
        id: commentId,
        updatedAt: "2026-06-15T10:40:00.000Z",
        authorUserId: userId,
        updatedByUserId: null,
      })
    ).toMatchObject({
      actorId: "66666666-6666-4666-8666-666666666666",
      body: "Ready for dispatch",
      id: commentId,
    });
    expect(
      toJobCommentElectricRow({
        actorId: "66666666-6666-4666-8666-666666666666",
        authorUserId: userId,
        body: "Ready for dispatch",
        createdAt: "2026-06-15T10:40:00.000Z",
        id: commentId,
        updatedAt: "2026-06-15T10:40:00.000Z",
        updatedByUserId: null,
      })
    ).not.toHaveProperty("authorUserId");
    expect(
      toJobCommentElectricRow({
        actorId: "66666666-6666-4666-8666-666666666666",
        authorUserId: userId,
        body: "Ready for dispatch",
        createdAt: "2026-06-15T10:40:00.000Z",
        id: commentId,
        updatedAt: "2026-06-15T10:40:00.000Z",
        updatedByUserId: null,
      })
    ).not.toHaveProperty("updatedByUserId");
    const productActor = toProductActivityActorElectricRow({
      displayDetail: "Dispatch",
      displayName: "Taylor Member",
      id: "66666666-6666-4666-8666-666666666666",
      kind: "member",
      routeHref: "/members/user_taylor",
      routeLabel: "Taylor Member",
    });
    expect(productActor).toMatchObject({
      displayDetail: "Dispatch",
      displayName: "Taylor Member",
      kind: "member",
      route: { href: "/members/user_taylor", label: "Taylor Member" },
    });
    expect(productActor).not.toHaveProperty("userId");
    expect(
      toProductMemberActorSummaryElectricRow({
        actorId: "66666666-6666-4666-8666-666666666666",
        displayDetail: "Dispatch",
        displayName: "Taylor Member",
        routeHref: "/members/user_taylor",
        routeLabel: "Taylor Member",
        userId,
      })
    ).toMatchObject({
      displayName: "Taylor Member",
      id: "66666666-6666-4666-8666-666666666666",
      kind: "member",
      route: { href: "/members/user_taylor", label: "Taylor Member" },
      userId,
    });
  });
});

function makeTestFetch(response: Response) {
  return Object.assign(
    vi.fn<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>(
      () => Promise.resolve(response) as ReturnType<typeof fetch>
    ),
    {
      preconnect: vi.fn<typeof fetch.preconnect>(),
    }
  ) satisfies typeof fetch;
}

function readElectricLifecycle(collection: object) {
  return (
    collection as {
      readonly _lifecycle: {
        readonly markReady: () => void;
        readonly setStatus: (status: string) => void;
      };
    }
  )._lifecycle;
}

function makeElectricError({
  kind,
  message = "sync failed",
  status,
}: {
  readonly kind: DataPlaneElectricSyncError["kind"];
  readonly message?: string | undefined;
  readonly status?: number | undefined;
}): DataPlaneElectricSyncError {
  return {
    kind,
    message,
    retryable: status === undefined || status >= 500,
    shapeName: "jobs",
    ...(status === undefined ? {} : { status }),
  };
}

function makeReadyHealthSnapshot(
  collection: Parameters<
    typeof createDataPlaneCollectionHealth
  >[0]["collection"],
  subscriptionName: string
) {
  const health = createDataPlaneCollectionHealth({
    collection,
    collectionId: collection,
    source: "electric",
    status: "connecting",
    subscriptionName,
  });

  return health.markReady();
}

function makeTestCollection(
  rows: readonly JobListItem[],
  options: { readonly id: string }
) {
  let currentRows = [...rows];

  return {
    cleanup: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    entries: () =>
      currentRows
        .map((row) => [row.id, row] as [JobListItem["id"], JobListItem])
        .values(),
    id: options.id,
    keys: () => currentRows.map((row) => row.id).values(),
    preload: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    status: "ready",
    subscribeChanges: vi.fn<() => { unsubscribe: () => void }>(() => ({
      unsubscribe: vi.fn<() => void>(),
    })),
    subscriberCount: 0,
    get toArray() {
      return currentRows;
    },
    utils: {
      writeBatch: (callback: () => void) => callback(),
      writeDelete: (key: JobListItem["id"] | readonly JobListItem["id"][]) => {
        const keys = new Set(Array.isArray(key) ? key : [key]);
        currentRows = currentRows.filter((row) => !keys.has(row.id));
      },
      writeUpsert: (data: JobListItem | readonly JobListItem[]) => {
        const incomingRows = Array.isArray(data) ? data : [data];
        const nextRowsById = new Map(currentRows.map((row) => [row.id, row]));
        for (const row of incomingRows) {
          nextRowsById.set(row.id, row);
        }
        currentRows = [...nextRowsById.values()];
      },
    },
  };
}

function makeJob(
  title: string,
  options: {
    readonly id?: WorkItemIdType | undefined;
    readonly updatedAt?: string | undefined;
    readonly workItemId?: WorkItemIdType | undefined;
  } = {}
): Job {
  return {
    createdAt: "2026-06-15T10:00:00.000Z",
    createdByUserId: "user_123" as UserId,
    id:
      options.id ??
      options.workItemId ??
      ("11111111-1111-4111-8111-111111111121" as WorkItemIdType),
    kind: "job",
    labels: [],
    priority: "medium",
    status: "new",
    title,
    updatedAt: options.updatedAt ?? "2026-06-15T10:00:00.000Z",
  } satisfies Job;
}

function makeJobsWorkspaceJobRow(
  job: Job
): ReturnType<typeof toJobsWorkspaceJobRow> {
  return {
    createdAt: job.createdAt,
    createdByUserId: job.createdByUserId,
    id: job.id,
    kind: job.kind,
    priority: job.priority,
    status: job.status,
    title: job.title,
    updatedAt: job.updatedAt,
  };
}

function makeJobWriteResponse(job: Job, txid: number): JobWriteResponse {
  return {
    job,
    mutation: { txid },
  };
}

function makeJobDetailWriteResponse(
  job: Job,
  txid: number
): JobDetailWriteResponse {
  return {
    detail: {
      activity: [],
      comments: [],
      job,
      viewerAccess: {
        canComment: true,
        visibility: "internal",
      },
      visits: [],
    },
    mutation: { txid },
  };
}

function createFakeCollection<Item>(getKey: (item: Item) => string): {
  delete: (item: Item) => void;
  entries: () => IterableIterator<[string, Item]>;
  subscribeChanges: (callback: () => void) => {
    requestSnapshot: () => void;
    unsubscribe: () => void;
  };
  upsert: (item: Item) => void;
} {
  const rows = new Map<string, Item>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    delete: (item) => {
      rows.delete(getKey(item));
      emit();
    },
    entries: () => rows.entries(),
    subscribeChanges: (callback) => {
      listeners.add(callback);
      return {
        requestSnapshot: callback,
        unsubscribe: () => {
          listeners.delete(callback);
        },
      };
    },
    upsert: (item) => {
      rows.set(getKey(item), item);
      emit();
    },
  };
}

function makeObservableCollection<Item>(initialRows: readonly Item[]) {
  let rows = [...initialRows];
  const listeners = new Set<() => void>();
  const subscriber = Promise.withResolvers<null>();

  return {
    entries: () =>
      rows.map((row, index) => [index, row] as [number, Item]).values(),
    set: (nextRows: readonly Item[]) => {
      rows = [...nextRows];
      for (const listener of listeners) {
        listener();
      }
    },
    subscribeChanges: (listener: () => void) => {
      listeners.add(listener);
      subscriber.resolve(null);

      return {
        requestSnapshot: () => listener(),
        unsubscribe: () => {
          listeners.delete(listener);
        },
      };
    },
    waitForSubscriber: () => subscriber.promise,
  };
}

function makeSynchronouslyConfirmingCollection<Item>(
  confirmedRows: readonly Item[]
) {
  let rows: readonly Item[] = [];

  return {
    entries: () =>
      rows.map((row, index) => [index, row] as [number, Item]).values(),
    subscribeChanges: (listener: () => void) => {
      rows = [...confirmedRows];
      listener();

      return {
        unsubscribe: vi.fn<() => void>(),
      };
    },
  };
}
