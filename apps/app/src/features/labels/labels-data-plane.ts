import type {
  CreateLabelInput,
  Label,
  LabelIdType,
  LabelWriteResponse,
  UpdateLabelInput,
} from "@ceird/labels-core";
import {
  CreateLabelInputSchema,
  LabelId,
  LabelSchema,
  UpdateLabelInputSchema,
} from "@ceird/labels-core";
import type { QueryClient } from "@tanstack/query-core";
import { Effect, Schema } from "effect";

import { seedQueryCollectionInitialData } from "#/data-plane/bootstrap";
import {
  COMPLETE_TENANT_COLLECTION,
  defineQueryCollectionContract,
  syncBackedCollectionCompleteness,
} from "#/data-plane/collection-contract";
import type { DataPlaneCollectionHealth } from "#/data-plane/collection-health";
import {
  ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
  reconcileQueryCollectionDataAfterConcurrentWrite,
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
import type {
  CreateDataPlaneElectricCollectionOptions,
  DataPlaneElectricCollectionContract,
  DataPlaneElectricMutationHandlers,
} from "#/data-plane/electric-collection";
import { createCollectionWithQueryFallback } from "#/data-plane/query-fallback-collection";
import type {
  CreateDataPlaneFallbackCollectionOptions,
  DataPlaneFallbackHealth,
} from "#/data-plane/query-fallback-collection";
import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import type { DataPlaneSession } from "#/data-plane/session";
import { getCurrentServerLabels } from "#/features/api/app-api-server";
import {
  archiveBrowserLabelWithConfirmation,
  createBrowserLabelWithConfirmation,
  updateBrowserLabelWithConfirmation,
} from "#/features/labels/labels-state";

export { searchSettingsLabels } from "#/features/labels/labels-search";

interface LabelsCollection extends DataPlaneCollectionSnapshot<Label> {
  readonly cleanup: () => Promise<void>;
  delete: (key: Label["id"]) => LabelMutationTransaction;
  entries: () => IterableIterator<[string | number, Label]>;
  readonly id: string;
  insert: (data: Label) => LabelMutationTransaction;
  readonly keys: () => IterableIterator<Label["id"]>;
  readonly preload?: (() => Promise<void>) | undefined;
  readonly status: string;
  subscribeChanges: (callback: () => void) => {
    requestSnapshot?: (options?: { readonly optimizedOnly?: boolean }) => void;
    unsubscribe: () => void;
  };
  readonly subscriberCount: number;
  readonly utils: {
    readonly writeBatch: (callback: () => void) => void;
    readonly writeDelete: (key: Label["id"] | readonly Label["id"][]) => void;
    readonly writeUpsert: (data: Label | readonly Label[]) => void;
  };
  update: (
    key: Label["id"],
    callback: (draft: Label) => void
  ) => LabelMutationTransaction;
}
type LabelsCollectionSyncOptions = Omit<
  CreateDataPlaneFallbackCollectionOptions<LabelsCollection, LabelsCollection>,
  "createQueryCollection"
>;
type LabelElectricMutationHandlers = DataPlaneElectricMutationHandlers<
  typeof LabelStandardSchema
>;

interface LabelElectricMutationHandlerDependencies {
  readonly archiveLabel: (
    labelId: LabelIdType
  ) => Effect.Effect<LabelWriteResponse, unknown>;
  readonly createLabel: (
    input: CreateLabelInput
  ) => Effect.Effect<LabelWriteResponse, unknown>;
  readonly updateLabel: (
    labelId: LabelIdType,
    input: UpdateLabelInput
  ) => Effect.Effect<LabelWriteResponse, unknown>;
}

const LABEL_ELECTRIC_MUTATION_CONFIRMATION_TIMEOUT_MS = 10_000;

const decodeCreateLabelInput = Schema.decodeUnknownSync(CreateLabelInputSchema);
const decodeUpdateLabelInput = Schema.decodeUnknownSync(UpdateLabelInputSchema);
const decodeLabelId = Schema.decodeUnknownSync(LabelId);
const LabelStandardSchema = Schema.toStandardSchemaV1(LabelSchema);
const defaultLabelElectricMutationHandlerDependencies = {
  archiveLabel: archiveBrowserLabelWithConfirmation,
  createLabel: createBrowserLabelWithConfirmation,
  updateLabel: updateBrowserLabelWithConfirmation,
} satisfies LabelElectricMutationHandlerDependencies;

export interface LabelsCollectionState {
  readonly collection: LabelsCollection;
  readonly health: DataPlaneFallbackHealth;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}

export interface SettingsLabelsCollectionState {
  readonly collection: LabelsCollection | null;
  readonly health: DataPlaneCollectionHealth;
}

interface LabelMutationTransaction {
  readonly error?: unknown;
  readonly isPersisted: {
    readonly promise: Promise<unknown>;
  };
  readonly state?: string;
}

function labelsCollectionKey(scope: OrganizationDataScope) {
  return organizationDataQueryKey("labels", scope);
}

function labelsCollectionId(scope: OrganizationDataScope) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:labels`;
}

function settingsLabelsCollectionId(scope: OrganizationDataScope) {
  return `${labelsCollectionId(scope)}:settings:electric`;
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

export function getOrCreateSettingsLabelsCollectionState({
  scope,
  session,
  sync,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly sync?: CreateDataPlaneElectricCollectionOptions | undefined;
}): SettingsLabelsCollectionState {
  const registryKey = settingsLabelsCollectionId(scope);
  const existing = session?.registry.get(registryKey);

  if (existing) {
    return existing as SettingsLabelsCollectionState;
  }

  const contract = createLabelsElectricCollectionContract({
    id: registryKey,
    mutationHandlers: createLabelElectricMutationHandlers(),
  });
  const result = createElectricCollectionFromContract(contract, sync);
  const created = {
    collection: result.collection as LabelsCollection | null,
    health: result.health,
  } satisfies SettingsLabelsCollectionState;

  session?.registry.set(registryKey, created);

  return created;
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
  const electricContract = createLabelsElectricCollectionContract({
    id: `${labelsCollectionId(scope)}:electric`,
    mutationHandlers: createLabelElectricMutationHandlers(),
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

function createLabelsElectricCollectionContract({
  id,
  mutationHandlers,
}: {
  readonly id: string;
  readonly mutationHandlers?: LabelElectricMutationHandlers | undefined;
}): DataPlaneElectricCollectionContract<
  typeof LabelStandardSchema,
  Label["id"]
> {
  return defineElectricCollectionContract({
    collection: "labels",
    completeness: syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "labels",
    }),
    getKey: (label: Label) => label.id,
    id,
    ...(mutationHandlers === undefined ? {} : { mutationHandlers }),
    schema: LabelStandardSchema,
    shapeName: "labels",
    shapeOptions: {
      transformer: toLabelElectricRow,
    },
  });
}

export function createLabelElectricMutationHandlers(
  dependencies: LabelElectricMutationHandlerDependencies = defaultLabelElectricMutationHandlerDependencies
): LabelElectricMutationHandlers {
  return {
    onDelete: async ({ transaction }) => {
      const responses = await Promise.all(
        transaction.mutations.map((mutation) =>
          Effect.runPromise(
            dependencies.archiveLabel(decodeLabelId(mutation.original.id))
          )
        )
      );

      return toElectricLabelMatchingStrategy(responses);
    },
    onInsert: async ({ transaction }) => {
      const responses = await Promise.all(
        transaction.mutations.map((mutation) =>
          Effect.runPromise(
            dependencies.createLabel(
              decodeCreateLabelInput({ name: mutation.modified.name })
            )
          )
        )
      );

      return toElectricLabelMatchingStrategy(responses);
    },
    onUpdate: async ({ transaction }) => {
      const responses = await Promise.all(
        transaction.mutations.map((mutation) =>
          Effect.runPromise(
            dependencies.updateLabel(
              decodeLabelId(mutation.original.id),
              decodeUpdateLabelInput({
                name: mutation.modified.name,
              })
            )
          )
        )
      );

      return toElectricLabelMatchingStrategy(responses);
    },
  };
}

function toElectricLabelMatchingStrategy(
  responses: readonly LabelWriteResponse[]
) {
  const txids = responses.map((response) => response.mutation.txid);
  const [firstTxid] = txids;

  if (firstTxid === undefined) {
    throw new Error("Electric label mutation did not produce a txid.");
  }

  return {
    timeout: LABEL_ELECTRIC_MUTATION_CONFIRMATION_TIMEOUT_MS,
    txid: txids.length === 1 ? firstTxid : txids,
  };
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
