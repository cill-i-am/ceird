import {
  ProductActorDisplayDetail,
  ProductActorDisplayName,
  ProductActorId,
  ProductActorKind,
  ProductActorRoute,
} from "@ceird/identity-core";
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
  ActivityId,
  CommentId,
  ContactId,
  IsoDateTimeString,
  JobActivityEventTypeSchema,
  JobActivityPayloadSchema,
  JobCollaboratorSchema,
  JobDetailResponseSchema,
  JobKindSchema,
  JobListItemSchema,
  JobOptionsResponseSchema,
  JobPrioritySchema,
  JobStatusSchema,
  JobVisitSchema,
  UserId,
  WorkItemId,
} from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import { LabelId, LabelSchema } from "@ceird/labels-core";
import type { SiteOption } from "@ceird/sites-core";
import {
  SiteId,
  SiteLatitudeSchema,
  SiteLocationProviderSchema,
  SiteLocationStatusSchema,
  SiteLongitudeSchema,
} from "@ceird/sites-core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
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
  syncBackedCollectionCompleteness,
} from "#/data-plane/collection-contract";
import type { DataPlaneCollectionFilterScope } from "#/data-plane/collection-contract";
import type {
  DataPlaneCollectionHealth,
  DataPlaneCollectionHealthError,
  DataPlaneCollectionHealthSnapshot,
  DataPlaneCollectionHealthStatus,
} from "#/data-plane/collection-health";
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
import {
  createElectricCollectionFromContract,
  defineElectricCollectionContract,
} from "#/data-plane/electric-collection";
import type { DataPlaneElectricCollectionContract } from "#/data-plane/electric-collection";
import type { DataPlaneLiveCollection } from "#/data-plane/live-query";
import { createCollectionWithQueryFallback } from "#/data-plane/query-fallback-collection";
import type {
  CreateDataPlaneFallbackCollectionOptions,
  DataPlaneFallbackHealth,
} from "#/data-plane/query-fallback-collection";
import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import type { DataPlaneSession } from "#/data-plane/session";
import {
  getCurrentServerJobDetail,
  getCurrentServerExternalJobOptions,
  getCurrentServerJobOptions,
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
const JOBS_WORKSPACE_READ_MODEL_QUERY_NAME = "jobs.workspace.electric";
const JOBS_WORKSPACE_DETAIL_QUERY_NAME = "jobs.workspace.detail.electric";
type JobsElectricRowValue =
  | bigint
  | boolean
  | null
  | number
  | string
  | readonly JobsElectricRowValue[]
  | { readonly [key: string]: JobsElectricRowValue };
type JobsElectricRow = Record<string, JobsElectricRowValue>;

interface JobsCollection extends DataPlaneCollectionSnapshot<JobListItem> {
  readonly cleanup: () => Promise<void>;
  readonly entries: () => Iterable<[JobListItem["id"], JobListItem]>;
  readonly id: string;
  readonly keys: () => IterableIterator<JobListItem["id"]>;
  readonly preload?: (() => Promise<void>) | undefined;
  readonly status: string;
  readonly subscribeChanges: (callback: () => void) => {
    readonly requestSnapshot?:
      | ((options?: { readonly optimizedOnly?: boolean }) => void)
      | undefined;
    readonly unsubscribe: () => void;
  };
  readonly subscriberCount: number;
  readonly utils: {
    readonly writeBatch: (callback: () => void) => void;
    readonly writeDelete: (
      key: JobListItem["id"] | readonly JobListItem["id"][]
    ) => void;
    readonly writeUpsert: (data: JobListItem | readonly JobListItem[]) => void;
  };
}
type JobOptionsCollection = ReturnType<typeof createJobOptionsCollection>;
type JobDetailCollection = ReturnType<typeof createJobDetailCollection>;
type JobCollaboratorsCollection = ReturnType<
  typeof createJobCollaboratorsCollection
>;
type JobsWorkspaceCollection<
  Item extends object,
  Key extends string | number = string,
> = DataPlaneLiveCollection<Item, Key, Record<string, never>>;
export type JobsCollectionSyncOptions = Omit<
  CreateDataPlaneFallbackCollectionOptions<JobsCollection, JobsCollection>,
  "createQueryCollection"
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

export const JobsWorkspaceJobRowSchema = Schema.Struct({
  assigneeId: Schema.optional(UserId),
  blockedReason: Schema.optional(Schema.String),
  completedAt: Schema.optional(IsoDateTimeString),
  completedByUserId: Schema.optional(UserId),
  contactId: Schema.optional(ContactId),
  coordinatorId: Schema.optional(UserId),
  createdAt: IsoDateTimeString,
  createdByUserId: UserId,
  id: WorkItemId,
  kind: JobKindSchema,
  priority: JobPrioritySchema,
  siteId: Schema.optional(SiteId),
  status: JobStatusSchema,
  title: Schema.String,
  updatedAt: IsoDateTimeString,
});
export type JobsWorkspaceJobRow = Schema.Schema.Type<
  typeof JobsWorkspaceJobRowSchema
>;

export const JobLabelAssignmentRowSchema = Schema.Struct({
  createdAt: IsoDateTimeString,
  id: Schema.String,
  labelId: LabelId,
  workItemId: WorkItemId,
});
export type JobLabelAssignmentRow = Schema.Schema.Type<
  typeof JobLabelAssignmentRowSchema
>;

export const JobContactSummaryRowSchema = Schema.Struct({
  email: Schema.optional(Schema.String),
  id: ContactId,
  name: Schema.String,
  notes: Schema.optional(Schema.String),
  phone: Schema.optional(Schema.String),
  updatedAt: IsoDateTimeString,
});
export type JobContactSummaryRow = Schema.Schema.Type<
  typeof JobContactSummaryRowSchema
>;

export const JobSiteSummaryRowSchema = Schema.Struct({
  accessNotes: Schema.optional(Schema.String),
  displayLocation: Schema.String,
  formattedAddress: Schema.optional(Schema.String),
  hasUsableCoordinates: Schema.Boolean,
  id: SiteId,
  latitude: Schema.optional(SiteLatitudeSchema),
  locationProvider: Schema.optional(SiteLocationProviderSchema),
  locationStatus: SiteLocationStatusSchema,
  longitude: Schema.optional(SiteLongitudeSchema),
  name: Schema.String,
  updatedAt: IsoDateTimeString,
});
export type JobSiteSummaryRow = Schema.Schema.Type<
  typeof JobSiteSummaryRowSchema
>;

export const JobCommentEdgeRowSchema = Schema.Struct({
  commentId: CommentId,
  createdAt: IsoDateTimeString,
  id: Schema.String,
  workItemId: WorkItemId,
});
export type JobCommentEdgeRow = Schema.Schema.Type<
  typeof JobCommentEdgeRowSchema
>;

export const JobsWorkspaceCommentRowSchema = Schema.Struct({
  actorId: Schema.optional(ProductActorId),
  authorUserId: UserId,
  body: Schema.String,
  createdAt: IsoDateTimeString,
  id: CommentId,
  updatedAt: IsoDateTimeString,
  updatedByUserId: Schema.optional(UserId),
});
export type JobsWorkspaceCommentRow = Schema.Schema.Type<
  typeof JobsWorkspaceCommentRowSchema
>;

export const JobsWorkspaceActivityRowSchema = Schema.Struct({
  actorId: Schema.optional(ProductActorId),
  actorUserId: Schema.optional(UserId),
  createdAt: IsoDateTimeString,
  eventType: JobActivityEventTypeSchema,
  id: ActivityId,
  payload: JobActivityPayloadSchema,
  workItemId: WorkItemId,
});
export type JobsWorkspaceActivityRow = Schema.Schema.Type<
  typeof JobsWorkspaceActivityRowSchema
>;

export type JobsWorkspaceVisitRow = Schema.Schema.Type<typeof JobVisitSchema>;

export const JobsWorkspaceProductActorRowSchema = Schema.Struct({
  displayDetail: Schema.optional(ProductActorDisplayDetail),
  displayName: ProductActorDisplayName,
  id: ProductActorId,
  kind: ProductActorKind,
  route: Schema.optional(ProductActorRoute),
});
export type JobsWorkspaceProductActorRow = Schema.Schema.Type<
  typeof JobsWorkspaceProductActorRowSchema
>;

export const JobsWorkspaceMemberActorSummaryRowSchema = Schema.Struct({
  displayDetail: Schema.optional(ProductActorDisplayDetail),
  displayName: ProductActorDisplayName,
  id: ProductActorId,
  kind: Schema.Literal("member"),
  route: Schema.optional(ProductActorRoute),
  userId: UserId,
});
export type JobsWorkspaceMemberActorSummaryRow = Schema.Schema.Type<
  typeof JobsWorkspaceMemberActorSummaryRowSchema
>;

export interface JobsWorkspaceReadModelContracts {
  readonly activity: ReturnType<typeof createJobActivityElectricContract>;
  readonly actors: ReturnType<
    typeof createProductActivityActorsElectricContract
  >;
  readonly collaborators: ReturnType<
    typeof createJobCollaboratorsElectricContract
  >;
  readonly comments: ReturnType<typeof createJobCommentsElectricContract>;
  readonly contactSummaries: ReturnType<
    typeof createJobContactSummariesElectricContract
  >;
  readonly detail: JobsWorkspaceDetailContract;
  readonly jobComments: ReturnType<
    typeof createJobCommentEdgesElectricContract
  >;
  readonly jobLabelAssignments: ReturnType<
    typeof createJobLabelAssignmentsElectricContract
  >;
  readonly jobs: ReturnType<typeof createJobsWorkspaceJobsElectricContract>;
  readonly labels: ReturnType<typeof createJobsWorkspaceLabelsElectricContract>;
  readonly list: JobsWorkspaceListContract;
  readonly memberActorSummaries: ReturnType<
    typeof createProductMemberActorSummariesElectricContract
  >;
  readonly siteSummaries: ReturnType<
    typeof createJobSiteSummariesElectricContract
  >;
  readonly visits: ReturnType<typeof createJobVisitsElectricContract>;
}

export interface JobsWorkspaceReadModelState {
  readonly collectionHealth: JobsWorkspaceReadModelCollectionHealth;
  readonly activity?:
    | JobsWorkspaceCollection<JobsWorkspaceActivityRow>
    | undefined;
  readonly actors?:
    | JobsWorkspaceCollection<JobsWorkspaceProductActorRow>
    | undefined;
  readonly collaborators?: JobsWorkspaceCollection<JobCollaborator> | undefined;
  readonly comments?:
    | JobsWorkspaceCollection<JobsWorkspaceCommentRow>
    | undefined;
  readonly contactSummaries?:
    | JobsWorkspaceCollection<JobContactSummaryRow>
    | undefined;
  readonly detailHealth: DataPlaneCollectionHealth;
  readonly detailCollectionHealth: JobsWorkspaceDetailReadModelCollectionHealth;
  readonly health: DataPlaneCollectionHealth;
  readonly jobComments?: JobsWorkspaceCollection<JobCommentEdgeRow> | undefined;
  readonly jobLabelAssignments?:
    | JobsWorkspaceCollection<JobLabelAssignmentRow>
    | undefined;
  readonly jobs?: JobsWorkspaceCollection<JobsWorkspaceJobRow> | undefined;
  readonly labels?: JobsWorkspaceCollection<Label> | undefined;
  readonly memberActorSummaries?:
    | JobsWorkspaceCollection<JobsWorkspaceMemberActorSummaryRow>
    | undefined;
  readonly siteSummaries?:
    | JobsWorkspaceCollection<JobSiteSummaryRow>
    | undefined;
  readonly visits?: JobsWorkspaceCollection<JobsWorkspaceVisitRow> | undefined;
}

export interface JobsWorkspaceReadModelCollectionHealth {
  readonly jobs: DataPlaneCollectionHealth;
  readonly labels: DataPlaneCollectionHealth;
  readonly jobLabelAssignments: DataPlaneCollectionHealth;
  readonly siteSummaries: DataPlaneCollectionHealth;
  readonly contactSummaries: DataPlaneCollectionHealth;
}

export interface JobsWorkspaceDetailReadModelCollectionHealth extends JobsWorkspaceReadModelCollectionHealth {
  readonly actors: DataPlaneCollectionHealth;
  readonly collaborators: DataPlaneCollectionHealth;
  readonly activity: DataPlaneCollectionHealth;
  readonly visits: DataPlaneCollectionHealth;
  readonly jobComments: DataPlaneCollectionHealth;
  readonly comments: DataPlaneCollectionHealth;
  readonly memberActorSummaries: DataPlaneCollectionHealth;
}

export type JobsWorkspaceSort = "updated-desc" | "updated-asc" | "priority";
export type JobsWorkspaceStatusFilter =
  | "active"
  | "blocked"
  | "completed"
  | "all";

export interface JobsWorkspaceVisibleRowsOptions {
  readonly labelId?: string | undefined;
  readonly query?: string | undefined;
  readonly sort: JobsWorkspaceSort;
  readonly status: JobsWorkspaceStatusFilter;
}

export interface JobsWorkspaceVisibleRow {
  readonly contact?: JobContactSummaryRow | undefined;
  readonly job: JobsWorkspaceJobRow;
  readonly labels: readonly Label[];
  readonly searchText: string;
  readonly site?: JobSiteSummaryRow | undefined;
}

export interface JobsWorkspaceDetailActivityItem {
  readonly activity: JobsWorkspaceActivityRow;
  readonly actor?: JobsWorkspaceProductActorRow | undefined;
}

export interface JobsWorkspaceDetailReadModel {
  readonly activity: readonly JobsWorkspaceDetailActivityItem[];
  readonly assignee?: JobsWorkspaceMemberActorSummaryRow | undefined;
  readonly collaborators: readonly JobCollaborator[];
  readonly commentCount: number;
  readonly contact?: JobContactSummaryRow | undefined;
  readonly coordinator?: JobsWorkspaceMemberActorSummaryRow | undefined;
  readonly job: JobsWorkspaceJobRow;
  readonly labels: readonly Label[];
  readonly site?: JobSiteSummaryRow | undefined;
  readonly visits: readonly JobsWorkspaceVisitRow[];
}

export interface JobsWorkspaceListContract {
  readonly completeness: ReturnType<typeof jobsWorkspaceListCompleteness>;
  readonly derivesFromCollections: readonly [
    "jobs",
    "job-label-assignments",
    "labels",
    "job-sites",
    "job-contacts",
  ];
  readonly healthCollections: readonly [
    "jobs",
    "job-label-assignments",
    "labels",
    "job-sites",
    "job-contacts",
  ];
  readonly requiredShapes: readonly [
    "jobs",
    "work-item-labels",
    "labels",
    "sites",
    "contacts",
  ];
}

export interface JobsWorkspaceDetailContract {
  readonly completeness: ReturnType<typeof jobsWorkspaceDetailCompleteness>;
  readonly derivesFromCollections: readonly [
    "jobs",
    "job-label-assignments",
    "labels",
    "job-sites",
    "job-contacts",
    "job-collaborators",
    "product-activity-actors",
    "product-member-actor-summaries",
    "job-activity",
    "job-visits",
    "job-comments",
    "job-comment-bodies",
  ];
  readonly healthCollections: readonly [
    "jobs",
    "job-label-assignments",
    "labels",
    "job-sites",
    "job-contacts",
    "job-collaborators",
    "product-activity-actors",
    "product-member-actor-summaries",
    "job-activity",
    "job-visits",
    "job-comments",
    "job-comment-bodies",
  ];
  readonly projectionFollowUps: readonly string[];
  readonly requiredShapes: readonly [
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
    "comments",
  ];
}

const JobListItemStandardSchema = Schema.toStandardSchemaV1(JobListItemSchema);
const JobListItemElectricStandardSchema =
  JobListItemStandardSchema as unknown as StandardSchemaV1<
    unknown,
    JobsElectricRow
  >;

export interface JobsCollectionState {
  readonly collection: JobsCollection;
  readonly health: DataPlaneFallbackHealth;
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

function jobsWorkspaceCollectionId(
  scope: OrganizationDataScope,
  collection: string
) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:jobs-workspace:${collection}`;
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
  sync,
}: {
  readonly initialJobs: readonly JobListItem[];
  readonly listScope?: JobsListScope | undefined;
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly sync?: JobsCollectionSyncOptions | undefined;
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
  const result = createJobsCollection({
    initialJobs,
    listScope,
    queryClient,
    scope,
    state,
    sync,
    writeVersionRef,
  });
  const created = {
    collection: result.collection,
    health: result.health,
    listScope,
    writeVersionRef,
  } satisfies JobsCollectionState;
  state.collection = result.collection;
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
  viewer: JobsViewer
): Promise<JobOptionsResponse> {
  if (canUseInternalJobOptions(viewer)) {
    return await getCurrentServerJobOptions();
  }

  if (!isExternalJobsViewer(viewer)) {
    return EMPTY_JOBS_OPTIONS;
  }

  return await getCurrentServerExternalJobOptions();
}

export function createJobsWorkspaceReadModelContracts(
  scope: OrganizationDataScope
): JobsWorkspaceReadModelContracts {
  return {
    activity: createJobActivityElectricContract(scope),
    actors: createProductActivityActorsElectricContract(scope),
    collaborators: createJobCollaboratorsElectricContract(scope),
    comments: createJobCommentsElectricContract(scope),
    contactSummaries: createJobContactSummariesElectricContract(scope),
    detail: createJobsWorkspaceDetailContract(),
    jobComments: createJobCommentEdgesElectricContract(scope),
    jobLabelAssignments: createJobLabelAssignmentsElectricContract(scope),
    jobs: createJobsWorkspaceJobsElectricContract(scope),
    labels: createJobsWorkspaceLabelsElectricContract(scope),
    list: createJobsWorkspaceListContract(),
    memberActorSummaries:
      createProductMemberActorSummariesElectricContract(scope),
    siteSummaries: createJobSiteSummariesElectricContract(scope),
    visits: createJobVisitsElectricContract(scope),
  };
}

export function getOrCreateJobsWorkspaceReadModelState({
  scope,
  session,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
}): JobsWorkspaceReadModelState {
  const registryKey = jobsWorkspaceCollectionId(scope, "list-read-model");
  const existing = session?.registry.get(registryKey);

  if (existing) {
    return existing as JobsWorkspaceReadModelState;
  }

  const contracts = createJobsWorkspaceReadModelContracts(scope);
  const jobs = createJobsWorkspaceElectricCollection<
    JobsWorkspaceJobRow,
    string
  >(contracts.jobs);
  const labels = createJobsWorkspaceElectricCollection<Label, string>(
    contracts.labels
  );
  const jobLabelAssignments = createJobsWorkspaceElectricCollection<
    JobLabelAssignmentRow,
    string
  >(contracts.jobLabelAssignments);
  const siteSummaries = createJobsWorkspaceElectricCollection<
    JobSiteSummaryRow,
    string
  >(contracts.siteSummaries);
  const contactSummaries = createJobsWorkspaceElectricCollection<
    JobContactSummaryRow,
    string
  >(contracts.contactSummaries);
  const collaborators = createJobsWorkspaceElectricCollection<
    JobCollaborator,
    string
  >(contracts.collaborators);
  const actors = createJobsWorkspaceElectricCollection<
    JobsWorkspaceProductActorRow,
    string
  >(contracts.actors);
  const memberActorSummaries = createJobsWorkspaceElectricCollection<
    JobsWorkspaceMemberActorSummaryRow,
    string
  >(contracts.memberActorSummaries);
  const activity = createJobsWorkspaceElectricCollection<
    JobsWorkspaceActivityRow,
    string
  >(contracts.activity);
  const visits = createJobsWorkspaceElectricCollection<
    JobsWorkspaceVisitRow,
    string
  >(contracts.visits);
  const jobComments = createJobsWorkspaceElectricCollection<
    JobCommentEdgeRow,
    string
  >(contracts.jobComments);
  const comments = createJobsWorkspaceElectricCollection<
    JobsWorkspaceCommentRow,
    string
  >(contracts.comments);
  const collectionHealth = {
    jobs: jobs.health,
    labels: labels.health,
    jobLabelAssignments: jobLabelAssignments.health,
    siteSummaries: siteSummaries.health,
    contactSummaries: contactSummaries.health,
  } satisfies JobsWorkspaceReadModelCollectionHealth;
  const detailCollectionHealth = {
    ...collectionHealth,
    actors: actors.health,
    collaborators: collaborators.health,
    activity: activity.health,
    visits: visits.health,
    jobComments: jobComments.health,
    comments: comments.health,
    memberActorSummaries: memberActorSummaries.health,
  } satisfies JobsWorkspaceDetailReadModelCollectionHealth;
  const created = {
    activity: activity.collection,
    actors: actors.collection,
    collectionHealth,
    collaborators: collaborators.collection,
    comments: comments.collection,
    contactSummaries: contactSummaries.collection,
    detailCollectionHealth,
    detailHealth: createJobsWorkspaceReadModelHealth({
      collectionHealth: detailCollectionHealth,
      collectionId: jobsWorkspaceCollectionId(scope, "detail-read-model"),
      subscriptionName: "jobs-workspace-detail",
    }),
    health: createJobsWorkspaceReadModelHealth({
      collectionHealth,
      collectionId: jobsWorkspaceCollectionId(scope, "list-read-model"),
      subscriptionName: "jobs-workspace-list",
    }),
    jobComments: jobComments.collection,
    jobLabelAssignments: jobLabelAssignments.collection,
    jobs: jobs.collection,
    labels: labels.collection,
    memberActorSummaries: memberActorSummaries.collection,
    siteSummaries: siteSummaries.collection,
    visits: visits.collection,
  } satisfies JobsWorkspaceReadModelState;

  session?.registry.set(registryKey, created);

  return created;
}

function createJobsWorkspaceElectricCollection<
  Item extends object,
  Key extends string | number,
>(
  contract: unknown
): {
  readonly collection?: JobsWorkspaceCollection<Item, Key> | undefined;
  readonly health: DataPlaneCollectionHealth;
} {
  const typedContract = contract as DataPlaneElectricCollectionContract<
    StandardSchemaV1<unknown, never>,
    Key
  >;
  const result = createElectricCollectionFromContract(typedContract);

  if (result.status === "disabled") {
    return {
      health: result.health,
    };
  }

  return {
    collection: result.collection as unknown as JobsWorkspaceCollection<
      Item,
      Key
    >,
    health: result.health,
  };
}

export function createJobsWorkspaceReadModelHealth({
  collectionHealth,
  collectionId,
  subscriptionName,
}: {
  readonly collectionHealth:
    | JobsWorkspaceReadModelCollectionHealth
    | JobsWorkspaceDetailReadModelCollectionHealth;
  readonly collectionId: string;
  readonly subscriptionName: string;
}): DataPlaneCollectionHealth {
  const healthSources = Object.values(collectionHealth);
  const computeCurrent = () =>
    aggregateJobsWorkspaceReadModelHealth({
      collectionId,
      snapshots: healthSources.map((health) => health.current),
      subscriptionName,
    });

  return {
    get current() {
      return computeCurrent();
    },
    markFallbackActive: () => computeCurrent(),
    markReady: () => computeCurrent(),
    markUnavailable: () => computeCurrent(),
    subscribe: (listener) => {
      const unsubscribes = healthSources.map((health) =>
        health.subscribe(() => listener(computeCurrent()))
      );

      return () => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
      };
    },
  };
}

export function aggregateJobsWorkspaceReadModelHealth({
  collectionId,
  snapshots,
  subscriptionName = "jobs-workspace-list",
}: {
  readonly collectionId: string;
  readonly snapshots: readonly DataPlaneCollectionHealthSnapshot[];
  readonly subscriptionName?: string | undefined;
}): DataPlaneCollectionHealthSnapshot {
  const status = getJobsWorkspaceReadModelHealthStatus(snapshots);
  const firstUnavailable = snapshots.find(
    (snapshot) => snapshot.status === "unavailable"
  );
  const firstDisabled = snapshots.find(
    (snapshot) => snapshot.status === "disabled"
  );
  const firstFallback = snapshots.find(
    (snapshot) => snapshot.status === "fallback-active"
  );
  const readyLatencies = snapshots
    .map((snapshot) => snapshot.initialReadyLatencyMs)
    .filter((value): value is number => value !== undefined);

  return {
    collection: "jobs",
    collectionId,
    ...(firstDisabled?.disabledReason === undefined
      ? {}
      : {
          disabledReason: `${formatJobsWorkspaceHealthSource(firstDisabled)}: ${firstDisabled.disabledReason}`,
        }),
    ...(firstFallback?.fallbackReason === undefined
      ? {}
      : {
          fallbackReason: `${formatJobsWorkspaceHealthSource(firstFallback)}: ${firstFallback.fallbackReason}`,
        }),
    ...(readyLatencies.length === snapshots.length
      ? { initialReadyLatencyMs: Math.max(...readyLatencies) }
      : {}),
    ...(firstUnavailable?.lastError === undefined
      ? {}
      : {
          lastError: annotateJobsWorkspaceHealthError(
            firstUnavailable.lastError,
            firstUnavailable
          ),
        }),
    lastStatusChangeAtMs: Math.max(
      ...snapshots.map((snapshot) => snapshot.lastStatusChangeAtMs)
    ),
    recoveryAttempts: snapshots.reduce(
      (total, snapshot) => total + snapshot.recoveryAttempts,
      0
    ),
    source: "electric",
    startedAtMs: Math.min(...snapshots.map((snapshot) => snapshot.startedAtMs)),
    status,
    subscriptionName,
  };
}

function getJobsWorkspaceReadModelHealthStatus(
  snapshots: readonly DataPlaneCollectionHealthSnapshot[]
): DataPlaneCollectionHealthStatus {
  if (snapshots.some((snapshot) => snapshot.status === "unavailable")) {
    return "unavailable";
  }

  if (snapshots.some((snapshot) => snapshot.status === "disabled")) {
    return "disabled";
  }

  if (snapshots.some((snapshot) => snapshot.status === "fallback-active")) {
    return "fallback-active";
  }

  if (snapshots.every((snapshot) => snapshot.status === "ready")) {
    return "ready";
  }

  return "connecting";
}

function annotateJobsWorkspaceHealthError(
  error: DataPlaneCollectionHealthError,
  snapshot: DataPlaneCollectionHealthSnapshot
): DataPlaneCollectionHealthError {
  return {
    ...error,
    message: `${formatJobsWorkspaceHealthSource(snapshot)}: ${error.message}`,
  };
}

function formatJobsWorkspaceHealthSource(
  snapshot: DataPlaneCollectionHealthSnapshot
) {
  return snapshot.subscriptionName ?? snapshot.collection;
}

export function createJobsWorkspaceListContract(): JobsWorkspaceListContract {
  return {
    completeness: jobsWorkspaceListCompleteness(),
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
    requiredShapes: ["jobs", "work-item-labels", "labels", "sites", "contacts"],
  };
}

export function createJobsWorkspaceDetailContract(): JobsWorkspaceDetailContract {
  return {
    completeness: jobsWorkspaceDetailCompleteness(),
    derivesFromCollections: [
      "jobs",
      "job-label-assignments",
      "labels",
      "job-sites",
      "job-contacts",
      "job-collaborators",
      "product-activity-actors",
      "product-member-actor-summaries",
      "job-activity",
      "job-visits",
      "job-comments",
      "job-comment-bodies",
    ],
    healthCollections: [
      "jobs",
      "job-label-assignments",
      "labels",
      "job-sites",
      "job-contacts",
      "job-collaborators",
      "product-activity-actors",
      "product-member-actor-summaries",
      "job-activity",
      "job-visits",
      "job-comments",
      "job-comment-bodies",
    ],
    projectionFollowUps: [
      "Additional member/contact availability facets should come from domain-owned product projections before Jobs detail renders them from Electric.",
      "Site active-job counts and highest-active-priority summaries remain domain projections; the Jobs workspace should not recompute those site-level rollups from synced job rows.",
    ],
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
      "comments",
    ],
  };
}

export function deriveJobsWorkspaceVisibleRows({
  contacts,
  jobs,
  labels,
  labelAssignments,
  options,
  sites,
}: {
  readonly contacts: readonly JobContactSummaryRow[];
  readonly jobs: readonly JobsWorkspaceJobRow[];
  readonly labels: readonly Label[];
  readonly labelAssignments: readonly JobLabelAssignmentRow[];
  readonly options: JobsWorkspaceVisibleRowsOptions;
  readonly sites: readonly JobSiteSummaryRow[];
}): readonly JobsWorkspaceVisibleRow[] {
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const contactsById = new Map(
    contacts.map((contact) => [contact.id, contact])
  );
  const labelsByJobId = new Map<string, Label[]>();

  for (const assignment of labelAssignments) {
    const label = labelsById.get(assignment.labelId);

    if (!label) {
      continue;
    }

    const existing = labelsByJobId.get(assignment.workItemId);
    if (existing) {
      existing.push(label);
    } else {
      labelsByJobId.set(assignment.workItemId, [label]);
    }
  }

  const normalizedQuery = normalizeJobsWorkspaceQuery(options.query);
  const rows = jobs
    .map((job): JobsWorkspaceVisibleRow => {
      const rowLabels = labelsByJobId.get(job.id) ?? [];
      const site =
        job.siteId === undefined ? undefined : sitesById.get(job.siteId);
      const contact =
        job.contactId === undefined
          ? undefined
          : contactsById.get(job.contactId);
      const searchText = normalizeJobsWorkspaceQuery(
        [
          job.title,
          job.status,
          job.priority,
          job.blockedReason,
          site?.name,
          site?.displayLocation,
          contact?.name,
          contact?.email,
          contact?.phone,
          ...rowLabels.map((label) => label.name),
        ]
          .filter(Boolean)
          .join(" ")
      );

      return {
        contact,
        job,
        labels: rowLabels.toSorted((left, right) =>
          left.name.localeCompare(right.name)
        ),
        searchText,
        site,
      };
    })
    .filter((row) => matchesJobsWorkspaceStatus(row.job, options.status))
    .filter((row) =>
      options.labelId === undefined
        ? true
        : row.labels.some((label) => label.id === options.labelId)
    )
    .filter((row) =>
      normalizedQuery === "" ? true : row.searchText.includes(normalizedQuery)
    );

  return rows.toSorted((left, right) =>
    compareJobsWorkspaceRows(left, right, options.sort)
  );
}

export function deriveJobsWorkspaceDetail({
  activity,
  actors,
  collaborators,
  comments,
  contacts,
  jobComments,
  jobs,
  labels,
  labelAssignments,
  memberActorSummaries,
  selectedJobId,
  sites,
  visits,
}: {
  readonly activity: readonly JobsWorkspaceActivityRow[];
  readonly actors: readonly JobsWorkspaceProductActorRow[];
  readonly collaborators: readonly JobCollaborator[];
  readonly comments: readonly JobsWorkspaceCommentRow[];
  readonly contacts: readonly JobContactSummaryRow[];
  readonly jobComments: readonly JobCommentEdgeRow[];
  readonly jobs: readonly JobsWorkspaceJobRow[];
  readonly labels: readonly Label[];
  readonly labelAssignments: readonly JobLabelAssignmentRow[];
  readonly memberActorSummaries: readonly JobsWorkspaceMemberActorSummaryRow[];
  readonly selectedJobId?: WorkItemIdType | string | undefined;
  readonly sites: readonly JobSiteSummaryRow[];
  readonly visits: readonly JobsWorkspaceVisitRow[];
}): JobsWorkspaceDetailReadModel | undefined {
  if (selectedJobId === undefined) {
    return undefined;
  }

  const job = jobs.find((candidate) => candidate.id === selectedJobId);
  if (!job) {
    return undefined;
  }

  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));
  const memberActorsByUserId = new Map(
    memberActorSummaries.map((summary) => [summary.userId, summary])
  );
  const commentIdsForJob = new Set(
    jobComments
      .filter((edge) => edge.workItemId === job.id)
      .map((edge) => edge.commentId)
  );

  return {
    activity: activity
      .filter((item) => item.workItemId === job.id)
      .toSorted((left, right) =>
        right.createdAt === left.createdAt
          ? right.id.localeCompare(left.id)
          : right.createdAt.localeCompare(left.createdAt)
      )
      .map((item) => ({
        activity: item,
        actor:
          item.actorId === undefined ? undefined : actorsById.get(item.actorId),
      })),
    assignee:
      job.assigneeId === undefined
        ? undefined
        : memberActorsByUserId.get(job.assigneeId),
    collaborators: collaborators
      .filter((collaborator) => collaborator.workItemId === job.id)
      .toSorted((left, right) => left.roleLabel.localeCompare(right.roleLabel)),
    commentCount: comments.filter((comment) => commentIdsForJob.has(comment.id))
      .length,
    contact:
      job.contactId === undefined
        ? undefined
        : contacts.find((contact) => contact.id === job.contactId),
    coordinator:
      job.coordinatorId === undefined
        ? undefined
        : memberActorsByUserId.get(job.coordinatorId),
    job,
    labels: labelAssignments
      .filter((assignment) => assignment.workItemId === job.id)
      .map((assignment) => labelsById.get(assignment.labelId))
      .filter((label): label is Label => label !== undefined)
      .toSorted((left, right) => left.name.localeCompare(right.name)),
    site:
      job.siteId === undefined
        ? undefined
        : sites.find((site) => site.id === job.siteId),
    visits: visits
      .filter((visit) => visit.workItemId === job.id)
      .toSorted((left, right) =>
        right.visitDate === left.visitDate
          ? right.createdAt.localeCompare(left.createdAt)
          : right.visitDate.localeCompare(left.visitDate)
      ),
  };
}

function normalizeJobsWorkspaceQuery(query: string | undefined): string {
  return query?.trim().toLocaleLowerCase() ?? "";
}

function matchesJobsWorkspaceStatus(
  job: JobsWorkspaceJobRow,
  status: JobsWorkspaceStatusFilter
): boolean {
  if (status === "all") {
    return true;
  }

  if (status === "active") {
    return job.status !== "completed" && job.status !== "canceled";
  }

  return job.status === status;
}

function compareJobsWorkspaceRows(
  left: JobsWorkspaceVisibleRow,
  right: JobsWorkspaceVisibleRow,
  sort: JobsWorkspaceSort
): number {
  if (sort === "updated-asc") {
    return left.job.updatedAt.localeCompare(right.job.updatedAt);
  }

  if (sort === "priority") {
    const priorityDelta =
      jobPriorityRank(right.job.priority) - jobPriorityRank(left.job.priority);

    return priorityDelta === 0
      ? right.job.updatedAt.localeCompare(left.job.updatedAt)
      : priorityDelta;
  }

  return right.job.updatedAt.localeCompare(left.job.updatedAt);
}

function jobPriorityRank(priority: JobsWorkspaceJobRow["priority"]): number {
  switch (priority) {
    case "urgent": {
      return 4;
    }
    case "high": {
      return 3;
    }
    case "medium": {
      return 2;
    }
    case "low": {
      return 1;
    }
    case "none": {
      return 0;
    }
    default: {
      return 0;
    }
  }
}

export function createJobsWorkspaceJobsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "jobs",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "jobs",
    }),
    getKey: (job: JobsWorkspaceJobRow) => job.id,
    id: `${jobsWorkspaceCollectionId(scope, "jobs")}:electric`,
    schema: Schema.toStandardSchemaV1(JobsWorkspaceJobRowSchema),
    shapeName: "jobs",
    shapeOptions: {
      transformer: toJobsWorkspaceJobRow,
    },
  });
}

export function createJobsWorkspaceLabelsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "labels",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "labels",
    }),
    getKey: (label: Label) => label.id,
    id: `${jobsWorkspaceCollectionId(scope, "labels")}:electric`,
    schema: Schema.toStandardSchemaV1(LabelSchema),
    shapeName: "labels",
    shapeOptions: {
      transformer: toJobsWorkspaceLabelRow,
    },
  });
}

export function createJobLabelAssignmentsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "job-label-assignments",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "work-item-labels",
    }),
    getKey: (assignment: JobLabelAssignmentRow) => assignment.id,
    id: `${jobsWorkspaceCollectionId(scope, "job-label-assignments")}:electric`,
    schema: Schema.toStandardSchemaV1(JobLabelAssignmentRowSchema),
    shapeName: "work-item-labels",
    shapeOptions: {
      transformer: toJobLabelAssignmentRow,
    },
  });
}

export function createJobSiteSummariesElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "job-sites",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "sites",
    }),
    getKey: (site: JobSiteSummaryRow) => site.id,
    id: `${jobsWorkspaceCollectionId(scope, "job-sites")}:electric`,
    schema: Schema.toStandardSchemaV1(JobSiteSummaryRowSchema),
    shapeName: "sites",
    shapeOptions: {
      transformer: toJobSiteSummaryRow,
    },
  });
}

export function createJobContactSummariesElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "job-contacts",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "contacts",
    }),
    getKey: (contact: JobContactSummaryRow) => contact.id,
    id: `${jobsWorkspaceCollectionId(scope, "job-contacts")}:electric`,
    schema: Schema.toStandardSchemaV1(JobContactSummaryRowSchema),
    shapeName: "contacts",
    shapeOptions: {
      transformer: toJobContactSummaryRow,
    },
  });
}

export function createJobCollaboratorsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "job-collaborators",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "work-item-collaborators",
    }),
    getKey: (collaborator: JobCollaborator) => collaborator.id,
    id: `${jobsWorkspaceCollectionId(scope, "job-collaborators")}:electric`,
    schema: Schema.toStandardSchemaV1(JobCollaboratorSchema),
    shapeName: "work-item-collaborators",
    shapeOptions: {
      transformer: toJobCollaboratorElectricRow,
    },
  });
}

export function createProductActivityActorsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "product-activity-actors",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "product-activity-actors",
    }),
    getKey: (actor: JobsWorkspaceProductActorRow) => actor.id,
    id: `${jobsWorkspaceCollectionId(scope, "product-activity-actors")}:electric`,
    schema: Schema.toStandardSchemaV1(JobsWorkspaceProductActorRowSchema),
    shapeName: "product-activity-actors",
    shapeOptions: {
      transformer: toProductActivityActorElectricRow,
    },
  });
}

export function createProductMemberActorSummariesElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "product-member-actor-summaries",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "product-member-actor-summaries",
    }),
    getKey: (summary: JobsWorkspaceMemberActorSummaryRow) => summary.userId,
    id: `${jobsWorkspaceCollectionId(scope, "product-member-actor-summaries")}:electric`,
    schema: Schema.toStandardSchemaV1(JobsWorkspaceMemberActorSummaryRowSchema),
    shapeName: "product-member-actor-summaries",
    shapeOptions: {
      transformer: toProductMemberActorSummaryElectricRow,
    },
  });
}

export function createJobActivityElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "job-activity",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "work-item-activity",
    }),
    getKey: (activity: JobsWorkspaceActivityRow) => activity.id,
    id: `${jobsWorkspaceCollectionId(scope, "job-activity")}:electric`,
    schema: Schema.toStandardSchemaV1(JobsWorkspaceActivityRowSchema),
    shapeName: "work-item-activity",
    shapeOptions: {
      transformer: toJobActivityElectricRow,
    },
  });
}

export function createJobVisitsElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "job-visits",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "work-item-visits",
    }),
    getKey: (visit: Schema.Schema.Type<typeof JobVisitSchema>) => visit.id,
    id: `${jobsWorkspaceCollectionId(scope, "job-visits")}:electric`,
    schema: Schema.toStandardSchemaV1(JobVisitSchema),
    shapeName: "work-item-visits",
    shapeOptions: {
      transformer: toJobVisitElectricRow,
    },
  });
}

export function createJobCommentEdgesElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "job-comments",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "work-item-comments",
    }),
    getKey: (edge: JobCommentEdgeRow) => edge.id,
    id: `${jobsWorkspaceCollectionId(scope, "job-comments")}:electric`,
    schema: Schema.toStandardSchemaV1(JobCommentEdgeRowSchema),
    shapeName: "work-item-comments",
    shapeOptions: {
      transformer: toJobCommentEdgeRow,
    },
  });
}

export function createJobCommentsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "job-comment-bodies",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "comments",
    }),
    getKey: (comment: JobsWorkspaceCommentRow) => comment.id,
    id: `${jobsWorkspaceCollectionId(scope, "comments")}:electric`,
    schema: Schema.toStandardSchemaV1(JobsWorkspaceCommentRowSchema),
    shapeName: "comments",
    shapeOptions: {
      transformer: toJobCommentElectricRow,
    },
  });
}

function createJobsCollection({
  initialJobs,
  listScope,
  queryClient,
  scope,
  state,
  sync,
  writeVersionRef,
}: {
  readonly initialJobs: readonly JobListItem[];
  readonly listScope: JobsListScope;
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly state: {
    collection?: DataPlaneCollectionSnapshot<JobListItem> | undefined;
  };
  readonly sync?: JobsCollectionSyncOptions | undefined;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = jobsCollectionKey(scope, listScope);
  seedQueryCollectionInitialData(queryClient, queryKey, [...initialJobs]);

  const queryContract = defineQueryCollectionContract({
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
    schema: JobListItemStandardSchema,
    staleTime: 30_000,
    syncMode: "eager",
  });
  const electricContract = defineElectricCollectionContract({
    collection: "jobs",
    completeness: syncBackedCollectionCompleteness({
      covers: jobsListCompleteness(listScope),
      source: "electric",
      subscriptionName: "jobs",
    }),
    getKey: (job) => String(job.id) as JobListItem["id"],
    id: `${jobsCollectionId(scope, listScope)}:electric`,
    schema: JobListItemElectricStandardSchema,
    shapeName: "jobs",
    shapeOptions: {
      transformer: toJobListItemElectricRow,
    },
  });

  return createCollectionWithQueryFallback<
    JobsCollection,
    JobsCollection,
    typeof queryContract,
    typeof electricContract
  >(
    queryClient,
    {
      electric: electricContract,
      query: queryContract,
    },
    { ...sync, electricEnabled: sync?.electricEnabled === true }
  );
}

function toJobListItemElectricRow(row: Record<string, unknown>) {
  const item: JobsElectricRow = {
    createdAt: String(row.createdAt),
    id: String(row.id),
    kind: String(row.kind),
    labels: [],
    priority: String(row.priority),
    status: String(row.status),
    title: String(row.title),
    updatedAt: String(row.updatedAt),
  };

  addOptionalString(item, "assigneeId", row.assigneeId);
  addOptionalString(item, "contactId", row.contactId);
  addOptionalString(item, "coordinatorId", row.coordinatorId);
  addOptionalString(item, "siteId", row.siteId);

  return item;
}

export function toJobsWorkspaceJobRow(
  row: Record<string, unknown>
): JobsWorkspaceJobRow {
  const item: JobsElectricRow = {
    createdAt: String(row.createdAt),
    createdByUserId: String(row.createdByUserId),
    id: String(row.id),
    kind: String(row.kind),
    priority: String(row.priority),
    status: String(row.status),
    title: String(row.title),
    updatedAt: String(row.updatedAt),
  };

  addOptionalString(item, "assigneeId", row.assigneeId);
  addOptionalString(item, "blockedReason", row.blockedReason);
  addOptionalString(item, "completedAt", row.completedAt);
  addOptionalString(item, "completedByUserId", row.completedByUserId);
  addOptionalString(item, "contactId", row.contactId);
  addOptionalString(item, "coordinatorId", row.coordinatorId);
  addOptionalString(item, "siteId", row.siteId);

  return Schema.decodeUnknownSync(JobsWorkspaceJobRowSchema)(item);
}

export function toJobLabelAssignmentRow(
  row: Record<string, unknown>
): JobLabelAssignmentRow {
  const workItemId = String(row.workItemId);
  const labelId = String(row.labelId);

  return Schema.decodeUnknownSync(JobLabelAssignmentRowSchema)({
    createdAt: String(row.createdAt),
    id: `${workItemId}:${labelId}`,
    labelId,
    workItemId,
  });
}

export function toJobSiteSummaryRow(
  row: Record<string, unknown>
): JobSiteSummaryRow {
  const item: JobsElectricRow = {
    displayLocation: String(row.displayLocation),
    hasUsableCoordinates:
      row.latitude !== null &&
      row.latitude !== undefined &&
      row.longitude !== null &&
      row.longitude !== undefined,
    id: String(row.id),
    locationStatus: String(row.locationStatus),
    name: String(row.name),
    updatedAt: String(row.updatedAt),
  };

  addOptionalString(item, "accessNotes", row.accessNotes);
  addOptionalString(item, "formattedAddress", row.formattedAddress);
  addOptionalNumber(item, "latitude", row.latitude);
  addOptionalString(item, "locationProvider", row.locationProvider);
  addOptionalNumber(item, "longitude", row.longitude);

  return Schema.decodeUnknownSync(JobSiteSummaryRowSchema)(item);
}

export function toJobContactSummaryRow(
  row: Record<string, unknown>
): JobContactSummaryRow {
  const item: JobsElectricRow = {
    id: String(row.id),
    name: String(row.name),
    updatedAt: String(row.updatedAt),
  };

  addOptionalString(item, "email", row.email);
  addOptionalString(item, "notes", row.notes);
  addOptionalString(item, "phone", row.phone);

  return Schema.decodeUnknownSync(JobContactSummaryRowSchema)(item);
}

export function toJobsWorkspaceLabelRow(row: Record<string, unknown>): Label {
  return Schema.decodeUnknownSync(LabelSchema)({
    createdAt: String(row.createdAt),
    id: String(row.id),
    name: String(row.name),
    updatedAt: String(row.updatedAt),
  });
}

export function toJobCollaboratorElectricRow(
  row: Record<string, unknown>
): JobCollaborator {
  const item: JobsElectricRow = {
    accessLevel: String(row.accessLevel),
    createdAt: String(row.createdAt),
    id: String(row.id),
    roleLabel: String(row.roleLabel),
    subjectType: String(row.subjectType),
    updatedAt: String(row.updatedAt),
    workItemId: String(row.workItemId),
  };

  addOptionalString(item, "userId", row.userId);

  return Schema.decodeUnknownSync(JobCollaboratorSchema)(item);
}

export function toJobActivityElectricRow(
  row: Record<string, unknown>
): JobsWorkspaceActivityRow {
  const item: JobsElectricRow = {
    createdAt: String(row.createdAt),
    eventType: String(row.eventType),
    id: String(row.id),
    payload: parseJsonColumn(row.payload) as JobsElectricRowValue,
    workItemId: String(row.workItemId),
  };

  addOptionalString(item, "actorId", row.actorId);
  addOptionalString(item, "actorUserId", row.actorUserId);

  return Schema.decodeUnknownSync(JobsWorkspaceActivityRowSchema)(item);
}

export function toJobVisitElectricRow(
  row: Record<string, unknown>
): Schema.Schema.Type<typeof JobVisitSchema> {
  return Schema.decodeUnknownSync(JobVisitSchema)({
    authorUserId: String(row.authorUserId),
    createdAt: String(row.createdAt),
    durationMinutes: Number(row.durationMinutes),
    id: String(row.id),
    note: String(row.note),
    visitDate: String(row.visitDate),
    workItemId: String(row.workItemId),
  });
}

export function toJobCommentEdgeRow(
  row: Record<string, unknown>
): JobCommentEdgeRow {
  const workItemId = String(row.workItemId);
  const commentId = String(row.commentId);

  return Schema.decodeUnknownSync(JobCommentEdgeRowSchema)({
    commentId,
    createdAt: String(row.createdAt),
    id: `${workItemId}:${commentId}`,
    workItemId,
  });
}

export function toJobCommentElectricRow(
  row: Record<string, unknown>
): JobsWorkspaceCommentRow {
  const item: JobsElectricRow = {
    authorUserId: String(row.authorUserId),
    body: String(row.body),
    createdAt: String(row.createdAt),
    id: String(row.id),
    updatedAt: String(row.updatedAt),
  };

  addOptionalString(item, "actorId", row.actorId);
  addOptionalString(item, "updatedByUserId", row.updatedByUserId);

  return Schema.decodeUnknownSync(JobsWorkspaceCommentRowSchema)(item);
}

export function toProductActivityActorElectricRow(
  row: Record<string, unknown>
): JobsWorkspaceProductActorRow {
  const item: JobsElectricRow = {
    displayName: String(row.displayName),
    id: String(row.id),
    kind: String(row.kind),
  };

  addOptionalString(item, "displayDetail", row.displayDetail);

  if (
    row.routeHref !== null &&
    row.routeHref !== undefined &&
    row.routeLabel !== null &&
    row.routeLabel !== undefined
  ) {
    item.route = {
      href: String(row.routeHref),
      label: String(row.routeLabel),
    };
  }

  return Schema.decodeUnknownSync(JobsWorkspaceProductActorRowSchema)(item);
}

export function toProductMemberActorSummaryElectricRow(
  row: Record<string, unknown>
): JobsWorkspaceMemberActorSummaryRow {
  const item: JobsElectricRow = {
    displayName: String(row.displayName),
    id: String(row.actorId),
    kind: "member",
    userId: String(row.userId),
  };

  addOptionalString(item, "displayDetail", row.displayDetail);

  if (
    row.routeHref !== null &&
    row.routeHref !== undefined &&
    row.routeLabel !== null &&
    row.routeLabel !== undefined
  ) {
    item.route = {
      href: String(row.routeHref),
      label: String(row.routeLabel),
    };
  }

  return Schema.decodeUnknownSync(JobsWorkspaceMemberActorSummaryRowSchema)(
    item
  );
}

function addOptionalString(item: JobsElectricRow, key: string, value: unknown) {
  if (value === null || value === undefined) {
    return;
  }

  item[key] = String(value);
}

function addOptionalNumber(item: JobsElectricRow, key: string, value: unknown) {
  if (value === null || value === undefined) {
    return;
  }

  item[key] = Number(value);
}

function parseJsonColumn(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  return JSON.parse(value) as unknown;
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

function jobsWorkspaceListCompleteness() {
  return syncBackedCollectionCompleteness({
    covers: COMPLETE_TENANT_COLLECTION,
    source: "electric",
    subscriptionName: JOBS_WORKSPACE_READ_MODEL_QUERY_NAME,
  });
}

function jobsWorkspaceDetailCompleteness() {
  return syncBackedCollectionCompleteness({
    covers: COMPLETE_TENANT_COLLECTION,
    source: "electric",
    subscriptionName: JOBS_WORKSPACE_DETAIL_QUERY_NAME,
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
