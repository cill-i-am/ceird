import type { OrganizationId, UserId } from "@ceird/identity-core";
import {
  IsoDateTimeString,
  PROXIMITY_PROVIDER_ERROR_TAG,
  PROXIMITY_ROUTE_UNAVAILABLE_ERROR_TAG,
  ProximityOriginSummarySchema,
  ProximityResultMetadataSchema,
  ProximityCostGuardError,
  type ProximityCoordinates,
  type ProximityExcludedCount,
  type ProximityOriginInput,
  type ProximityOriginSummary,
  ProximityProviderError,
  ProximityRouteUnavailableError,
  type ProximityResultMetadata,
  type RouteDisplayLine,
  type RouteSummary,
} from "@ceird/proximity-core";
import { Context, Effect, Layer, Option, Schema } from "effect";

import { RouteProvider } from "./route-provider.js";
import type { RouteCostContext, RouteDestination } from "./route-provider.js";

export const ROUTE_PROXIMITY_RANKED_CANDIDATE_LIMIT = 100;
const DEFAULT_PROXIMITY_LIMIT = 10;
const MAX_PROXIMITY_LIMIT = 25;

const decodeIsoDateTimeString = Schema.decodeUnknownSync(IsoDateTimeString);
const decodeOriginSummary = Schema.decodeUnknownSync(
  ProximityOriginSummarySchema
);
const decodeResultMetadata = Schema.decodeUnknownSync(
  ProximityResultMetadataSchema
);

export interface RouteProximityCandidate<Row> {
  readonly coordinates: ProximityCoordinates;
  readonly destinationId: string;
  readonly row: Row;
}

export interface RouteProximityRankInput<Row> {
  readonly candidateCount: number;
  readonly candidateLimitApplied: boolean;
  readonly candidates: readonly RouteProximityCandidate<Row>[];
  readonly context: RouteCostContext;
  readonly excluded?: readonly ProximityExcludedCount[];
  readonly includeRouteLines?: boolean;
  readonly limit?: number;
  readonly origin: ProximityOriginInput;
}

export interface RouteProximityRankedRow<Row> {
  readonly routeLine?: RouteDisplayLine;
  readonly routeSummary: RouteSummary;
  readonly row: Row;
}

export interface RouteProximityRankResult<Row> {
  readonly meta: ProximityResultMetadata;
  readonly origin: ProximityOriginSummary;
  readonly rows: readonly RouteProximityRankedRow<Row>[];
}

export interface RouteProximityPreviewInput {
  readonly context: RouteCostContext;
  readonly destination: RouteDestination;
  readonly includeRouteLine?: boolean;
  readonly origin: ProximityOriginInput;
}

export interface RouteProximityPreviewResult {
  readonly origin: ProximityOriginSummary;
  readonly routeLine?: RouteDisplayLine;
  readonly routeSummary: RouteSummary;
}

export interface RouteProximityServiceImplementation {
  readonly preview: (
    input: RouteProximityPreviewInput
  ) => Effect.Effect<
    RouteProximityPreviewResult,
    | ProximityCostGuardError
    | ProximityProviderError
    | ProximityRouteUnavailableError
  >;
  readonly rank: <Row>(
    input: RouteProximityRankInput<Row>
  ) => Effect.Effect<
    RouteProximityRankResult<Row>,
    | ProximityCostGuardError
    | ProximityProviderError
    | ProximityRouteUnavailableError
  >;
}

export interface RouteInvocationContextImplementation {
  readonly agentThreadId?: string;
}

export class RouteInvocationContext extends Context.Service<
  RouteInvocationContext,
  RouteInvocationContextImplementation
>()("@ceird/domains/proximity/RouteInvocationContext") {}

export class RouteProximityService extends Context.Service<
  RouteProximityService,
  RouteProximityServiceImplementation
>()("@ceird/domains/proximity/RouteProximityService", {
  make: Effect.gen(function* RouteProximityServiceLive() {
    const routeProvider = yield* RouteProvider;

    const rank = Effect.fn("RouteProximityService.rank")(function* <Row>(
      input: RouteProximityRankInput<Row>
    ) {
      const limit = normalizeProximityLimit(input.limit);
      const origin = makeOriginSummary(input.origin);
      yield* Effect.annotateCurrentSpan("candidateCount", input.candidateCount);
      yield* Effect.annotateCurrentSpan(
        "candidateLimitApplied",
        input.candidateLimitApplied
      );
      yield* Effect.annotateCurrentSpan("rankedCandidateLimit", 100);

      if (input.candidates.length === 0) {
        return {
          meta: makeMetadata({
            candidateCount: input.candidateCount,
            candidateLimitApplied: input.candidateLimitApplied,
            excluded: input.excluded ?? [],
          }),
          origin,
          rows: [],
        } satisfies RouteProximityRankResult<Row>;
      }

      const rankResult = yield* routeProvider.rankRoutes({
        context: input.context,
        destinations: input.candidates.map((candidate) => ({
          coordinates: candidate.coordinates,
          destinationId: candidate.destinationId,
        })),
        origin: input.origin.coordinates,
      });
      const candidatesById = new Map(
        input.candidates.map((candidate, index) => [
          candidate.destinationId,
          { candidate, index },
        ])
      );
      const routeRows = rankResult.rows
        .flatMap((row) => {
          const match = candidatesById.get(row.destinationId);

          return match === undefined
            ? []
            : [
                {
                  index: match.index,
                  routeSummary: row.routeSummary,
                  row: match.candidate.row,
                  destination: {
                    coordinates: match.candidate.coordinates,
                    destinationId: match.candidate.destinationId,
                  },
                },
              ];
        })
        .toSorted((left, right) => {
          const durationDifference =
            left.routeSummary.durationSeconds -
            right.routeSummary.durationSeconds;

          if (durationDifference !== 0) {
            return durationDifference;
          }

          const distanceDifference =
            left.routeSummary.distanceMeters -
            right.routeSummary.distanceMeters;

          return distanceDifference === 0
            ? left.index - right.index
            : distanceDifference;
        });
      const selectedRouteRows = routeRows.slice(0, limit);
      const rows =
        input.includeRouteLines === true
          ? yield* Effect.all(
              selectedRouteRows.map((row) =>
                routeProvider
                  .previewRoute({
                    context: input.context,
                    destination: row.destination,
                    includeLine: true,
                    origin: input.origin.coordinates,
                  })
                  .pipe(
                    Effect.map((preview) => ({
                      routeLine: preview.line,
                      routeSummary: row.routeSummary,
                      row: row.row,
                    })),
                    Effect.catchTags({
                      [PROXIMITY_PROVIDER_ERROR_TAG]: () =>
                        Effect.succeed({
                          routeSummary: row.routeSummary,
                          row: row.row,
                        }),
                      [PROXIMITY_ROUTE_UNAVAILABLE_ERROR_TAG]: () =>
                        Effect.succeed({
                          routeSummary: row.routeSummary,
                          row: row.row,
                        }),
                    })
                  )
              ),
              { concurrency: 3 }
            )
          : selectedRouteRows.map((row) => ({
              routeSummary: row.routeSummary,
              row: row.row,
            }));

      return {
        meta: makeMetadata({
          candidateCount: input.candidateCount,
          candidateLimitApplied: input.candidateLimitApplied,
          excluded: mergeExcludedCounts([
            ...(input.excluded ?? []),
            {
              count: rankResult.unavailableDestinationIds.length,
              reason: "no_driving_route",
            },
          ]),
        }),
        origin,
        rows,
      } satisfies RouteProximityRankResult<Row>;
    });

    const preview = Effect.fn("RouteProximityService.preview")(function* (
      input: RouteProximityPreviewInput
    ) {
      const origin = makeOriginSummary(input.origin);
      const previewResult = yield* routeProvider.previewRoute({
        context: input.context,
        destination: input.destination,
        includeLine: input.includeRouteLine === true,
        origin: input.origin.coordinates,
      });

      return {
        origin,
        routeLine: previewResult.line,
        routeSummary: previewResult.routeSummary,
      } satisfies RouteProximityPreviewResult;
    });

    return {
      preview,
      rank,
    } satisfies RouteProximityServiceImplementation;
  }),
}) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    RouteProximityService,
    RouteProximityService.make
  );
  static readonly Default =
    RouteProximityService.DefaultWithoutDependencies.pipe(
      Layer.provide(RouteProvider.Google)
    );
}

export function makeRouteCostContext(input: {
  readonly actorUserId: UserId;
  readonly agentThreadId?: string;
  readonly organizationId: OrganizationId;
}): RouteCostContext {
  return input;
}

export function makeCurrentRouteCostContext(input: {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
}): Effect.Effect<RouteCostContext> {
  return Effect.serviceOption(RouteInvocationContext).pipe(
    Effect.map((context) =>
      makeRouteCostContext({
        actorUserId: input.actorUserId,
        agentThreadId: Option.getOrUndefined(context)?.agentThreadId,
        organizationId: input.organizationId,
      })
    )
  );
}

function normalizeProximityLimit(limit: number | undefined) {
  return Math.min(
    MAX_PROXIMITY_LIMIT,
    Math.max(1, limit ?? DEFAULT_PROXIMITY_LIMIT)
  );
}

function makeMetadata(input: {
  readonly candidateCount: number;
  readonly candidateLimitApplied: boolean;
  readonly excluded: readonly ProximityExcludedCount[];
}) {
  return decodeResultMetadata({
    candidateCount: input.candidateCount,
    candidateLimitApplied: input.candidateLimitApplied,
    excluded: mergeExcludedCounts([
      ...input.excluded,
      ...(input.candidateLimitApplied
        ? [
            {
              count: Math.max(
                0,
                input.candidateCount - ROUTE_PROXIMITY_RANKED_CANDIDATE_LIMIT
              ),
              reason: "candidate_cap" as const,
            },
          ]
        : []),
    ]),
    rankedCandidateLimit: ROUTE_PROXIMITY_RANKED_CANDIDATE_LIMIT,
  });
}

function makeOriginSummary(origin: ProximityOriginInput) {
  return decodeOriginSummary({
    accuracyMeters:
      origin.mode === "current_location" ? origin.accuracyMeters : undefined,
    computedAt: nowIsoString(),
    coordinates: origin.coordinates,
    displayText:
      origin.mode === "current_location"
        ? "Current location"
        : origin.displayText,
    mode: origin.mode,
  });
}

function mergeExcludedCounts(
  excluded: readonly ProximityExcludedCount[]
): readonly ProximityExcludedCount[] {
  const counts = new Map<ProximityExcludedCount["reason"], number>();

  for (const item of excluded) {
    if (item.count <= 0) {
      continue;
    }

    counts.set(item.reason, (counts.get(item.reason) ?? 0) + item.count);
  }

  return Array.from(counts.entries()).map(([reason, count]) => ({
    count,
    reason,
  }));
}

function nowIsoString() {
  return decodeIsoDateTimeString(new Date().toISOString());
}
