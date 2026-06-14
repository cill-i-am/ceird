#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const domainRequire = createRequire(
  new URL("../apps/domain/package.json", import.meta.url)
);
const { Client: PgClient } = domainRequire("pg");

const defaultAttempts = 60;
const defaultIntervalMs = 5000;
const defaultRequestTimeoutMs = 30_000;
const emailVerificationTimeoutMs = 10_000;
const emailVerificationPollMs = 100;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

function readRequiredEnv(env, name) {
  const value = env[name]?.trim();

  if (value === undefined || value.length === 0) {
    throw new UsageError(`${name} is required for deployed sync canary.`);
  }

  return value;
}

function readPositiveIntegerEnv(env, name, fallback) {
  const rawValue = env[name]?.trim();

  if (rawValue === undefined || rawValue.length === 0) {
    return fallback;
  }

  const value = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new UsageError(`${name} must be a positive integer.`);
  }

  return value;
}

function readOriginEnv(env, name) {
  const value = readRequiredEnv(env, name);
  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UsageError(`${name} must be an HTTP(S) URL.`);
  }

  return url.origin;
}

export function readDeployedSyncCanaryConfig(env = process.env) {
  return {
    apiUrl: readOriginEnv(env, "PLAYWRIGHT_API_URL"),
    appUrl: readOriginEnv(env, "PLAYWRIGHT_BASE_URL"),
    attempts: readPositiveIntegerEnv(
      env,
      "CEIRD_SYNC_CANARY_ATTEMPTS",
      defaultAttempts
    ),
    databaseUrl: readRequiredEnv(env, "PLAYWRIGHT_DATABASE_URL"),
    intervalMs: readPositiveIntegerEnv(
      env,
      "CEIRD_SYNC_CANARY_INTERVAL_MS",
      defaultIntervalMs
    ),
    requestTimeoutMs: readPositiveIntegerEnv(
      env,
      "CEIRD_SYNC_CANARY_REQUEST_TIMEOUT_MS",
      defaultRequestTimeoutMs
    ),
    stage: env.PREVIEW_STAGE ?? env.CI_STAGE ?? env.ALCHEMY_STAGE ?? "stage",
    syncUrl: readOriginEnv(env, "PLAYWRIGHT_SYNC_URL"),
  };
}

export function makeSyncCanaryId(input = {}) {
  const random = input.randomUUID?.() ?? randomUUID();
  const time = input.now === undefined ? Date.now() : input.now();
  const suffix = `${time.toString(36)}-${random.slice(0, 8)}`;

  return suffix
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function requireFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }

  return fetchImpl;
}

function makeAuthUrl(config, path) {
  return new URL(`/api/auth${path}`, config.apiUrl).toString();
}

function makeSyncShapeUrl(config) {
  return new URL("/v1/shapes/jobs?offset=-1", config.syncUrl).toString();
}

function readSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    const values = headers.getSetCookie();

    if (values.length > 0) {
      return values;
    }
  }

  const value = headers.get("set-cookie");
  return value === null ? [] : [value];
}

function storeResponseCookies(cookieJar, response) {
  for (const header of readSetCookieHeaders(response.headers)) {
    const [cookiePair] = header.split(";");

    if (cookiePair === undefined) {
      continue;
    }

    const equalsIndex = cookiePair.indexOf("=");

    if (equalsIndex <= 0) {
      continue;
    }

    cookieJar.set(
      cookiePair.slice(0, equalsIndex).trim(),
      cookiePair.slice(equalsIndex + 1).trim()
    );
  }
}

function formatCookieHeader(cookieJar) {
  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function makeHeaders(input) {
  const headers = {
    accept: "application/json",
    origin: input.config.appUrl,
    ...input.extra,
  };
  const cookie = formatCookieHeader(input.cookieJar);

  if (cookie.length > 0) {
    headers.cookie = cookie;
  }

  return headers;
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseText(response) {
  return await response
    .clone()
    .text()
    .catch(() => "");
}

function summarizeBody(body) {
  return body.trim().replaceAll(/\s+/g, " ").slice(0, 500);
}

async function requireOk(response, context) {
  if (response.ok) {
    return;
  }

  const body = summarizeBody(await readResponseText(response));
  throw new Error(
    `${context} failed with status ${response.status}${body.length > 0 ? `: ${body}` : ""}`
  );
}

async function postAuthJson(config, dependencies, cookieJar, path, body) {
  const response = await fetchWithTimeout(
    dependencies.fetch,
    makeAuthUrl(config, path),
    {
      body: JSON.stringify(body),
      headers: makeHeaders({
        config,
        cookieJar,
        extra: { "content-type": "application/json" },
      }),
      method: "POST",
    },
    config.requestTimeoutMs
  );

  storeResponseCookies(cookieJar, response);
  return response;
}

async function getAuthJson(config, dependencies, cookieJar, path) {
  const response = await fetchWithTimeout(
    dependencies.fetch,
    makeAuthUrl(config, path),
    {
      headers: makeHeaders({ config, cookieJar }),
      method: "GET",
    },
    config.requestTimeoutMs
  );

  storeResponseCookies(cookieJar, response);
  return response;
}

async function markCanaryUserEmailVerified(config, dependencies, email) {
  const client = dependencies.createDatabaseClient(config.databaseUrl);
  await client.connect();

  try {
    const deadline = Date.now() + emailVerificationTimeoutMs;

    do {
      const result = await client.query(
        `update "user"
         set email_verified = true
         where email = $1
         returning id`,
        [email]
      );

      if (result.rows[0]) {
        return;
      }

      await dependencies.delay(emailVerificationPollMs);
    } while (Date.now() < deadline);

    throw new Error(`Expected to verify canary user ${email}.`);
  } finally {
    await client.end();
  }
}

function readOrganizationId(payload) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    typeof payload.id === "string" &&
    payload.id.length > 0
  ) {
    return payload.id;
  }

  throw new Error("Organization creation returned an invalid payload.");
}

async function createVerifiedCanaryOrganization(
  config,
  dependencies,
  cookieJar,
  canaryId
) {
  const email = `sync-canary-${canaryId}@example.com`;
  const password = `CeirdSyncCanary-${canaryId}-A1!`;
  const signupResponse = await postAuthJson(
    config,
    dependencies,
    cookieJar,
    "/sign-up/email",
    {
      callbackURL: `${config.appUrl}/verify-email?status=success`,
      email,
      name: "Sync Canary",
      password,
    }
  );

  await requireOk(signupResponse, "Sync canary signup");
  await markCanaryUserEmailVerified(config, dependencies, email);

  const createOrganizationResponse = await postAuthJson(
    config,
    dependencies,
    cookieJar,
    "/organization/create",
    {
      name: `Sync Canary ${canaryId}`,
      slug: `sync-canary-${canaryId}`,
    }
  );

  await requireOk(
    createOrganizationResponse,
    "Sync canary organization create"
  );

  const organizationId = readOrganizationId(
    await createOrganizationResponse.json()
  );
  const setActiveResponse = await postAuthJson(
    config,
    dependencies,
    cookieJar,
    "/organization/set-active",
    { organizationId }
  );

  await requireOk(setActiveResponse, "Sync canary organization activation");

  const sessionResponse = await getAuthJson(
    config,
    dependencies,
    cookieJar,
    "/get-session"
  );

  await requireOk(sessionResponse, "Sync canary active session check");

  return { email, organizationId };
}

function hasElectricResponseSignal(response, body) {
  if (response.status !== 200) {
    return false;
  }

  for (const [name] of response.headers) {
    if (name.startsWith("electric-")) {
      return true;
    }
  }

  return isElectricShapeMessageBody(body);
}

function isElectricShapeMessageBody(body) {
  try {
    const payload = JSON.parse(body);

    return (
      Array.isArray(payload) &&
      payload.some(
        (message) =>
          typeof message === "object" &&
          message !== null &&
          ("headers" in message || "key" in message || "value" in message)
      )
    );
  } catch {
    return false;
  }
}

async function waitForAuthenticatedShape(config, dependencies, cookieJar) {
  const shapeUrl = makeSyncShapeUrl(config);
  let lastStatus = "not-started";
  let lastBody = "";

  for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
    let response;
    let body = "";

    try {
      response = await fetchWithTimeout(
        dependencies.fetch,
        shapeUrl,
        {
          headers: makeHeaders({ config, cookieJar }),
          method: "GET",
        },
        config.requestTimeoutMs
      );
      body = await readResponseText(response);
    } catch (error) {
      lastStatus = "request-error";
      lastBody = summarizeBody(
        error instanceof Error ? error.message : String(error)
      );

      if (attempt < config.attempts) {
        dependencies.logger.log(
          `Authenticated Electric sync canary attempt ${attempt} failed before a response: ${lastBody}; waiting for container readiness.`
        );
        await dependencies.delay(config.intervalMs);
        continue;
      }

      break;
    }

    lastStatus = String(response.status);
    lastBody = summarizeBody(body);

    if (hasElectricResponseSignal(response, body)) {
      dependencies.logger.log(
        `Authenticated Electric sync canary passed with status ${response.status} on attempt ${attempt}.`
      );
      return {
        bodySummary: lastBody,
        status: response.status,
      };
    }

    if (attempt < config.attempts) {
      dependencies.logger.log(
        `Authenticated Electric sync canary attempt ${attempt} returned ${response.status}; waiting for container readiness.`
      );
      await dependencies.delay(config.intervalMs);
    }
  }

  throw new Error(
    `Authenticated Electric sync canary did not pass after ${config.attempts} attempts; last status=${lastStatus}${lastBody.length > 0 ? ` body=${lastBody}` : ""}.`
  );
}

export async function runDeployedSyncCanary(config, dependencies = {}) {
  const resolvedDependencies = {
    createDatabaseClient:
      dependencies.createDatabaseClient ??
      ((connectionString) => new PgClient({ connectionString })),
    delay: dependencies.delay ?? delay,
    fetch: requireFetch(dependencies.fetch ?? globalThis.fetch),
    logger: dependencies.logger ?? console,
  };
  const canaryId =
    dependencies.canaryId ??
    makeSyncCanaryId({
      now: dependencies.now,
      randomUUID: dependencies.randomUUID,
    });
  const cookieJar = new Map();

  resolvedDependencies.logger.log(
    `Starting authenticated Electric sync canary for stage ${config.stage}.`
  );

  const identity = await createVerifiedCanaryOrganization(
    config,
    resolvedDependencies,
    cookieJar,
    canaryId
  );
  const shape = await waitForAuthenticatedShape(
    config,
    resolvedDependencies,
    cookieJar
  );

  resolvedDependencies.logger.log(
    `Authenticated Electric sync canary finished for organization ${identity.organizationId}.`
  );

  return {
    ...identity,
    canaryId,
    shape,
  };
}

async function main() {
  const config = readDeployedSyncCanaryConfig();
  await runDeployedSyncCanary(config);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
