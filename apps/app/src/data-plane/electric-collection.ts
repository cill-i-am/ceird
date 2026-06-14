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
import { createCollection } from "@tanstack/react-db";

import type {
  DataPlaneCollectionCompleteness,
  DataPlaneCollectionName,
} from "./collection-contract";

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
  | "auth"
  | "configuration"
  | "missing-headers"
  | "network"
  | "rate-limited"
  | "server"
  | "unknown";

export interface DataPlaneElectricSyncError {
  readonly cause: unknown;
  readonly kind: DataPlaneElectricSyncErrorKind;
  readonly message: string;
  readonly retryable: boolean;
  readonly shapeName: SyncShapeName;
  readonly status?: number | undefined;
}

export interface DataPlaneElectricRuntime {
  readonly fetch?: typeof fetch | undefined;
  readonly isBrowser: boolean;
}

interface ResolvedDataPlaneElectricRuntime extends DataPlaneElectricRuntime {
  readonly syncOrigin?: string | undefined;
}

export interface DataPlaneElectricCollectionContract<
  Schema extends StandardSchemaV1<unknown, ElectricRow<unknown>>,
  Key extends string | number,
> {
  readonly collection: DataPlaneCollectionName;
  readonly completeness: DataPlaneCollectionCompleteness;
  readonly getKey: (item: StandardSchemaV1.InferOutput<Schema>) => Key;
  readonly id: string;
  readonly schema: Schema;
  readonly shapeName: SyncShapeName;
  readonly shapeOptions?:
    | DataPlaneElectricShapeOptions<StandardSchemaV1.InferOutput<Schema>>
    | undefined;
  readonly syncMode?: DataPlaneElectricCollectionSyncMode | undefined;
}

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
      readonly shapeUrl: string;
      readonly status: "enabled";
    }
  | {
      readonly collection: null;
      readonly disabledReason: DataPlaneElectricDisabledReason;
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
      status: "disabled",
    } as const satisfies DataPlaneElectricCollectionResult<never>;
  }

  if (runtime.syncOrigin === undefined) {
    return {
      collection: null,
      disabledReason: "missing-sync-origin",
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
      status: "disabled",
    } as const satisfies DataPlaneElectricCollectionResult<never>;
  }

  const shapeOptions = createElectricShapeOptions(contract, {
    fetch: runtime.fetch,
    onSyncError: options.onSyncError,
    shapeUrl,
  });
  const collection = createCollection(
    electricCollectionOptions({
      getKey: contract.getKey,
      id: contract.id,
      schema: contract.schema,
      shapeOptions,
      syncMode: contract.syncMode ?? "eager",
    })
  );

  return {
    collection,
    shapeUrl,
    status: "enabled",
  } as const;
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
): ShapeStreamOptions<GetExtensions<StandardSchemaV1.InferOutput<Schema>>> {
  assertSafeElectricShapeOptions(contract.shapeOptions);

  const {
    columnMapper,
    fetchClient,
    headers,
    onError,
    transformer,
    ...passThroughShapeOptions
  } = contract.shapeOptions ?? {};

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
      cause: error,
      kind: "network",
      message: formatUnknownElectricError(error),
      retryable: true,
      shapeName,
    };
  }

  if (isMissingHeadersError(error)) {
    return {
      cause: error,
      kind: "missing-headers",
      message: error.message,
      retryable: false,
      shapeName,
    };
  }

  return {
    cause: error,
    kind: "unknown",
    message: formatUnknownElectricError(error),
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
    cause: error,
    kind,
    message: error.message,
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

function formatUnknownElectricError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function resolveElectricRuntime(
  runtime: Partial<DataPlaneElectricRuntime> | undefined
): ResolvedDataPlaneElectricRuntime {
  return {
    fetch: runtime?.fetch,
    isBrowser: runtime?.isBrowser ?? isBrowserRuntime(),
    syncOrigin: readViteSyncOrigin(),
  };
}

function isBrowserRuntime() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function readViteSyncOrigin() {
  const { env } = import.meta as ImportMeta & {
    readonly env?: { readonly VITE_SYNC_ORIGIN?: string | undefined };
  };
  const processEnv = (
    globalThis as typeof globalThis & {
      readonly process?: {
        readonly env?: { readonly VITE_SYNC_ORIGIN?: string | undefined };
      };
    }
  ).process?.env;
  const value = (env?.VITE_SYNC_ORIGIN ?? processEnv?.VITE_SYNC_ORIGIN)?.trim();

  return value && value.length > 0 ? value : undefined;
}
