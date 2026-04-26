"use client";

/* oxlint-disable max-classes-per-file */

import { Effect, Schema } from "effect";

export interface BrowserGeolocationCoordinates {
  readonly accuracy?: number;
  readonly latitude: number;
  readonly longitude: number;
}

export class BrowserGeolocationUnavailableError extends Schema.TaggedError<BrowserGeolocationUnavailableError>()(
  "BrowserGeolocationUnavailableError",
  {
    message: Schema.String,
  }
) {}

export class BrowserGeolocationPermissionDeniedError extends Schema.TaggedError<BrowserGeolocationPermissionDeniedError>()(
  "BrowserGeolocationPermissionDeniedError",
  {
    message: Schema.String,
  }
) {}

export class BrowserGeolocationPositionUnavailableError extends Schema.TaggedError<BrowserGeolocationPositionUnavailableError>()(
  "BrowserGeolocationPositionUnavailableError",
  {
    message: Schema.String,
  }
) {}

export class BrowserGeolocationTimeoutError extends Schema.TaggedError<BrowserGeolocationTimeoutError>()(
  "BrowserGeolocationTimeoutError",
  {
    message: Schema.String,
  }
) {}

export class BrowserGeolocationUnknownError extends Schema.TaggedError<BrowserGeolocationUnknownError>()(
  "BrowserGeolocationUnknownError",
  {
    code: Schema.optional(Schema.Number),
    message: Schema.String,
  }
) {}

export type BrowserGeolocationError =
  | BrowserGeolocationPermissionDeniedError
  | BrowserGeolocationPositionUnavailableError
  | BrowserGeolocationTimeoutError
  | BrowserGeolocationUnavailableError
  | BrowserGeolocationUnknownError;

export const requestBrowserGeolocation = Effect.fn(
  "BrowserGeolocation.request"
)(function* () {
  if (
    typeof navigator === "undefined" ||
    !("geolocation" in navigator) ||
    !navigator.geolocation
  ) {
    return yield* Effect.fail(
      new BrowserGeolocationUnavailableError({
        message: "Location is not available in this browser.",
      })
    );
  }

  return yield* Effect.async<
    BrowserGeolocationCoordinates,
    BrowserGeolocationError
  >((resume) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resume(
          Effect.succeed({
            accuracy: position.coords.accuracy,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        );
      },
      (error) => {
        resume(Effect.fail(toBrowserGeolocationError(error)));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 10_000,
      }
    );
  });
});

export function toBrowserGeolocationError(error: {
  readonly code?: number;
  readonly message?: string;
}): BrowserGeolocationError {
  if (error.code === 1) {
    return new BrowserGeolocationPermissionDeniedError({
      message: "Location permission was denied.",
    });
  }

  if (error.code === 2) {
    return new BrowserGeolocationPositionUnavailableError({
      message: "Your current location could not be determined.",
    });
  }

  if (error.code === 3) {
    return new BrowserGeolocationTimeoutError({
      message: "Location lookup timed out. Try again in a moment.",
    });
  }

  return new BrowserGeolocationUnknownError({
    code: error.code,
    message: error.message ?? "Location lookup failed.",
  });
}

export function formatBrowserGeolocationError(error: BrowserGeolocationError) {
  return error.message;
}
