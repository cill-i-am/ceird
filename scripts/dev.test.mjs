import assert from "node:assert/strict";
import test from "node:test";

import { createDevEnvironment } from "./dev.mjs";

test("adds a default Better Auth base URL for local portless dev", () => {
  const env = createDevEnvironment({
    PATH: process.env.PATH ?? "",
    PORTLESS_PORT: "1355",
  });

  assert.equal(
    env.BETTER_AUTH_BASE_URL,
    "https://api.task-tracker.localhost:1355"
  );
  assert.equal(env.AUTH_EMAIL_FROM, "auth@task-tracker.localhost");
  assert.equal(env.AUTH_EMAIL_FROM_NAME, "Task Tracker");
  assert.equal(env.RESEND_API_KEY, "re_test_placeholder");
});

test("preserves an explicit Better Auth base URL override", () => {
  const env = createDevEnvironment({
    AUTH_EMAIL_FROM: "custom@example.com",
    AUTH_EMAIL_FROM_NAME: "Custom Sender",
    BETTER_AUTH_BASE_URL: "https://custom-auth.example.com",
    PATH: process.env.PATH ?? "",
    PORTLESS_PORT: "1355",
    RESEND_API_KEY: "re_live_custom",
  });

  assert.equal(env.BETTER_AUTH_BASE_URL, "https://custom-auth.example.com");
  assert.equal(env.AUTH_EMAIL_FROM, "custom@example.com");
  assert.equal(env.AUTH_EMAIL_FROM_NAME, "Custom Sender");
  assert.equal(env.RESEND_API_KEY, "re_live_custom");
});
