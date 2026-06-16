import type { JobListItem } from "@ceird/jobs-core";
import { JobListItemSchema } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type {
  SiteActiveJobPriority,
  SiteComment,
  SiteCommentsResponse,
  SiteIdType,
  SiteListCursorType,
  SiteListResponse,
  SiteOption,
} from "@ceird/sites-core";
import {
  SiteActiveJobPrioritySchema,
  SiteCommentSchema,
  SiteOptionSchema,
} from "@ceird/sites-core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { QueryClient } from "@tanstack/query-core";
import { Effect, Schema } from "effect";

import type { DataPlaneSeed } from "#/data-plane/bootstrap";
import {
  createDataPlaneSeed,
  seedQueryCollectionInitialData,
} from "#/data-plane/bootstrap";
import {
  createQueryCollectionFromContract,
  defineQueryCollectionContract,
  entityDetailCollectionCompleteness,
  pagedQueryCollectionCompleteness,
  syncBackedCollectionCompleteness,
} from "#/data-plane/collection-contract";
import {
  ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
  deleteDataPlaneCollectionItem,
  ensureDataPlaneCollectionReadyForWrite,
  readDataPlaneCollectionData,
  reconcileQueryCollectionDataAfterConcurrentWrite,
  replaceDataPlaneCollectionData,
  upsertDataPlaneCollectionItem,
} from "#/data-plane/collection-write";
import type {
  DataPlaneCollectionSnapshot,
  DataPlaneCollectionWriteVersionRef,
} from "#/data-plane/collection-write";
import {
  createElectricCollectionFromContract,
  defineElectricCollectionContract,
} from "#/data-plane/electric-collection";
import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import type { DataPlaneSession } from "#/data-plane/session";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import {
  listCurrentServerJobs,
  listCurrentServerSites,
} from "#/features/api/app-api-server";

type SitesCollection = ReturnType<typeof createSitesCollection>;
type SiteCommentsCollection = ReturnType<typeof createSiteCommentsCollection>;
type SiteRelatedJobsCollection = ReturnType<
  typeof createSiteRelatedJobsCollection
>;
type SitesElectricReadModelCollections = ReturnType<
  typeof createSitesElectricReadModelCollections
>;

export const SITES_LIST_PAGE_LIMIT = 50;
export const SITE_RELATED_JOBS_PAGE_LIMIT = 25;

type SitesElectricRowValue =
  | bigint
  | boolean
  | null
  | number
  | string
  | SitesElectricRowValue[]
  | { readonly [key: string]: SitesElectricRowValue };
type SitesElectricRow = Record<string, SitesElectricRowValue>;

const SiteActiveJobSummaryElectricRowSchema = Schema.Struct({
  activeJobCount: Schema.Number,
  highestActiveJobPriority: Schema.optional(
    Schema.NullOr(SiteActiveJobPrioritySchema)
  ),
  organizationId: Schema.String,
  siteId: Schema.String,
  updatedAt: Schema.String,
});
const SiteLabelAssignmentElectricRowSchema = Schema.Struct({
  createdAt: Schema.String,
  labelId: Schema.String,
  organizationId: Schema.String,
  siteId: Schema.String,
});
const SiteOptionElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteOptionSchema
) as unknown as StandardSchemaV1<unknown, SitesElectricRow>;
const SiteActiveJobSummaryElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteActiveJobSummaryElectricRowSchema
) as unknown as StandardSchemaV1<unknown, SitesElectricRow>;
const SiteLabelAssignmentElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteLabelAssignmentElectricRowSchema
) as unknown as StandardSchemaV1<unknown, SitesElectricRow>;
const SiteRelatedJobElectricStandardSchema = Schema.toStandardSchemaV1(
  JobListItemSchema
) as unknown as StandardSchemaV1<unknown, SitesElectricRow>;

export interface SiteActiveJobSummaryElectricRow {
  readonly activeJobCount: number;
  readonly highestActiveJobPriority?: SiteActiveJobPriority | undefined;
  readonly organizationId: string;
  readonly siteId: SiteIdType;
  readonly updatedAt: string;
}

export interface SiteLabelAssignmentElectricRow {
  readonly createdAt: string;
  readonly labelId: Label["id"];
  readonly organizationId: string;
  readonly siteId: SiteIdType;
}

export interface SitesElectricReadModelRows {
  readonly activeJobSummaries: readonly SiteActiveJobSummaryElectricRow[];
  readonly labels: readonly Label[];
  readonly siteLabelAssignments: readonly SiteLabelAssignmentElectricRow[];
  readonly sites: readonly SiteOption[];
}

export interface SitesElectricReadModelContracts {
  readonly activeJobSummaries: ReturnType<
    typeof createSiteActiveJobSummariesElectricContract
  >;
  readonly relatedJobs: ReturnType<
    typeof createSiteRelatedJobsElectricContract
  >;
  readonly siteLabelAssignments: ReturnType<
    typeof createSiteLabelAssignmentsElectricContract
  >;
  readonly sites: ReturnType<typeof createSitesElectricContract>;
}

export interface SitesElectricReadModelCollectionState {
  readonly collections: SitesElectricReadModelCollections;
}

export type SitesWorkspaceFilter =
  | "all"
  | "with-active-jobs"
  | "needs-location";

export type SitesWorkspaceSort = "name" | "active-jobs" | "updated";

export interface SitesWorkspaceVisibleRow {
  readonly relatedJobs: readonly JobListItem[];
  readonly site: SiteOption;
}

interface SitesListPageScope {
  readonly cursor?: SiteListCursorType | undefined;
  readonly limit: number;
}

const DEFAULT_SITES_LIST_PAGE_SCOPE = {
  limit: SITES_LIST_PAGE_LIMIT,
} satisfies SitesListPageScope;

export interface SitesCollectionState {
  readonly collection: SitesCollection;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}

export interface SiteCommentsCollectionState {
  readonly collection: SiteCommentsCollection;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}

export interface SiteRelatedJobsCollectionState {
  readonly collection: SiteRelatedJobsCollection;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}

export function sitesCollectionKey(
  scope: OrganizationDataScope,
  page: SitesListPageScope = DEFAULT_SITES_LIST_PAGE_SCOPE
) {
  return [
    ...organizationDataQueryKey("sites", scope),
    "page",
    {
      ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
      limit: page.limit,
      type: "cursor",
    },
  ];
}

export function siteCommentsCollectionKey(
  scope: OrganizationDataScope,
  siteId: SiteIdType
) {
  return [...organizationDataQueryKey("site-comments", scope), "site", siteId];
}

export function siteActiveJobSummariesCollectionKey(
  scope: OrganizationDataScope
) {
  return organizationDataQueryKey("site-active-job-summaries", scope);
}

export function siteLabelAssignmentsCollectionKey(
  scope: OrganizationDataScope
) {
  return organizationDataQueryKey("site-label-assignments", scope);
}

export function siteRelatedJobsCollectionKey(
  scope: OrganizationDataScope,
  siteId: SiteIdType
) {
  return [
    ...organizationDataQueryKey("site-related-jobs", scope),
    "site",
    siteId,
  ];
}

export function sitesCollectionId(scope: OrganizationDataScope) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:sites`;
}

export function siteCommentsCollectionId(
  scope: OrganizationDataScope,
  siteId: SiteIdType
) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:site:${siteId}:comments`;
}

export function siteActiveJobSummariesCollectionId(
  scope: OrganizationDataScope
) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:site-active-job-summaries`;
}

export function siteLabelAssignmentsCollectionId(scope: OrganizationDataScope) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:site-label-assignments`;
}

export function siteRelatedJobsCollectionId(
  scope: OrganizationDataScope,
  siteId: SiteIdType
) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:site:${siteId}:related-jobs`;
}

export function createSitesListSeed(
  scope: OrganizationDataScope,
  response: SiteListResponse,
  requestStartedAt?: number | undefined
): DataPlaneSeed<readonly SiteOption[]> {
  return createDataPlaneSeed({
    collection: "sites",
    completeness: pagedQueryCollectionCompleteness({
      page: {
        hasNextPage: response.nextCursor !== undefined,
        limit: SITES_LIST_PAGE_LIMIT,
        type: "cursor",
      },
      queryName: "sites-list",
    }),
    data: response.items,
    queryKey: sitesCollectionKey(scope),
    requestStartedAt,
  });
}

export function createSiteCommentsSeed(
  scope: OrganizationDataScope,
  siteId: SiteIdType,
  response: SiteCommentsResponse,
  requestStartedAt?: number | undefined
): DataPlaneSeed<readonly SiteComment[]> {
  return createDataPlaneSeed({
    collection: "site-comments",
    completeness: entityDetailCollectionCompleteness({
      entityId: siteId,
      entityType: "site",
    }),
    data: sortSiteComments(response.comments),
    queryKey: siteCommentsCollectionKey(scope, siteId),
    requestStartedAt,
  });
}

export function createSitesElectricReadModelContracts({
  scope,
  siteId,
}: {
  readonly scope: OrganizationDataScope;
  readonly siteId?: SiteIdType | undefined;
}): SitesElectricReadModelContracts {
  return {
    activeJobSummaries: createSiteActiveJobSummariesElectricContract(scope),
    relatedJobs: createSiteRelatedJobsElectricContract({ scope, siteId }),
    siteLabelAssignments: createSiteLabelAssignmentsElectricContract(scope),
    sites: createSitesElectricContract(scope),
  };
}

export function createSitesElectricReadModelCollections({
  scope,
  siteId,
}: {
  readonly scope: OrganizationDataScope;
  readonly siteId?: SiteIdType | undefined;
}) {
  const contracts = createSitesElectricReadModelContracts({ scope, siteId });

  return {
    activeJobSummaries: createElectricCollectionFromContract(
      contracts.activeJobSummaries
    ),
    relatedJobs: createElectricCollectionFromContract(contracts.relatedJobs),
    siteLabelAssignments: createElectricCollectionFromContract(
      contracts.siteLabelAssignments
    ),
    sites: createElectricCollectionFromContract(contracts.sites),
  };
}

export function getOrCreateSitesElectricReadModelCollectionState({
  scope,
  session,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
}): SitesElectricReadModelCollectionState {
  const registryKey = `${sitesCollectionId(scope)}:workspace-read-model:electric`;
  const existing = session?.registry.get(registryKey);

  if (existing) {
    return existing as SitesElectricReadModelCollectionState;
  }

  const created = {
    collections: createSitesElectricReadModelCollections({ scope }),
  } satisfies SitesElectricReadModelCollectionState;

  session?.registry.set(registryKey, created);

  return created;
}

export function joinSitesElectricReadModel({
  activeJobSummaries,
  labels,
  siteLabelAssignments,
  sites,
}: SitesElectricReadModelRows): readonly SiteOption[] {
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const labelsBySiteId = new Map<SiteIdType, Label[]>();

  for (const assignment of siteLabelAssignments) {
    const label = labelsById.get(assignment.labelId);

    if (label === undefined) {
      continue;
    }

    const siteLabels = labelsBySiteId.get(assignment.siteId) ?? [];
    siteLabels.push(label);
    labelsBySiteId.set(assignment.siteId, siteLabels);
  }

  for (const siteLabels of labelsBySiteId.values()) {
    siteLabels.sort(compareLabels);
  }

  const summariesBySiteId = new Map(
    activeJobSummaries.map((summary) => [summary.siteId, summary])
  );

  return sortSiteOptions(
    sites.map((site) => {
      const summary = summariesBySiteId.get(site.id);

      return {
        ...site,
        activeJobCount: summary?.activeJobCount ?? 0,
        highestActiveJobPriority: summary?.highestActiveJobPriority,
        labels: labelsBySiteId.get(site.id) ?? [],
      };
    })
  );
}

export function selectSiteRelatedJobs(
  jobs: readonly JobListItem[],
  siteId: SiteIdType
): readonly JobListItem[] {
  return jobs
    .filter((job) => job.siteId === siteId)
    .toSorted(compareRelatedJobs);
}

export function deriveSitesWorkspaceVisibleRows({
  activeJobSummaries,
  filter,
  labels,
  query,
  relatedJobs,
  siteLabelAssignments,
  sites,
  sort,
}: SitesElectricReadModelRows & {
  readonly filter: SitesWorkspaceFilter;
  readonly query: string;
  readonly relatedJobs: readonly JobListItem[];
  readonly sort: SitesWorkspaceSort;
}): readonly SitesWorkspaceVisibleRow[] {
  const normalizedQuery = normalizeSitesWorkspaceQuery(query);
  const joinedSites = joinSitesElectricReadModel({
    activeJobSummaries,
    labels,
    siteLabelAssignments,
    sites,
  });

  return joinedSites
    .filter((site) => matchesSitesWorkspaceFilter(site, filter))
    .filter((site) => matchesSitesWorkspaceQuery(site, normalizedQuery))
    .toSorted((left, right) => compareSitesWorkspaceRows(left, right, sort))
    .map((site) => ({
      relatedJobs: selectSiteRelatedJobs(relatedJobs, site.id),
      site,
    }));
}

function createSitesElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "sites",
    completeness: syncBackedCollectionCompleteness({
      covers: {
        mode: "complete-tenant",
      },
      source: "electric",
      subscriptionName: "sites",
    }),
    getKey: (site) => String(site.id),
    id: `${sitesCollectionId(scope)}:electric`,
    schema: SiteOptionElectricStandardSchema,
    shapeName: "sites",
    shapeOptions: {
      transformer: toSiteOptionElectricRow,
    },
  });
}

function createSiteLabelAssignmentsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "site-label-assignments",
    completeness: syncBackedCollectionCompleteness({
      covers: {
        mode: "complete-tenant",
      },
      source: "electric",
      subscriptionName: "site-labels",
    }),
    getKey: (assignment) =>
      `${String(assignment.siteId)}:${String(assignment.labelId)}`,
    id: `${siteLabelAssignmentsCollectionId(scope)}:electric`,
    schema: SiteLabelAssignmentElectricStandardSchema,
    shapeName: "site-labels",
    shapeOptions: {
      transformer: toSiteLabelAssignmentElectricRow,
    },
  });
}

function createSiteActiveJobSummariesElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "site-active-job-summaries",
    completeness: syncBackedCollectionCompleteness({
      covers: {
        mode: "complete-tenant",
      },
      source: "electric",
      subscriptionName: "site-active-job-summaries",
    }),
    getKey: (summary) => String(summary.siteId),
    id: `${siteActiveJobSummariesCollectionId(scope)}:electric`,
    schema: SiteActiveJobSummaryElectricStandardSchema,
    shapeName: "site-active-job-summaries",
    shapeOptions: {
      transformer: toSiteActiveJobSummaryElectricRow,
    },
  });
}

function createSiteRelatedJobsElectricContract({
  scope,
  siteId,
}: {
  readonly scope: OrganizationDataScope;
  readonly siteId?: SiteIdType | undefined;
}) {
  const covers =
    siteId === undefined
      ? ({ mode: "complete-tenant" } as const)
      : ({
          filters: [{ field: "siteId", operator: "eq", value: siteId }],
          mode: "filtered-query",
          queryName: "site-related-jobs",
        } as const);

  return defineElectricCollectionContract({
    collection: "site-related-jobs",
    completeness: syncBackedCollectionCompleteness({
      covers,
      source: "electric",
      subscriptionName: "jobs",
    }),
    getKey: (job) => String(job.id),
    id:
      siteId === undefined
        ? `${organizationDataQueryKey("site-related-jobs", scope).join(":")}:electric`
        : `${siteRelatedJobsCollectionId(scope, siteId)}:electric`,
    schema: SiteRelatedJobElectricStandardSchema,
    shapeName: "jobs",
    shapeOptions: {
      transformer: toSiteRelatedJobElectricRow,
    },
  });
}

export function getOrCreateSitesCollectionState({
  initialSites,
  queryClient,
  scope,
  session,
}: {
  readonly initialSites: readonly SiteOption[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
}): SitesCollectionState {
  const registryKey = sitesCollectionId(scope);
  const existing = session?.registry.get(registryKey);

  if (existing) {
    seedQueryCollectionInitialData(queryClient, sitesCollectionKey(scope), [
      ...initialSites,
    ]);
    return existing as SitesCollectionState;
  }

  const writeVersionRef = { current: 0 };
  const state = {
    collection: undefined as SitesCollection | undefined,
    writeVersionRef,
  };
  const collection = createSitesCollection({
    initialSites,
    queryClient,
    scope,
    state,
    writeVersionRef,
  });
  const created = {
    collection,
    writeVersionRef,
  } satisfies SitesCollectionState;
  state.collection = collection;
  session?.registry.set(registryKey, created);

  return created;
}

export function getOrCreateSiteCommentsCollectionState({
  initialComments,
  queryClient,
  scope,
  session,
  siteId,
}: {
  readonly initialComments: readonly SiteComment[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly siteId: SiteIdType;
}): SiteCommentsCollectionState {
  const registryKey = siteCommentsCollectionId(scope, siteId);
  const existing = session?.registry.get(registryKey);

  if (existing) {
    seedQueryCollectionInitialData(
      queryClient,
      siteCommentsCollectionKey(scope, siteId),
      sortSiteComments(initialComments)
    );
    return existing as SiteCommentsCollectionState;
  }

  const writeVersionRef = { current: 0 };
  const state = {
    collection: undefined as SiteCommentsCollection | undefined,
    writeVersionRef,
  };
  const collection = createSiteCommentsCollection({
    initialComments,
    queryClient,
    scope,
    siteId,
    state,
    writeVersionRef,
  });
  const created = {
    collection,
    writeVersionRef,
  } satisfies SiteCommentsCollectionState;
  state.collection = collection;
  session?.registry.set(registryKey, created);

  return created;
}

export function getOrCreateSiteRelatedJobsCollectionState({
  initialJobs,
  queryClient,
  scope,
  session,
  siteId,
}: {
  readonly initialJobs: readonly JobListItem[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly siteId: SiteIdType;
}): SiteRelatedJobsCollectionState {
  const registryKey = siteRelatedJobsCollectionId(scope, siteId);
  const existing = session?.registry.get(registryKey);

  if (existing) {
    seedQueryCollectionInitialData(
      queryClient,
      siteRelatedJobsCollectionKey(scope, siteId),
      [...initialJobs]
    );
    return existing as SiteRelatedJobsCollectionState;
  }

  const writeVersionRef = { current: 0 };
  const state = {
    collection: undefined as SiteRelatedJobsCollection | undefined,
    writeVersionRef,
  };
  const collection = createSiteRelatedJobsCollection({
    initialJobs,
    queryClient,
    scope,
    siteId,
    state,
    writeVersionRef,
  });
  const created = {
    collection,
    writeVersionRef,
  } satisfies SiteRelatedJobsCollectionState;
  state.collection = collection;
  session?.registry.set(registryKey, created);

  return created;
}

export function getSiteRelatedJobsCollectionState({
  scope,
  session,
  siteId,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly siteId: SiteIdType;
}): SiteRelatedJobsCollectionState | undefined {
  return session?.registry.get(siteRelatedJobsCollectionId(scope, siteId)) as
    | SiteRelatedJobsCollectionState
    | undefined;
}

export function deleteSiteCommentsCollectionState({
  scope,
  session,
  siteId,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly siteId: SiteIdType;
}) {
  disposeRegisteredCollectionState<SiteCommentsCollectionState>(
    session,
    siteCommentsCollectionId(scope, siteId)
  );
}

export function deleteSiteRelatedJobsCollectionState({
  scope,
  session,
  siteId,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly siteId: SiteIdType;
}) {
  disposeRegisteredCollectionState<SiteRelatedJobsCollectionState>(
    session,
    siteRelatedJobsCollectionId(scope, siteId)
  );
}

export async function replaceSitesCollectionData(
  state: SitesCollectionState,
  sites: readonly SiteOption[]
) {
  await replaceDataPlaneCollectionData({
    collection: state.collection,
    items: sortSiteOptions(sites),
    writeVersionRef: state.writeVersionRef,
  });
}

export async function upsertSiteCollectionItem(
  state: SitesCollectionState,
  site: SiteOption
) {
  await upsertDataPlaneCollectionItem({
    collection: state.collection,
    item: site,
    writeVersionRef: state.writeVersionRef,
  });
}

export async function refetchSiteCommentsCollectionData(
  state: SiteCommentsCollectionState,
  fallbackComments: readonly SiteComment[] = []
) {
  await ensureDataPlaneCollectionReadyForWrite(state.collection);
  await state.collection.utils.refetch({ throwOnError: true });
  return siteCommentsFromCollectionState(state, fallbackComments);
}

export async function upsertSiteCommentCollectionItem(
  state: SiteCommentsCollectionState,
  comment: SiteComment
) {
  await upsertDataPlaneCollectionItem({
    collection: state.collection,
    item: comment,
    writeVersionRef: state.writeVersionRef,
  });
}

export async function replaceSiteRelatedJobsCollectionData(
  state: SiteRelatedJobsCollectionState,
  jobs: readonly JobListItem[]
) {
  await replaceDataPlaneCollectionData({
    collection: state.collection,
    items: jobs,
    writeVersionRef: state.writeVersionRef,
  });
}

export async function upsertSiteRelatedJobCollectionItem(
  state: SiteRelatedJobsCollectionState,
  job: JobListItem
) {
  await upsertDataPlaneCollectionItem({
    collection: state.collection,
    item: job,
    writeVersionRef: state.writeVersionRef,
  });
}

export async function deleteSiteRelatedJobCollectionItem(
  state: SiteRelatedJobsCollectionState,
  jobId: JobListItem["id"]
) {
  await deleteDataPlaneCollectionItem({
    collection: state.collection,
    key: jobId,
    writeVersionRef: state.writeVersionRef,
  });
}

export function siteCommentsFromCollectionState(
  state: SiteCommentsCollectionState,
  fallbackComments: readonly SiteComment[]
): readonly SiteComment[] {
  if (state.collection.status !== "ready") {
    return sortSiteComments(fallbackComments);
  }

  return sortSiteComments(readDataPlaneCollectionData(state.collection));
}

function createSitesCollection({
  initialSites,
  queryClient,
  scope,
  state,
  writeVersionRef,
}: {
  readonly initialSites: readonly SiteOption[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly state: {
    collection?: DataPlaneCollectionSnapshot<SiteOption> | undefined;
  };
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = sitesCollectionKey(scope);
  seedQueryCollectionInitialData(queryClient, queryKey, [...initialSites]);

  return createQueryCollectionFromContract(
    queryClient,
    defineQueryCollectionContract({
      collection: "sites",
      completeness: pagedQueryCollectionCompleteness({
        page: {
          limit: SITES_LIST_PAGE_LIMIT,
          type: "cursor",
        },
        queryName: "sites-list",
      }),
      getKey: (site: SiteOption) => site.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: sitesCollectionId(scope),
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await listCurrentServerSites({
          limit: SITES_LIST_PAGE_LIMIT,
        });

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: state.collection,
          incomingItems: response.items,
          requestWriteVersion,
          writeVersionRef,
        });
      },
      queryKey,
      retry: false,
      schema: Schema.toStandardSchemaV1(SiteOptionSchema),
      staleTime: 30_000,
      syncMode: "eager",
    })
  );
}

function createSiteRelatedJobsCollection({
  initialJobs,
  queryClient,
  scope,
  siteId,
  state,
  writeVersionRef,
}: {
  readonly initialJobs: readonly JobListItem[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly siteId: SiteIdType;
  readonly state: {
    collection?: DataPlaneCollectionSnapshot<JobListItem> | undefined;
  };
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = siteRelatedJobsCollectionKey(scope, siteId);
  seedQueryCollectionInitialData(queryClient, queryKey, [...initialJobs]);

  return createQueryCollectionFromContract(
    queryClient,
    defineQueryCollectionContract({
      collection: "site-related-jobs",
      completeness: pagedQueryCollectionCompleteness({
        filters: [{ field: "siteId", operator: "eq", value: siteId }],
        page: {
          limit: SITE_RELATED_JOBS_PAGE_LIMIT,
          type: "cursor",
        },
        queryName: "site-related-jobs",
      }),
      getKey: (job: JobListItem) => job.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: siteRelatedJobsCollectionId(scope, siteId),
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await listCurrentServerJobs({
          limit: SITE_RELATED_JOBS_PAGE_LIMIT,
          siteId,
        });

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: state.collection,
          incomingItems: response.items,
          requestWriteVersion,
          writeVersionRef,
        });
      },
      queryKey,
      retry: false,
      schema: Schema.toStandardSchemaV1(JobListItemSchema),
      staleTime: 30_000,
      syncMode: "eager",
    })
  );
}

function createSiteCommentsCollection({
  initialComments,
  queryClient,
  scope,
  siteId,
  state,
  writeVersionRef,
}: {
  readonly initialComments: readonly SiteComment[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly siteId: SiteIdType;
  readonly state: {
    collection?: DataPlaneCollectionSnapshot<SiteComment> | undefined;
  };
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = siteCommentsCollectionKey(scope, siteId);
  seedQueryCollectionInitialData(
    queryClient,
    queryKey,
    sortSiteComments(initialComments)
  );

  return createQueryCollectionFromContract(
    queryClient,
    defineQueryCollectionContract({
      collection: "site-comments",
      completeness: entityDetailCollectionCompleteness({
        entityId: siteId,
        entityType: "site",
      }),
      getKey: (comment: SiteComment) => comment.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: siteCommentsCollectionId(scope, siteId),
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await Effect.runPromise(
          listBrowserSiteComments(siteId)
        );

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: state.collection,
          incomingItems: sortSiteComments(response.comments),
          requestWriteVersion,
          writeVersionRef,
        });
      },
      queryKey,
      retry: false,
      schema: Schema.toStandardSchemaV1(SiteCommentSchema),
      staleTime: 30_000,
      syncMode: "on-demand",
    })
  );
}

function listBrowserSiteComments(siteId: SiteIdType) {
  return runBrowserAppApiRequest("SitesBrowser.listSiteComments", (client) =>
    client.sites.listSiteComments({
      params: { siteId },
    })
  );
}

function toSiteOptionElectricRow(
  row: Record<string, unknown>
): SitesElectricRow {
  const site: Record<string, unknown> = {
    displayLocation: String(row.displayLocation ?? ""),
    hasUsableCoordinates:
      row.latitude !== null &&
      row.latitude !== undefined &&
      row.longitude !== null &&
      row.longitude !== undefined &&
      ["google_resolved", "manually_adjusted", "validated"].includes(
        String(row.locationStatus)
      ),
    id: String(row.id),
    labels: [],
    locationStatus: String(row.locationStatus),
    name: String(row.name),
    activeJobCount: 0,
  };

  addOptionalValue(site, "accessNotes", row.accessNotes);
  addOptionalValue(site, "addressComponents", row.addressComponents);
  addOptionalValue(site, "addressLine1", row.addressLine1);
  addOptionalValue(site, "addressLine2", row.addressLine2);
  addOptionalValue(site, "country", row.country);
  addOptionalValue(site, "county", row.county);
  addOptionalValue(site, "eircode", row.eircode);
  addOptionalValue(site, "formattedAddress", row.formattedAddress);
  addOptionalValue(site, "googlePlaceId", row.googlePlaceId);
  addOptionalValue(site, "latitude", row.latitude);
  addOptionalValue(site, "locationProvider", row.locationProvider);
  addOptionalValue(site, "locationResolvedAt", row.locationResolvedAt);
  addOptionalValue(site, "longitude", row.longitude);
  addOptionalValue(site, "rawLocationInput", row.rawLocationInput);
  addOptionalValue(site, "town", row.town);

  Schema.decodeUnknownSync(SiteOptionSchema)(site);

  return site as SitesElectricRow;
}

function toSiteLabelAssignmentElectricRow(
  row: Record<string, unknown>
): SitesElectricRow {
  const assignment = {
    createdAt: String(row.createdAt),
    labelId: String(row.labelId),
    organizationId: String(row.organizationId),
    siteId: String(row.siteId),
  };

  Schema.decodeUnknownSync(SiteLabelAssignmentElectricRowSchema)(assignment);

  return assignment;
}

function toSiteActiveJobSummaryElectricRow(
  row: Record<string, unknown>
): SitesElectricRow {
  const highestActiveJobPriority =
    row.highestActiveJobPriority === null ||
    row.highestActiveJobPriority === undefined
      ? undefined
      : (String(row.highestActiveJobPriority) as SiteActiveJobPriority);

  const summary = {
    activeJobCount: Number(row.activeJobCount ?? 0),
    ...(highestActiveJobPriority === undefined
      ? {}
      : { highestActiveJobPriority }),
    organizationId: String(row.organizationId),
    siteId: String(row.siteId),
    updatedAt: String(row.updatedAt),
  };

  Schema.decodeUnknownSync(SiteActiveJobSummaryElectricRowSchema)(summary);

  return summary;
}

function toSiteRelatedJobElectricRow(
  row: Record<string, unknown>
): SitesElectricRow {
  const job: Record<string, unknown> = {
    createdAt: String(row.createdAt),
    id: String(row.id),
    kind: String(row.kind),
    labels: [],
    priority: String(row.priority),
    status: String(row.status),
    title: String(row.title),
    updatedAt: String(row.updatedAt),
  };

  addOptionalValue(job, "assigneeId", row.assigneeId);
  addOptionalValue(job, "contactId", row.contactId);
  addOptionalValue(job, "coordinatorId", row.coordinatorId);
  addOptionalValue(job, "siteId", row.siteId);

  Schema.decodeUnknownSync(JobListItemSchema)(job);

  return job as SitesElectricRow;
}

function addOptionalValue(
  target: Record<string, unknown>,
  key: string,
  value: unknown
) {
  if (value === null || value === undefined) {
    return;
  }

  target[key] = value;
}

function sortSiteComments(comments: readonly SiteComment[]) {
  return comments.toSorted(compareSiteComments);
}

function sortSiteOptions(sites: readonly SiteOption[]) {
  return sites.toSorted(compareSiteOptions);
}

function compareSiteOptions(left: SiteOption, right: SiteOption) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}

function compareSiteComments(left: SiteComment, right: SiteComment) {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);

  return createdAtComparison === 0
    ? left.id.localeCompare(right.id)
    : createdAtComparison;
}

function compareLabels(left: Label, right: Label) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}

function compareRelatedJobs(left: JobListItem, right: JobListItem) {
  const updatedAtComparison = right.updatedAt.localeCompare(left.updatedAt);

  return updatedAtComparison === 0
    ? right.id.localeCompare(left.id)
    : updatedAtComparison;
}

function normalizeSitesWorkspaceQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

function matchesSitesWorkspaceFilter(
  site: SiteOption,
  filter: SitesWorkspaceFilter
) {
  if (filter === "with-active-jobs") {
    return (site.activeJobCount ?? 0) > 0;
  }

  if (filter === "needs-location") {
    return !site.hasUsableCoordinates;
  }

  return true;
}

function matchesSitesWorkspaceQuery(site: SiteOption, query: string) {
  if (query.length === 0) {
    return true;
  }

  const searchableText = [
    site.name,
    site.displayLocation,
    site.formattedAddress,
    site.accessNotes,
    ...site.labels.map((label) => label.name),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();

  return searchableText.includes(query);
}

function compareSitesWorkspaceRows(
  left: SiteOption,
  right: SiteOption,
  sort: SitesWorkspaceSort
) {
  if (sort === "active-jobs") {
    const activeJobComparison =
      (right.activeJobCount ?? 0) - (left.activeJobCount ?? 0);

    if (activeJobComparison !== 0) {
      return activeJobComparison;
    }
  }

  if (sort === "updated") {
    const leftUpdatedAt = getSiteUpdatedAt(left);
    const rightUpdatedAt = getSiteUpdatedAt(right);
    const updatedAtComparison = rightUpdatedAt.localeCompare(leftUpdatedAt);

    if (updatedAtComparison !== 0) {
      return updatedAtComparison;
    }
  }

  return compareSiteOptions(left, right);
}

function getSiteUpdatedAt(site: SiteOption) {
  return "updatedAt" in site && typeof site.updatedAt === "string"
    ? site.updatedAt
    : "";
}

interface DisposableCollectionState {
  readonly collection: {
    readonly cleanup: () => Promise<void>;
    readonly subscriberCount: number;
  };
}

function disposeRegisteredCollectionState<
  State extends DisposableCollectionState,
>(session: DataPlaneSession | undefined, registryKey: string) {
  const state = session?.registry.get(registryKey) as State | undefined;

  if (!session || !state) {
    return;
  }

  queueMicrotask(() => {
    if (session.registry.get(registryKey) !== state) {
      return;
    }

    if (state.collection.subscriberCount > 0) {
      return;
    }

    session.registry.delete(registryKey);
    void state.collection.cleanup();
  });
}
