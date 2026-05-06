import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";

import { loadInfraStageConfig } from "./stages.ts";

function loadConfig(overrides: ReadonlyMap<string, string> = new Map()) {
  return Effect.runPromise(
    loadInfraStageConfig.pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown(
            Object.fromEntries([
              ["AUTH_EMAIL_FROM", "no-reply@example.com"],
              ["CEIRD_ZONE_NAME", "example.com"],
              ["PLANETSCALE_ORGANIZATION", "example"],
              ...overrides,
            ])
          )
        )
      )
    )
  );
}

describe("infra stage config", () => {
  it("defaults the API site geocoder to stub mode", async () => {
    const config = await loadConfig();

    expect(config.siteGeocoderMode).toBe("stub");
    expect(config.googleMapsApiKey).toBeUndefined();
  });

  it("loads a redacted Google Maps key for google geocoding mode", async () => {
    const config = await loadConfig(
      new Map([
        ["GOOGLE_MAPS_API_KEY", "google-key"],
        ["SITE_GEOCODER_MODE", "google"],
      ])
    );

    expect(config.siteGeocoderMode).toBe("google");
    const { googleMapsApiKey } = config;

    expect(googleMapsApiKey).toBeDefined();
    if (googleMapsApiKey === undefined) {
      throw new Error("Expected Google Maps API key to be configured");
    }
    expect(Redacted.value(googleMapsApiKey)).toBe("google-key");
  });
});
