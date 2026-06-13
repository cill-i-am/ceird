import type { JobListItem } from "@ceird/jobs-core";
import { JobListItemSchema } from "@ceird/jobs-core";
import type {
  SiteComment,
  SiteCommentsResponse,
  SiteIdType,
  SiteListCursorType,
  SiteListResponse,
  SiteOption,
} from "@ceird/sites-core";
import { SiteCommentSchema, SiteOptionSchema } from "@ceird/sites-core";
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

export const SITES_LIST_PAGE_LIMIT = 50;
export const SITE_RELATED_JOBS_PAGE_LIMIT = 25;

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

function siteRelatedJobsCollectionKey(
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

function siteRelatedJobsCollectionId(
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
