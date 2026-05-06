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

  it("keeps API source-map uploads disabled until deploy credentials are complete", async () => {
    const config = await loadConfig(
      new Map([
        ["SENTRY_ORG", "technifit-1f"],
        ["SENTRY_RELEASE", "abc123"],
      ])
    );

    expect(config.sentryApiProject).toBe("ceird-api");
    expect(config.sentryApiSourceMapUploadEnabled).toBeFalsy();
  });

  it("enables API source-map uploads for non-dry-run deploys with Sentry credentials", async () => {
    const config = await loadConfig(
      new Map([
        ["SENTRY_API_PROJECT", "custom-api"],
        ["SENTRY_AUTH_TOKEN", "token"],
        ["SENTRY_ORG", "technifit-1f"],
        ["SENTRY_RELEASE", "abc123"],
      ])
    );

    expect(config.sentryApiProject).toBe("custom-api");
    expect(config.sentryOrg).toBe("technifit-1f");
    expect(config.sentryRelease).toBe("abc123");
    expect(config.sentryApiSourceMapUploadEnabled).toBeTruthy();
  });

  it("does not upload API source maps during dry-run deploys", async () => {
    const config = await loadConfig(
      new Map([
        ["CEIRD_DEPLOY_DRY_RUN", "true"],
        ["SENTRY_AUTH_TOKEN", "token"],
        ["SENTRY_ORG", "technifit-1f"],
        ["SENTRY_RELEASE", "abc123"],
      ])
    );

    expect(config.sentryApiSourceMapUploadEnabled).toBeFalsy();
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
