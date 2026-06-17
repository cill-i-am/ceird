import type { SyncShapeName } from "@ceird/domain-core";
import type {
  ColumnMapper,
  ExternalHeadersRecord,
  ExternalParamsRecord,
  GetExtensions,
  Row as ElectricRow,
  ShapeStreamOptions,
} from "@electric-sql/client";
import { FetchError, snakeCamelMapper } from "@electric-sql/client";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import type { ElectricCollectionConfig } from "@tanstack/electric-db-collection";
import { createCollection } from "@tanstack/react-db";

import { resolveSyncOrigin } from "#/lib/sync-origin";

import type {
  DataPlaneCollectionCompleteness,
  DataPlaneCollectionName,
} from "./collection-contract";
import type {
  DataPlaneCollectionHealth,
  DataPlaneCollectionHealthError,
} from "./collection-health";
import { createDataPlaneCollectionHealth } from "./collection-health";

export type DataPlaneElectricCollectionSyncMode =
  | "eager"
  | "on-demand"
  | "progressive";

export type DataPlaneElectricShapeUrlStyle = "path" | "query";

export type DataPlaneElectricDisabledReason =
  | "invalid-sync-origin"
  | "missing-sync-origin"
  | "server-render";

export type DataPlaneElectricSyncErrorKind =
  DataPlaneCollectionHealthError["kind"];

export interface DataPlaneElectricSyncError extends DataPlaneCollectionHealthError {
  readonly shapeName: SyncShapeName;
}

export interface DataPlaneElectricRuntime {
  readonly fetch?: typeof fetch | undefined;
  readonly isBrowser: boolean;
  readonly now?: (() => number) | undefined;
  readonly syncOrigin?: string | undefined;
}

interface ResolvedDataPlaneElectricRuntime extends DataPlaneElectricRuntime {
  readonly syncOrigin?: string | undefined;
}

type DataPlaneElectricSchemaOutput<
  Schema extends StandardSchemaV1<unknown, ElectricRow<unknown>>,
> = Schema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<Schema> extends ElectricRow<unknown>
    ? StandardSchemaV1.InferOutput<Schema>
    : ElectricRow<unknown>
  : ElectricRow<unknown>;

export interface DataPlaneElectricCollectionContract<
  Schema extends StandardSchemaV1<unknown, ElectricRow<unknown>>,
  Key extends string | number,
> {
  readonly collection: DataPlaneCollectionName;
  readonly completeness: DataPlaneCollectionCompleteness;
  readonly getKey: (item: DataPlaneElectricSchemaOutput<Schema>) => Key;
  readonly id: string;
  readonly mutationHandlers?:
    | DataPlaneElectricMutationHandlers<Schema>
    | undefined;
  readonly schema: Schema;
  readonly shapeName: SyncShapeName;
  readonly shapeOptions?:
    | DataPlaneElectricShapeOptions<DataPlaneElectricSchemaOutput<Schema>>
    | undefined;
  readonly syncMode?: DataPlaneElectricCollectionSyncMode | undefined;
}

export type DataPlaneElectricMutationHandlers<
  Schema extends StandardSchemaV1<unknown, ElectricRow<unknown>>,
> = Pick<
  ElectricCollectionConfig<DataPlaneElectricSchemaOutput<Schema>, Schema>,
  "onDelete" | "onInsert" | "onUpdate"
>;

export type DataPlaneElectricShapeOptions<Row extends ElectricRow<unknown>> =
  Omit<
    ShapeStreamOptions<GetExtensions<Row>>,
    "columnMapper" | "fetchClient" | "onError" | "transformer" | "url"
  > & {
    readonly columnMapper?: ColumnMapper | undefined;
    readonly fetchClient?: typeof fetch | undefined;
    readonly headers?: ExternalHeadersRecord | undefined;
    readonly onError?:
      | ShapeStreamOptions<GetExtensions<Row>>["onError"]
      | undefined;
    readonly params?: ExternalParamsRecord<Row> | undefined;
    readonly transformer?:
      | ShapeStreamOptions<GetExtensions<Row>>["transformer"]
      | undefined;
  };

export type DataPlaneElectricCollectionResult<Collection> =
  | {
      readonly collection: Collection;
      readonly disabledReason?: undefined;
      readonly health: DataPlaneCollectionHealth;
      readonly shapeUrl: string;
      readonly status: "enabled";
    }
  | {
      readonly collection: null;
      readonly disabledReason: DataPlaneElectricDisabledReason;
      readonly health: DataPlaneCollectionHealth;
      readonly shapeUrl?: undefined;
      readonly status: "disabled";
    };

export interface CreateDataPlaneElectricCollectionOptions {
  readonly onSyncError?:
    | ((error: DataPlaneElectricSyncError) => void)
    | undefined;
  readonly runtime?: Partial<DataPlaneElectricRuntime> | undefined;
  readonly shapeUrlStyle?: DataPlaneElectricShapeUrlStyle | undefined;
}

export const DEFAULT_DATA_PLANE_ELECTRIC_SHAPE_URL_STYLE = "path" as const;

const TRUSTED_ELECTRIC_SOURCE_PARAMS = new Set([
  "columns",
  "params",
  "secret",
  "source",
  "source_id",
  "source_secret",
  "sourceid",
  "table",
  "where",
]);
const ALLOWED_ELECTRIC_CLIENT_PARAMS = new Set(["replica"]);

export function defineElectricCollectionContract<
  Schema extends StandardSchemaV1<unknown, ElectricRow<unknown>>,
  Key extends string | number,
>(
  contract: DataPlaneElectricCollectionContract<Schema, Key>
): DataPlaneElectricCollectionContract<Schema, Key> {
  assertSafeElectricShapeOptions(contract.shapeOptions);
  assertSupportedElectricSyncMode(contract.syncMode);

  return contract;
}

export function createElectricCollectionFromContract<
  Schema extends StandardSchemaV1<unknown, ElectricRow<unknown>>,
  Key extends string | number,
>(
  contract: DataPlaneElectricCollectionContract<Schema, Key>,
  options: CreateDataPlaneElectricCollectionOptions = {}
) {
  assertSupportedElectricSyncMode(contract.syncMode);

  const runtime = resolveElectricRuntime(options.runtime);

  if (!runtime.isBrowser) {
    return {
      collection: null,
      disabledReason: "server-render",
      health: createElectricCollectionHealth(contract, {
        disabledReason: "server-render",
        now: runtime.now,
        status: "disabled",
      }),
      status: "disabled",
    } as const satisfies DataPlaneElectricCollectionResult<never>;
  }

  if (runtime.syncOrigin === undefined) {
    return {
      collection: null,
      disabledReason: "missing-sync-origin",
      health: createElectricCollectionHealth(contract, {
        disabledReason: "missing-sync-origin",
        now: runtime.now,
        status: "disabled",
      }),
      status: "disabled",
    } as const satisfies DataPlaneElectricCollectionResult<never>;
  }

  const shapeUrl = makeElectricShapeUrl({
    shapeName: contract.shapeName,
    style: options.shapeUrlStyle,
    syncOrigin: runtime.syncOrigin,
  });

  if (shapeUrl === null) {
    return {
      collection: null,
      disabledReason: "invalid-sync-origin",
      health: createElectricCollectionHealth(contract, {
        disabledReason: "invalid-sync-origin",
        now: runtime.now,
        status: "disabled",
      }),
      status: "disabled",
    } as const satisfies DataPlaneElectricCollectionResult<never>;
  }

  const health = createElectricCollectionHealth(contract, {
    now: runtime.now,
    status: "connecting",
  });
  const shapeOptions = createElectricShapeOptions(contract, {
    fetch: runtime.fetch,
    onSyncError: (error) => {
      recordElectricCollectionSyncError(health, error);
      options.onSyncError?.(error);
    },
    shapeUrl,
  });
  const collection = createCollection(
    electricCollectionOptions({
      getKey: contract.getKey,
      id: contract.id,
      ...contract.mutationHandlers,
      schema: contract.schema,
      shapeOptions,
      syncMode: contract.syncMode ?? "eager",
    })
  );
  connectElectricCollectionHealth(collection, health);

  return {
    collection,
    health,
    shapeUrl,
    status: "enabled",
  } as const;
}

export function recordElectricCollectionSyncError(
  health: DataPlaneCollectionHealth,
  error: DataPlaneElectricSyncError
) {
  return error.retryable
    ? health.markRetrying(error)
    : health.markUnavailable(error);
}

export function createElectricShapeOptions<
  Schema extends StandardSchemaV1<unknown, ElectricRow<unknown>>,
  Key extends string | number,
>(
  contract: DataPlaneElectricCollectionContract<Schema, Key>,
  options: {
    readonly fetch?: typeof fetch | undefined;
    readonly onSyncError?:
      | ((error: DataPlaneElectricSyncError) => void)
      | undefined;
    readonly shapeUrl: string;
  }
): ShapeStreamOptions<GetExtensions<DataPlaneElectricSchemaOutput<Schema>>> {
  assertSafeElectricShapeOptions(contract.shapeOptions);

  const {
    columnMapper,
    fetchClient,
    headers,
    onError,
    transformer,
    ...passThroughShapeOptions
  } = contract.shapeOptions ?? {};
  const params = {
    ...passThroughShapeOptions.params,
  } satisfies ExternalParamsRecord<DataPlaneElectricSchemaOutput<Schema>>;

  return {
    ...passThroughShapeOptions,
    columnMapper: columnMapper ?? snakeCamelMapper(),
    fetchClient: makeCredentialedSyncFetch(fetchClient ?? options.fetch),
    headers,
    onError: async (error) => {
      const normalized = normalizeElectricSyncError(error, contract.shapeName);
      options.onSyncError?.(normalized);

      const callerRetryOptions = await onError?.(error);
      if (callerRetryOptions !== undefined) {
        assertSafeElectricShapeOptions(callerRetryOptions);
        return callerRetryOptions;
      }

      return normalized.retryable ? {} : undefined;
    },
    params,
    transformer,
    url: options.shapeUrl,
  };
}

export function makeElectricShapeUrl({
  shapeName,
  style = DEFAULT_DATA_PLANE_ELECTRIC_SHAPE_URL_STYLE,
  syncOrigin,
}: {
  readonly shapeName: SyncShapeName;
  readonly style?: DataPlaneElectricShapeUrlStyle | undefined;
  readonly syncOrigin: string;
}) {
  const origin = normalizeSyncOrigin(syncOrigin);

  if (origin === null) {
    return null;
  }

  const url =
    style === "query"
      ? new URL("/v1/shape", origin)
      : new URL(`/v1/shapes/${encodeURIComponent(shapeName)}`, origin);

  if (style === "query") {
    url.searchParams.set("shape", shapeName);
  }

  return url.toString();
}

export function normalizeSyncOrigin(syncOrigin: string) {
  const trimmed = syncOrigin.trim();

  if (trimmed.length === 0) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    return null;
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";

  return url.toString();
}

export function assertSafeElectricShapeOptions(
  shapeOptions:
    | { readonly params?: Readonly<Record<string, unknown>> | undefined }
    | undefined
) {
  const params = shapeOptions?.params;

  if (params === undefined) {
    return;
  }

  const forbiddenParams = Object.keys(params).filter((key) =>
    isTrustedElectricSourceParam(key)
  );

  if (forbiddenParams.length === 0) {
    return;
  }

  throw new Error(
    `Electric shapeOptions.params cannot include trusted source parameters: ${forbiddenParams.join(", ")}`
  );
}

function isTrustedElectricSourceParam(key: string) {
  const normalized = key.toLowerCase();
  const bracketBase = normalized.split("[", 1)[0] ?? normalized;

  if (normalized.startsWith("subset__")) {
    return true;
  }

  if (ALLOWED_ELECTRIC_CLIENT_PARAMS.has(normalized)) {
    return false;
  }

  return (
    TRUSTED_ELECTRIC_SOURCE_PARAMS.has(normalized) ||
    TRUSTED_ELECTRIC_SOURCE_PARAMS.has(bracketBase)
  );
}

export function assertSupportedElectricSyncMode(
  syncMode: DataPlaneElectricCollectionSyncMode | undefined
) {
  if (syncMode === undefined || syncMode === "eager") {
    return;
  }

  throw new Error(
    "Electric collections currently support eager full-shape sync only; add an authorized subset contract before using on-demand or progressive sync."
  );
}

export function makeCredentialedSyncFetch(fetchClient = globalThis.fetch) {
  return ((
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) =>
    fetchClient(input, {
      ...init,
      credentials: "include",
    })) as typeof fetch;
}

export function normalizeElectricSyncError(
  error: unknown,
  shapeName: SyncShapeName
): DataPlaneElectricSyncError {
  if (error instanceof FetchError || isFetchErrorLike(error)) {
    return normalizeElectricFetchError(error, shapeName);
  }

  if (isNetworkLikeError(error)) {
    return {
      kind: "network",
      message: formatElectricSyncErrorMessage("network"),
      retryable: true,
      shapeName,
    };
  }

  if (isMissingHeadersError(error)) {
    return {
      kind: "missing-headers",
      message: formatElectricSyncErrorMessage("missing-headers"),
      retryable: false,
      shapeName,
    };
  }

  return {
    kind: "unknown",
    message: formatElectricSyncErrorMessage("unknown"),
    retryable: false,
    shapeName,
  };
}

function normalizeElectricFetchError(
  error: FetchError | FetchErrorLike,
  shapeName: SyncShapeName
): DataPlaneElectricSyncError {
  const { status } = error;
  const kind = classifyElectricFetchError(status);

  return {
    kind,
    message: formatElectricSyncErrorMessage(kind, status),
    retryable: isRetryableElectricFetchStatus(status),
    shapeName,
    status,
  };
}

function classifyElectricFetchError(
  status: number
): DataPlaneElectricSyncErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }

  if (status === 404) {
    return "configuration";
  }

  if (status === 429) {
    return "rate-limited";
  }

  if (status >= 400 && status < 500) {
    return "configuration";
  }

  if (status >= 500) {
    return "server";
  }

  return "network";
}

function isRetryableElectricFetchStatus(status: number) {
  return status === 429 || status >= 500;
}

interface FetchErrorLike {
  readonly message: string;
  readonly status: number;
}

function isFetchErrorLike(error: unknown): error is FetchErrorLike {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;

  return (
    typeof record.status === "number" && typeof record.message === "string"
  );
}

function isMissingHeadersError(
  error: unknown
): error is Error & { readonly name?: string } {
  return (
    error instanceof Error &&
    (error.name === "MissingHeadersError" ||
      error.message.includes("required headers"))
  );
}

function isNetworkLikeError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}

function formatElectricSyncErrorMessage(
  kind: DataPlaneElectricSyncErrorKind,
  status?: number | undefined
) {
  switch (kind) {
    case "auth": {
      return "Sync authorization failed.";
    }
    case "configuration": {
      return status === undefined
        ? "Sync configuration failed."
        : `Sync configuration failed with status ${status}.`;
    }
    case "missing-headers": {
      return "Sync response is missing required Electric headers.";
    }
    case "network": {
      return "Sync request failed before a response was received.";
    }
    case "rate-limited": {
      return "Sync origin rate limited the collection.";
    }
    case "server": {
      return status === undefined
        ? "Sync origin is unavailable."
        : `Sync origin is unavailable with status ${status}.`;
    }
    case "unknown": {
      return "Sync failed.";
    }
    default: {
      kind satisfies never;
      return "Sync failed.";
    }
  }
}

function resolveElectricRuntime(
  runtime: Partial<DataPlaneElectricRuntime> | undefined
): ResolvedDataPlaneElectricRuntime {
  const browserOrigin = isBrowserRuntime() ? window.location.origin : undefined;

  return {
    fetch: runtime?.fetch,
    isBrowser: runtime?.isBrowser ?? isBrowserRuntime(),
    now: runtime?.now,
    syncOrigin: runtime?.syncOrigin ?? resolveSyncOrigin(browserOrigin),
  };
}

function createElectricCollectionHealth<
  Schema extends StandardSchemaV1<unknown, ElectricRow<unknown>>,
  Key extends string | number,
>(
  contract: DataPlaneElectricCollectionContract<Schema, Key>,
  options: {
    readonly disabledReason?: DataPlaneElectricDisabledReason | undefined;
    readonly now?: (() => number) | undefined;
    readonly status: "connecting" | "disabled";
  }
) {
  return createDataPlaneCollectionHealth({
    collection: contract.collection,
    collectionId: contract.id,
    disabledReason: options.disabledReason,
    now: options.now,
    source: "electric",
    status: options.status,
    subscriptionName: contract.shapeName,
  });
}

interface ElectricCollectionHealthObservable {
  readonly status: string;
  readonly on?:
    | ((
        event: "status:change",
        callback: (event: { readonly status: string }) => void
      ) => () => void)
    | undefined;
  readonly onFirstReady?: ((callback: () => void) => void) | undefined;
}

export function connectElectricCollectionHealth(
  collection: ElectricCollectionHealthObservable,
  health: DataPlaneCollectionHealth
) {
  const markReadyWhenReady = (status: string) => {
    if (status === "ready") {
      health.markReady();
    }
  };
  const unsubscribe = collection.on?.("status:change", (event) => {
    markReadyWhenReady(event.status);
  });

  if (collection.status === "ready") {
    health.markReady();
  }

  if (unsubscribe === undefined) {
    collection.onFirstReady?.(() => {
      health.markReady();
    });
  }

  return unsubscribe ?? (() => null);
}

function isBrowserRuntime() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
