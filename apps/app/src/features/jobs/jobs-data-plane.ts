import type {
  JobCollaborator,
  JobDetailResponse,
  JobListItem,
  JobListQuery,
  JobListResponse,
  JobOptionsResponse,
  WorkItemIdType,
} from "@ceird/jobs-core";
import {
  JobCollaboratorSchema,
  JobDetailResponseSchema,
  JobListItemSchema,
  JobOptionsResponseSchema,
} from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type { SiteOption } from "@ceird/sites-core";
import type { QueryClient } from "@tanstack/query-core";
import { Schema } from "effect";

import {
  createDataPlaneSeed,
  seedQueryCollectionInitialData,
} from "#/data-plane/bootstrap";
import type { DataPlaneSeed } from "#/data-plane/bootstrap";
import {
  COMPLETE_TENANT_COLLECTION,
  createQueryCollectionFromContract,
  defineQueryCollectionContract,
  entityDetailCollectionCompleteness,
  pagedQueryCollectionCompleteness,
} from "#/data-plane/collection-contract";
import type { DataPlaneCollectionFilterScope } from "#/data-plane/collection-contract";
import {
  ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
  deleteDataPlaneCollectionItem,
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
import {
  getCurrentServerJobDetail,
  getCurrentServerJobOptions,
  listAllCurrentServerJobs,
  listCurrentServerJobs,
} from "#/features/jobs/jobs-server";
import {
  canUseInternalJobOptions,
  isExternalJobsViewer,
} from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import { upsertOrganizationLabel } from "#/features/labels/labels-state";

export const EMPTY_JOBS_OPTIONS: JobOptionsResponse = {
  contacts: [],
  labels: [],
  members: [],
  sites: [],
};

const JOB_OPTIONS_COLLECTION_ITEM_ID = "job-options";
const DEFAULT_JOBS_LIST_LIMIT = 50;

type JobsCollection = ReturnType<typeof createJobsCollection>;
type JobOptionsCollection = ReturnType<typeof createJobOptionsCollection>;
type JobDetailCollection = ReturnType<typeof createJobDetailCollection>;
type JobCollaboratorsCollection = ReturnType<
  typeof createJobCollaboratorsCollection
>;

const JobOptionsCollectionItemSchema = Schema.Struct({
  id: Schema.Literal(JOB_OPTIONS_COLLECTION_ITEM_ID),
  options: JobOptionsResponseSchema,
});
type JobOptionsCollectionItem = Schema.Schema.Type<
  typeof JobOptionsCollectionItemSchema
>;

const JobDetailCollectionItemSchema = Schema.Struct({
  detail: JobDetailResponseSchema,
  id: Schema.String,
});
export type JobDetailCollectionItem = Schema.Schema.Type<
  typeof JobDetailCollectionItemSchema
>;

export interface JobsCollectionState {
  readonly collection: JobsCollection;
  readonly listScope: JobsListScope;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}

export interface JobOptionsCollectionState {
  readonly collection: JobOptionsCollection;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}

export interface JobDetailCollectionState {
  readonly collection: JobDetailCollection;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}

export interface JobCollaboratorsCollectionState {
  readonly collection: JobCollaboratorsCollection;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}

export interface JobsListScope {
  readonly query: JobListQuery;
}

export function createJobsListScope(query: JobListQuery = {}): JobsListScope {
  return {
    query: normalizeJobsListQuery(query),
  };
}

export function jobsCollectionKey(
  scope: OrganizationDataScope,
  listScope: JobsListScope = createJobsListScope()
) {
  const { query } = listScope;

  return [
    ...organizationDataQueryKey("jobs", scope),
    "list",
    "cursor",
    query.cursor ?? "initial",
    "limit",
    query.limit ?? DEFAULT_JOBS_LIST_LIMIT,
    "status",
    query.status ?? "all",
    "assignee",
    query.assigneeId ?? "all",
    "coordinator",
    query.coordinatorId ?? "all",
    "priority",
    query.priority ?? "all",
    "label",
    query.labelId ?? "all",
    "site",
    query.siteId ?? "all",
    "search",
    query.query ?? "",
    "sort",
    "updated-desc",
  ] as const;
}

function jobOptionsCollectionKey(scope: OrganizationDataScope) {
  return organizationDataQueryKey("job-options", scope);
}

function jobDetailCollectionKey(
  scope: OrganizationDataScope,
  workItemId: WorkItemIdType
) {
  return [...organizationDataQueryKey("job-details", scope), "job", workItemId];
}

function jobCollaboratorsCollectionKey(
  scope: OrganizationDataScope,
  workItemId: WorkItemIdType
) {
  return [
    ...organizationDataQueryKey("job-collaborators", scope),
    "job",
    workItemId,
  ];
}

export function jobsCollectionId(
  scope: OrganizationDataScope,
  listScope: JobsListScope = createJobsListScope()
) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:jobs:${jobsListScopeKey(listScope)}`;
}

export function jobsListScopeKey(listScope: JobsListScope) {
  return jobsCollectionKey(
    {
      organizationId: "scope" as OrganizationDataScope["organizationId"],
      role: "member",
      userId: "user",
    },
    listScope
  )
    .slice(7)
    .join(":");
}

function jobOptionsCollectionId(scope: OrganizationDataScope) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:job-options`;
}

function jobDetailCollectionId(
  scope: OrganizationDataScope,
  workItemId: WorkItemIdType
) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:job:${workItemId}:detail`;
}

function jobCollaboratorsCollectionId(
  scope: OrganizationDataScope,
  workItemId: WorkItemIdType
) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:job:${workItemId}:collaborators`;
}

export function createJobsListSeed(
  scope: OrganizationDataScope,
  response: JobListResponse,
  listScope: JobsListScope = createJobsListScope(),
  requestStartedAt?: number | undefined
): DataPlaneSeed<readonly JobListItem[]> {
  return createDataPlaneSeed({
    collection: "jobs",
    completeness: jobsListCompleteness(listScope, response),
    data: response.items,
    queryKey: jobsCollectionKey(scope, listScope),
    requestStartedAt,
  });
}

export function createJobOptionsSeed(
  scope: OrganizationDataScope,
  response: JobOptionsResponse,
  requestStartedAt?: number | undefined
): DataPlaneSeed<readonly JobOptionsCollectionItem[]> {
  return createDataPlaneSeed({
    collection: "job-options",
    completeness: COMPLETE_TENANT_COLLECTION,
    data: [toJobOptionsCollectionItem(response)],
    queryKey: jobOptionsCollectionKey(scope),
    requestStartedAt,
  });
}

export function getOrCreateJobsCollectionState({
  initialJobs,
  listScope = createJobsListScope(),
  queryClient,
  scope,
  session,
}: {
  readonly initialJobs: readonly JobListItem[];
  readonly listScope?: JobsListScope | undefined;
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
}): JobsCollectionState {
  const registryKey = jobsCollectionId(scope, listScope);
  const existing = session?.registry.get(registryKey);

  if (existing) {
    seedQueryCollectionInitialData(
      queryClient,
      jobsCollectionKey(scope, listScope),
      [...initialJobs]
    );
    return existing as JobsCollectionState;
  }

  const writeVersionRef = { current: 0 };
  const state = {
    collection: undefined as JobsCollection | undefined,
    writeVersionRef,
  };
  const collection = createJobsCollection({
    initialJobs,
    listScope,
    queryClient,
    scope,
    state,
    writeVersionRef,
  });
  const created = {
    collection,
    listScope,
    writeVersionRef,
  } satisfies JobsCollectionState;
  state.collection = collection;
  session?.registry.set(registryKey, created);

  return created;
}

export function getOrCreateJobOptionsCollectionState({
  initialOptions,
  loadOptions = getCurrentServerJobOptions,
  queryClient,
  scope,
  session,
}: {
  readonly initialOptions: JobOptionsResponse;
  readonly loadOptions?: (() => Promise<JobOptionsResponse>) | undefined;
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
}): JobOptionsCollectionState {
  const registryKey = jobOptionsCollectionId(scope);
  const existing = session?.registry.get(registryKey);
  const initialItems = [toJobOptionsCollectionItem(initialOptions)];

  if (existing) {
    seedQueryCollectionInitialData(
      queryClient,
      jobOptionsCollectionKey(scope),
      initialItems
    );
    return existing as JobOptionsCollectionState;
  }

  const writeVersionRef = { current: 0 };
  const state = {
    collection: undefined as JobOptionsCollection | undefined,
    writeVersionRef,
  };
  const collection = createJobOptionsCollection({
    initialOptions,
    loadOptions,
    queryClient,
    scope,
    state,
    writeVersionRef,
  });
  const created = {
    collection,
    writeVersionRef,
  } satisfies JobOptionsCollectionState;
  state.collection = collection;
  session?.registry.set(registryKey, created);

  return created;
}

export function getOrCreateJobDetailCollectionState({
  initialDetail,
  queryClient,
  scope,
  session,
}: {
  readonly initialDetail: JobDetailResponse;
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
}): JobDetailCollectionState {
  const registryKey = jobDetailCollectionId(scope, initialDetail.job.id);
  const existing = session?.registry.get(registryKey);

  if (existing) {
    seedQueryCollectionInitialData(
      queryClient,
      jobDetailCollectionKey(scope, initialDetail.job.id),
      [toJobDetailCollectionItem(initialDetail)]
    );
    return existing as JobDetailCollectionState;
  }

  const writeVersionRef = { current: 0 };
  const state = {
    collection: undefined as JobDetailCollection | undefined,
    writeVersionRef,
  };
  const collection = createJobDetailCollection({
    initialDetail,
    queryClient,
    scope,
    state,
    writeVersionRef,
  });
  const created = {
    collection,
    writeVersionRef,
  } satisfies JobDetailCollectionState;
  state.collection = collection;
  session?.registry.set(registryKey, created);

  return created;
}

export function getOrCreateJobCollaboratorsCollectionState({
  initialCollaborators,
  queryClient,
  scope,
  session,
  workItemId,
}: {
  readonly initialCollaborators: readonly JobCollaborator[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly workItemId: WorkItemIdType;
}): JobCollaboratorsCollectionState {
  const registryKey = jobCollaboratorsCollectionId(scope, workItemId);
  const existing = session?.registry.get(registryKey);
  const sortedCollaborators = sortJobCollaborators(initialCollaborators);

  if (existing) {
    seedQueryCollectionInitialData(
      queryClient,
      jobCollaboratorsCollectionKey(scope, workItemId),
      sortedCollaborators
    );
    return existing as JobCollaboratorsCollectionState;
  }

  const writeVersionRef = { current: 0 };
  const state = {
    collection: undefined as JobCollaboratorsCollection | undefined,
    writeVersionRef,
  };
  const collection = createJobCollaboratorsCollection({
    initialCollaborators: sortedCollaborators,
    queryClient,
    scope,
    state,
    workItemId,
    writeVersionRef,
  });
  const created = {
    collection,
    writeVersionRef,
  } satisfies JobCollaboratorsCollectionState;
  state.collection = collection;
  session?.registry.set(registryKey, created);

  return created;
}

export function deleteJobDetailCollectionState({
  scope,
  session,
  workItemId,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly workItemId: WorkItemIdType;
}) {
  disposeRegisteredCollectionState<JobDetailCollectionState>(
    session,
    jobDetailCollectionId(scope, workItemId)
  );
}

export function deleteJobCollaboratorsCollectionState({
  scope,
  session,
  workItemId,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly workItemId: WorkItemIdType;
}) {
  disposeRegisteredCollectionState<JobCollaboratorsCollectionState>(
    session,
    jobCollaboratorsCollectionId(scope, workItemId)
  );
}

export async function replaceJobsCollectionData(
  state: JobsCollectionState,
  jobs: readonly JobListItem[]
) {
  await replaceDataPlaneCollectionData({
    collection: state.collection,
    items: jobs,
    writeVersionRef: state.writeVersionRef,
  });
}

export async function replaceJobOptionsCollectionData(
  state: JobOptionsCollectionState,
  options: JobOptionsResponse
) {
  await replaceDataPlaneCollectionData({
    collection: state.collection,
    items: [toJobOptionsCollectionItem(options)],
    writeVersionRef: state.writeVersionRef,
  });
}

export async function replaceJobDetailCollectionData(
  state: JobDetailCollectionState,
  detail: JobDetailResponse
) {
  await replaceDataPlaneCollectionData({
    collection: state.collection,
    items: [toJobDetailCollectionItem(detail)],
    writeVersionRef: state.writeVersionRef,
  });
}

export async function replaceJobCollaboratorsCollectionData(
  state: JobCollaboratorsCollectionState,
  collaborators: readonly JobCollaborator[]
) {
  await replaceDataPlaneCollectionData({
    collection: state.collection,
    items: sortJobCollaborators(collaborators),
    writeVersionRef: state.writeVersionRef,
  });
}

export async function upsertJobCollaboratorCollectionItem(
  state: JobCollaboratorsCollectionState,
  collaborator: JobCollaborator
) {
  await upsertDataPlaneCollectionItem({
    collection: state.collection,
    item: collaborator,
    writeVersionRef: state.writeVersionRef,
  });
}

export async function deleteJobCollaboratorCollectionItem(
  state: JobCollaboratorsCollectionState,
  collaboratorId: JobCollaborator["id"]
) {
  await deleteDataPlaneCollectionItem({
    collection: state.collection,
    key: collaboratorId,
    writeVersionRef: state.writeVersionRef,
  });
}

export function jobsFromCollectionState(
  state: JobsCollectionState,
  fallbackJobs: readonly JobListItem[]
): readonly JobListItem[] {
  if (state.collection.status !== "ready") {
    return fallbackJobs;
  }

  return readDataPlaneCollectionData(state.collection);
}

export function jobOptionsFromCollectionState(
  state: JobOptionsCollectionState,
  fallbackOptions: JobOptionsResponse
): JobOptionsResponse {
  if (state.collection.status !== "ready") {
    return fallbackOptions;
  }

  return (
    readDataPlaneCollectionData(state.collection)[0]?.options ?? fallbackOptions
  );
}

export function upsertJobOptionsLabel(
  options: JobOptionsResponse,
  label: Label
): JobOptionsResponse {
  return {
    ...options,
    labels: upsertOrganizationLabel(options.labels, label),
  };
}

export function upsertJobOptionsSite(
  options: JobOptionsResponse,
  site: SiteOption
): JobOptionsResponse {
  return {
    ...options,
    sites: upsertJobOptionSite(options.sites, site),
  };
}

export async function loadCurrentJobsOptionsForViewer(
  viewer: JobsViewer,
  existingList?: JobListResponse | undefined
): Promise<JobOptionsResponse> {
  if (canUseInternalJobOptions(viewer)) {
    return await getCurrentServerJobOptions();
  }

  if (!isExternalJobsViewer(viewer)) {
    return EMPTY_JOBS_OPTIONS;
  }

  const list = existingList ?? (await listAllCurrentServerJobs({}));
  const details = await Promise.all(
    list.items.map((item) => getCurrentServerJobDetail(item.id))
  );

  return deriveExternalJobsScopedOptions(details);
}

function createJobsCollection({
  initialJobs,
  listScope,
  queryClient,
  scope,
  state,
  writeVersionRef,
}: {
  readonly initialJobs: readonly JobListItem[];
  readonly listScope: JobsListScope;
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly state: {
    collection?: DataPlaneCollectionSnapshot<JobListItem> | undefined;
  };
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = jobsCollectionKey(scope, listScope);
  seedQueryCollectionInitialData(queryClient, queryKey, [...initialJobs]);

  return createQueryCollectionFromContract(
    queryClient,
    defineQueryCollectionContract({
      collection: "jobs",
      completeness: jobsListCompleteness(listScope),
      getKey: (job: JobListItem) => job.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: jobsCollectionId(scope, listScope),
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await listCurrentServerJobs(listScope.query);

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

function normalizeJobsListQuery(query: JobListQuery): JobListQuery {
  return {
    assigneeId: query.assigneeId,
    coordinatorId: query.coordinatorId,
    cursor: query.cursor,
    labelId: query.labelId,
    limit: query.limit ?? DEFAULT_JOBS_LIST_LIMIT,
    priority: query.priority,
    query: query.query,
    siteId: query.siteId,
    status: query.status,
  };
}

function jobsListCompleteness(
  listScope: JobsListScope,
  response?: JobListResponse | undefined
) {
  return pagedQueryCollectionCompleteness({
    filters: jobsListFilterScopes(listScope),
    page: {
      cursor: listScope.query.cursor,
      hasNextPage: response?.nextCursor !== undefined,
      limit: listScope.query.limit ?? DEFAULT_JOBS_LIST_LIMIT,
      type: "cursor",
    },
    queryName: "jobs.list",
  });
}

function jobsListFilterScopes(
  listScope: JobsListScope
): readonly DataPlaneCollectionFilterScope[] {
  const { query } = listScope;
  const filters: DataPlaneCollectionFilterScope[] = [];

  pushFilterScope(filters, "status", query.status);
  pushFilterScope(filters, "assigneeId", query.assigneeId);
  pushFilterScope(filters, "coordinatorId", query.coordinatorId);
  pushFilterScope(filters, "priority", query.priority);
  pushFilterScope(filters, "labelId", query.labelId);
  pushFilterScope(filters, "siteId", query.siteId);
  pushFilterScope(filters, "query", query.query, "search");

  return filters;
}

function pushFilterScope(
  filters: DataPlaneCollectionFilterScope[],
  field: string,
  value: unknown,
  operator: DataPlaneCollectionFilterScope["operator"] = "eq"
) {
  if (
    value === undefined ||
    value === "all" ||
    !isDataPlaneCollectionFilterValue(value)
  ) {
    return;
  }

  filters.push({ field, operator, value });
}

function isDataPlaneCollectionFilterValue(
  value: unknown
): value is DataPlaneCollectionFilterScope["value"] {
  if (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }

  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "boolean" ||
        typeof item === "number" ||
        typeof item === "string"
    )
  );
}

function createJobOptionsCollection({
  initialOptions,
  loadOptions,
  queryClient,
  scope,
  state,
  writeVersionRef,
}: {
  readonly initialOptions: JobOptionsResponse;
  readonly loadOptions: () => Promise<JobOptionsResponse>;
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly state: {
    collection?:
      | DataPlaneCollectionSnapshot<JobOptionsCollectionItem>
      | undefined;
  };
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = jobOptionsCollectionKey(scope);
  seedQueryCollectionInitialData(queryClient, queryKey, [
    toJobOptionsCollectionItem(initialOptions),
  ]);

  return createQueryCollectionFromContract(
    queryClient,
    defineQueryCollectionContract({
      collection: "job-options",
      completeness: COMPLETE_TENANT_COLLECTION,
      getKey: (item: JobOptionsCollectionItem) => item.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: jobOptionsCollectionId(scope),
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await loadOptions();

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: state.collection,
          incomingItems: [toJobOptionsCollectionItem(response)],
          requestWriteVersion,
          writeVersionRef,
        });
      },
      queryKey,
      retry: false,
      schema: Schema.toStandardSchemaV1(JobOptionsCollectionItemSchema),
      staleTime: 30_000,
      syncMode: "eager",
    })
  );
}

function createJobDetailCollection({
  initialDetail,
  queryClient,
  scope,
  state,
  writeVersionRef,
}: {
  readonly initialDetail: JobDetailResponse;
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly state: {
    collection?:
      | DataPlaneCollectionSnapshot<JobDetailCollectionItem>
      | undefined;
  };
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = jobDetailCollectionKey(scope, initialDetail.job.id);
  seedQueryCollectionInitialData(queryClient, queryKey, [
    toJobDetailCollectionItem(initialDetail),
  ]);

  return createQueryCollectionFromContract(
    queryClient,
    defineQueryCollectionContract({
      collection: "job-details",
      completeness: entityDetailCollectionCompleteness({
        entityId: initialDetail.job.id,
        entityType: "job",
      }),
      getKey: (item: JobDetailCollectionItem) => item.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: jobDetailCollectionId(scope, initialDetail.job.id),
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await getCurrentServerJobDetail(initialDetail.job.id);

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: state.collection,
          incomingItems: [toJobDetailCollectionItem(response)],
          requestWriteVersion,
          writeVersionRef,
        });
      },
      queryKey,
      retry: false,
      schema: Schema.toStandardSchemaV1(JobDetailCollectionItemSchema),
      staleTime: 30_000,
      syncMode: "on-demand",
    })
  );
}

function createJobCollaboratorsCollection({
  initialCollaborators,
  queryClient,
  scope,
  state,
  workItemId,
  writeVersionRef,
}: {
  readonly initialCollaborators: readonly JobCollaborator[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly state: {
    collection?: DataPlaneCollectionSnapshot<JobCollaborator> | undefined;
  };
  readonly workItemId: WorkItemIdType;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = jobCollaboratorsCollectionKey(scope, workItemId);
  seedQueryCollectionInitialData(queryClient, queryKey, [
    ...initialCollaborators,
  ]);

  return createQueryCollectionFromContract(
    queryClient,
    defineQueryCollectionContract({
      collection: "job-collaborators",
      completeness: entityDetailCollectionCompleteness({
        entityId: workItemId,
        entityType: "job",
      }),
      getKey: (collaborator: JobCollaborator) => collaborator.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: jobCollaboratorsCollectionId(scope, workItemId),
      queryFn: () => {
        const requestWriteVersion = writeVersionRef.current;

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: state.collection,
          incomingItems: [],
          requestWriteVersion,
          writeVersionRef,
        });
      },
      queryKey,
      retry: false,
      schema: Schema.toStandardSchemaV1(JobCollaboratorSchema),
      staleTime: 30_000,
      syncMode: "on-demand",
    })
  );
}

function toJobOptionsCollectionItem(
  options: JobOptionsResponse
): JobOptionsCollectionItem {
  return {
    id: JOB_OPTIONS_COLLECTION_ITEM_ID,
    options,
  };
}

export function toJobDetailCollectionItem(
  detail: JobDetailResponse
): JobDetailCollectionItem {
  return {
    detail,
    id: detail.job.id,
  };
}

function deriveExternalJobsScopedOptions(
  details: readonly JobDetailResponse[]
): JobOptionsResponse {
  const contactsById = new Map<
    JobOptionsResponse["contacts"][number]["id"],
    JobOptionsResponse["contacts"][number]
  >();
  const labelsById = new Map<Label["id"], Label>();
  const sitesById = new Map<SiteOption["id"], SiteOption>();

  for (const detail of details) {
    for (const label of detail.job.labels) {
      labelsById.set(label.id, label);
    }

    if (detail.site !== undefined) {
      sitesById.set(detail.site.id, detail.site);
    }

    if (detail.contact !== undefined) {
      contactsById.set(detail.contact.id, {
        email: detail.contact.email,
        id: detail.contact.id,
        name: detail.contact.name,
        phone: detail.contact.phone,
        siteIds: detail.job.siteId === undefined ? [] : [detail.job.siteId],
      });
    }
  }

  return {
    contacts: [...contactsById.values()],
    labels: [...labelsById.values()],
    members: [],
    sites: [...sitesById.values()],
  };
}

function upsertJobOptionSite(
  sites: readonly SiteOption[],
  site: SiteOption
): readonly SiteOption[] {
  const existingIndex = sites.findIndex((current) => current.id === site.id);

  if (existingIndex === -1) {
    return [...sites, site];
  }

  return sites.map((current, index) =>
    index === existingIndex ? site : current
  );
}

function sortJobCollaborators(collaborators: readonly JobCollaborator[]) {
  return collaborators.toSorted((left, right) =>
    left.roleLabel.localeCompare(right.roleLabel)
  );
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
