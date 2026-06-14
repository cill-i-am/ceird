import assert from "node:assert/strict";
import test from "node:test";

import {
  makeSyncCanaryId,
  readDeployedSyncCanaryConfig,
  runDeployedSyncCanary,
} from "./run-deployed-sync-canary.mjs";

function makeJsonResponse(payload, init = {}) {
  return Response.json(payload, init);
}

function makeTextResponse(payload, init = {}) {
  return new Response(payload, init);
}

function makeDatabaseClient(log) {
  return {
    connect() {
      log.push("db:connect");
      return Promise.resolve();
    },
    end() {
      log.push("db:end");
      return Promise.resolve();
    },
    query(sql, values) {
      log.push({ sql, values });
      return Promise.resolve({ rows: [{ id: "user_canary" }] });
    },
  };
}

test("reads deployed sync canary configuration from Playwright stage env", () => {
  assert.deepEqual(
    readDeployedSyncCanaryConfig({
      CEIRD_SYNC_CANARY_ATTEMPTS: "3",
      CEIRD_SYNC_CANARY_INTERVAL_MS: "10",
      CEIRD_SYNC_CANARY_REQUEST_TIMEOUT_MS: "500",
      PLAYWRIGHT_API_URL: "https://api.pr-123.ceird.app/path",
      PLAYWRIGHT_BASE_URL: "https://app.pr-123.ceird.app/path",
      PLAYWRIGHT_DATABASE_URL: "postgresql://ceird:secret@example/db",
      PLAYWRIGHT_SYNC_URL: "https://sync.pr-123.ceird.app/path",
      PREVIEW_STAGE: "pr-123",
    }),
    {
      apiUrl: "https://api.pr-123.ceird.app",
      appUrl: "https://app.pr-123.ceird.app",
      attempts: 3,
      databaseUrl: "postgresql://ceird:secret@example/db",
      intervalMs: 10,
      requestTimeoutMs: 500,
      stage: "pr-123",
      syncUrl: "https://sync.pr-123.ceird.app",
    }
  );
  assert.equal(
    makeSyncCanaryId({
      now: () => 1_700_000_000_000,
      randomUUID: () => "ABCDEF12-3456-7890-abcd-ef1234567890",
    }),
    "loyw3v28-abcdef12"
  );
});

test("creates a verified org session and retries until the Electric shape responds", async () => {
  const requests = [];
  const databaseLog = [];
  const logs = [];
  const result = await runDeployedSyncCanary(
    {
      apiUrl: "https://api.pr-123.ceird.app",
      appUrl: "https://app.pr-123.ceird.app",
      attempts: 2,
      databaseUrl: "postgresql://ceird:secret@example/db",
      intervalMs: 1,
      requestTimeoutMs: 1000,
      stage: "pr-123",
      syncUrl: "https://sync.pr-123.ceird.app",
    },
    {
      canaryId: "loyw3v28-abcdef12",
      createDatabaseClient: () => makeDatabaseClient(databaseLog),
      delay: () => Promise.resolve(),
      fetch: (url, init) => {
        requests.push({ init, url });

        if (url.endsWith("/api/auth/sign-up/email")) {
          return makeJsonResponse(
            { ok: true },
            {
              headers: {
                "set-cookie": "ceird_session=session-token; Path=/; HttpOnly",
              },
            }
          );
        }

        if (url.endsWith("/api/auth/organization/create")) {
          assert.match(init.headers.cookie, /ceird_session=session-token/);
          return makeJsonResponse(
            {
              id: "org_canary",
              name: "Sync Canary",
              slug: "sync-canary-loyw3v28-abcdef12",
            },
            {
              headers: {
                "set-cookie": "ceird_active_org=org_canary; Path=/; HttpOnly",
              },
            }
          );
        }

        if (url.endsWith("/api/auth/organization/set-active")) {
          assert.match(init.headers.cookie, /ceird_session=session-token/);
          return makeJsonResponse({ ok: true });
        }

        if (url.endsWith("/api/auth/get-session")) {
          assert.match(init.headers.cookie, /ceird_active_org=org_canary/);
          return makeJsonResponse({
            session: { activeOrganizationId: "org_canary" },
          });
        }

        if (url.endsWith("/v1/shapes/jobs?offset=-1")) {
          assert.match(init.headers.cookie, /ceird_active_org=org_canary/);

          const syncRequests = requests.filter((request) =>
            request.url.endsWith("/v1/shapes/jobs?offset=-1")
          );

          return syncRequests.length === 1
            ? makeJsonResponse(
                { error: "electric_container_unavailable" },
                {
                  status: 503,
                }
              )
            : makeTextResponse('[{"headers":{"control":"up-to-date"}}]', {
                headers: { "electric-handle": "shape-handle" },
                status: 200,
              });
        }

        throw new Error(`Unexpected URL ${url}`);
      },
      logger: {
        log(message) {
          logs.push(message);
        },
      },
    }
  );

  assert.equal(result.organizationId, "org_canary");
  assert.equal(result.shape.status, 200);
  assert.equal(
    requests.filter((request) =>
      request.url.endsWith("/v1/shapes/jobs?offset=-1")
    ).length,
    2
  );
  assert.deepEqual(
    databaseLog.map((entry) => entry?.values ?? entry),
    ["db:connect", ["sync-canary-loyw3v28-abcdef12@example.com"], "db:end"]
  );
  assert.ok(
    logs.some((message) =>
      message.includes("Authenticated Electric sync canary passed")
    )
  );
});

test("retries shape request errors while the Electric container starts", async () => {
  const requests = [];
  const logs = [];
  const result = await runDeployedSyncCanary(
    {
      apiUrl: "https://api.pr-123.ceird.app",
      appUrl: "https://app.pr-123.ceird.app",
      attempts: 2,
      databaseUrl: "postgresql://ceird:secret@example/db",
      intervalMs: 1,
      requestTimeoutMs: 1000,
      stage: "pr-123",
      syncUrl: "https://sync.pr-123.ceird.app",
    },
    {
      canaryId: "loyw3v28-abcdef12",
      createDatabaseClient: () => makeDatabaseClient([]),
      delay: () => Promise.resolve(),
      fetch: (url) => {
        requests.push(url);

        if (url.endsWith("/api/auth/sign-up/email")) {
          return makeJsonResponse(
            { ok: true },
            {
              headers: {
                "set-cookie": "ceird_session=session-token; Path=/; HttpOnly",
              },
            }
          );
        }

        if (url.endsWith("/api/auth/organization/create")) {
          return makeJsonResponse({
            id: "org_canary",
            name: "Sync Canary",
            slug: "sync-canary-loyw3v28-abcdef12",
          });
        }

        if (
          url.endsWith("/api/auth/organization/set-active") ||
          url.endsWith("/api/auth/get-session")
        ) {
          return makeJsonResponse({ ok: true });
        }

        if (url.endsWith("/v1/shapes/jobs?offset=-1")) {
          const syncRequests = requests.filter((requestUrl) =>
            requestUrl.endsWith("/v1/shapes/jobs?offset=-1")
          );

          if (syncRequests.length === 1) {
            return Promise.reject(new Error("This operation was aborted"));
          }

          return makeTextResponse('[{"headers":{"control":"up-to-date"}}]', {
            headers: { "electric-handle": "shape-handle" },
            status: 200,
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      },
      logger: {
        log(message) {
          logs.push(message);
        },
      },
    }
  );

  assert.equal(result.shape.status, 200);
  assert.equal(
    requests.filter((request) => request.endsWith("/v1/shapes/jobs?offset=-1"))
      .length,
    2
  );
  assert.ok(
    logs.some((message) => message.includes("failed before a response"))
  );
});

test("fails when the authenticated Electric shape never responds successfully", async () => {
  await assert.rejects(
    runDeployedSyncCanary(
      {
        apiUrl: "https://api.pr-123.ceird.app",
        appUrl: "https://app.pr-123.ceird.app",
        attempts: 1,
        databaseUrl: "postgresql://ceird:secret@example/db",
        intervalMs: 1,
        requestTimeoutMs: 1000,
        stage: "pr-123",
        syncUrl: "https://sync.pr-123.ceird.app",
      },
      {
        canaryId: "loyw3v28-abcdef12",
        createDatabaseClient: () => makeDatabaseClient([]),
        delay: () => Promise.resolve(),
        fetch: (url) => {
          if (url.endsWith("/api/auth/sign-up/email")) {
            return makeJsonResponse(
              { ok: true },
              {
                headers: {
                  "set-cookie": "ceird_session=session-token; Path=/; HttpOnly",
                },
              }
            );
          }

          if (url.endsWith("/api/auth/organization/create")) {
            return makeJsonResponse({
              id: "org_canary",
              name: "Sync Canary",
              slug: "sync-canary-loyw3v28-abcdef12",
            });
          }

          if (
            url.endsWith("/api/auth/organization/set-active") ||
            url.endsWith("/api/auth/get-session")
          ) {
            return makeJsonResponse({ ok: true });
          }

          if (url.endsWith("/v1/shapes/jobs?offset=-1")) {
            return makeJsonResponse(
              { error: "electric_container_unavailable" },
              { status: 503 }
            );
          }

          throw new Error(`Unexpected URL ${url}`);
        },
        logger: { log: () => null },
      }
    ),
    /Authenticated Electric sync canary did not pass/
  );
});

test("does not accept an unrelated non-empty 200 response as Electric", async () => {
  await assert.rejects(
    runDeployedSyncCanary(
      {
        apiUrl: "https://api.pr-123.ceird.app",
        appUrl: "https://app.pr-123.ceird.app",
        attempts: 1,
        databaseUrl: "postgresql://ceird:secret@example/db",
        intervalMs: 1,
        requestTimeoutMs: 1000,
        stage: "pr-123",
        syncUrl: "https://sync.pr-123.ceird.app",
      },
      {
        canaryId: "loyw3v28-abcdef12",
        createDatabaseClient: () => makeDatabaseClient([]),
        delay: () => Promise.resolve(),
        fetch: (url) => {
          if (url.endsWith("/api/auth/sign-up/email")) {
            return makeJsonResponse(
              { ok: true },
              {
                headers: {
                  "set-cookie": "ceird_session=session-token; Path=/; HttpOnly",
                },
              }
            );
          }

          if (url.endsWith("/api/auth/organization/create")) {
            return makeJsonResponse({
              id: "org_canary",
              name: "Sync Canary",
              slug: "sync-canary-loyw3v28-abcdef12",
            });
          }

          if (
            url.endsWith("/api/auth/organization/set-active") ||
            url.endsWith("/api/auth/get-session")
          ) {
            return makeJsonResponse({ ok: true });
          }

          if (url.endsWith("/v1/shapes/jobs?offset=-1")) {
            return makeTextResponse("not electric", { status: 200 });
          }

          throw new Error(`Unexpected URL ${url}`);
        },
        logger: { log: () => null },
      }
    ),
    /Authenticated Electric sync canary did not pass/
  );
});
