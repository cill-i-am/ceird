/* eslint-disable promise/prefer-await-to-then -- Effect.catch is Effect error handling, not Promise chaining. */

import {
  makeDomainServiceClient,
  makeSyncShapeAuthorizationPath,
  SyncShapeAuthorizationSchema,
  SyncShapeNameSchema,
} from "@ceird/domain-core";
import type { SyncShapeAuthorization, SyncShapeName } from "@ceird/domain-core";
import {
  makeWorkerObservabilityLive,
  WorkerObservability,
} from "@ceird/worker-observability";
import { Effect, Schema } from "effect";

import { decodeSyncWorkerConfigEnv } from "./env.js";
import type { SyncWorkerEnv } from "./env.js";

const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const electricShapePath = "/v1/shape";
const electricShapePathPrefix = "/v1/shapes/";
const forwardedElectricQueryParams = new Set([
  "cursor",
  "handle",
  "live",
  "live_sse",
  "log",
  "offset",
  "replica",
]);
const exposedElectricResponseHeaders = [
  "electric-cursor",
  "electric-handle",
  "electric-offset",
  "electric-schema",
  "electric-up-to-date",
  REQUEST_ID_HEADER,
];
const defaultSyncAuthorizationCacheTtlMs = 10_000;
const maxSyncAuthorizationCacheTtlMs = 60_000;
const maxSyncAuthorizationCacheEntries = 2048;
const syncAuthorizationCache = new Map<
  string,
  {
    readonly authorization: SyncShapeAuthorization;
    readonly expiresAtMs: number;
  }
>();

export const SYNC_WORKER_FAILURE_ERROR_TAG =
  "@ceird/sync/WorkerFailure" as const;

const SyncWorkerFailureKindSchema = Schema.Literals([
  "ElectricForwardingFailed",
  "SyncAuthorizationInvalidResponse",
  "SyncAuthorizationRejected",
  "SyncAuthorizationUnavailable",
  "SyncMethodNotAllowed",
  "SyncNotFound",
  "SyncShapeRequired",
  "SyncShapeUnknown",
  "SyncWorkerMisconfigured",
] as const);

type SyncWorkerFailureKind = Schema.Schema.Type<
  typeof SyncWorkerFailureKindSchema
>;

export class SyncWorkerFailure extends Schema.TaggedErrorClass<SyncWorkerFailure>()(
  SYNC_WORKER_FAILURE_ERROR_TAG,
  {
    failureTag: SyncWorkerFailureKindSchema,
    message: Schema.String,
    shapeName: Schema.optional(SyncShapeNameSchema),
    status: Schema.Number,
  }
) {}

export interface SyncWorkerDependencies {
  readonly authorizeShape?: (
    request: Request,
    shapeName: SyncShapeName,
    requestId: string
  ) => Effect.Effect<SyncShapeAuthorization, SyncWorkerFailure>;
  readonly fetchElectric?: (
    request: Request
  ) => Effect.Effect<Response, SyncWorkerFailure>;
  readonly now?: () => number;
}

type RequiredSyncRequestDependencies = Required<
  Pick<SyncWorkerDependencies, "authorizeShape" | "fetchElectric">
>;

export function clearSyncAuthorizationCacheForTesting() {
  syncAuthorizationCache.clear();
}

export function handleSyncWorkerFetch(
  request: Request,
  env: SyncWorkerEnv,
  _context: ExecutionContext,
  dependencies: SyncWorkerDependencies = {}
) {
  const startedAt = performance.now();
  const requestId = readRequestId(request);
  const authorizeShape = makeCachedShapeAuthorizer(
    dependencies.authorizeShape ?? makeDomainShapeAuthorizer(env),
    env,
    dependencies.now ?? performance.now.bind(performance)
  );
  const fetchElectric = dependencies.fetchElectric ?? makeElectricFetcher(env);

  return Effect.gen(function* () {
    yield* decodeSyncWorkerConfigEnv(env).pipe(
      Effect.mapError((cause) =>
        makeFailure("SyncWorkerMisconfigured", formatUnknownError(cause), 503)
      )
    );
    yield* readSyncAuthorizationCacheTtlMs(env);

    return yield* handleSyncRequest(request, env, {
      authorizeShape,
      fetchElectric,
      requestId,
    });
  }).pipe(
    Effect.tapError((failure) =>
      logSyncWorkerFailure(request, env, failure, requestId)
    ),
    Effect.catchTag(SYNC_WORKER_FAILURE_ERROR_TAG, (failure) =>
      Effect.succeed(makeFailureResponse(request, env, requestId, failure))
    ),
    Effect.tap((response) =>
      recordSyncWorkerAnalytics(
        request,
        env,
        response.status,
        startedAt,
        requestId
      )
    ),
    Effect.tap((response) =>
      logSyncWorkerFetchOutcome(request, env, response, requestId)
    ),
    Effect.map((response) =>
      withSharedResponseHeaders(request, env, response, requestId)
    ),
    Effect.withSpan("SyncWorker.handleFetch", {
      attributes: {
        ...(env.ALCHEMY_STACK_NAME === undefined
          ? {}
          : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
        ...(env.ALCHEMY_STAGE === undefined
          ? {}
          : { "alchemy.stage": env.ALCHEMY_STAGE }),
        "ceird.adapter": "sync",
        "http.method": request.method,
        "http.path": new URL(request.url).pathname,
      },
    })
  );
}

function recordSyncWorkerAnalytics(
  request: Request,
  env: SyncWorkerEnv,
  status: number,
  startedAt: number,
  requestId: string
) {
  return WorkerObservability.recordRequest({
    adapter: "sync",
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    method: request.method,
    path: new URL(request.url).pathname,
    requestId,
    status,
  }).pipe(Effect.provide(makeWorkerObservabilityLive(env)));
}

function handleSyncRequest(
  request: Request,
  env: SyncWorkerEnv,
  dependencies: RequiredSyncRequestDependencies & {
    readonly requestId: string;
  }
) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return Effect.succeed(makeCorsPreflightResponse(request, env));
  }

  if (request.method === "GET" && url.pathname === "/health") {
    return Effect.succeed(Response.json({ ok: true, service: "sync" }));
  }

  if (request.method !== "GET") {
    return Effect.fail(
      makeFailure("SyncMethodNotAllowed", "Method is not allowed", 405)
    );
  }

  const shapeNameResult = readRequestedShapeName(url);

  if (shapeNameResult._tag === "Failure") {
    return Effect.fail(shapeNameResult.failure);
  }

  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan(
      "sync.shapeName",
      shapeNameResult.shapeName
    );

    const authorization = yield* dependencies.authorizeShape(
      request,
      shapeNameResult.shapeName,
      dependencies.requestId
    );
    const electricRequest = yield* makeElectricShapeRequest(
      request,
      authorization,
      env.ELECTRIC_SOURCE_SECRET,
      dependencies.requestId
    );

    return yield* dependencies.fetchElectric(electricRequest);
  }).pipe(
    Effect.mapError((failure) =>
      withFailureShapeName(failure, shapeNameResult.shapeName)
    )
  );
}

function makeDomainShapeAuthorizer(env: SyncWorkerEnv) {
  const domain = makeDomainServiceClient(env.DOMAIN);

  return (request: Request, shapeName: SyncShapeName, requestId: string) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        catch: (cause) =>
          makeFailure(
            "SyncAuthorizationUnavailable",
            formatUnknownError(cause),
            503,
            shapeName
          ),
        try: () => {
          const headers = new Headers(request.headers);

          headers.set(REQUEST_ID_HEADER, requestId);

          const authorizeUrl = new URL(
            makeSyncShapeAuthorizationPath(shapeName),
            request.url
          );

          return domain.request(
            new Request(authorizeUrl, {
              headers,
              method: "GET",
            })
          );
        },
      });

      if (!response.ok) {
        const message = yield* readDomainAuthorizationFailureMessage(response);

        return yield* Effect.fail(
          makeFailure(
            response.status >= 500
              ? "SyncAuthorizationUnavailable"
              : "SyncAuthorizationRejected",
            message,
            response.status,
            shapeName
          )
        );
      }

      const payload = yield* Effect.tryPromise({
        catch: (cause) =>
          makeFailure(
            "SyncAuthorizationInvalidResponse",
            formatUnknownError(cause),
            502,
            shapeName
          ),
        try: () => response.json(),
      });

      return yield* Schema.decodeUnknownEffect(SyncShapeAuthorizationSchema)(
        payload
      ).pipe(
        Effect.mapError((cause) =>
          makeFailure(
            "SyncAuthorizationInvalidResponse",
            formatUnknownError(cause),
            502,
            shapeName
          )
        )
      );
    }).pipe(
      Effect.withSpan("SyncWorker.authorizeShape", {
        attributes: {
          "http.request_id": requestId,
          "sync.shapeName": shapeName,
        },
      })
    );
}

function makeCachedShapeAuthorizer(
  authorizeShape: RequiredSyncRequestDependencies["authorizeShape"],
  env: SyncWorkerEnv,
  now: () => number
) {
  return (request: Request, shapeName: SyncShapeName, requestId: string) =>
    Effect.gen(function* () {
      const ttlMs = yield* readSyncAuthorizationCacheTtlMs(env);

      if (ttlMs === 0) {
        return yield* authorizeAndValidateShape(
          authorizeShape,
          request,
          shapeName,
          requestId
        );
      }

      const cacheKey = yield* makeSyncAuthorizationCacheKey(request, shapeName);

      if (cacheKey === null) {
        return yield* authorizeAndValidateShape(
          authorizeShape,
          request,
          shapeName,
          requestId
        );
      }

      const nowMs = now();
      const cachedGrant = syncAuthorizationCache.get(cacheKey);

      if (cachedGrant !== undefined) {
        if (
          cachedGrant.expiresAtMs > nowMs &&
          cachedGrant.authorization.shape === shapeName
        ) {
          return cachedGrant.authorization;
        }

        syncAuthorizationCache.delete(cacheKey);
      }

      const authorization = yield* authorizeAndValidateShape(
        authorizeShape,
        request,
        shapeName,
        requestId
      );

      pruneExpiredSyncAuthorizationCache(nowMs);
      syncAuthorizationCache.set(cacheKey, {
        authorization,
        expiresAtMs: nowMs + ttlMs,
      });
      pruneOversizedSyncAuthorizationCache();

      return authorization;
    }).pipe(
      Effect.withSpan("SyncWorker.authorizeShape.cache", {
        attributes: {
          "http.request_id": requestId,
          "sync.shapeName": shapeName,
        },
      })
    );
}

function authorizeAndValidateShape(
  authorizeShape: RequiredSyncRequestDependencies["authorizeShape"],
  request: Request,
  shapeName: SyncShapeName,
  requestId: string
) {
  return Effect.gen(function* () {
    const authorization = yield* authorizeShape(request, shapeName, requestId);

    if (authorization.shape !== shapeName) {
      return yield* Effect.fail(
        makeFailure(
          "SyncAuthorizationInvalidResponse",
          "Sync authorization response shape did not match the requested shape",
          502,
          shapeName
        )
      );
    }

    return authorization;
  });
}

function readSyncAuthorizationCacheTtlMs(env: SyncWorkerEnv) {
  return Effect.sync(() => {
    const rawValue = env.SYNC_AUTHORIZATION_CACHE_TTL_SECONDS?.trim();

    if (rawValue === undefined || rawValue.length === 0) {
      return defaultSyncAuthorizationCacheTtlMs;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value) || value < 0 || value > 60) {
      throw new Error(
        "SYNC_AUTHORIZATION_CACHE_TTL_SECONDS must be a number from 0 to 60"
      );
    }

    return Math.round(value * 1000);
  }).pipe(
    Effect.mapError((cause) =>
      makeFailure("SyncWorkerMisconfigured", formatUnknownError(cause), 503)
    ),
    Effect.map((ttlMs) => Math.min(ttlMs, maxSyncAuthorizationCacheTtlMs))
  );
}

function makeSyncAuthorizationCacheKey(
  request: Request,
  shapeName: SyncShapeName
) {
  return Effect.tryPromise({
    catch: (cause) =>
      makeFailure(
        "SyncAuthorizationUnavailable",
        formatUnknownError(cause),
        503,
        shapeName
      ),
    try: async () => {
      const identityParts = readSyncAuthorizationIdentityParts(request);

      if (identityParts.length === 0) {
        return null;
      }

      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(identityParts))
      );

      return `v1:${shapeName}:${formatDigestHex(digest)}`;
    },
  });
}

function readSyncAuthorizationIdentityParts(request: Request) {
  const { headers } = request;
  const authHeaderNames = ["authorization", "cookie"] as const;
  const authParts = authHeaderNames.flatMap((name) =>
    headers.get(name) === null ? [] : [[name, headers.get(name)] as const]
  );

  if (authParts.length === 0) {
    return [];
  }

  const url = new URL(request.url);
  const routingHeaderNames = [
    "origin",
    "referer",
    "x-ceird-active-organization-id",
    "x-ceird-organization-id",
    "x-organization-id",
  ] as const;
  const routingParts = routingHeaderNames.flatMap((name) =>
    headers.get(name) === null ? [] : [[name, headers.get(name)] as const]
  );

  return [["host", url.host] as const, ...routingParts, ...authParts];
}

function formatDigestHex(digest: ArrayBuffer) {
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function pruneExpiredSyncAuthorizationCache(nowMs: number) {
  for (const [cacheKey, grant] of syncAuthorizationCache) {
    if (grant.expiresAtMs <= nowMs) {
      syncAuthorizationCache.delete(cacheKey);
    }
  }
}

function pruneOversizedSyncAuthorizationCache() {
  while (syncAuthorizationCache.size > maxSyncAuthorizationCacheEntries) {
    const oldestKey = syncAuthorizationCache.keys().next().value;

    if (oldestKey === undefined) {
      return;
    }

    syncAuthorizationCache.delete(oldestKey);
  }
}

function readDomainAuthorizationFailureMessage(response: Response) {
  return Effect.tryPromise({
    catch: (cause) => cause,
    try: async () =>
      readDomainErrorPayloadSummary(await response.clone().json()),
  }).pipe(
    Effect.catch(() => Effect.succeed(undefined as string | undefined)),
    Effect.map((summary) =>
      summary === undefined
        ? `Sync authorization failed with status ${String(response.status)}`
        : `Sync authorization failed with status ${String(response.status)}: ${summary}`
    )
  );
}

function readDomainErrorPayloadSummary(payload: unknown) {
  if (payload === null || typeof payload !== "object") {
    return;
  }

  const record = payload as Record<string, unknown>;
  const { _tag: rawTag, error: rawError, message: rawMessage } = record;
  const tag = typeof rawTag === "string" ? rawTag : undefined;
  let message: string | undefined;

  if (typeof rawMessage === "string") {
    message = rawMessage;
  } else if (typeof rawError === "string") {
    message = rawError;
  }

  const parts = [tag, message].filter((part) => part !== undefined);

  return parts.length === 0 ? undefined : parts.join(": ");
}

function makeElectricFetcher(env: SyncWorkerEnv) {
  return (request: Request) =>
    Effect.tryPromise({
      catch: (cause) =>
        makeFailure("ElectricForwardingFailed", formatUnknownError(cause), 502),
      try: () => {
        const options =
          env.ELECTRIC_SQL_LOCATION_HINT === undefined
            ? undefined
            : { locationHint: env.ELECTRIC_SQL_LOCATION_HINT };
        const stub = env.ElectricSql.getByName("primary", options);

        return stub.fetch(request);
      },
    }).pipe(
      Effect.withSpan("SyncWorker.fetchElectric", {
        attributes: {
          "http.path": new URL(request.url).pathname,
          "http.request_id":
            request.headers.get(REQUEST_ID_HEADER) ?? undefined,
        },
      })
    );
}

function readRequestedShapeName(
  url: URL
):
  | { readonly _tag: "Success"; readonly shapeName: SyncShapeName }
  | { readonly _tag: "Failure"; readonly failure: SyncWorkerFailure } {
  if (
    url.pathname !== electricShapePath &&
    !url.pathname.startsWith(electricShapePathPrefix)
  ) {
    return {
      _tag: "Failure",
      failure: makeFailure("SyncNotFound", "Sync route not found", 404),
    };
  }

  const rawShapeName =
    url.pathname === electricShapePath
      ? url.searchParams.get("shape")
      : url.pathname.slice(electricShapePathPrefix.length);

  if (rawShapeName === null || rawShapeName.length === 0) {
    return {
      _tag: "Failure",
      failure: makeFailure(
        "SyncShapeRequired",
        "A sync shape name is required",
        400
      ),
    };
  }

  if (!Schema.is(SyncShapeNameSchema)(rawShapeName)) {
    return {
      _tag: "Failure",
      failure: makeFailure("SyncShapeUnknown", "Sync shape is not known", 404),
    };
  }

  return {
    _tag: "Success",
    shapeName: rawShapeName,
  };
}

function makeElectricShapeRequest(
  sourceRequest: Request,
  authorization: SyncShapeAuthorization,
  electricSourceSecret: string,
  requestId: string
) {
  return Effect.sync(() => {
    const sourceUrl = new URL(sourceRequest.url);
    const electricUrl = new URL("http://electric/v1/shape");

    for (const [key, value] of sourceUrl.searchParams) {
      if (shouldForwardElectricQueryParam(key)) {
        electricUrl.searchParams.append(key, value);
      }
    }

    electricUrl.searchParams.set("table", authorization.table);
    electricUrl.searchParams.set("where", authorization.where);
    electricUrl.searchParams.set("secret", electricSourceSecret);

    for (const [key, value] of Object.entries(authorization.params)) {
      electricUrl.searchParams.set(`params[${key}]`, value);
    }

    const headers = makeElectricRequestHeaders(sourceRequest.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    const init: RequestInit = {
      headers,
      method: sourceRequest.method,
    };

    if (
      sourceRequest.method !== "GET" &&
      sourceRequest.method !== "HEAD" &&
      sourceRequest.body !== null
    ) {
      init.body = sourceRequest.body;
    }

    return new Request(electricUrl, init);
  });
}

function shouldForwardElectricQueryParam(key: string) {
  return forwardedElectricQueryParams.has(key.toLowerCase());
}

function makeElectricRequestHeaders(sourceHeaders: Headers) {
  const headers = new Headers(sourceHeaders);
  const headerNames = [...headers.keys()];

  for (const name of headerNames) {
    const lowerName = name.toLowerCase();

    if (
      lowerName === "authorization" ||
      lowerName === "cookie" ||
      lowerName === "host" ||
      lowerName === "origin" ||
      lowerName === "referer" ||
      lowerName === "x-forwarded-host" ||
      lowerName === "x-forwarded-proto" ||
      lowerName.startsWith("cf-")
    ) {
      headers.delete(name);
    }
  }

  return headers;
}

function makeCorsPreflightResponse(request: Request, env: SyncWorkerEnv) {
  const headers = makeCorsHeaders(request, env);

  applyCorsPreflightHeaders(headers, request);

  return new Response(null, {
    headers,
    status: 204,
  });
}

function withSharedResponseHeaders(
  request: Request,
  env: SyncWorkerEnv,
  response: Response,
  requestId: string
) {
  const headers = makeCorsHeaders(request, env, response.headers);

  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.set(REQUEST_ID_HEADER, requestId);
  if (request.method === "OPTIONS") {
    applyCorsPreflightHeaders(headers, request);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function logSyncWorkerFetchOutcome(
  request: Request,
  env: SyncWorkerEnv,
  response: Response,
  requestId: string
) {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return Effect.void;
  }

  const shapeName = readObservedShapeName(url);
  const log =
    response.status >= 500
      ? Effect.logWarning("Handled sync Worker request")
      : Effect.logInfo("Handled sync Worker request");

  return log.pipe(
    Effect.annotateLogs({
      ...(env.ALCHEMY_STACK_NAME === undefined
        ? {}
        : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
      ...(env.ALCHEMY_STAGE === undefined
        ? {}
        : { "alchemy.stage": env.ALCHEMY_STAGE }),
      "ceird.adapter": "sync",
      "http.method": request.method,
      "http.path": url.pathname,
      "http.request_id": requestId,
      "http.status": response.status,
      ...(shapeName === undefined ? {} : { "sync.shapeName": shapeName }),
    })
  );
}

function logSyncWorkerFailure(
  request: Request,
  env: SyncWorkerEnv,
  failure: SyncWorkerFailure,
  requestId: string
) {
  const log =
    failure.status >= 500
      ? Effect.logWarning("Sync Worker request failed")
      : Effect.logInfo("Sync Worker request failed");

  return log.pipe(
    Effect.annotateLogs({
      ...(env.ALCHEMY_STACK_NAME === undefined
        ? {}
        : { "alchemy.stackName": env.ALCHEMY_STACK_NAME }),
      ...(env.ALCHEMY_STAGE === undefined
        ? {}
        : { "alchemy.stage": env.ALCHEMY_STAGE }),
      "ceird.adapter": "sync",
      "http.method": request.method,
      "http.path": new URL(request.url).pathname,
      "http.request_id": requestId,
      "http.status": failure.status,
      "sync.failure_message": redactElectricSensitiveError(failure.message),
      "sync.failure_tag": failure.failureTag,
      ...(failure.shapeName === undefined
        ? {}
        : { "sync.shapeName": failure.shapeName }),
    })
  );
}

function makeCorsHeaders(
  request: Request,
  env: SyncWorkerEnv,
  baseHeaders: HeadersInit = {}
) {
  const headers = new Headers(baseHeaders);
  const origin = request.headers.get("origin");

  stripAccessControlHeaders(headers);

  if (origin !== null && isTrustedOrigin(origin, env)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set(
      "access-control-expose-headers",
      exposedElectricResponseHeaders.join(",")
    );
  }

  headers.append("vary", "Origin");

  return headers;
}

function stripAccessControlHeaders(headers: Headers) {
  // oxlint-disable-next-line unicorn/prefer-spread -- Clone before deleting from the same Headers object.
  for (const name of Array.from(headers.keys())) {
    if (name.toLowerCase().startsWith("access-control-")) {
      headers.delete(name);
    }
  }
}

function applyCorsPreflightHeaders(headers: Headers, request: Request) {
  headers.set(
    "access-control-allow-headers",
    request.headers.get("access-control-request-headers") ??
      "authorization,content-type,x-request-id"
  );
  headers.set("access-control-allow-methods", "GET,OPTIONS");
  headers.set("access-control-max-age", "600");
}

function isTrustedOrigin(origin: string, env: SyncWorkerEnv) {
  return [env.AUTH_APP_ORIGIN, ...(env.AUTH_TRUSTED_ORIGINS ?? "").split(",")]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .some((trustedOrigin) =>
      originMatchesTrustedPattern(origin, trustedOrigin)
    );
}

function originMatchesTrustedPattern(origin: string, trustedOrigin: string) {
  if (origin === trustedOrigin) {
    return true;
  }

  if (!trustedOrigin.includes("*")) {
    return false;
  }

  const pattern = trustedOrigin.split("*").map(escapeRegExp).join("[^.]+");

  return new RegExp(`^${pattern}$`).test(origin);
}

function makeFailureResponse(
  request: Request,
  env: SyncWorkerEnv,
  requestId: string,
  failure: SyncWorkerFailure
) {
  const error = readFailureErrorCode(failure.status);

  return withSharedResponseHeaders(
    request,
    env,
    Response.json({ error }, { status: failure.status }),
    requestId
  );
}

function readFailureErrorCode(status: number) {
  if (status === 401) {
    return "sync_unauthorized";
  }

  if (status === 403) {
    return "sync_forbidden";
  }

  if (status === 404) {
    return "sync_not_found";
  }

  if (status === 405) {
    return "sync_method_not_allowed";
  }

  if (status >= 500) {
    return "sync_unavailable";
  }

  return "sync_bad_request";
}

function makeFailure(
  failureTag: SyncWorkerFailureKind,
  message: string,
  status: number,
  shapeName?: SyncShapeName | undefined
): SyncWorkerFailure {
  return new SyncWorkerFailure({
    failureTag,
    message: redactElectricSensitiveError(message),
    ...(shapeName === undefined ? {} : { shapeName }),
    status,
  });
}

function withFailureShapeName(
  failure: SyncWorkerFailure,
  shapeName: SyncShapeName
) {
  if (failure.shapeName !== undefined) {
    return failure;
  }

  return new SyncWorkerFailure({
    failureTag: failure.failureTag,
    message: failure.message,
    shapeName,
    status: failure.status,
  });
}

function formatUnknownError(error: unknown) {
  return redactElectricSensitiveError(
    error instanceof Error ? error.message : String(error)
  );
}

function readRequestId(request: Request) {
  const value = request.headers.get(REQUEST_ID_HEADER)?.trim();

  return value !== undefined && SAFE_REQUEST_ID_PATTERN.test(value)
    ? value
    : crypto.randomUUID();
}

function readObservedShapeName(url: URL) {
  let rawShapeName: string | null | undefined;

  if (url.pathname === electricShapePath) {
    rawShapeName = url.searchParams.get("shape");
  } else if (url.pathname.startsWith(electricShapePathPrefix)) {
    rawShapeName = url.pathname.slice(electricShapePathPrefix.length);
  }

  return rawShapeName !== undefined &&
    rawShapeName !== null &&
    Schema.is(SyncShapeNameSchema)(rawShapeName)
    ? rawShapeName
    : undefined;
}

function redactElectricSensitiveError(input: string) {
  return input
    .replaceAll(/([?&]secret=)[^&\s)"']+/giu, "$1[REDACTED]")
    .replaceAll(/([?&]params%5B[^=]+%5D=)[^&\s)"']+/giu, "$1[REDACTED]")
    .replaceAll(/([?&]params\[[^\]]+\]=)[^&\s)"']+/giu, "$1[REDACTED]");
}

function escapeRegExp(input: string) {
  return input.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
