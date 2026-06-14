import type { QueryClient } from "@tanstack/query-core";

import type { DataPlaneCollectionName } from "./collection-contract";
import { createQueryCollectionFromContract } from "./collection-contract";
import type {
  DataPlaneCollectionHealth,
  DataPlaneCollectionHealthSnapshot,
} from "./collection-health";
import {
  createDataPlaneCollectionHealth,
  markDataPlaneCollectionFallbackActive,
} from "./collection-health";
import { createElectricCollectionFromContract } from "./electric-collection";
import type {
  CreateDataPlaneElectricCollectionOptions,
  DataPlaneElectricCollectionResult,
  DataPlaneElectricDisabledReason,
  DataPlaneElectricSyncError,
} from "./electric-collection";

export type DataPlaneFallbackReason =
  | "invalid-sync-origin"
  | "missing-sync-origin"
  | "server-render"
  | "slice-not-electric-backed"
  | "sync-disabled"
  | "sync-readiness-timeout"
  | "sync-unauthorized"
  | "sync-unavailable";

export type DataPlaneFallbackBackend = "electric" | "query";

export interface DataPlaneFallbackHealth extends DataPlaneCollectionHealth {
  readonly retryElectric: () => boolean;
}

export interface DataPlaneFallbackCollectionResult<Collection> {
  readonly collection: Collection;
  readonly health: DataPlaneFallbackHealth;
}

interface DataPlaneFallbackContractShape {
  readonly collection: DataPlaneCollectionName;
  readonly id: string;
}

export interface CreateDataPlaneFallbackCollectionOptions<
  QueryCollection,
  ElectricCollection,
  QueryContract extends DataPlaneFallbackContractShape =
    DataPlaneFallbackContractShape,
  ElectricContract extends DataPlaneFallbackContractShape =
    DataPlaneFallbackContractShape,
> extends Omit<CreateDataPlaneElectricCollectionOptions, "onSyncError"> {
  readonly createElectricCollection?:
    | ((
        contract: ElectricContract,
        options: CreateDataPlaneElectricCollectionOptions
      ) => DataPlaneElectricCollectionResult<ElectricCollection>)
    | undefined;
  readonly createQueryCollection?:
    | ((queryClient: QueryClient, contract: QueryContract) => QueryCollection)
    | undefined;
  readonly electricEnabled?: boolean | undefined;
  readonly onHealthChange?:
    | ((health: DataPlaneCollectionHealthSnapshot) => void)
    | undefined;
  readonly onSyncError?:
    | ((error: DataPlaneElectricSyncError) => void)
    | undefined;
  readonly readinessTimeoutMs?: number | undefined;
}

export function createCollectionWithQueryFallback<
  QueryCollection extends object,
  ElectricCollection extends object,
  QueryContract extends DataPlaneFallbackContractShape,
  ElectricContract extends DataPlaneFallbackContractShape,
>(
  queryClient: QueryClient,
  contract: {
    readonly electric?: ElectricContract | undefined;
    readonly query: QueryContract;
  },
  options: CreateDataPlaneFallbackCollectionOptions<
    QueryCollection,
    ElectricCollection,
    QueryContract,
    ElectricContract
  > = {}
): DataPlaneFallbackCollectionResult<QueryCollection | ElectricCollection> {
  const createQuery =
    options.createQueryCollection ??
    ((client: QueryClient, queryContract: QueryContract) =>
      createQueryCollectionFromContract(
        client,
        queryContract as unknown as Parameters<
          typeof createQueryCollectionFromContract
        >[1]
      ) as QueryCollection);
  const createElectric =
    options.createElectricCollection ??
    ((
      electricContract: ElectricContract,
      electricOptions: CreateDataPlaneElectricCollectionOptions
    ) =>
      createElectricCollectionFromContract(
        electricContract as unknown as Parameters<
          typeof createElectricCollectionFromContract
        >[0],
        electricOptions
      ) as DataPlaneElectricCollectionResult<ElectricCollection>);
  const queryCollection = createQuery(queryClient, contract.query);

  if (options.electricEnabled === false) {
    const health = createQueryFallbackHealth({
      contract: contract.query,
      now: options.runtime?.now,
      reason: "sync-disabled",
    });
    return {
      collection: queryCollection,
      health: createFallbackHealthFacade({
        initialHealth: health,
        onHealthChange: options.onHealthChange,
      }).health,
    };
  }

  if (contract.electric === undefined) {
    const health = createQueryFallbackHealth({
      contract: contract.query,
      now: options.runtime?.now,
      reason: "slice-not-electric-backed",
    });
    return {
      collection: queryCollection,
      health: createFallbackHealthFacade({
        initialHealth: health,
        onHealthChange: options.onHealthChange,
      }).health,
    };
  }

  const healthBridgeRef: {
    current?: ReturnType<typeof createFallbackHealthFacade> | undefined;
  } = {};
  const createElectricResult = () =>
    createElectric(contract.electric as ElectricContract, {
      ...options,
      onSyncError: (error) => {
        options.onSyncError?.(error);
        healthBridgeRef.current?.markFallbackActive({
          reason: fallbackReasonFromElectricError(error),
        });
      },
    });

  const electricResult = createElectricResult();
  const healthBridge = createFallbackHealthFacade({
    initialHealth: electricResult.health,
    onHealthChange: options.onHealthChange,
  });
  healthBridgeRef.current = healthBridge;

  if (electricResult.status === "disabled") {
    healthBridge.markFallbackActive({
      reason: fallbackReasonFromElectricDisabledReason(
        electricResult.disabledReason
      ),
    });
    return {
      collection: queryCollection,
      health: healthBridge.health,
    };
  }

  let electricCollection = electricResult.collection;
  healthBridge.setRetryElectric(() => {
    const retryResult = createElectricResult();
    healthBridge.replaceHealth(retryResult.health);
    if (retryResult.status === "disabled") {
      healthBridge.markFallbackActive({
        reason: fallbackReasonFromElectricDisabledReason(
          retryResult.disabledReason
        ),
      });
      return false;
    }

    void cleanupCollection(electricCollection);
    electricCollection = retryResult.collection;
    return true;
  });

  const collection = createSwitchableFallbackCollection({
    getElectricCollection: () => electricCollection,
    queryCollection,
    health: healthBridge.health,
  });

  if (options.readinessTimeoutMs !== undefined) {
    scheduleReadinessFallback({
      collection,
      health: healthBridge.health,
      ms: options.readinessTimeoutMs,
    });
  }

  return {
    collection,
    health: healthBridge.health,
  };
}

export function fallbackReasonFromElectricError(
  error: DataPlaneElectricSyncError
): DataPlaneFallbackReason {
  if (error.kind === "auth") {
    return "sync-unauthorized";
  }

  return "sync-unavailable";
}

function fallbackReasonFromElectricDisabledReason(
  reason: DataPlaneElectricDisabledReason
): DataPlaneFallbackReason {
  return reason;
}

function createQueryFallbackHealth({
  contract,
  now,
  reason,
}: {
  readonly contract: DataPlaneFallbackContractShape;
  readonly now?: (() => number) | undefined;
  readonly reason: DataPlaneFallbackReason;
}) {
  const health = createDataPlaneCollectionHealth({
    collection: contract.collection,
    collectionId: contract.id,
    now,
    source: "query",
    status: "connecting",
  });
  markDataPlaneCollectionFallbackActive(health, { reason });

  return health;
}

function createFallbackHealthFacade({
  initialHealth,
  onHealthChange,
}: {
  readonly initialHealth: DataPlaneCollectionHealth;
  readonly onHealthChange?:
    | ((health: DataPlaneCollectionHealthSnapshot) => void)
    | undefined;
}) {
  const listeners = new Set<
    (snapshot: DataPlaneCollectionHealthSnapshot) => void
  >();
  let currentHealth = initialHealth;
  let retryElectric: (() => boolean) | undefined;
  let unsubscribeCurrentHealth = currentHealth.subscribe((snapshot) => {
    onHealthChange?.(snapshot);
    for (const listener of listeners) {
      listener(snapshot);
    }
  });

  const bridge = {
    health: {
      get current() {
        return currentHealth.current;
      },
      markFallbackActive: (options = {}) =>
        markDataPlaneCollectionFallbackActive(currentHealth, options),
      markReady: () => currentHealth.markReady(),
      markUnavailable: (error) => currentHealth.markUnavailable(error),
      retryElectric: () =>
        isRecoverableFallback(currentHealth.current)
          ? (retryElectric?.() ?? false)
          : false,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    } satisfies DataPlaneFallbackHealth,
    markFallbackActive: (options: {
      readonly reason: DataPlaneFallbackReason;
    }) => markDataPlaneCollectionFallbackActive(currentHealth, options),
    replaceHealth(nextHealth: DataPlaneCollectionHealth) {
      unsubscribeCurrentHealth();
      currentHealth = nextHealth;
      unsubscribeCurrentHealth = currentHealth.subscribe((snapshot) => {
        onHealthChange?.(snapshot);
        for (const listener of listeners) {
          listener(snapshot);
        }
      });
      onHealthChange?.(currentHealth.current);
      for (const listener of listeners) {
        listener(currentHealth.current);
      }
    },
    setRetryElectric(callback: () => boolean) {
      retryElectric = callback;
    },
  };

  return bridge;
}

function isRecoverableFallback(snapshot: DataPlaneCollectionHealthSnapshot) {
  return (
    snapshot.status === "fallback-active" &&
    (snapshot.lastError?.retryable === true ||
      snapshot.fallbackReason === "sync-readiness-timeout")
  );
}

function createSwitchableFallbackCollection<
  QueryCollection extends object,
  ElectricCollection extends object,
>({
  getElectricCollection,
  health,
  queryCollection,
}: {
  readonly getElectricCollection: () => ElectricCollection;
  readonly health: DataPlaneFallbackHealth;
  readonly queryCollection: QueryCollection;
}) {
  const activeCollection = () =>
    activeFallbackBackend(health) === "electric"
      ? getElectricCollection()
      : queryCollection;

  return new Proxy(queryCollection, {
    get(_target, property) {
      if (property === "dataPlaneCollectionHealth") {
        return health;
      }

      if (property === "cleanup") {
        return async () => {
          await cleanupCollection(queryCollection);
          await cleanupCollection(getElectricCollection());
        };
      }

      if (property === "subscriberCount") {
        return (
          readNumericCollectionProperty(queryCollection, "subscriberCount") +
          readNumericCollectionProperty(
            getElectricCollection(),
            "subscriberCount"
          )
        );
      }

      if (property === "subscribeChanges") {
        return (callback: () => void) =>
          subscribeSwitchableCollection({
            callback,
            getElectricCollection,
            health,
            queryCollection,
          });
      }

      const active = activeCollection();
      const value = Reflect.get(active, property, active);

      return typeof value === "function" ? value.bind(active) : value;
    },
    set(_target, property, value) {
      return Reflect.set(activeCollection(), property, value);
    },
  }) as QueryCollection | ElectricCollection;
}

function subscribeSwitchableCollection<
  QueryCollection extends object,
  ElectricCollection extends object,
>({
  callback,
  getElectricCollection,
  health,
  queryCollection,
}: {
  readonly callback: () => void;
  readonly getElectricCollection: () => ElectricCollection;
  readonly health: DataPlaneFallbackHealth;
  readonly queryCollection: QueryCollection;
}) {
  let activeBackend = activeFallbackBackend(health);
  let activeSubscription = subscribeCollectionChanges(
    activeBackend === "electric" ? getElectricCollection() : queryCollection,
    callback
  );
  const unsubscribeHealth = health.subscribe(() => {
    const nextBackend = activeFallbackBackend(health);
    if (nextBackend === activeBackend) {
      callback();
      return;
    }

    activeSubscription.unsubscribe();
    activeBackend = nextBackend;
    activeSubscription = subscribeCollectionChanges(
      activeBackend === "electric" ? getElectricCollection() : queryCollection,
      callback
    );
    callback();
  });

  return {
    requestSnapshot: (snapshotOptions?: { readonly optimizedOnly?: boolean }) =>
      activeSubscription.requestSnapshot?.(snapshotOptions),
    unsubscribe: () => {
      unsubscribeHealth();
      activeSubscription.unsubscribe();
    },
  };
}

function activeFallbackBackend(
  health: DataPlaneCollectionHealth
): DataPlaneFallbackBackend {
  return health.current.status === "fallback-active" ? "query" : "electric";
}

function subscribeCollectionChanges(collection: object, callback: () => void) {
  const subscribeChanges = readCollectionFunction<
    (callback: () => void) => {
      requestSnapshot?: (options?: {
        readonly optimizedOnly?: boolean;
      }) => void;
      unsubscribe: () => void;
    }
  >(collection, "subscribeChanges");

  return subscribeChanges?.(callback) ?? { unsubscribe: () => null };
}

function scheduleReadinessFallback({
  collection,
  health,
  ms,
}: {
  readonly collection: object;
  readonly health: DataPlaneFallbackHealth;
  readonly ms: number;
}) {
  setTimeout(() => {
    if (
      activeFallbackBackend(health) === "electric" &&
      readCollectionStringProperty(collection, "status") !== "ready"
    ) {
      health.markFallbackActive({
        reason: "sync-readiness-timeout",
      });
    }
  }, ms);
}

async function cleanupCollection(collection: object) {
  await readCollectionFunction<() => Promise<void> | void>(
    collection,
    "cleanup"
  )?.();
}

function readCollectionFunction<FunctionType>(
  collection: object,
  key: string
): FunctionType | undefined {
  const value = (collection as Record<string, unknown>)[key];

  return typeof value === "function" ? (value as FunctionType) : undefined;
}

function readCollectionStringProperty(collection: object, key: string) {
  const value = (collection as Record<string, unknown>)[key];

  return typeof value === "string" ? value : undefined;
}

function readNumericCollectionProperty(collection: object, key: string) {
  const value = (collection as Record<string, unknown>)[key];

  return typeof value === "number" ? value : 0;
}
