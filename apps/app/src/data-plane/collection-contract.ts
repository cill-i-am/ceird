import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { QueryClient, QueryKey } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";

export const DATA_PLANE_COLLECTION_NAMES = [
  "activity-events",
  "product-activity-actors",
  "jobs",
  "job-activity",
  "job-comment-bodies",
  "job-comments",
  "job-contacts",
  "job-options",
  "job-label-assignments",
  "job-details",
  "job-collaborators",
  "job-sites",
  "job-visits",
  "product-activity-actors",
  "product-member-actor-summaries",
  "sites",
  "site-active-job-summaries",
  "site-comments",
  "site-label-assignments",
  "site-related-jobs",
  "labels",
] as const;

export type DataPlaneCollectionName =
  (typeof DATA_PLANE_COLLECTION_NAMES)[number];

export type DataPlaneCollectionFilterValue =
  | boolean
  | number
  | string
  | readonly (boolean | number | string)[];

export interface DataPlaneCollectionFilterScope {
  readonly field: string;
  readonly operator?: "custom" | "eq" | "in" | "range" | "search";
  readonly value?: DataPlaneCollectionFilterValue | undefined;
}

export interface DataPlaneCompleteTenantCompleteness {
  readonly mode: "complete-tenant";
}

export interface DataPlanePagedQueryCompleteness {
  readonly mode: "paged-query";
  readonly filters?: readonly DataPlaneCollectionFilterScope[] | undefined;
  readonly page: {
    readonly cursor?: string | undefined;
    readonly hasNextPage?: boolean | undefined;
    readonly limit?: number | undefined;
    readonly type: "cursor";
  };
  readonly queryName: string;
}

export interface DataPlaneFilteredQueryCompleteness {
  readonly mode: "filtered-query";
  readonly filters: readonly DataPlaneCollectionFilterScope[];
  readonly queryName: string;
}

export interface DataPlaneEntityDetailCompleteness {
  readonly entityId: number | string;
  readonly entityType: string;
  readonly mode: "entity-detail";
}

export type DataPlaneSyncBackedCoverage =
  | DataPlaneCompleteTenantCompleteness
  | DataPlaneEntityDetailCompleteness
  | DataPlaneFilteredQueryCompleteness
  | DataPlanePagedQueryCompleteness;

export interface DataPlaneSyncBackedCompleteness {
  readonly covers: DataPlaneSyncBackedCoverage;
  readonly mode: "sync-backed";
  readonly source: "electric" | "query-subscription";
  readonly subscriptionName: string;
}

export type DataPlaneCollectionCompleteness =
  | DataPlaneCompleteTenantCompleteness
  | DataPlaneEntityDetailCompleteness
  | DataPlaneFilteredQueryCompleteness
  | DataPlanePagedQueryCompleteness
  | DataPlaneSyncBackedCompleteness;

export const COMPLETE_TENANT_COLLECTION = {
  mode: "complete-tenant",
} as const satisfies DataPlaneCompleteTenantCompleteness;

export function pagedQueryCollectionCompleteness(
  completeness: Omit<DataPlanePagedQueryCompleteness, "mode">
): DataPlanePagedQueryCompleteness {
  return { ...completeness, mode: "paged-query" };
}

export function filteredQueryCollectionCompleteness(
  completeness: Omit<DataPlaneFilteredQueryCompleteness, "mode">
): DataPlaneFilteredQueryCompleteness {
  return { ...completeness, mode: "filtered-query" };
}

export function entityDetailCollectionCompleteness(
  completeness: Omit<DataPlaneEntityDetailCompleteness, "mode">
): DataPlaneEntityDetailCompleteness {
  return { ...completeness, mode: "entity-detail" };
}

export function syncBackedCollectionCompleteness(
  completeness: Omit<DataPlaneSyncBackedCompleteness, "mode">
): DataPlaneSyncBackedCompleteness {
  return { ...completeness, mode: "sync-backed" };
}

export function isCompleteTenantCollection(
  completeness: DataPlaneCollectionCompleteness
): completeness is DataPlaneCompleteTenantCompleteness {
  return completeness.mode === "complete-tenant";
}

export function assertCompleteTenantCollection(
  completeness: DataPlaneCollectionCompleteness,
  context = "Collection"
): asserts completeness is DataPlaneCompleteTenantCompleteness {
  if (isCompleteTenantCollection(completeness)) {
    return;
  }

  throw new Error(
    `${context} requires complete tenant data; received ${completeness.mode}`
  );
}

type DataPlaneCollectionSyncMode = "eager" | "on-demand";
type DataPlaneInferSchemaOutput<Schema extends StandardSchemaV1> =
  Schema extends StandardSchemaV1
    ? StandardSchemaV1.InferOutput<Schema> extends object
      ? StandardSchemaV1.InferOutput<Schema>
      : Record<string, unknown>
    : Record<string, unknown>;

export interface DataPlaneQueryCollectionContract<
  Schema extends StandardSchemaV1<unknown, object>,
  Key extends string | number,
> {
  readonly collection: DataPlaneCollectionName;
  readonly completeness: DataPlaneCollectionCompleteness;
  readonly gcTime?: number | undefined;
  readonly getKey: (item: DataPlaneInferSchemaOutput<Schema>) => Key;
  readonly id: string;
  readonly queryFn:
    | (() => Promise<readonly DataPlaneInferSchemaOutput<Schema>[]>)
    | (() => readonly DataPlaneInferSchemaOutput<Schema>[]);
  readonly queryKey: QueryKey;
  readonly retry?: false | number | undefined;
  readonly schema: Schema;
  readonly staleTime?: number | undefined;
  readonly syncMode: DataPlaneCollectionSyncMode;
}

const REQUIRED_CONTRACT_FIELDS = [
  "collection",
  "completeness",
  "getKey",
  "id",
  "queryFn",
  "queryKey",
  "schema",
  "syncMode",
] as const;

export function defineQueryCollectionContract<
  Schema extends StandardSchemaV1<unknown, object>,
  Key extends string | number,
>(
  contract: DataPlaneQueryCollectionContract<Schema, Key>
): DataPlaneQueryCollectionContract<Schema, Key> {
  const missingFields = REQUIRED_CONTRACT_FIELDS.filter(
    (field) => contract[field] === undefined
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Missing collection contract fields: ${missingFields.join(", ")}`
    );
  }

  return contract;
}

export function createQueryCollectionFromContract<
  Schema extends StandardSchemaV1<unknown, object>,
  Key extends string | number,
>(
  queryClient: QueryClient,
  contract: DataPlaneQueryCollectionContract<Schema, Key>
) {
  return createCollection(
    queryCollectionOptions<Schema, unknown, QueryKey, Key>({
      getKey: contract.getKey,
      ...(contract.gcTime === undefined ? {} : { gcTime: contract.gcTime }),
      id: contract.id,
      queryClient,
      queryFn: async () => [...(await contract.queryFn())],
      queryKey: contract.queryKey,
      ...(contract.retry === undefined ? {} : { retry: contract.retry }),
      schema: contract.schema,
      ...(contract.staleTime === undefined
        ? {}
        : { staleTime: contract.staleTime }),
      syncMode: contract.syncMode,
    })
  );
}
