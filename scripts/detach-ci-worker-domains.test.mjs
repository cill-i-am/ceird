import assert from "node:assert/strict";
import test from "node:test";

import {
  collectCiWorkerHostnames,
  collectPreviewWorkerHostnames,
  collectWorkerHostnames,
  detachCiWorkerDomains,
  readCloudflareCredentials,
} from "./detach-ci-worker-domains.mjs";

const ciEnv = {
  CEIRD_AGENT_HOSTNAME: "agent-ci-123-1.ceird.app",
  CEIRD_API_HOSTNAME: "api-ci-123-1.ceird.app",
  CEIRD_APP_HOSTNAME: "app-ci-123-1.ceird.app",
  CEIRD_MCP_HOSTNAME: "mcp-ci-123-1.ceird.app",
  CEIRD_SYNC_HOSTNAME: "sync-ci-123-1.ceird.app",
  CI_STAGE: "ci-123-1",
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  CLOUDFLARE_API_KEY: "api-key",
  CLOUDFLARE_EMAIL: "ops@example.com",
};

function response(body, status = 200) {
  return Response.json(body, { status });
}

test("collects expected first-level CI Worker hostnames", () => {
  assert.deepEqual(collectCiWorkerHostnames(ciEnv), [
    "app-ci-123-1.ceird.app",
    "api-ci-123-1.ceird.app",
    "agent-ci-123-1.ceird.app",
    "mcp-ci-123-1.ceird.app",
    "sync-ci-123-1.ceird.app",
  ]);
});

test("collects expected preview Worker hostnames", () => {
  assert.deepEqual(
    collectPreviewWorkerHostnames({
      CEIRD_ZONE_NAME: "ceird.app",
      PREVIEW_STAGE: "pr-123",
    }),
    [
      "app.pr-123.ceird.app",
      "api.pr-123.ceird.app",
      "agent.pr-123.ceird.app",
      "mcp.pr-123.ceird.app",
      "sync.pr-123.ceird.app",
    ]
  );
});

test("chooses preview Worker hostnames when PREVIEW_STAGE is set", () => {
  assert.deepEqual(
    collectWorkerHostnames({
      CEIRD_ZONE_NAME: "ceird.app",
      PREVIEW_STAGE: "pr-123",
    }),
    [
      "app.pr-123.ceird.app",
      "api.pr-123.ceird.app",
      "agent.pr-123.ceird.app",
      "mcp.pr-123.ceird.app",
      "sync.pr-123.ceird.app",
    ]
  );
});

test("rejects hostnames that do not match the CI stage", () => {
  assert.throws(
    () =>
      collectCiWorkerHostnames({
        ...ciEnv,
        CEIRD_APP_HOSTNAME: "app.pr-123.ceird.app",
      }),
    /CEIRD_APP_HOSTNAME must be app-ci-123-1\.ceird\.app/
  );
});

test("rejects unexpected preview stages", () => {
  assert.throws(
    () =>
      collectPreviewWorkerHostnames({
        CEIRD_ZONE_NAME: "ceird.app",
        PREVIEW_STAGE: "main",
      }),
    /Refusing to detach preview Worker domains for stage main/
  );
});

test("reads Cloudflare global key credentials", () => {
  assert.deepEqual(readCloudflareCredentials(ciEnv), {
    accountId: "account-id",
    apiKey: "api-key",
    email: "ops@example.com",
  });
});

test("detaches matching Worker domains one at a time", async () => {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({
      hostname: url.searchParams.get("hostname"),
      method: init.method ?? "GET",
      path: url.pathname,
    });

    if ((init.method ?? "GET") === "GET") {
      return response({
        success: true,
        result: [
          { hostname: "app-ci-123-1.ceird.app", id: "domain-app" },
          { hostname: "other.ceird.app", id: "domain-other" },
        ],
      });
    }

    return response({ success: true, result: {} });
  };
  let output = "";

  await detachCiWorkerDomains({
    credentials: readCloudflareCredentials(ciEnv),
    fetchImpl,
    hostnames: ["app-ci-123-1.ceird.app"],
    sleepImpl: () => Promise.resolve(),
    stdout: { write: (chunk) => (output += chunk) },
  });

  assert.deepEqual(calls, [
    {
      hostname: "app-ci-123-1.ceird.app",
      method: "GET",
      path: "/client/v4/accounts/account-id/workers/domains",
    },
    {
      hostname: null,
      method: "DELETE",
      path: "/client/v4/accounts/account-id/workers/domains/domain-app",
    },
  ]);
  assert.match(output, /Detached Worker domain app-ci-123-1\.ceird\.app/);
});

test("retries transient Worker domain delete failures", async () => {
  const calls = [];
  const sleeps = [];
  const fetchImpl = (url, init) => {
    calls.push(init.method ?? "GET");

    if ((init.method ?? "GET") === "GET") {
      return response({
        success: true,
        result: [{ hostname: "api-ci-123-1.ceird.app", id: "domain-api" }],
      });
    }

    if (calls.filter((method) => method === "DELETE").length === 1) {
      return response(
        {
          errors: [{ code: 10_000, message: "temporary Cloudflare failure" }],
          success: false,
        },
        500
      );
    }

    return response({ success: true, result: {} });
  };

  await detachCiWorkerDomains({
    credentials: readCloudflareCredentials(ciEnv),
    fetchImpl,
    hostnames: ["api-ci-123-1.ceird.app"],
    sleepImpl: (duration) => {
      sleeps.push(duration);
      return Promise.resolve();
    },
    stdout: { write: (chunk) => chunk.length },
  });

  assert.deepEqual(calls, ["GET", "DELETE", "DELETE"]);
  assert.deepEqual(sleeps, [5000]);
});

test("reports missing Worker domains without deleting", async () => {
  const calls = [];
  let output = "";
  const fetchImpl = (_url, init) => {
    calls.push(init.method ?? "GET");
    return response({ success: true, result: [] });
  };

  await detachCiWorkerDomains({
    credentials: readCloudflareCredentials(ciEnv),
    fetchImpl,
    hostnames: ["sync-ci-123-1.ceird.app"],
    stdout: { write: (chunk) => (output += chunk) },
  });

  assert.deepEqual(calls, ["GET"]);
  assert.match(
    output,
    /No Worker domain attached for sync-ci-123-1\.ceird\.app/
  );
});
