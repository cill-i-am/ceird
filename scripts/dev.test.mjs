import assert from "node:assert/strict";
import test from "node:test";

import { createDevEnvironment } from "./dev.mjs";

test("adds a default Better Auth base URL for local portless dev", () => {
  const env = createDevEnvironment({
    PATH: process.env.PATH ?? "",
    PORTLESS_PORT: "1355",
  });

  assert.equal(env.API_ORIGIN, "http://127.0.0.1:3001");
  assert.equal(
    env.BETTER_AUTH_BASE_URL,
    "https://api.task-tracker.localhost:1355"
  );
  assert.equal(env.AUTH_EMAIL_FROM, "auth@task-tracker.localhost");
  assert.equal(env.AUTH_EMAIL_FROM_NAME, "Task Tracker");
  assert.equal(env.AUTH_EMAIL_TRANSPORT, "noop");
  assert.equal(env.CLOUDFLARE_ACCOUNT_ID, undefined);
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
});

test("preserves an explicit Better Auth base URL override", () => {
  const env = createDevEnvironment({
    API_ORIGIN: "http://127.0.0.1:4301",
    AUTH_EMAIL_FROM: "custom@example.com",
    AUTH_EMAIL_FROM_NAME: "Custom Sender",
    AUTH_EMAIL_TRANSPORT: "cloudflare-api",
    BETTER_AUTH_BASE_URL: "https://custom-auth.example.com",
    CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
    CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
    PATH: process.env.PATH ?? "",
    PORTLESS_PORT: "1355",
  });

  assert.equal(env.API_ORIGIN, "http://127.0.0.1:4301");
  assert.equal(env.BETTER_AUTH_BASE_URL, "https://custom-auth.example.com");
  assert.equal(env.AUTH_EMAIL_FROM, "custom@example.com");
  assert.equal(env.AUTH_EMAIL_FROM_NAME, "Custom Sender");
  assert.equal(env.AUTH_EMAIL_TRANSPORT, "cloudflare-api");
  assert.equal(env.CLOUDFLARE_ACCOUNT_ID, "cloudflare-account-live");
  assert.equal(env.CLOUDFLARE_API_TOKEN, "cloudflare-token-live");
});

test("keeps local email noop unless the transport is explicit", () => {
  const env = createDevEnvironment({
    CLOUDFLARE_ACCOUNT_ID: "cloudflare-account-live",
    CLOUDFLARE_API_TOKEN: "cloudflare-token-live",
    PATH: process.env.PATH ?? "",
    PORTLESS_PORT: "1355",
  });

  assert.equal(env.AUTH_EMAIL_TRANSPORT, "noop");
});
