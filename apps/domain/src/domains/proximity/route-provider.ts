import {
  decodeOrganizationId,
  decodeUserId,
  type OrganizationId,
  type UserId,
} from "@ceird/identity-core";
import {
  IsoDateTimeString,
  ProximityCostGuardError,
  ProximityProviderError,
  ProximityRouteUnavailableError,
  type ProximityCoordinates,
  type RouteDisplayLine,
  type RouteDisplayLineResponse,
  type RouteSummary,
} from "@ceird/proximity-core";
import {
  Cache,
  Config,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Redacted,
  Schema,
} from "effect";

const GOOGLE_ROUTES_MATRIX_URL =
  "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const GOOGLE_ROUTES_DIRECTIONS_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_ROUTES_MATRIX_FIELD_MASK =
  "originIndex,destinationIndex,status,condition,distanceMeters,duration";
const GOOGLE_ROUTES_PREVIEW_FIELD_MASK =
  "routes.duration,routes.distanceMeters";
const GOOGLE_ROUTES_PREVIEW_LINE_FIELD_MASK =
  "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline";
const DEFAULT_GOOGLE_ROUTES_REQUEST_TIMEOUT = Duration.seconds(5);
const DEFAULT_ROUTE_PROVIDER_CACHE_CAPACITY = 500;
const DEFAULT_ROUTE_PROVIDER_CACHE_SUCCESS_TTL = Duration.seconds(30);
const DEFAULT_ROUTE_PROVIDER_CACHE_FAILURE_TTL = Duration.seconds(3);
const DEFAULT_ROUTE_COST_GUARD_WINDOW = Duration.seconds(60);
const DEFAULT_ROUTE_COST_GUARD_ACTOR_LIMIT = 500;
const DEFAULT_ROUTE_COST_GUARD_AGENT_THREAD_LIMIT = 200;
const DEFAULT_ROUTE_COST_GUARD_ORGANIZATION_LIMIT = 5_000;
const GOOGLE_ROUTES_PROVIDER_FAILED_MESSAGE = "Google Routes provider failed";
const GOOGLE_ROUTES_PROVIDER_CONFIGURATION_FAILED_MESSAGE =
  "Google Routes provider is not configured";
const warmGoogleRoutesProviderEffects = new Map<
  string,
  Effect.Effect<RouteProviderImplementation, Schema.SchemaError>
>();

const GoogleRoutesApiKeySchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1), Schema.isMaxLength(512))
);
const decodeGoogleRoutesApiKey = Schema.decodeUnknownEffect(
  GoogleRoutesApiKeySchema
);
const decodeIsoDateTimeString = Schema.decodeUnknownSync(IsoDateTimeString);

const GoogleRouteMatrixElementSchema = Schema.Struct({
  condition: Schema.optional(Schema.String),
  destinationIndex: Schema.Number,
  distanceMeters: Schema.optional(Schema.Number),
  duration: Schema.optional(Schema.String),
  originIndex: Schema.Number,
  status: Schema.optional(Schema.Unknown),
});
const GoogleRouteMatrixResponseSchema = Schema.Array(
  GoogleRouteMatrixElementSchema
);
const GoogleRouteSchema = Schema.Struct({
  distanceMeters: Schema.optional(Schema.Number),
  duration: Schema.optional(Schema.String),
  polyline: Schema.optional(
    Schema.Struct({
      encodedPolyline: Schema.optional(Schema.String),
    })
  ),
});
const GoogleComputeRoutesResponseSchema = Schema.Struct({
  routes: Schema.optional(Schema.Array(GoogleRouteSchema)),
});
const decodeGoogleRouteMatrixResponse = Schema.decodeUnknownEffect(
  GoogleRouteMatrixResponseSchema
);
const decodeGoogleComputeRoutesResponse = Schema.decodeUnknownEffect(
  GoogleComputeRoutesResponseSchema
);

export interface RouteDestination {
  readonly coordinates: ProximityCoordinates;
  readonly destinationId: string;
}

export interface RouteCostContext {
  readonly actorUserId: UserId;
  readonly agentThreadId?: string;
  readonly organizationId: OrganizationId;
}

export interface RouteCostGuardReserveInput {
  readonly context: RouteCostContext;
  readonly operation: "matrix" | "route_preview";
  readonly units: number;
}

export interface RouteCostGuardImplementation {
  readonly reserve: (
    input: RouteCostGuardReserveInput
  ) => Effect.Effect<void, ProximityCostGuardError>;
}

export interface RankRoutesInput {
  readonly context: RouteCostContext;
  readonly destinations: readonly RouteDestination[];
  readonly origin: ProximityCoordinates;
}

export interface RouteRankedDestination {
  readonly destinationId: string;
  readonly routeSummary: RouteSummary;
}

export interface RankRoutesResult {
  readonly rows: readonly RouteRankedDestination[];
  readonly unavailableDestinationIds: readonly string[];
}

export interface RoutePreviewInput {
  readonly context: RouteCostContext;
  readonly destination: RouteDestination;
  readonly includeLine: boolean;
  readonly origin: ProximityCoordinates;
}

export type RoutePreviewResult = RouteDisplayLineResponse;

export interface RouteProviderImplementation {
  readonly previewRoute: (
    input: RoutePreviewInput
  ) => Effect.Effect<
    RoutePreviewResult,
    | ProximityCostGuardError
    | ProximityProviderError
    | ProximityRouteUnavailableError
  >;
  readonly rankRoutes: (
    input: RankRoutesInput
  ) => Effect.Effect<
    RankRoutesResult,
    ProximityCostGuardError | ProximityProviderError
  >;
}

type PortableFetch = (input: string, init?: RequestInit) => Promise<Response>;

const defaultPortableFetch: PortableFetch = (input, init) =>
  globalThis.fetch(input, init);

type GoogleRoutesRequestFailure =
  | {
      readonly _tag: "GoogleRoutesFetchFailed";
      readonly cause: unknown;
    }
  | {
      readonly _tag: "GoogleRoutesJsonDecodeFailed";
      readonly cause: unknown;
    }
  | {
      readonly _tag: "GoogleRoutesTimedOut";
      readonly requestTimeout: Duration.Duration;
    };

type GoogleRoutesRequestResult =
  | {
      readonly _tag: "Success";
      readonly payload: unknown;
    }
  | {
      readonly _tag: "HttpError";
      readonly providerMessage?: string;
      readonly providerStatus?: string;
      readonly status: number;
    };

interface GoogleRoutesRequestFailureDetails {
  readonly cause?: unknown;
  readonly httpStatus?: number;
  readonly operation: "matrix" | "route_preview";
  readonly providerMessage?: string;
  readonly providerStatus?: string;
  readonly reason:
    | "fetch_failed"
    | "http_error"
    | "json_decode_failed"
    | "request_timeout"
    | "response_parse_failed";
  readonly requestTimeout?: Duration.Duration;
}

interface SerializedRouteCostContext {
  readonly actorUserId: string;
  readonly agentThreadId?: string;
  readonly organizationId: string;
}

interface SerializedRankRoutesCacheRequest {
  readonly context: {
    readonly actorUserId: string;
    readonly agentThreadId?: string;
    readonly organizationId: string;
  };
  readonly destinations: readonly RouteDestination[];
  readonly origin: ProximityCoordinates;
}

interface SerializedRoutePreviewCacheRequest {
  readonly context: {
    readonly actorUserId: string;
    readonly agentThreadId?: string;
    readonly organizationId: string;
  };
  readonly destination: RouteDestination;
  readonly includeLine: boolean;
  readonly origin: ProximityCoordinates;
}

interface RouteCostGuardCounter {
  readonly resetAtMillis: number;
  readonly used: number;
}

type RouteCostGuardScope = "actor" | "agent_thread" | "organization";

export function makeNoopRouteCostGuard(): RouteCostGuardImplementation {
  return {
    reserve: () => Effect.void,
  };
}

export function makeInMemoryRouteCostGuard(options?: {
  readonly actorLimit?: number;
  readonly agentThreadLimit?: number;
  readonly nowMillis?: () => number;
  readonly organizationLimit?: number;
  readonly window?: Duration.Duration;
}): RouteCostGuardImplementation {
  const actorLimit =
    options?.actorLimit ?? DEFAULT_ROUTE_COST_GUARD_ACTOR_LIMIT;
  const agentThreadLimit =
    options?.agentThreadLimit ?? DEFAULT_ROUTE_COST_GUARD_AGENT_THREAD_LIMIT;
  const organizationLimit =
    options?.organizationLimit ?? DEFAULT_ROUTE_COST_GUARD_ORGANIZATION_LIMIT;
  const window = options?.window ?? DEFAULT_ROUTE_COST_GUARD_WINDOW;
  const windowMillis = Duration.toMillis(window);
  const nowMillis = options?.nowMillis ?? (() => Date.now());
  const counters = new Map<string, RouteCostGuardCounter>();

  return {
    reserve: (input) =>
      Effect.sync(() => {
        const units = Math.max(1, Math.ceil(input.units));
        const now = nowMillis();
        const scopes = [
          {
            id: input.context.actorUserId,
            limit: actorLimit,
            scope: "actor",
          },
          ...(input.context.agentThreadId === undefined
            ? []
            : [
                {
                  id: input.context.agentThreadId,
                  limit: agentThreadLimit,
                  scope: "agent_thread" as const,
                },
              ]),
          {
            id: input.context.organizationId,
            limit: organizationLimit,
            scope: "organization",
          },
        ] satisfies ReadonlyArray<{
          readonly id: string;
          readonly limit: number;
          readonly scope: RouteCostGuardScope;
        }>;
        const nextCounters = scopes.map((scope) => {
          const key = `${scope.scope}:${scope.id}`;
          const current = counters.get(key);
          const effectiveCounter =
            current === undefined || current.resetAtMillis <= now
              ? {
                  resetAtMillis: now + windowMillis,
                  used: 0,
                }
              : current;

          return {
            ...scope,
            counter: effectiveCounter,
            key,
          };
        });
        const blockedScope = nextCounters.find(
          (scope) => scope.counter.used + units > scope.limit
        );

        if (blockedScope !== undefined) {
          return new ProximityCostGuardError({
            limit: blockedScope.limit,
            message: "Route provider cost guard limit reached",
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((blockedScope.counter.resetAtMillis - now) / 1_000)
            ),
            scope: blockedScope.scope,
          });
        }

        for (const scope of nextCounters) {
          counters.set(scope.key, {
            resetAtMillis: scope.counter.resetAtMillis,
            used: scope.counter.used + units,
          });
        }

        return undefined;
      }).pipe(
        Effect.flatMap((error) =>
          error === undefined ? Effect.void : Effect.fail(error)
        )
      ),
  };
}

export function makeGoogleRoutesProvider(options: {
  readonly cacheCapacity?: number;
  readonly cacheFailureTtl?: Duration.Duration;
  readonly cacheSuccessTtl?: Duration.Duration;
  readonly costGuard?: RouteCostGuardImplementation;
  readonly fetch?: PortableFetch;
  readonly googleMapsApiKey: string;
  readonly requestTimeout?: Duration.Duration;
}): Effect.Effect<RouteProviderImplementation, Schema.SchemaError> {
  return Effect.gen(function* makeGoogleRoutesProviderEffect() {
    const googleMapsApiKey = yield* decodeGoogleRoutesApiKey(
      options.googleMapsApiKey
    );
    const fetchImplementation = options.fetch ?? defaultPortableFetch;
    const requestTimeout =
      options.requestTimeout ?? DEFAULT_GOOGLE_ROUTES_REQUEST_TIMEOUT;
    const costGuard = options.costGuard ?? makeInMemoryRouteCostGuard();
    const cacheCapacity =
      options.cacheCapacity ?? DEFAULT_ROUTE_PROVIDER_CACHE_CAPACITY;
    const cacheSuccessTtl =
      options.cacheSuccessTtl ?? DEFAULT_ROUTE_PROVIDER_CACHE_SUCCESS_TTL;
    const cacheFailureTtl =
      options.cacheFailureTtl ?? DEFAULT_ROUTE_PROVIDER_CACHE_FAILURE_TTL;
    const timeToLive = <Success, Failure>(exit: Exit.Exit<Success, Failure>) =>
      Exit.isSuccess(exit) ? cacheSuccessTtl : cacheFailureTtl;

    const rankRoutesCache = yield* Cache.makeWith<
      string,
      RankRoutesResult,
      ProximityCostGuardError | ProximityProviderError
    >(
      (key) =>
        executeRankRoutes({
          costGuard,
          fetchImplementation,
          googleMapsApiKey,
          input: parseRankRoutesCacheKey(key),
          requestTimeout,
        }),
      {
        capacity: cacheCapacity,
        timeToLive,
      }
    );
    const previewRouteCache = yield* Cache.makeWith<
      string,
      RoutePreviewResult,
      | ProximityCostGuardError
      | ProximityProviderError
      | ProximityRouteUnavailableError
    >(
      (key) =>
        executePreviewRoute({
          costGuard,
          fetchImplementation,
          googleMapsApiKey,
          input: parseRoutePreviewCacheKey(key),
          requestTimeout,
        }),
      {
        capacity: cacheCapacity,
        timeToLive,
      }
    );

    return {
      previewRoute: (input) =>
        Cache.get(previewRouteCache, routePreviewCacheKey(input)),
      rankRoutes: (input) =>
        Cache.get(rankRoutesCache, rankRoutesCacheKey(input)),
    } satisfies RouteProviderImplementation;
  });
}

export function makeGoogleRoutesProviderFromConfig(options?: {
  readonly cacheCapacity?: number;
  readonly cacheFailureTtl?: Duration.Duration;
  readonly cacheSuccessTtl?: Duration.Duration;
  readonly costGuard?: RouteCostGuardImplementation;
  readonly fetch?: PortableFetch;
  readonly requestTimeout?: Duration.Duration;
}): Effect.Effect<
  RouteProviderImplementation,
  Config.ConfigError | Schema.SchemaError
> {
  return Effect.gen(function* makeGoogleRoutesProviderFromConfigEffect() {
    const googleMapsApiKey = yield* googleRoutesApiKeyConfig;

    return yield* makeGoogleRoutesProvider({
      ...options,
      googleMapsApiKey: Redacted.value(googleMapsApiKey),
    });
  });
}

function makeWarmGoogleRoutesProviderFromConfig(): Effect.Effect<
  RouteProviderImplementation,
  Config.ConfigError | Schema.SchemaError
> {
  return Effect.gen(function* makeWarmGoogleRoutesProviderFromConfigEffect() {
    const googleMapsApiKey = yield* googleRoutesApiKeyConfig;

    return yield* getWarmGoogleRoutesProviderEffect(
      Redacted.value(googleMapsApiKey)
    );
  });
}

function getWarmGoogleRoutesProviderEffect(googleMapsApiKey: string) {
  const existing = warmGoogleRoutesProviderEffects.get(googleMapsApiKey);

  if (existing !== undefined) {
    return existing;
  }

  const cached = Effect.runSync(
    Effect.cached(makeGoogleRoutesProvider({ googleMapsApiKey }))
  );
  warmGoogleRoutesProviderEffects.set(googleMapsApiKey, cached);
  return cached;
}

function getConfiguredWarmGoogleRoutesProvider() {
  return makeWarmGoogleRoutesProviderFromConfig().pipe(
    Effect.catchTags({
      ConfigError: (cause) =>
        logAndFailGoogleRoutesProviderConfiguration({
          cause,
          reason: "configuration_error",
        }),
      SchemaError: (cause) =>
        logAndFailGoogleRoutesProviderConfiguration({
          cause,
          reason: "configuration_error",
        }),
    })
  );
}

function executeRankRoutes(options: {
  readonly costGuard: RouteCostGuardImplementation;
  readonly fetchImplementation: PortableFetch;
  readonly googleMapsApiKey: string;
  readonly input: RankRoutesInput;
  readonly requestTimeout: Duration.Duration;
}): Effect.Effect<
  RankRoutesResult,
  ProximityCostGuardError | ProximityProviderError
> {
  return Effect.gen(function* executeRankRoutesEffect() {
    yield* options.costGuard.reserve({
      context: options.input.context,
      operation: "matrix",
      units: options.input.destinations.length,
    });
    const requestResult = yield* fetchGoogleRoutesPayload({
      body: {
        destinations: options.input.destinations.map((destination) =>
          routeMatrixWaypoint(destination.coordinates)
        ),
        origins: [routeMatrixWaypoint(options.input.origin)],
        routingPreference: "TRAFFIC_AWARE",
        travelMode: "DRIVE",
      },
      fetchImplementation: options.fetchImplementation,
      fieldMask: GOOGLE_ROUTES_MATRIX_FIELD_MASK,
      googleMapsApiKey: options.googleMapsApiKey,
      operation: "matrix",
      requestTimeout: options.requestTimeout,
      url: GOOGLE_ROUTES_MATRIX_URL,
    }).pipe(
      Effect.catchTags({
        GoogleRoutesFetchFailed: (failure) =>
          logAndFailGoogleRoutesProvider({
            cause: failure.cause,
            operation: "matrix",
            reason: "fetch_failed",
          }),
        GoogleRoutesJsonDecodeFailed: (failure) =>
          logAndFailGoogleRoutesProvider({
            cause: failure.cause,
            operation: "matrix",
            reason: "json_decode_failed",
          }),
        GoogleRoutesTimedOut: (failure) =>
          logAndFailGoogleRoutesProvider({
            operation: "matrix",
            reason: "request_timeout",
            requestTimeout: failure.requestTimeout,
          }),
      })
    );

    if (requestResult._tag === "HttpError") {
      return yield* logAndFailGoogleRoutesProvider({
        httpStatus: requestResult.status,
        operation: "matrix",
        providerMessage: requestResult.providerMessage,
        providerStatus: requestResult.providerStatus,
        reason: "http_error",
      });
    }

    const decoded = yield* decodeGoogleRouteMatrixResponse(
      requestResult.payload
    ).pipe(
      Effect.catchTag("SchemaError", (cause) =>
        logAndFailGoogleRoutesProvider({
          cause,
          operation: "matrix",
          reason: "response_parse_failed",
        })
      )
    );
    const computedAt = nowIsoString();
    const rows: RouteRankedDestination[] = [];
    const unavailableDestinationIds = new Set(
      options.input.destinations.map((destination) => destination.destinationId)
    );

    for (const element of decoded) {
      if (element.originIndex !== 0) {
        continue;
      }

      const destination = options.input.destinations[element.destinationIndex];
      if (destination === undefined) {
        continue;
      }

      if (
        !isRouteMatrixElementUsable(element) ||
        element.distanceMeters === undefined ||
        element.duration === undefined
      ) {
        continue;
      }

      const durationSeconds = parseGoogleDurationSeconds(element.duration);
      if (durationSeconds === undefined) {
        continue;
      }

      unavailableDestinationIds.delete(destination.destinationId);
      rows.push({
        destinationId: destination.destinationId,
        routeSummary: {
          computedAt,
          distanceMeters: element.distanceMeters,
          durationSeconds,
          provider: "google_routes",
          providerRequestKind: "matrix",
          routeStatus: "ok",
          trafficAware: true,
        },
      });
    }

    return {
      rows: rows.toSorted(
        (left, right) =>
          left.routeSummary.durationSeconds - right.routeSummary.durationSeconds
      ),
      unavailableDestinationIds: Array.from(unavailableDestinationIds),
    } satisfies RankRoutesResult;
  }).pipe(
    Effect.withSpan("RouteProvider.Google.rankRoutes", {
      attributes: {
        destinationCount: options.input.destinations.length,
        provider: "google_routes",
      },
    })
  );
}

function executePreviewRoute(options: {
  readonly costGuard: RouteCostGuardImplementation;
  readonly fetchImplementation: PortableFetch;
  readonly googleMapsApiKey: string;
  readonly input: RoutePreviewInput;
  readonly requestTimeout: Duration.Duration;
}): Effect.Effect<
  RoutePreviewResult,
  | ProximityCostGuardError
  | ProximityProviderError
  | ProximityRouteUnavailableError
> {
  return Effect.gen(function* executePreviewRouteEffect() {
    yield* options.costGuard.reserve({
      context: options.input.context,
      operation: "route_preview",
      units: 1,
    });
    const requestResult = yield* fetchGoogleRoutesPayload({
      body: {
        destination: routeWaypoint(options.input.destination.coordinates),
        origin: routeWaypoint(options.input.origin),
        ...(options.input.includeLine
          ? {
              polylineEncoding: "ENCODED_POLYLINE",
              polylineQuality: "OVERVIEW",
            }
          : {}),
        routingPreference: "TRAFFIC_AWARE",
        travelMode: "DRIVE",
      },
      fetchImplementation: options.fetchImplementation,
      fieldMask: options.input.includeLine
        ? GOOGLE_ROUTES_PREVIEW_LINE_FIELD_MASK
        : GOOGLE_ROUTES_PREVIEW_FIELD_MASK,
      googleMapsApiKey: options.googleMapsApiKey,
      operation: "route_preview",
      requestTimeout: options.requestTimeout,
      url: GOOGLE_ROUTES_DIRECTIONS_URL,
    }).pipe(
      Effect.catchTags({
        GoogleRoutesFetchFailed: (failure) =>
          logAndFailGoogleRoutesProvider({
            cause: failure.cause,
            operation: "route_preview",
            reason: "fetch_failed",
          }),
        GoogleRoutesJsonDecodeFailed: (failure) =>
          logAndFailGoogleRoutesProvider({
            cause: failure.cause,
            operation: "route_preview",
            reason: "json_decode_failed",
          }),
        GoogleRoutesTimedOut: (failure) =>
          logAndFailGoogleRoutesProvider({
            operation: "route_preview",
            reason: "request_timeout",
            requestTimeout: failure.requestTimeout,
          }),
      })
    );

    if (requestResult._tag === "HttpError") {
      return yield* logAndFailGoogleRoutesProvider({
        httpStatus: requestResult.status,
        operation: "route_preview",
        providerMessage: requestResult.providerMessage,
        providerStatus: requestResult.providerStatus,
        reason: "http_error",
      });
    }

    const decoded = yield* decodeGoogleComputeRoutesResponse(
      requestResult.payload
    ).pipe(
      Effect.catchTag("SchemaError", (cause) =>
        logAndFailGoogleRoutesProvider({
          cause,
          operation: "route_preview",
          reason: "response_parse_failed",
        })
      )
    );
    const [route] = decoded.routes ?? [];
    const durationSeconds =
      route?.duration === undefined
        ? undefined
        : parseGoogleDurationSeconds(route.duration);

    if (
      route === undefined ||
      route.distanceMeters === undefined ||
      durationSeconds === undefined
    ) {
      return yield* failRouteUnavailable();
    }

    const line: RouteDisplayLine | undefined =
      options.input.includeLine &&
      route.polyline?.encodedPolyline !== undefined &&
      route.polyline.encodedPolyline.trim().length > 0
        ? {
            encodedPolyline: route.polyline.encodedPolyline,
            format: "encoded_polyline",
          }
        : undefined;

    return {
      ...(line === undefined ? {} : { line }),
      routeSummary: {
        computedAt: nowIsoString(),
        distanceMeters: route.distanceMeters,
        durationSeconds,
        provider: "google_routes",
        providerRequestKind: "route_preview",
        routeStatus: "ok",
        trafficAware: true,
      },
    } satisfies RoutePreviewResult;
  }).pipe(
    Effect.withSpan("RouteProvider.Google.previewRoute", {
      attributes: {
        provider: "google_routes",
      },
    })
  );
}

function fetchGoogleRoutesPayload(options: {
  readonly body: unknown;
  readonly fetchImplementation: PortableFetch;
  readonly fieldMask: string;
  readonly googleMapsApiKey: string;
  readonly operation: "matrix" | "route_preview";
  readonly requestTimeout: Duration.Duration;
  readonly url: string;
}): Effect.Effect<GoogleRoutesRequestResult, GoogleRoutesRequestFailure> {
  return Effect.acquireUseRelease(
    Effect.sync(() => new AbortController()),
    (controller) =>
      Effect.gen(function* fetchGoogleRoutesPayloadEffect() {
        const response = yield* Effect.tryPromise({
          try: () =>
            options.fetchImplementation(options.url, {
              body: JSON.stringify(options.body),
              headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": options.googleMapsApiKey,
                "X-Goog-FieldMask": options.fieldMask,
              },
              method: "POST",
              signal: controller.signal,
            }),
          catch: (cause) =>
            ({
              _tag: "GoogleRoutesFetchFailed",
              cause,
            }) satisfies GoogleRoutesRequestFailure,
        });
        yield* Effect.annotateCurrentSpan("http.status", response.status);

        if (!response.ok) {
          const providerErrorDetails =
            yield* readGoogleErrorResponseDetails(response);

          return {
            _tag: "HttpError",
            ...providerErrorDetails,
            status: response.status,
          } satisfies GoogleRoutesRequestResult;
        }

        const payload = yield* Effect.tryPromise({
          try: () => response.json() as Promise<unknown>,
          catch: (cause) =>
            ({
              _tag: "GoogleRoutesJsonDecodeFailed",
              cause,
            }) satisfies GoogleRoutesRequestFailure,
        });

        return {
          _tag: "Success",
          payload,
        } satisfies GoogleRoutesRequestResult;
      }).pipe(
        Effect.timeoutOrElse({
          duration: options.requestTimeout,
          orElse: () =>
            Effect.fail({
              _tag: "GoogleRoutesTimedOut",
              requestTimeout: options.requestTimeout,
            } satisfies GoogleRoutesRequestFailure),
        }),
        Effect.withSpan("RouteProvider.Google.fetch", {
          attributes: {
            operation: options.operation,
            provider: "google_routes",
            requestTimeoutMs: Duration.toMillis(options.requestTimeout),
          },
        })
      ),
    (controller) => Effect.sync(() => controller.abort())
  );
}

function failRouteUnavailable(): Effect.Effect<
  never,
  ProximityRouteUnavailableError
> {
  return Effect.fail(
    new ProximityRouteUnavailableError({
      message: "No driving route was found for the selected destination",
      reason: "no_driving_route",
    })
  );
}

function logAndFailGoogleRoutesProvider(
  details: GoogleRoutesRequestFailureDetails
): Effect.Effect<never, ProximityProviderError> {
  return Effect.logWarning(GOOGLE_ROUTES_PROVIDER_FAILED_MESSAGE).pipe(
    Effect.annotateLogs({
      ...(details.cause === undefined
        ? {}
        : { failureCauseType: failureCauseName(details.cause) }),
      ...(details.httpStatus === undefined
        ? {}
        : { httpStatus: details.httpStatus }),
      operation: details.operation,
      provider: "google_routes",
      ...(details.providerStatus === undefined
        ? {}
        : { providerStatus: details.providerStatus }),
      reason: details.reason,
      ...(details.requestTimeout === undefined
        ? {}
        : { requestTimeoutMs: Duration.toMillis(details.requestTimeout) }),
    }),
    Effect.andThen(
      Effect.fail(
        new ProximityProviderError({
          message: GOOGLE_ROUTES_PROVIDER_FAILED_MESSAGE,
          provider: "google_routes",
          reason: details.reason,
        })
      )
    )
  );
}

function logAndFailGoogleRoutesProviderConfiguration(details: {
  readonly cause: unknown;
  readonly reason: string;
}): Effect.Effect<never, ProximityProviderError> {
  return Effect.logWarning(
    GOOGLE_ROUTES_PROVIDER_CONFIGURATION_FAILED_MESSAGE
  ).pipe(
    Effect.annotateLogs({
      failureCauseType: failureCauseName(details.cause),
      provider: "google_routes",
      reason: details.reason,
    }),
    Effect.andThen(
      Effect.fail(
        new ProximityProviderError({
          message: GOOGLE_ROUTES_PROVIDER_CONFIGURATION_FAILED_MESSAGE,
          provider: "google_routes",
          reason: details.reason,
        })
      )
    )
  );
}

function readGoogleErrorResponseDetails(response: Response) {
  return Effect.tryPromise({
    try: () => response.json() as Promise<unknown>,
    catch: () => null,
  }).pipe(
    Effect.orElseSucceed(() => null),
    Effect.map(extractGoogleErrorResponseDetails)
  );
}

function extractGoogleErrorResponseDetails(payload: unknown): {
  readonly providerMessage?: string;
  readonly providerStatus?: string;
} {
  const error =
    isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;

  if (error === undefined) {
    return {};
  }

  return {
    ...(typeof error.message === "string"
      ? { providerMessage: sanitizeProviderMessage(error.message) }
      : {}),
    ...(typeof error.status === "string"
      ? { providerStatus: error.status }
      : {}),
  };
}

function isRouteMatrixElementUsable(
  element: Schema.Schema.Type<typeof GoogleRouteMatrixElementSchema>
) {
  const status = isRecord(element.status) ? element.status : undefined;
  const statusCode = status?.code;

  return (
    (element.condition === undefined || element.condition === "ROUTE_EXISTS") &&
    (statusCode === undefined || statusCode === 0)
  );
}

function routeMatrixWaypoint(coordinates: ProximityCoordinates) {
  return {
    waypoint: routeWaypoint(coordinates),
  };
}

function routeWaypoint(coordinates: ProximityCoordinates) {
  return {
    location: {
      latLng: {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      },
    },
  };
}

function parseGoogleDurationSeconds(value: string) {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (match === null) {
    return undefined;
  }

  const durationSeconds = Number(match[1]);

  return Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : undefined;
}

function nowIsoString() {
  return decodeIsoDateTimeString(new Date().toISOString());
}

function rankRoutesCacheKey(input: RankRoutesInput) {
  return JSON.stringify({
    context: routeCostContextCacheValue(input.context),
    destinations: input.destinations,
    origin: input.origin,
  } satisfies SerializedRankRoutesCacheRequest);
}

function routePreviewCacheKey(input: RoutePreviewInput) {
  return JSON.stringify({
    context: routeCostContextCacheValue(input.context),
    destination: input.destination,
    includeLine: input.includeLine,
    origin: input.origin,
  } satisfies SerializedRoutePreviewCacheRequest);
}

function routeCostContextCacheValue(
  context: RouteCostContext
): SerializedRouteCostContext {
  return {
    actorUserId: context.actorUserId,
    ...(context.agentThreadId === undefined
      ? {}
      : { agentThreadId: context.agentThreadId }),
    organizationId: context.organizationId,
  };
}

function parseRankRoutesCacheKey(key: string): RankRoutesInput {
  const parsed = JSON.parse(key) as SerializedRankRoutesCacheRequest;

  return {
    context: parseRouteCostContext(parsed.context),
    destinations: parsed.destinations,
    origin: parsed.origin,
  };
}

function parseRoutePreviewCacheKey(key: string): RoutePreviewInput {
  const parsed = JSON.parse(key) as SerializedRoutePreviewCacheRequest;

  return {
    context: parseRouteCostContext(parsed.context),
    destination: parsed.destination,
    includeLine: parsed.includeLine,
    origin: parsed.origin,
  };
}

function parseRouteCostContext(
  context: SerializedRouteCostContext
): RouteCostContext {
  return {
    actorUserId: decodeUserId(context.actorUserId),
    ...(context.agentThreadId === undefined
      ? {}
      : { agentThreadId: context.agentThreadId }),
    organizationId: decodeOrganizationId(context.organizationId),
  };
}

function failureCauseName(cause: unknown) {
  if (cause instanceof Error) {
    return cause.name;
  }

  return typeof cause;
}

function sanitizeProviderMessage(value: string | undefined) {
  return value
    ?.replaceAll(/([?&]key=)[^&\s]+/gi, "$1[redacted]")
    .replaceAll(/\bkey=([^\s&]+)/gi, "key=[redacted]")
    .slice(0, 240);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeRedactedGoogleRoutesApiKey(value: Redacted.Redacted<string>) {
  return decodeGoogleRoutesApiKey(Redacted.value(value)).pipe(
    Effect.map((googleMapsApiKey) => Redacted.make(googleMapsApiKey)),
    Effect.catchTag("SchemaError", (error) =>
      Effect.fail(new Config.ConfigError(error))
    )
  );
}

const googleMapsApiKeyConfig = Config.redacted("GOOGLE_MAPS_API_KEY").pipe(
  Config.mapOrFail(decodeRedactedGoogleRoutesApiKey)
);
const googleRoutesApiKeyConfig = Config.redacted(
  "GOOGLE_MAPS_ROUTES_API_KEY"
).pipe(
  Config.mapOrFail(decodeRedactedGoogleRoutesApiKey),
  Config.orElse(() => googleMapsApiKeyConfig)
);

export class RouteProvider extends Context.Service<
  RouteProvider,
  RouteProviderImplementation
>()("@ceird/domains/proximity/RouteProvider") {
  static readonly previewRoute = (input: RoutePreviewInput) =>
    RouteProvider.use((service) => service.previewRoute(input));

  static readonly rankRoutes = (input: RankRoutesInput) =>
    RouteProvider.use((service) => service.rankRoutes(input));

  static readonly Google = Layer.succeed(
    RouteProvider,
    RouteProvider.of({
      previewRoute: (input) =>
        getConfiguredWarmGoogleRoutesProvider().pipe(
          Effect.flatMap((provider) => provider.previewRoute(input))
        ),
      rankRoutes: (input) =>
        getConfiguredWarmGoogleRoutesProvider().pipe(
          Effect.flatMap((provider) => provider.rankRoutes(input))
        ),
    })
  );
}
