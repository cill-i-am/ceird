import { describe, expect, it } from "vitest";

import type { ApiWorkerEnv } from "./env.js";
import { apiWorkerEnvConfigMap } from "./env.js";

describe("Cloudflare Worker env config mapping", () => {
  it("forwards site geocoder config from Cloudflare env into Effect Config", () => {
    const config = apiWorkerEnvConfigMap({
      AUTH_APP_ORIGIN: "https://app.example.com",
      AUTH_EMAIL_FROM: "no-reply@example.com",
      AUTH_EMAIL_QUEUE: {} as Queue,
      BETTER_AUTH_BASE_URL: "https://api.example.com/api/auth",
      BETTER_AUTH_SECRET: "secret",
      DATABASE: {} as Hyperdrive,
      GOOGLE_GEOCODING_REQUEST_TIMEOUT_MS: "1500",
      GOOGLE_MAPS_API_KEY: "google-key",
      SITE_GEOCODER_MODE: "google",
    } satisfies ApiWorkerEnv);

    expect(config.get("SITE_GEOCODER_MODE")).toBe("google");
    expect(config.get("GOOGLE_MAPS_API_KEY")).toBe("google-key");
    expect(config.get("GOOGLE_GEOCODING_REQUEST_TIMEOUT_MS")).toBe("1500");
  });
});
