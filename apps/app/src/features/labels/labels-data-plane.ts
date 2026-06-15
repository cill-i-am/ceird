import type { Label } from "@ceird/labels-core";
import { LabelSchema } from "@ceird/labels-core";
import type { QueryClient } from "@tanstack/query-core";
import { Schema } from "effect";

import { seedQueryCollectionInitialData } from "#/data-plane/bootstrap";
import {
  COMPLETE_TENANT_COLLECTION,
  defineQueryCollectionContract,
  syncBackedCollectionCompleteness,
} from "#/data-plane/collection-contract";
import {
  ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
  reconcileQueryCollectionDataAfterConcurrentWrite,
  upsertDataPlaneCollectionItem,
} from "#/data-plane/collection-write";
import type {
  DataPlaneCollectionSnapshot,
  DataPlaneCollectionWriteVersionRef,
} from "#/data-plane/collection-write";
import { defineElectricCollectionContract } from "#/data-plane/electric-collection";
import { createCollectionWithQueryFallback } from "#/data-plane/query-fallback-collection";
import type {
  CreateDataPlaneFallbackCollectionOptions,
  DataPlaneFallbackHealth,
} from "#/data-plane/query-fallback-collection";
import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import type { DataPlaneSession } from "#/data-plane/session";
import { getCurrentServerLabels } from "#/features/api/app-api-server";

interface LabelsCollection extends DataPlaneCollectionSnapshot<Label> {
  readonly cleanup: () => Promise<void>;
  readonly id: string;
  readonly keys: () => IterableIterator<Label["id"]>;
  readonly preload?: (() => Promise<void>) | undefined;
  readonly status?: string | undefined;
  readonly subscriberCount: number;
  readonly utils: {
    readonly writeBatch: (callback: () => void) => void;
    readonly writeDelete: (key: Label["id"] | readonly Label["id"][]) => void;
    readonly writeUpsert: (data: Label | readonly Label[]) => void;
  };
}
type LabelsCollectionSyncOptions = Omit<
  CreateDataPlaneFallbackCollectionOptions<LabelsCollection, LabelsCollection>,
  "createQueryCollection"
>;

export interface LabelsCollectionState {
  readonly collection: LabelsCollection;
  readonly health: DataPlaneFallbackHealth;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}

function labelsCollectionKey(scope: OrganizationDataScope) {
  return organizationDataQueryKey("labels", scope);
}

function labelsCollectionId(scope: OrganizationDataScope) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:labels`;
}

export function getOrCreateLabelsCollectionState({
  initialLabels,
  queryClient,
  scope,
  session,
  sync,
}: {
  readonly initialLabels: readonly Label[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly sync?: LabelsCollectionSyncOptions | undefined;
}): LabelsCollectionState {
  const registryKey = labelsCollectionId(scope);
  const existing = session?.registry.get(registryKey);
  const sortedLabels = sortLabels(initialLabels);

  if (existing) {
    seedQueryCollectionInitialData(
      queryClient,
      labelsCollectionKey(scope),
      sortedLabels
    );
    return existing as LabelsCollectionState;
  }

  const writeVersionRef = { current: 0 };
  const state = {
    collection: undefined as LabelsCollection | undefined,
    writeVersionRef,
  };
  const result = createLabelsCollection({
    initialLabels: sortedLabels,
    queryClient,
    scope,
    state,
    sync,
    writeVersionRef,
  });
  const created = {
    collection: result.collection,
    health: result.health,
    writeVersionRef,
  } satisfies LabelsCollectionState;
  state.collection = result.collection;
  session?.registry.set(registryKey, created);

  return created;
}

export async function upsertLabelCollectionItem(
  state: LabelsCollectionState,
  label: Label
) {
  await upsertDataPlaneCollectionItem({
    collection: state.collection,
    item: label,
    writeVersionRef: state.writeVersionRef,
  });
}

function createLabelsCollection({
  initialLabels,
  queryClient,
  scope,
  state,
  sync,
  writeVersionRef,
}: {
  readonly initialLabels: readonly Label[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly state: {
    collection?: DataPlaneCollectionSnapshot<Label> | undefined;
  };
  readonly sync?: LabelsCollectionSyncOptions | undefined;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = labelsCollectionKey(scope);
  seedQueryCollectionInitialData(queryClient, queryKey, [...initialLabels]);
  const electricContract = defineElectricCollectionContract({
    collection: "labels",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "labels",
    }),
    getKey: (label: Label) => label.id,
    id: `${labelsCollectionId(scope)}:electric`,
    schema: Schema.toStandardSchemaV1(LabelSchema),
    shapeName: "labels",
    shapeOptions: {
      transformer: toLabelElectricRow,
    },
  });
  const queryContract = defineQueryCollectionContract({
    collection: "labels",
    completeness: COMPLETE_TENANT_COLLECTION,
    getKey: (label: Label) => label.id,
    gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
    id: labelsCollectionId(scope),
    queryFn: async () => {
      const requestWriteVersion = writeVersionRef.current;
      const response = await getCurrentServerLabels();

      return reconcileQueryCollectionDataAfterConcurrentWrite({
        collection: state.collection,
        incomingItems: sortLabels(response.labels),
        requestWriteVersion,
        writeVersionRef,
      });
    },
    queryKey,
    retry: false,
    schema: Schema.toStandardSchemaV1(LabelSchema),
    staleTime: 30_000,
    syncMode: "on-demand",
  });

  return createCollectionWithQueryFallback<
    LabelsCollection,
    LabelsCollection,
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

function toLabelElectricRow(row: Record<string, unknown>) {
  return {
    createdAt: String(row.createdAt),
    id: String(row.id),
    name: String(row.name),
    updatedAt: String(row.updatedAt),
  };
}

function sortLabels(labels: readonly Label[]) {
  return labels.toSorted(compareLabels);
}

function compareLabels(left: Label, right: Label) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}
