import {
  SITE_GEOCODING_PROVIDERS,
  SiteGeocodingProviderSchema,
} from "@task-tracker/jobs-core";
import type { SiteGeocodingProvider } from "@task-tracker/jobs-core";
import { Config, Effect, Schema } from "effect";

export type SiteGeocoderMode = SiteGeocodingProvider;

export type SiteGeocodingConfig =
  | {
      readonly mode: "stub";
    }
  | {
      readonly googleMapsApiKey: string;
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

export const loadGoogleMapsApiKey = googleMapsApiKeyConfig;

export const loadSiteGeocodingConfig = Effect.gen(
  function* loadSiteGeocodingConfigEffect() {
    const mode = yield* siteGeocoderModeConfig;

    if (mode === "stub") {
      return {
        mode,
      } satisfies SiteGeocodingConfig;
    }

    const googleMapsApiKey = yield* loadGoogleMapsApiKey;

    return {
      googleMapsApiKey,
      mode,
    } satisfies SiteGeocodingConfig;
  }
);
