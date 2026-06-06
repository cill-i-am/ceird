import { decodeOrganizationId, decodeUserId } from "@ceird/identity-core";
import { ProximityProviderError } from "@ceird/proximity-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { RouteProvider } from "./route-provider.js";
import { RouteProximityService } from "./service.js";

const context = {
  actorUserId: decodeUserId("user_123"),
  organizationId: decodeOrganizationId("org_123"),
} as const;

describe("RouteProximityService", () => {
  it("keeps matrix summaries canonical when enriching rows with route lines", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* RouteProximityService;

        return yield* service.rank({
          candidateCount: 2,
          candidateLimitApplied: false,
          candidates: [
            {
              coordinates: { latitude: 53.34, longitude: -6.26 },
              destinationId: "site-a",
              row: { id: "site-a" },
            },
            {
              coordinates: { latitude: 53.36, longitude: -6.3 },
              destinationId: "site-b",
              row: { id: "site-b" },
            },
          ],
          context,
          includeRouteLines: true,
          origin: {
            coordinates: { latitude: 53.35, longitude: -6.27 },
            mode: "current_location",
          },
        });
      }).pipe(
        Effect.provide(RouteProximityService.DefaultWithoutDependencies),
        Effect.provide(
          Layer.succeed(
            RouteProvider,
            RouteProvider.of({
              previewRoute: (input) =>
                Effect.succeed({
                  line: {
                    encodedPolyline: `line-${input.destination.destinationId}`,
                    format: "encoded_polyline" as const,
                  },
                  routeSummary: {
                    computedAt: "2026-06-06T10:00:01.000Z",
                    distanceMeters: 1,
                    durationSeconds: 1,
                    provider: "google_routes",
                    providerRequestKind: "route_preview",
                    routeStatus: "ok",
                    trafficAware: true,
                  },
                }),
              rankRoutes: () =>
                Effect.succeed({
                  rows: [
                    {
                      destinationId: "site-a",
                      routeSummary: {
                        computedAt: "2026-06-06T10:00:00.000Z",
                        distanceMeters: 2_000,
                        durationSeconds: 400,
                        provider: "google_routes",
                        providerRequestKind: "matrix",
                        routeStatus: "ok",
                        trafficAware: true,
                      },
                    },
                    {
                      destinationId: "site-b",
                      routeSummary: {
                        computedAt: "2026-06-06T10:00:00.000Z",
                        distanceMeters: 2_500,
                        durationSeconds: 500,
                        provider: "google_routes",
                        providerRequestKind: "matrix",
                        routeStatus: "ok",
                        trafficAware: true,
                      },
                    },
                  ],
                  unavailableDestinationIds: [],
                }),
            })
          )
        )
      )
    );

    expect(result.rows.map((row) => row.routeSummary)).toMatchObject([
      {
        distanceMeters: 2_000,
        durationSeconds: 400,
        providerRequestKind: "matrix",
      },
      {
        distanceMeters: 2_500,
        durationSeconds: 500,
        providerRequestKind: "matrix",
      },
    ]);
    expect(result.rows.map((row) => row.routeLine)).toStrictEqual([
      { encodedPolyline: "line-site-a", format: "encoded_polyline" },
      { encodedPolyline: "line-site-b", format: "encoded_polyline" },
    ]);
  });

  it("keeps ranked rows when optional route line enrichment fails", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* RouteProximityService;

        return yield* service.rank({
          candidateCount: 2,
          candidateLimitApplied: false,
          candidates: [
            {
              coordinates: { latitude: 53.34, longitude: -6.26 },
              destinationId: "site-a",
              row: { id: "site-a" },
            },
            {
              coordinates: { latitude: 53.36, longitude: -6.3 },
              destinationId: "site-b",
              row: { id: "site-b" },
            },
          ],
          context,
          includeRouteLines: true,
          origin: {
            coordinates: { latitude: 53.35, longitude: -6.27 },
            mode: "current_location",
          },
        });
      }).pipe(
        Effect.provide(RouteProximityService.DefaultWithoutDependencies),
        Effect.provide(
          Layer.succeed(
            RouteProvider,
            RouteProvider.of({
              previewRoute: (input) =>
                input.destination.destinationId === "site-a"
                  ? Effect.fail(
                      new ProximityProviderError({
                        message: "Route line preview failed",
                        provider: "google_routes",
                        reason: "test_failure",
                      })
                    )
                  : Effect.succeed({
                      line: {
                        encodedPolyline: "line-site-b",
                        format: "encoded_polyline" as const,
                      },
                      routeSummary: {
                        computedAt: "2026-06-06T10:00:01.000Z",
                        distanceMeters: 1,
                        durationSeconds: 1,
                        provider: "google_routes",
                        providerRequestKind: "route_preview",
                        routeStatus: "ok",
                        trafficAware: true,
                      },
                    }),
              rankRoutes: () =>
                Effect.succeed({
                  rows: [
                    {
                      destinationId: "site-a",
                      routeSummary: {
                        computedAt: "2026-06-06T10:00:00.000Z",
                        distanceMeters: 2_000,
                        durationSeconds: 400,
                        provider: "google_routes",
                        providerRequestKind: "matrix",
                        routeStatus: "ok",
                        trafficAware: true,
                      },
                    },
                    {
                      destinationId: "site-b",
                      routeSummary: {
                        computedAt: "2026-06-06T10:00:00.000Z",
                        distanceMeters: 2_500,
                        durationSeconds: 500,
                        provider: "google_routes",
                        providerRequestKind: "matrix",
                        routeStatus: "ok",
                        trafficAware: true,
                      },
                    },
                  ],
                  unavailableDestinationIds: [],
                }),
            })
          )
        )
      )
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.routeLine).toBeUndefined();
    expect(result.rows[1]?.routeLine).toStrictEqual({
      encodedPolyline: "line-site-b",
      format: "encoded_polyline",
    });
  });
});
