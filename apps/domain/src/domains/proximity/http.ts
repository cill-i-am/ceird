import {
  GooglePlaceId as ProximityGooglePlaceId,
  ProximityAccessDeniedError,
  ProximityCostGuardError,
  ProximityOriginResolutionError,
  ProximityProviderError,
  signProximityOriginToken,
} from "@ceird/proximity-core";
import type {
  ProximityOriginAutocompleteInput,
  ProximityOriginPlaceDetailsInput,
  UnsignedTypedOrigin,
} from "@ceird/proximity-core";
import {
  GooglePlaceId as SiteGooglePlaceId,
  GooglePlacesSessionToken as SiteGooglePlacesSessionToken,
  SITE_LOCATION_PROVIDER_ERROR_TAG,
  SITE_LOCATION_RESOLUTION_ERROR_TAG,
  SiteCountrySchema,
} from "@ceird/sites-core";
import type {
  SiteLocationAutocompleteInput,
  SiteLocationPlaceDetailsInput,
  SiteLocationProviderError,
  SiteLocationResolutionError,
} from "@ceird/sites-core";
import { Config, Effect, Layer, Schema } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { mapOrganizationActorResolutionErrors } from "../organizations/actor-access.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import {
  ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
  ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
} from "../organizations/errors.js";
import { SiteLocationProvider } from "../sites/location-provider.js";

const ORIGIN_LOOKUP_COST_GUARD_WINDOW_MS = 60_000;
const ORIGIN_LOOKUP_COST_GUARD_ACTOR_LIMIT = 120;
const ORIGIN_LOOKUP_COST_GUARD_ORGANIZATION_LIMIT = 2000;
const DEFAULT_PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS = 15 * 60;
const originLookupCostGuardCounters = new Map<string, OriginLookupCounter>();

interface OriginLookupCounter {
  readonly resetAtMillis: number;
  readonly used: number;
}

const decodeProximityGooglePlaceId = Schema.decodeUnknownSync(
  ProximityGooglePlaceId
);
const decodeSiteCountry = Schema.decodeUnknownSync(SiteCountrySchema);
const decodeSiteGooglePlaceId = Schema.decodeUnknownSync(SiteGooglePlaceId);
const decodeSiteGooglePlacesSessionToken = Schema.decodeUnknownSync(
  SiteGooglePlacesSessionToken
);

const observeProximityOperation = (operation: string) =>
  observeApiOperation({
    domain: "proximity",
    operation,
    service: "ProximityHttp",
  });

const ProximityHttpConfig = Config.all({
  originTokenSecret: Config.string("AGENT_INTERNAL_SECRET"),
  originTokenTtlSeconds: Config.int("PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS").pipe(
    Config.withDefault(DEFAULT_PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS),
    Config.mapOrFail(
      decodePositiveIntegerConfig("PROXIMITY_ORIGIN_TOKEN_TTL_SECONDS")
    )
  ),
});
const loadProximityHttpConfig = ProximityHttpConfig.pipe(
  Effect.mapError(
    () =>
      new ProximityProviderError({
        message: "Origin proof could not be issued.",
        provider: "google_places",
        reason: "origin_token_signing_failed",
      })
  )
);

const ProximityHandlersLive = HttpApiBuilder.group(
  AppApi,
  "proximity",
  (handlers) =>
    Effect.gen(function* () {
      const authorization = yield* OrganizationAuthorization;
      const currentOrganizationActor = yield* CurrentOrganizationActor;
      const siteLocationProvider = yield* SiteLocationProvider;

      const loadActor = () =>
        currentOrganizationActor.get().pipe(
          mapOrganizationActorResolutionErrors(
            (message) =>
              new ProximityAccessDeniedError({
                message,
              })
          ),
          Effect.catchTag(ORGANIZATION_ACTOR_STORAGE_ERROR_TAG, () =>
            Effect.fail(
              new ProximityAccessDeniedError({
                message: "Cannot resolve the current organization actor.",
              })
            )
          )
        );

      const ensureCanUseOriginLookup = Effect.fn(
        "ProximityHttp.ensureCanUseOriginLookup"
      )(function* () {
        const actor = yield* loadActor();
        yield* authorization.ensureCanViewOrganizationData(actor).pipe(
          Effect.catchTag(
            ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
            (error) =>
              Effect.fail(
                new ProximityAccessDeniedError({
                  message: error.message,
                })
              )
          )
        );

        return actor;
      });

      return handlers
        .handle("autocompleteOrigin", ({ payload }) =>
          Effect.gen(function* () {
            const actor = yield* ensureCanUseOriginLookup();
            yield* Effect.annotateCurrentSpan("action", "autocompleteOrigin");
            yield* Effect.annotateCurrentSpan(
              "organizationId",
              actor.organizationId
            );
            yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
            yield* Effect.annotateCurrentSpan("actorRole", actor.role);
            yield* reserveOriginLookup(actor);

            const response = yield* siteLocationProvider
              .autocomplete(toSiteAutocompleteInput(payload))
              .pipe(
                Effect.catchTag(
                  SITE_LOCATION_PROVIDER_ERROR_TAG,
                  failProximityProviderError
                )
              );

            return {
              suggestions: response.suggestions.map((suggestion) => ({
                displayText: suggestion.displayText,
                placeId: decodeProximityGooglePlaceId(suggestion.placeId),
                secondaryText: suggestion.secondaryText,
              })),
            };
          }).pipe(observeProximityOperation("autocompleteOrigin"))
        )
        .handle("getOriginPlaceDetails", ({ payload }) =>
          Effect.gen(function* () {
            const actor = yield* ensureCanUseOriginLookup();
            yield* Effect.annotateCurrentSpan(
              "action",
              "getOriginPlaceDetails"
            );
            yield* Effect.annotateCurrentSpan(
              "organizationId",
              actor.organizationId
            );
            yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
            yield* Effect.annotateCurrentSpan("actorRole", actor.role);
            yield* reserveOriginLookup(actor);

            const location = yield* siteLocationProvider
              .resolvePlace(toSitePlaceDetailsInput(payload))
              .pipe(
                Effect.catchTag(
                  SITE_LOCATION_PROVIDER_ERROR_TAG,
                  failProximityProviderError
                ),
                Effect.catchTag(
                  SITE_LOCATION_RESOLUTION_ERROR_TAG,
                  failProximityOriginResolutionError
                )
              );

            const origin = {
              coordinates: {
                latitude: location.latitude,
                longitude: location.longitude,
              },
              displayText: location.displayLocation,
              mode: "typed_origin" as const,
              placeId: decodeProximityGooglePlaceId(location.googlePlaceId),
            } satisfies UnsignedTypedOrigin;
            const config = yield* loadProximityHttpConfig;
            const originToken = yield* signOriginToken({
              origin,
              originTokenSecret: config.originTokenSecret,
              originTokenTtlSeconds: config.originTokenTtlSeconds,
            });

            return {
              origin: {
                ...origin,
                originToken,
              },
            };
          }).pipe(observeProximityOperation("getOriginPlaceDetails"))
        );
    })
);

export const ProximityHttpLive = Layer.mergeAll(
  DomainCorsLive,
  ProximityHandlersLive
).pipe(
  Layer.provide(
    Layer.mergeAll(
      CurrentOrganizationActor.Default,
      OrganizationAuthorization.Default
    )
  )
);

function reserveOriginLookup(actor: OrganizationActor) {
  return Effect.sync(() => {
    const now = Date.now();
    const scopes = [
      {
        id: actor.userId,
        limit: ORIGIN_LOOKUP_COST_GUARD_ACTOR_LIMIT,
        scope: "actor" as const,
      },
      {
        id: actor.organizationId,
        limit: ORIGIN_LOOKUP_COST_GUARD_ORGANIZATION_LIMIT,
        scope: "organization" as const,
      },
    ];
    const nextCounters = scopes.map((scope) => {
      const key = `origin_lookup:${scope.scope}:${scope.id}`;
      const current = originLookupCostGuardCounters.get(key);
      const counter =
        current === undefined || current.resetAtMillis <= now
          ? {
              resetAtMillis: now + ORIGIN_LOOKUP_COST_GUARD_WINDOW_MS,
              used: 0,
            }
          : current;

      return { ...scope, counter, key };
    });
    const blockedScope = nextCounters.find(
      (scope) => scope.counter.used + 1 > scope.limit
    );

    if (blockedScope !== undefined) {
      return new ProximityCostGuardError({
        limit: blockedScope.limit,
        message: "Origin lookup cost guard limit reached",
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((blockedScope.counter.resetAtMillis - now) / 1000)
        ),
        scope: blockedScope.scope,
      });
    }

    for (const scope of nextCounters) {
      originLookupCostGuardCounters.set(scope.key, {
        resetAtMillis: scope.counter.resetAtMillis,
        used: scope.counter.used + 1,
      });
    }
  }).pipe(
    Effect.flatMap((error) =>
      error === undefined ? Effect.void : Effect.fail(error)
    )
  );
}

function signOriginToken(input: {
  readonly origin: UnsignedTypedOrigin;
  readonly originTokenSecret: string;
  readonly originTokenTtlSeconds: number;
}) {
  return Effect.tryPromise({
    catch: () =>
      new ProximityProviderError({
        message: "Origin proof could not be issued.",
        provider: "google_places",
        reason: "origin_token_signing_failed",
      }),
    try: () =>
      signProximityOriginToken({
        origin: input.origin,
        secret: input.originTokenSecret,
        ttlSeconds: input.originTokenTtlSeconds,
      }),
  });
}

function decodePositiveIntegerConfig(configKey: string) {
  const schema = Schema.Int.check(
    Schema.isGreaterThanOrEqualTo(1, {
      message: `${configKey} must be a positive integer`,
    })
  );

  return (value: number) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError((error) => new Config.ConfigError(error))
    );
}

function toSiteAutocompleteInput(
  input: ProximityOriginAutocompleteInput
): SiteLocationAutocompleteInput {
  return {
    country:
      input.country === undefined
        ? undefined
        : decodeSiteCountry(input.country),
    input: input.input,
    sessionToken: decodeSiteGooglePlacesSessionToken(input.sessionToken),
  };
}

function toSitePlaceDetailsInput(
  input: ProximityOriginPlaceDetailsInput
): SiteLocationPlaceDetailsInput {
  return {
    placeId: decodeSiteGooglePlaceId(input.placeId),
    rawInput: input.rawInput,
    sessionToken: decodeSiteGooglePlacesSessionToken(input.sessionToken),
  };
}

function failProximityProviderError(error: SiteLocationProviderError) {
  return Effect.fail(
    new ProximityProviderError({
      message: error.message,
      provider: "google_places",
      reason: error.reason,
    })
  );
}

function failProximityOriginResolutionError(
  error: SiteLocationResolutionError
) {
  return Effect.fail(
    new ProximityOriginResolutionError({
      message: error.message,
      operation: error.operation ?? "place_details",
      reason: "place_details_unresolved",
    })
  );
}
