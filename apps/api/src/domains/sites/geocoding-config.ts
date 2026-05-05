import {
  SITE_GEOCODING_PROVIDERS,
  SiteGeocodingProviderSchema,
} from "@ceird/sites-core";
import type { SiteGeocodingProvider } from "@ceird/sites-core";
import { Config, Effect, Schema } from "effect";

export type SiteGeocoderMode = SiteGeocodingProvider;

export type SiteGeocodingConfig =
  | {
      readonly mode: "stub";
    }
  | {
      readonly googleMapsApiKey: string;
      readonly requestTimeoutMs: number;
      readonly mode: "google";
    };

const siteGeocoderModeConfig = Config.string("SITE_GEOCODER_MODE").pipe(
  Config.withDefault("google"),
  Config.validate({
    message: `SITE_GEOCODER_MODE must be one of ${SITE_GEOCODING_PROVIDERS.join(", ")}`,
    validation: (value): value is SiteGeocoderMode =>
      Schema.is(SiteGeocodingProviderSchema)(value),
  })
);

const googleMapsApiKeyConfig = Config.string("GOOGLE_MAPS_API_KEY").pipe(
  Config.validate({
    message: "GOOGLE_MAPS_API_KEY must not be empty",
    validation: (value) => value.trim().length > 0,
  })
);

const googleGeocodingRequestTimeoutMsConfig = Config.integer(
  "GOOGLE_GEOCODING_REQUEST_TIMEOUT_MS"
).pipe(
  Config.withDefault(5000),
  Config.validate({
    message: "GOOGLE_GEOCODING_REQUEST_TIMEOUT_MS must be between 1 and 60000",
    validation: (value) => value >= 1 && value <= 60_000,
  })
);

export const loadGoogleMapsApiKey = googleMapsApiKeyConfig;
export const loadGoogleGeocodingRequestTimeoutMs =
  googleGeocodingRequestTimeoutMsConfig;

export const loadSiteGeocodingConfig = Effect.gen(
  function* loadSiteGeocodingConfigEffect() {
    const mode = yield* siteGeocoderModeConfig;

    if (mode === "stub") {
      return {
        mode,
      } satisfies SiteGeocodingConfig;
    }

    const googleMapsApiKey = yield* loadGoogleMapsApiKey;
    const requestTimeoutMs = yield* loadGoogleGeocodingRequestTimeoutMs;

    return {
      googleMapsApiKey,
      mode,
      requestTimeoutMs,
    } satisfies SiteGeocodingConfig;
  }
);
