import type { Label } from "@ceird/labels-core";
import { LabelSchema } from "@ceird/labels-core";
import type { QueryClient } from "@tanstack/query-core";
import { Schema } from "effect";

import { seedQueryCollectionInitialData } from "#/data-plane/bootstrap";
import {
  createQueryCollectionFromContract,
  defineQueryCollectionContract,
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
import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import type { DataPlaneSession } from "#/data-plane/session";
import { getCurrentServerLabels } from "#/features/api/app-api-server";

type LabelsCollection = ReturnType<typeof createLabelsCollection>;

export interface LabelsCollectionState {
  readonly collection: LabelsCollection;
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
}: {
  readonly initialLabels: readonly Label[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
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
  const collection = createLabelsCollection({
    initialLabels: sortedLabels,
    queryClient,
    scope,
    state,
    writeVersionRef,
  });
  const created = {
    collection,
    writeVersionRef,
  } satisfies LabelsCollectionState;
  state.collection = collection;
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
  writeVersionRef,
}: {
  readonly initialLabels: readonly Label[];
  readonly queryClient: QueryClient;
  readonly scope: OrganizationDataScope;
  readonly state: {
    collection?: DataPlaneCollectionSnapshot<Label> | undefined;
  };
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  const queryKey = labelsCollectionKey(scope);
  seedQueryCollectionInitialData(queryClient, queryKey, [...initialLabels]);

  return createQueryCollectionFromContract(
    queryClient,
    defineQueryCollectionContract({
      collection: "labels",
      completeness: "complete",
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
    })
  );
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
