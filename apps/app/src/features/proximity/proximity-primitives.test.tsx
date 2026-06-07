import type {
  ProximityOriginInput,
  ProximityResultMetadata,
  TypedOrigin,
} from "@ceird/proximity-core";
import { Effect } from "effect";

import type { BrowserGeolocationCoordinates } from "#/lib/browser-geolocation";

import { buildMapsHandoffUrl, buildMapsHandoffUrls } from "./maps-handoff";
import {
  formatCandidateCapLabel,
  formatOriginAccuracy,
  formatRouteComputedAt,
  formatRouteDistance,
  formatRouteDuration,
} from "./proximity-format";
import {
  makeCurrentLocationOrigin,
  requestCurrentLocationOrigin,
} from "./proximity-location-access";
import {
  DEFAULT_PROXIMITY_RESULT_LIMIT,
  PROXIMITY_RESULT_LIMIT_OPTIONS,
  buildProximityRunRequest,
  getResolvedProximityOrigin,
  normalizeProximityResultLimit,
} from "./proximity-state";

const currentLocationCoordinates: BrowserGeolocationCoordinates = {
  accuracy: 18,
  latitude: 53.349_805,
  longitude: -6.260_31,
};

const typedOrigin: TypedOrigin = {
  coordinates: {
    latitude: 53.3478,
    longitude: -6.1956,
  },
  displayText: "Dublin Port, Dublin, Ireland",
  mode: "typed_origin",
  originToken: "v1.typedOrigin.testSignature" as TypedOrigin["originToken"],
  placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" as TypedOrigin["placeId"],
};

const origin: ProximityOriginInput = makeCurrentLocationOrigin(
  currentLocationCoordinates
);

describe("proximity shared primitives", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults result limits to 10 and only allows supported UI limits", () => {
    expect(DEFAULT_PROXIMITY_RESULT_LIMIT).toBe(10);
    expect(PROXIMITY_RESULT_LIMIT_OPTIONS).toStrictEqual([10, 15, 20, 25]);
    expect(normalizeProximityResultLimit()).toBe(10);
    expect(normalizeProximityResultLimit("15")).toBe(15);
    expect(normalizeProximityResultLimit(25)).toBe(25);
    expect(normalizeProximityResultLimit("100")).toBe(10);
  });

  it("does not build a proximity request before an origin is resolved", () => {
    expect(
      buildProximityRunRequest({
        includeRouteLines: false,
        limit: 25,
        originState: { status: "idle" },
      })
    ).toBeNull();

    expect(getResolvedProximityOrigin({ status: "idle" })).toBeNull();
  });

  it("builds proximity requests from resolved current or typed origins", () => {
    expect(
      buildProximityRunRequest({
        includeRouteLines: true,
        limit: 15,
        originState: { origin, status: "current_location_ready" },
      })
    ).toStrictEqual({
      includeRouteLines: true,
      limit: 15,
      origin,
    });

    expect(
      getResolvedProximityOrigin({
        origin: typedOrigin,
        status: "typed_origin_selected",
      })
    ).toStrictEqual(typedOrigin);
  });

  it("maps browser current location to the current-location origin without persisting coordinates", async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const pushStateSpy = vi.spyOn(window.history, "pushState");

    const resolvedOrigin = await Effect.runPromise(
      requestCurrentLocationOrigin(() =>
        Effect.succeed(currentLocationCoordinates)
      )
    );

    expect(resolvedOrigin).toStrictEqual({
      accuracyMeters: 18,
      coordinates: {
        latitude: 53.349_805,
        longitude: -6.260_31,
      },
      mode: "current_location",
    });
    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it("formats route summary values using route-aware vocabulary", () => {
    expect(formatRouteDuration(480)).toBe("8 min");
    expect(formatRouteDuration(3900)).toBe("1 hr 5 min");
    expect(formatRouteDistance(840)).toBe("840 m");
    expect(formatRouteDistance(3200)).toBe("3.2 km");
    expect(formatOriginAccuracy(18)).toBe("within 18 m");
    expect(
      formatRouteComputedAt("2026-06-06T08:41:00.000Z", {
        locale: "en-IE",
        timeZone: "Europe/Dublin",
      })
    ).toBe("Computed at 09:41");
  });

  it("formats candidate-cap metadata calmly", () => {
    const meta = {
      candidateCount: 135,
      candidateLimitApplied: true,
      excluded: [{ count: 35, reason: "candidate_cap" }],
      rankedCandidateLimit: 100,
    } satisfies ProximityResultMetadata;

    expect(formatCandidateCapLabel(meta, "jobs", 10)).toBe(
      "Ranked 100 eligible jobs, showing 10"
    );
  });

  it("builds default, Google, and Apple maps handoff URLs from origin and destination coordinates", () => {
    const destination = {
      latitude: 53.351,
      longitude: -6.255,
    };

    const googleUrl = new URL(
      buildMapsHandoffUrl({
        destination,
        destinationLabel: "14 Willow Close",
        origin: origin.coordinates,
        provider: "google",
      })
    );
    expect(googleUrl.origin).toBe("https://www.google.com");
    expect(googleUrl.searchParams.get("api")).toBe("1");
    expect(googleUrl.searchParams.get("origin")).toBe("53.349805,-6.26031");
    expect(googleUrl.searchParams.get("destination")).toBe("53.351,-6.255");
    expect(googleUrl.searchParams.get("travelmode")).toBe("driving");

    const appleUrl = new URL(
      buildMapsHandoffUrl({
        destination,
        destinationLabel: "14 Willow Close",
        origin: origin.coordinates,
        provider: "apple",
      })
    );
    expect(appleUrl.origin).toBe("https://maps.apple.com");
    expect(appleUrl.searchParams.get("saddr")).toBe("53.349805,-6.26031");
    expect(appleUrl.searchParams.get("daddr")).toBe("53.351,-6.255");
    expect(appleUrl.searchParams.get("q")).toBe("14 Willow Close");
    expect(appleUrl.searchParams.get("dirflg")).toBe("d");
    expect(
      buildMapsHandoffUrls({
        destination,
        destinationLabel: "14 Willow Close",
        origin: origin.coordinates,
      }).default.url
    ).toContain("travelmode=driving");
  });

  it("uses mobile default-map schemes for primary maps handoff where supported", () => {
    const destination = {
      latitude: 53.351,
      longitude: -6.255,
    };

    expect(
      buildMapsHandoffUrl({
        destination,
        destinationLabel: "14 Willow Close",
        origin: origin.coordinates,
        platformUserAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        provider: "default",
      })
    ).toMatch(/^maps:\/\//);
    const androidUrl = new URL(
      buildMapsHandoffUrl({
        destination,
        destinationLabel: "14 Willow Close",
        origin: origin.coordinates,
        platformUserAgent: "Mozilla/5.0 (Linux; Android 15; Pixel)",
        provider: "default",
      })
    );
    expect(androidUrl.origin).toBe("https://www.google.com");
    expect(androidUrl.searchParams.get("origin")).toBe("53.349805,-6.26031");
    expect(androidUrl.searchParams.get("destination")).toBe("53.351,-6.255");
    expect(androidUrl.searchParams.get("travelmode")).toBe("driving");
  });
});
