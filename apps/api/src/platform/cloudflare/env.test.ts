import { describe, expect, it } from "@effect/vitest";

import type { AuthEmailQueueMessage } from "../../domains/identity/authentication/auth-email-queue.js";
import type { ApiWorkerEnv } from "./env.js";
import { apiWorkerEnvConfigMap } from "./env.js";

function makeWorkerEnv(): ApiWorkerEnv {
  return {
    AUTH_APP_ORIGIN: "https://app.example.com",
    AUTH_EMAIL_FROM: "auth@example.com",
    AUTH_EMAIL_FROM_NAME: "Ceird",
    AUTH_EMAIL_QUEUE: {
      send: () => Promise.resolve(),
    } as unknown as Queue<AuthEmailQueueMessage>,
    AUTH_EMAIL_TRANSPORT: "cloudflare-binding",
    BETTER_AUTH_BASE_URL: "https://api.example.com/api/auth",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    DATABASE: {
      connectionString: "postgresql://postgres:postgres@localhost:5432/app",
    } as Hyperdrive,
    GOOGLE_MAPS_API_KEY: "google-key",
    NODE_ENV: "test",
  };
}

describe("Cloudflare Worker environment config", () => {
  it("exposes the Google Maps API key to Effect config", () => {
    const config = apiWorkerEnvConfigMap(makeWorkerEnv());

    expect(config.get("GOOGLE_MAPS_API_KEY")).toBe("google-key");
  });
});
