import type { CurrentLocationOrigin } from "@ceird/proximity-core";
import { Effect } from "effect";

import { requestBrowserGeolocation } from "#/lib/browser-geolocation";
import type {
  BrowserGeolocationCoordinates,
  BrowserGeolocationError,
} from "#/lib/browser-geolocation";

export type BrowserGeolocationRequest = () => Effect.Effect<
  BrowserGeolocationCoordinates,
  BrowserGeolocationError,
  never
>;

export function makeCurrentLocationOrigin(
  coordinates: BrowserGeolocationCoordinates
): CurrentLocationOrigin {
  return {
    ...(coordinates.accuracy === undefined
      ? {}
      : { accuracyMeters: coordinates.accuracy }),
    coordinates: {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    },
    mode: "current_location",
  };
}

export function requestCurrentLocationOrigin(
  request: BrowserGeolocationRequest = requestBrowserGeolocation
) {
  return request().pipe(Effect.map(makeCurrentLocationOrigin));
}
