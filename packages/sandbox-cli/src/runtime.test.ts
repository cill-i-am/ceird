import {
  makeNodeServiceEnvironmentEntries,
  waitForSandboxServicesReady,
} from "./runtime.js";
import { SandboxPreflightError } from "./sandbox-preflight-error.js";

describe("makeNodeServiceEnvironmentEntries()", () => {
  it("includes the Better Auth secret and base URL for the api container only", () => {
    const apiEnv = makeNodeServiceEnvironmentEntries({
      authOrigin: "https://agent-one.api.task-tracker.localhost:1355",
      databaseUrl: "postgresql://postgres:postgres@postgres:5432/task_tracker",
      filter: "api",
      publishedPort: 4301,
      serverAuthOrigin: "http://tt-sbx-agent-one-api:4301",
      sandboxId: "abc123def456",
      betterAuthSecret: "super-secret",
    });
    const appEnv = makeNodeServiceEnvironmentEntries({
      authOrigin: "https://agent-one.api.task-tracker.localhost:1355",
      databaseUrl: "postgresql://postgres:postgres@postgres:5432/task_tracker",
      filter: "app",
      publishedPort: 4300,
      serverAuthOrigin: "http://tt-sbx-agent-one-api:4301",
      sandboxId: "abc123def456",
      betterAuthSecret: "super-secret",
    });

    expect(apiEnv).toContain("BETTER_AUTH_SECRET=super-secret");
    expect(apiEnv).toContain(
      "BETTER_AUTH_BASE_URL=https://agent-one.api.task-tracker.localhost:1355"
    );
    expect(apiEnv).toContain("AUTH_EMAIL_FROM=auth@task-tracker.localhost");
    expect(apiEnv).toContain("AUTH_EMAIL_FROM_NAME=Task Tracker");
    expect(apiEnv).toContain("RESEND_API_KEY=re_test_placeholder");
    expect(appEnv).toContain(
      "VITE_AUTH_ORIGIN=https://agent-one.api.task-tracker.localhost:1355"
    );
    expect(appEnv).toContain("AUTH_ORIGIN=http://tt-sbx-agent-one-api:4301");
    expect(appEnv).not.toContain("BETTER_AUTH_SECRET=super-secret");
    expect(appEnv).not.toContain(
      "BETTER_AUTH_BASE_URL=https://agent-one.api.task-tracker.localhost:1355"
    );
  }, 10_000);

  it("uses the fallback loopback auth origin when aliases are unavailable", () => {
    const apiEnv = makeNodeServiceEnvironmentEntries({
      authOrigin: "http://127.0.0.1:4301",
      databaseUrl: "postgresql://postgres:postgres@postgres:5432/task_tracker",
      filter: "api",
      publishedPort: 4301,
      serverAuthOrigin: "http://tt-sbx-agent-one-api:4301",
      sandboxId: "abc123def456",
      betterAuthSecret: "super-secret",
    });
    const appEnv = makeNodeServiceEnvironmentEntries({
      authOrigin: "http://127.0.0.1:4301",
      databaseUrl: "postgresql://postgres:postgres@postgres:5432/task_tracker",
      filter: "app",
      publishedPort: 4300,
      serverAuthOrigin: "http://tt-sbx-agent-one-api:4301",
      sandboxId: "abc123def456",
      betterAuthSecret: "super-secret",
    });

    expect(apiEnv).toContain("BETTER_AUTH_BASE_URL=http://127.0.0.1:4301");
    expect(apiEnv).toContain("AUTH_EMAIL_FROM=auth@task-tracker.localhost");
    expect(apiEnv).toContain("AUTH_EMAIL_FROM_NAME=Task Tracker");
    expect(apiEnv).toContain("RESEND_API_KEY=re_test_placeholder");
    expect(appEnv).toContain("VITE_AUTH_ORIGIN=http://127.0.0.1:4301");
    expect(appEnv).toContain("AUTH_ORIGIN=http://tt-sbx-agent-one-api:4301");
  }, 10_000);
});

describe("waitForSandboxServicesReady()", () => {
  it("allows cold-start services to become healthy before the timeout expires", async () => {
    let attempts = 0;

    await expect(
      waitForSandboxServicesReady({
        timeoutMs: 120_000,
        intervalMs: 1000,
        wait: () => Promise.resolve(),
        checkPostgres: () => {
          attempts += 1;
          return Promise.resolve(attempts >= 81);
        },
        checkApi: () => Promise.resolve(attempts >= 81),
        checkApp: () => Promise.resolve(attempts >= 81),
      })
    ).resolves.toBeUndefined();

    expect(attempts).toBe(81);
  }, 10_000);

  it("fails when services never become healthy before the timeout", async () => {
    let attempts = 0;
    let waits = 0;

    await expect(
      waitForSandboxServicesReady({
        timeoutMs: 3000,
        intervalMs: 1000,
        wait: () => {
          waits += 1;
          return Promise.resolve();
        },
        checkPostgres: () => {
          attempts += 1;
          return Promise.resolve(false);
        },
        checkApi: () => Promise.resolve(false),
        checkApp: () => Promise.resolve(false),
      })
    ).rejects.toBeInstanceOf(SandboxPreflightError);

    expect(attempts).toBe(3);
    expect(waits).toBe(2);
  }, 10_000);
});
