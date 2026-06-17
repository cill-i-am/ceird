import type { DataPlaneCollectionName } from "./collection-contract";

export type DataPlaneCollectionHealthStatus =
  | "disabled"
  | "connecting"
  | "fallback-active"
  | "ready"
  | "unavailable";

export type DataPlaneCollectionHealthSource = "electric" | "query";

export type DataPlaneCollectionHealthErrorKind =
  | "auth"
  | "configuration"
  | "missing-headers"
  | "network"
  | "rate-limited"
  | "server"
  | "unknown";

export interface DataPlaneCollectionHealthError {
  readonly kind: DataPlaneCollectionHealthErrorKind;
  readonly message: string;
  readonly retryable: boolean;
  readonly status?: number | undefined;
}

export interface DataPlaneCollectionHealthSnapshot {
  readonly collection: DataPlaneCollectionName;
  readonly collectionId: string;
  readonly disabledReason?: string | undefined;
  readonly fallbackReason?: string | undefined;
  readonly initialReadyLatencyMs?: number | undefined;
  readonly lastError?: DataPlaneCollectionHealthError | undefined;
  readonly lastStatusChangeAtMs: number;
  readonly recoveryAttempts: number;
  readonly source: DataPlaneCollectionHealthSource;
  readonly startedAtMs: number;
  readonly status: DataPlaneCollectionHealthStatus;
  readonly subscriptionName?: string | undefined;
}

export interface DataPlaneCollectionHealth {
  readonly current: DataPlaneCollectionHealthSnapshot;
  readonly markFallbackActive: (
    options?: DataPlaneCollectionFallbackOptions
  ) => DataPlaneCollectionHealthSnapshot;
  readonly markReady: () => DataPlaneCollectionHealthSnapshot;
  readonly markRetrying: (
    error: DataPlaneCollectionHealthError
  ) => DataPlaneCollectionHealthSnapshot;
  readonly markUnavailable: (
    error: DataPlaneCollectionHealthError
  ) => DataPlaneCollectionHealthSnapshot;
  readonly subscribe: (
    listener: (snapshot: DataPlaneCollectionHealthSnapshot) => void
  ) => () => void;
}

export interface DataPlaneCollectionFallbackOptions {
  readonly reason?: string | undefined;
}

export interface CreateDataPlaneCollectionHealthOptions {
  readonly collection: DataPlaneCollectionName;
  readonly collectionId: string;
  readonly disabledReason?: string | undefined;
  readonly now?: (() => number) | undefined;
  readonly source: DataPlaneCollectionHealthSource;
  readonly status: DataPlaneCollectionHealthStatus;
  readonly subscriptionName?: string | undefined;
}

export function createDataPlaneCollectionHealth({
  collection,
  collectionId,
  disabledReason,
  now = Date.now,
  source,
  status,
  subscriptionName,
}: CreateDataPlaneCollectionHealthOptions): DataPlaneCollectionHealth {
  const startedAtMs = now();
  const listeners = new Set<
    (snapshot: DataPlaneCollectionHealthSnapshot) => void
  >();
  let snapshot: DataPlaneCollectionHealthSnapshot = {
    collection,
    collectionId,
    ...(disabledReason === undefined ? {} : { disabledReason }),
    lastStatusChangeAtMs: startedAtMs,
    recoveryAttempts: 0,
    source,
    startedAtMs,
    status,
    ...(subscriptionName === undefined ? {} : { subscriptionName }),
  };

  const publish = (
    next: DataPlaneCollectionHealthSnapshot
  ): DataPlaneCollectionHealthSnapshot => {
    snapshot = next;
    for (const listener of listeners) {
      listener(snapshot);
    }
    return snapshot;
  };

  const updateStatus = (
    nextStatus: DataPlaneCollectionHealthStatus,
    patch: Partial<DataPlaneCollectionHealthSnapshot> = {}
  ) =>
    publish({
      ...snapshot,
      ...patch,
      lastStatusChangeAtMs: now(),
      status: nextStatus,
    });

  return {
    get current() {
      return snapshot;
    },
    markFallbackActive: (options = {}) =>
      updateStatus(
        "fallback-active",
        options.reason === undefined ? {} : { fallbackReason: options.reason }
      ),
    markReady: () =>
      updateStatus("ready", {
        initialReadyLatencyMs:
          snapshot.initialReadyLatencyMs ?? now() - snapshot.startedAtMs,
      }),
    markRetrying: (error) =>
      updateStatus(snapshot.status === "ready" ? "ready" : "connecting", {
        lastError: sanitizeCollectionHealthError(error),
        recoveryAttempts: error.retryable
          ? snapshot.recoveryAttempts + 1
          : snapshot.recoveryAttempts,
      }),
    markUnavailable: (error) =>
      updateStatus("unavailable", {
        lastError: sanitizeCollectionHealthError(error),
        recoveryAttempts: error.retryable
          ? snapshot.recoveryAttempts + 1
          : snapshot.recoveryAttempts,
      }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function markDataPlaneCollectionFallbackActive(
  health: DataPlaneCollectionHealth,
  options: DataPlaneCollectionFallbackOptions = {}
) {
  return health.markFallbackActive(options);
}

function sanitizeCollectionHealthError(
  error: DataPlaneCollectionHealthError
): DataPlaneCollectionHealthError {
  return {
    kind: error.kind,
    message: error.message,
    retryable: error.retryable,
    ...(error.status === undefined ? {} : { status: error.status }),
  };
}
