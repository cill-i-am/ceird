import type { CommentIdType } from "@ceird/comments-core";
import {
  CommentBodySchema,
  CommentId,
  IsoDateTimeString,
} from "@ceird/comments-core";
import {
  ProductActorDisplayDetail,
  ProductActorDisplayName,
  ProductActorId,
  ProductActorKind,
  ProductActorRoute,
} from "@ceird/identity-core";
import type { JobListItem } from "@ceird/jobs-core";
import { JobListItemSchema } from "@ceird/jobs-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import { LabelSchema } from "@ceird/labels-core";
import type {
  AssignSiteLabelInput,
  AddSiteCommentInput,
  AddSiteCommentResponse,
  CreateSiteInput,
  SiteActiveJobPriority,
  SiteIdType,
  SiteOption,
  SiteWriteResponse,
  UpdateSiteInput,
} from "@ceird/sites-core";
import {
  SiteId,
  SiteActiveJobPrioritySchema,
  SiteOptionSchema,
} from "@ceird/sites-core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Effect, Exit, Schema } from "effect";

import {
  COMPLETE_TENANT_COLLECTION,
  syncBackedCollectionCompleteness,
} from "#/data-plane/collection-contract";
import { executeDataPlaneCommandAction } from "#/data-plane/command-action";
import {
  createElectricCollectionFromContract,
  defineElectricCollectionContract,
} from "#/data-plane/electric-collection";
import type { DataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import type { DataPlaneSession } from "#/data-plane/session";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";

type SitesWorkspaceElectricRowValue =
  | bigint
  | boolean
  | null
  | number
  | string
  | SitesWorkspaceElectricRowValue[]
  | { readonly [key: string]: SitesWorkspaceElectricRowValue };
type SitesWorkspaceElectricRow = Record<string, SitesWorkspaceElectricRowValue>;

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
const ProductActivityActorElectricRowSchema = Schema.Struct({
  displayDetail: Schema.optional(ProductActorDisplayDetail),
  displayName: ProductActorDisplayName,
  id: ProductActorId,
  kind: ProductActorKind,
  route: Schema.optional(ProductActorRoute),
});
const SiteCommentEdgeElectricRowSchema = Schema.Struct({
  commentId: CommentId,
  createdAt: IsoDateTimeString,
  id: Schema.String,
  siteId: SiteId,
});
const SiteCommentBodyElectricRowSchema = Schema.Struct({
  actorId: ProductActorId,
  body: CommentBodySchema,
  createdAt: IsoDateTimeString,
  id: CommentId,
  updatedAt: IsoDateTimeString,
});
const SiteOptionElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteOptionSchema
) as unknown as StandardSchemaV1<unknown, SitesWorkspaceElectricRow>;
const SiteActiveJobSummaryElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteActiveJobSummaryElectricRowSchema
) as unknown as StandardSchemaV1<unknown, SitesWorkspaceElectricRow>;
const SiteLabelAssignmentElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteLabelAssignmentElectricRowSchema
) as unknown as StandardSchemaV1<unknown, SitesWorkspaceElectricRow>;
const SiteRelatedJobElectricStandardSchema = Schema.toStandardSchemaV1(
  JobListItemSchema
) as unknown as StandardSchemaV1<unknown, SitesWorkspaceElectricRow>;
const LabelElectricStandardSchema = Schema.toStandardSchemaV1(LabelSchema);
const ProductActivityActorElectricStandardSchema = Schema.toStandardSchemaV1(
  ProductActivityActorElectricRowSchema
) as unknown as StandardSchemaV1<unknown, SitesWorkspaceProductActorRow>;
const SiteCommentEdgeElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteCommentEdgeElectricRowSchema
) as unknown as StandardSchemaV1<unknown, SiteCommentEdgeRow>;
const SiteCommentBodyElectricStandardSchema = Schema.toStandardSchemaV1(
  SiteCommentBodyElectricRowSchema
) as unknown as StandardSchemaV1<unknown, SiteCommentBodyRow>;
const SITES_WORKSPACE_MUTATION_CONFIRMATION_TIMEOUT_MS = 10_000;

interface SitesWorkspaceObservableCollection<Item> {
  entries: () => IterableIterator<[string | number, Item]>;
  subscribeChanges: (callback: () => void) => {
    requestSnapshot?: (options?: { readonly optimizedOnly?: boolean }) => void;
    unsubscribe: () => void;
  };
}

export interface SitesWorkspaceCommandCollections {
  readonly commentBodies: SitesWorkspaceObservableCollection<SiteCommentBodyRow> | null;
  readonly commentEdges: SitesWorkspaceObservableCollection<SiteCommentEdgeRow> | null;
  readonly siteLabelAssignments: SitesWorkspaceObservableCollection<SiteLabelAssignmentElectricRow> | null;
  readonly sites: SitesWorkspaceObservableCollection<SiteOption> | null;
}

export interface SitesWorkspaceCommandRunnerOptions {
  readonly collections: SitesWorkspaceCommandCollections;
  readonly journal?: DataPlaneMutationJournal | undefined;
  readonly timeoutMs?: number | undefined;
}

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

export interface SitesWorkspaceElectricObservation {
  readonly collection: "site-label-assignments" | "sites";
  readonly kind: "already-reflected" | "observed-change";
}

export type SitesWorkspaceCommandResult = SiteWriteResponse & {
  readonly electricObservation: SitesWorkspaceElectricObservation;
};

export interface SiteCommentEdgeRow extends SitesWorkspaceElectricRow {
  readonly commentId: CommentIdType;
  readonly createdAt: string;
  readonly id: string;
  readonly siteId: SiteIdType;
}

export type SiteCommentBodyRow = Schema.Schema.Type<
  typeof SiteCommentBodyElectricRowSchema
> &
  SitesWorkspaceElectricRow;

export type SitesWorkspaceProductActorRow = Schema.Schema.Type<
  typeof ProductActivityActorElectricRowSchema
> &
  SitesWorkspaceElectricRow;

export interface SitesWorkspaceDetailCommentItem {
  readonly actor?: SitesWorkspaceProductActorRow | undefined;
  readonly comment: SiteCommentBodyRow;
  readonly edge: SiteCommentEdgeRow;
}

export interface SitesWorkspaceCommentCommandCollections {
  readonly commentBodies: SitesWorkspaceObservableCollection<SiteCommentBodyRow> | null;
  readonly commentEdges: SitesWorkspaceObservableCollection<SiteCommentEdgeRow> | null;
}

export interface SitesWorkspaceCommentElectricObservation {
  readonly commentBody: "already-reflected" | "observed-change";
  readonly commentEdge: "already-reflected" | "observed-change";
}

type SitesWorkspaceSiteCommentResponse = AddSiteCommentResponse;

export type SitesWorkspaceCommentCommandResult =
  SitesWorkspaceSiteCommentResponse & {
    readonly electricObservation: SitesWorkspaceCommentElectricObservation;
  };

export type SitesWorkspaceFilter =
  | "all"
  | "with-active-jobs"
  | "needs-location";

export type SitesWorkspaceSort = "name" | "active-jobs" | "updated";

export interface SitesWorkspaceVisibleRow {
  readonly comments: readonly SitesWorkspaceDetailCommentItem[];
  readonly relatedJobs: readonly JobListItem[];
  readonly site: SiteOption;
}

export interface SitesWorkspaceReadModelRows {
  readonly activeJobSummaries: readonly SiteActiveJobSummaryElectricRow[];
  readonly actors: readonly SitesWorkspaceProductActorRow[];
  readonly commentBodies: readonly SiteCommentBodyRow[];
  readonly labels: readonly Label[];
  readonly relatedJobs: readonly JobListItem[];
  readonly siteCommentEdges: readonly SiteCommentEdgeRow[];
  readonly siteLabelAssignments: readonly SiteLabelAssignmentElectricRow[];
  readonly sites: readonly SiteOption[];
}

export function createSitesWorkspaceCommandRunner({
  addComment = addBrowserSiteComment,
  collections,
  journal,
  timeoutMs = SITES_WORKSPACE_MUTATION_CONFIRMATION_TIMEOUT_MS,
}: SitesWorkspaceCommandRunnerOptions & {
  readonly addComment?:
    | ((
        siteId: SiteIdType,
        input: AddSiteCommentInput
      ) => ReturnType<typeof addBrowserSiteComment>)
    | undefined;
}) {
  return {
    addSiteComment: (siteId: SiteIdType, input: AddSiteCommentInput) =>
      executeDataPlaneCommandAction(
        {
          affectedCollections: ["site-comment-bodies", "site-comments"],
          execute: async (commandInput: {
            readonly input: AddSiteCommentInput;
            readonly siteId: SiteIdType;
          }) => {
            const exit = await Effect.runPromiseExit(
              addComment(commandInput.siteId, commandInput.input)
            );

            if (Exit.isFailure(exit)) {
              return Exit.failCause(exit.cause);
            }

            return await catchWorkspaceConfirmationFailure(
              awaitSiteCommentConfirmation({
                collections: {
                  commentBodies: collections.commentBodies,
                  commentEdges: collections.commentEdges,
                },
                response: exit.value,
                siteId: commandInput.siteId,
                timeoutMs,
              })
            );
          },
          name: "sites-workspace.add-comment",
          optimistic: "none",
        },
        { input, siteId },
        { journal }
      ),
    assignSiteLabel: (siteId: SiteIdType, input: AssignSiteLabelInput) =>
      executeDataPlaneCommandAction(
        {
          affectedCollections: ["site-label-assignments"],
          execute: async (commandInput: {
            readonly input: AssignSiteLabelInput;
            readonly siteId: SiteIdType;
          }) => {
            const exit = await Effect.runPromiseExit(
              assignBrowserSiteLabelWithConfirmation(
                commandInput.siteId,
                commandInput.input
              )
            );

            if (Exit.isFailure(exit)) {
              return Exit.failCause(exit.cause);
            }

            return await catchWorkspaceConfirmationFailure(
              awaitSiteLabelAssignmentConfirmation({
                collection: collections.siteLabelAssignments,
                labelId: commandInput.input.labelId,
                mode: "assigned",
                response: exit.value,
                siteId: commandInput.siteId,
                timeoutMs,
              })
            );
          },
          name: "sites-workspace.assign-label",
          optimistic: "none",
        },
        { input, siteId },
        { journal }
      ),
    createSite: (input: CreateSiteInput) =>
      executeDataPlaneCommandAction(
        {
          affectedCollections: ["sites"],
          execute: async (commandInput: CreateSiteInput) => {
            const exit = await Effect.runPromiseExit(
              createBrowserSiteWithConfirmation(commandInput)
            );

            if (Exit.isFailure(exit)) {
              return Exit.failCause(exit.cause);
            }

            return await catchWorkspaceConfirmationFailure(
              awaitSiteConfirmation({
                collection: collections.sites,
                response: exit.value,
                timeoutMs,
              })
            );
          },
          name: "sites-workspace.create",
          optimistic: "none",
        },
        input,
        { journal }
      ),
    removeSiteLabel: (siteId: SiteIdType, labelId: LabelIdType) =>
      executeDataPlaneCommandAction(
        {
          affectedCollections: ["site-label-assignments"],
          execute: async (commandInput: {
            readonly labelId: LabelIdType;
            readonly siteId: SiteIdType;
          }) => {
            const exit = await Effect.runPromiseExit(
              removeBrowserSiteLabelWithConfirmation(
                commandInput.siteId,
                commandInput.labelId
              )
            );

            if (Exit.isFailure(exit)) {
              return Exit.failCause(exit.cause);
            }

            return await catchWorkspaceConfirmationFailure(
              awaitSiteLabelAssignmentConfirmation({
                collection: collections.siteLabelAssignments,
                labelId: commandInput.labelId,
                mode: "removed",
                response: exit.value,
                siteId: commandInput.siteId,
                timeoutMs,
              })
            );
          },
          name: "sites-workspace.remove-label",
          optimistic: "none",
        },
        { labelId, siteId },
        { journal }
      ),
    updateSite: (siteId: SiteIdType, input: UpdateSiteInput) =>
      executeDataPlaneCommandAction(
        {
          affectedCollections: ["sites"],
          execute: async (commandInput: {
            readonly input: UpdateSiteInput;
            readonly siteId: SiteIdType;
          }) => {
            const exit = await Effect.runPromiseExit(
              updateBrowserSiteWithConfirmation(
                commandInput.siteId,
                commandInput.input
              )
            );

            if (Exit.isFailure(exit)) {
              return Exit.failCause(exit.cause);
            }

            return await catchWorkspaceConfirmationFailure(
              awaitSiteConfirmation({
                collection: collections.sites,
                response: exit.value,
                timeoutMs,
              })
            );
          },
          name: "sites-workspace.update",
          optimistic: "none",
        },
        { input, siteId },
        { journal }
      ),
  };
}

export function getOrCreateSitesWorkspaceReadModelCollectionState({
  scope,
  session,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
}) {
  const registryKey = `${sitesWorkspaceCollectionId(scope)}:read-model`;
  const existing = session?.registry.get(registryKey);

  if (existing) {
    return existing as ReturnType<
      typeof createSitesWorkspaceReadModelCollections
    >;
  }

  const created = createSitesWorkspaceReadModelCollections(scope);
  session?.registry.set(registryKey, created);

  return created;
}

export function deriveSitesWorkspaceVisibleRows({
  activeJobSummaries,
  actors,
  commentBodies,
  filter,
  labels,
  query,
  relatedJobs,
  siteCommentEdges,
  siteLabelAssignments,
  sites,
  sort,
}: SitesWorkspaceReadModelRows & {
  readonly filter: SitesWorkspaceFilter;
  readonly query: string;
  readonly sort: SitesWorkspaceSort;
}): readonly SitesWorkspaceVisibleRow[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const joinedSites = joinSitesWorkspaceRows({
    activeJobSummaries,
    labels,
    siteLabelAssignments,
    sites,
  });
  const actorsById = new Map(actors.map((actor) => [actor.id, actor]));
  const commentsById = new Map(
    commentBodies.map((comment) => [comment.id, comment])
  );

  return joinedSites
    .filter((site) => matchesSitesWorkspaceFilter(site, filter))
    .filter((site) => matchesSitesWorkspaceQuery(site, normalizedQuery))
    .toSorted((left, right) => compareSitesWorkspaceRows(left, right, sort))
    .map((site) => ({
      comments: selectSiteComments({
        actorsById,
        commentsById,
        siteCommentEdges,
        siteId: site.id,
      }),
      relatedJobs: selectSiteRelatedJobs(relatedJobs, site.id),
      site,
    }));
}

function createSitesWorkspaceReadModelCollections(
  scope: OrganizationDataScope
) {
  return {
    activeJobSummaries: createElectricCollectionFromContract(
      createSiteActiveJobSummariesElectricContract(scope)
    ),
    actors: createElectricCollectionFromContract(
      createProductActivityActorsElectricContract(scope)
    ),
    commentBodies: createElectricCollectionFromContract(
      createSiteCommentBodiesElectricContract(scope)
    ),
    labels: createElectricCollectionFromContract(
      createLabelsElectricContract(scope)
    ),
    relatedJobs: createElectricCollectionFromContract(
      createSiteRelatedJobsElectricContract(scope)
    ),
    siteLabelAssignments: createElectricCollectionFromContract(
      createSiteLabelAssignmentsElectricContract(scope)
    ),
    siteCommentEdges: createElectricCollectionFromContract(
      createSiteCommentEdgesElectricContract(scope)
    ),
    sites: createElectricCollectionFromContract(
      createSitesElectricContract(scope)
    ),
  };
}

function createSitesElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "sites",
    completeness: syncBackedCollectionCompleteness({
      covers: { mode: "complete-tenant" },
      source: "electric",
      subscriptionName: "sites",
    }),
    getKey: (site) => String(site.id),
    id: `${sitesWorkspaceCollectionId(scope)}:sites`,
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
      covers: { mode: "complete-tenant" },
      source: "electric",
      subscriptionName: "site-labels",
    }),
    getKey: (assignment) =>
      `${String(assignment.siteId)}:${String(assignment.labelId)}`,
    id: `${sitesWorkspaceCollectionId(scope)}:site-label-assignments`,
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
      covers: { mode: "complete-tenant" },
      source: "electric",
      subscriptionName: "site-active-job-summaries",
    }),
    getKey: (summary) => String(summary.siteId),
    id: `${sitesWorkspaceCollectionId(scope)}:site-active-job-summaries`,
    schema: SiteActiveJobSummaryElectricStandardSchema,
    shapeName: "site-active-job-summaries",
    shapeOptions: {
      transformer: toSiteActiveJobSummaryElectricRow,
    },
  });
}

function createSiteRelatedJobsElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "site-related-jobs",
    completeness: syncBackedCollectionCompleteness({
      covers: { mode: "complete-tenant" },
      source: "electric",
      subscriptionName: "jobs",
    }),
    getKey: (job) => String(job.id),
    id: `${organizationDataQueryKey("site-related-jobs", scope).join(":")}:workspace:electric`,
    schema: SiteRelatedJobElectricStandardSchema,
    shapeName: "jobs",
    shapeOptions: {
      transformer: toSiteRelatedJobElectricRow,
    },
  });
}

function createLabelsElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "labels",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "labels",
    }),
    getKey: (label: Label) => label.id,
    id: `${sitesWorkspaceCollectionId(scope)}:labels`,
    schema: LabelElectricStandardSchema,
    shapeName: "labels",
    shapeOptions: {
      transformer: toLabelElectricRow,
    },
  });
}

function createProductActivityActorsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "product-activity-actors",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "product-activity-actors",
    }),
    getKey: (actor: SitesWorkspaceProductActorRow) => actor.id,
    id: `${sitesWorkspaceCollectionId(scope)}:product-activity-actors`,
    schema: ProductActivityActorElectricStandardSchema,
    shapeName: "product-activity-actors",
    shapeOptions: {
      transformer: toProductActivityActorElectricRow,
    },
  });
}

function createSiteCommentEdgesElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "site-comments",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "site-comments",
    }),
    getKey: (edge: SiteCommentEdgeRow) => edge.id,
    id: `${sitesWorkspaceCollectionId(scope)}:site-comments`,
    schema: SiteCommentEdgeElectricStandardSchema,
    shapeName: "site-comments",
    shapeOptions: {
      transformer: toSiteCommentEdgeElectricRow,
    },
  });
}

function createSiteCommentBodiesElectricContract(scope: OrganizationDataScope) {
  return defineElectricCollectionContract({
    collection: "site-comment-bodies",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "site-comment-bodies",
    }),
    getKey: (comment: SiteCommentBodyRow) => comment.id,
    id: `${sitesWorkspaceCollectionId(scope)}:site-comment-bodies`,
    schema: SiteCommentBodyElectricStandardSchema,
    shapeName: "site-comment-bodies",
    shapeOptions: {
      transformer: toSiteCommentBodyElectricRow,
    },
  });
}

function joinSitesWorkspaceRows({
  activeJobSummaries,
  labels,
  siteLabelAssignments,
  sites,
}: Pick<
  SitesWorkspaceReadModelRows,
  "activeJobSummaries" | "labels" | "siteLabelAssignments" | "sites"
>): readonly SiteOption[] {
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

  return sites.map((site) => {
    const summary = summariesBySiteId.get(site.id);

    return {
      ...site,
      activeJobCount: summary?.activeJobCount ?? 0,
      highestActiveJobPriority: summary?.highestActiveJobPriority,
      labels: labelsBySiteId.get(site.id) ?? [],
    };
  });
}

function selectSiteRelatedJobs(
  jobs: readonly JobListItem[],
  siteId: SiteIdType
): readonly JobListItem[] {
  return jobs
    .filter((job) => job.siteId === siteId)
    .toSorted(compareRelatedJobs);
}

function selectSiteComments({
  actorsById,
  commentsById,
  siteCommentEdges,
  siteId,
}: {
  readonly actorsById: ReadonlyMap<string, SitesWorkspaceProductActorRow>;
  readonly commentsById: ReadonlyMap<string, SiteCommentBodyRow>;
  readonly siteCommentEdges: readonly SiteCommentEdgeRow[];
  readonly siteId: SiteIdType;
}): readonly SitesWorkspaceDetailCommentItem[] {
  return siteCommentEdges
    .filter((edge) => edge.siteId === siteId)
    .flatMap((edge): SitesWorkspaceDetailCommentItem[] => {
      const comment = commentsById.get(edge.commentId);

      if (comment === undefined) {
        return [];
      }

      return [
        {
          actor: actorsById.get(comment.actorId),
          comment,
          edge,
        },
      ];
    })
    .toSorted(compareSiteComments);
}

function toSiteOptionElectricRow(
  row: Record<string, unknown>
): SitesWorkspaceElectricRow {
  const site: Record<string, unknown> = {
    activeJobCount: 0,
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
    updatedAt: String(row.updatedAt),
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

  return site as SitesWorkspaceElectricRow;
}

function toSiteLabelAssignmentElectricRow(
  row: Record<string, unknown>
): SitesWorkspaceElectricRow {
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
): SitesWorkspaceElectricRow {
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
): SitesWorkspaceElectricRow {
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

  return job as SitesWorkspaceElectricRow;
}

function toLabelElectricRow(row: Record<string, unknown>) {
  return {
    createdAt: String(row.createdAt),
    id: String(row.id),
    name: String(row.name),
    updatedAt: String(row.updatedAt),
  };
}

function toProductActivityActorElectricRow(
  row: Record<string, unknown>
): SitesWorkspaceProductActorRow {
  const actor: SitesWorkspaceElectricRow = {
    displayName: String(row.displayName),
    id: String(row.id),
    kind: String(row.kind),
  };

  addOptionalString(actor, "displayDetail", row.displayDetail);

  if (
    row.routeHref !== null &&
    row.routeHref !== undefined &&
    row.routeLabel !== null &&
    row.routeLabel !== undefined
  ) {
    actor.route = {
      href: String(row.routeHref),
      label: String(row.routeLabel),
    };
  }

  return Schema.decodeUnknownSync(ProductActivityActorElectricRowSchema)(
    actor
  ) as SitesWorkspaceProductActorRow;
}

function toSiteCommentEdgeElectricRow(
  row: Record<string, unknown>
): SiteCommentEdgeRow {
  const siteId = String(row.siteId);
  const commentId = String(row.commentId);

  return Schema.decodeUnknownSync(SiteCommentEdgeElectricRowSchema)({
    commentId,
    createdAt: String(row.createdAt),
    id: `${siteId}:${commentId}`,
    siteId,
  }) as SiteCommentEdgeRow;
}

export function toSiteCommentBodyElectricRow(
  row: Record<string, unknown>
): SiteCommentBodyRow {
  const comment: SitesWorkspaceElectricRow = {
    actorId: String(row.actorId),
    body: String(row.body),
    createdAt: String(row.createdAt),
    id: String(row.id),
    updatedAt: String(row.updatedAt),
  };

  return Schema.decodeUnknownSync(SiteCommentBodyElectricRowSchema)(
    comment
  ) as SiteCommentBodyRow;
}

async function awaitSiteConfirmation({
  collection,
  response,
  timeoutMs,
}: {
  readonly collection: SitesWorkspaceObservableCollection<SiteOption> | null;
  readonly response: SiteWriteResponse;
  readonly timeoutMs: number;
}) {
  const observation = await waitForWorkspaceCollectionObservation({
    collection,
    matches: (site) =>
      site.id === response.site.id &&
      site.updatedAt === response.site.updatedAt,
    timeoutMs,
  });

  return Exit.succeed(
    withSitesWorkspaceElectricObservation(response, {
      collection: "sites",
      kind: observation.kind,
    })
  );
}

async function awaitSiteCommentConfirmation({
  collections,
  response,
  siteId,
  timeoutMs,
}: {
  readonly collections: SitesWorkspaceCommentCommandCollections;
  readonly response: SitesWorkspaceSiteCommentResponse;
  readonly siteId: SiteIdType;
  readonly timeoutMs: number;
}) {
  const [commentBody, commentEdge] = await Promise.all([
    waitForWorkspaceCollectionObservation({
      collection: collections.commentBodies,
      matches: (comment) =>
        comment.id === response.id &&
        comment.body === response.body &&
        comment.createdAt === response.createdAt,
      timeoutMs,
    }),
    waitForWorkspaceCollectionObservation({
      collection: collections.commentEdges,
      matches: (edge) =>
        edge.commentId === response.id && edge.siteId === siteId,
      timeoutMs,
    }),
  ]);

  return Exit.succeed({
    ...response,
    electricObservation: {
      commentBody: commentBody.kind,
      commentEdge: commentEdge.kind,
    },
  } satisfies SitesWorkspaceCommentCommandResult);
}

async function catchWorkspaceConfirmationFailure<Success>(
  promise: Promise<Exit.Exit<Success, unknown>>
) {
  try {
    return await promise;
  } catch (error) {
    return Exit.fail(error);
  }
}

async function awaitSiteLabelAssignmentConfirmation({
  collection,
  labelId,
  mode,
  response,
  siteId,
  timeoutMs,
}: {
  readonly collection: SitesWorkspaceObservableCollection<SiteLabelAssignmentElectricRow> | null;
  readonly labelId: Label["id"];
  readonly mode: "assigned" | "removed";
  readonly response: SiteWriteResponse;
  readonly siteId: SiteIdType;
  readonly timeoutMs: number;
}) {
  const observation = await waitForWorkspaceCollectionObservation({
    collection,
    matches:
      mode === "assigned"
        ? (assignment) =>
            assignment.siteId === siteId && assignment.labelId === labelId
        : (assignment) =>
            !(assignment.siteId === siteId && assignment.labelId === labelId),
    mode,
    timeoutMs,
  });

  return Exit.succeed(
    withSitesWorkspaceElectricObservation(response, {
      collection: "site-label-assignments",
      kind: observation.kind,
    })
  );
}

function waitForWorkspaceCollectionObservation<Item>({
  collection,
  matches,
  mode = "assigned",
  timeoutMs,
}: {
  readonly collection: SitesWorkspaceObservableCollection<Item> | null;
  readonly matches: (item: Item) => boolean;
  readonly mode?: "assigned" | "removed" | undefined;
  readonly timeoutMs: number;
}): Promise<Pick<SitesWorkspaceElectricObservation, "kind">> {
  if (collection === null) {
    return Promise.reject(
      new Error(
        "Electric confirmation is unavailable because the collection is not connected."
      )
    );
  }

  const isConfirmed = () => {
    const items = Array.from(collection.entries(), ([, item]) => item);

    if (mode === "removed") {
      return items.every((item) => matches(item));
    }

    return items.some((item) => matches(item));
  };

  if (isConfirmed()) {
    return Promise.resolve({ kind: "already-reflected" });
  }

  const deferred =
    Promise.withResolvers<Pick<SitesWorkspaceElectricObservation, "kind">>();
  const timeout = globalThis.setTimeout(() => {
    subscription.unsubscribe();
    deferred.reject(
      new Error("Timed out waiting for Electric to confirm the site mutation.")
    );
  }, timeoutMs);
  const subscription = collection.subscribeChanges(() => {
    if (!isConfirmed()) {
      return;
    }

    globalThis.clearTimeout(timeout);
    subscription.unsubscribe();
    deferred.resolve({ kind: "observed-change" });
  });

  subscription.requestSnapshot?.({ optimizedOnly: false });

  return deferred.promise;
}

function withSitesWorkspaceElectricObservation(
  response: SiteWriteResponse,
  electricObservation: SitesWorkspaceElectricObservation
): SitesWorkspaceCommandResult {
  return {
    ...response,
    electricObservation,
  };
}

function createBrowserSiteWithConfirmation(input: CreateSiteInput) {
  return runBrowserAppApiRequest("SitesWorkspace.createSite", (client) =>
    client.sites.createSite({ payload: input })
  );
}

function updateBrowserSiteWithConfirmation(
  siteId: SiteIdType,
  input: UpdateSiteInput
) {
  return runBrowserAppApiRequest("SitesWorkspace.updateSite", (client) =>
    client.sites.updateSite({
      params: { siteId },
      payload: input,
    })
  );
}

function assignBrowserSiteLabelWithConfirmation(
  siteId: SiteIdType,
  input: AssignSiteLabelInput
) {
  return runBrowserAppApiRequest("SitesWorkspace.assignSiteLabel", (client) =>
    client.sites.assignSiteLabel({
      params: { siteId },
      payload: input,
    })
  );
}

function removeBrowserSiteLabelWithConfirmation(
  siteId: SiteIdType,
  labelId: LabelIdType
) {
  return runBrowserAppApiRequest("SitesWorkspace.removeSiteLabel", (client) =>
    client.sites.removeSiteLabel({
      params: { labelId, siteId },
    })
  );
}

function addBrowserSiteComment(siteId: SiteIdType, input: AddSiteCommentInput) {
  return runBrowserAppApiRequest("SitesWorkspace.addSiteComment", (client) =>
    client.sites.addSiteComment({
      params: { siteId },
      payload: input,
    })
  );
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

function addOptionalString(
  target: Record<string, SitesWorkspaceElectricRowValue>,
  key: string,
  value: unknown
) {
  if (value === null || value === undefined) {
    return;
  }

  target[key] = String(value);
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
    const updatedAtComparison = getSiteUpdatedAt(right).localeCompare(
      getSiteUpdatedAt(left)
    );

    if (updatedAtComparison !== 0) {
      return updatedAtComparison;
    }
  }

  return compareSiteOptions(left, right);
}

function compareSiteOptions(left: SiteOption, right: SiteOption) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
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

function compareSiteComments(
  left: SitesWorkspaceDetailCommentItem,
  right: SitesWorkspaceDetailCommentItem
) {
  const createdAtComparison = left.edge.createdAt.localeCompare(
    right.edge.createdAt
  );

  return createdAtComparison === 0
    ? left.edge.commentId.localeCompare(right.edge.commentId)
    : createdAtComparison;
}

function getSiteUpdatedAt(site: SiteOption) {
  return "updatedAt" in site && typeof site.updatedAt === "string"
    ? site.updatedAt
    : "";
}

function sitesWorkspaceCollectionId(scope: OrganizationDataScope) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:sites-workspace`;
}
