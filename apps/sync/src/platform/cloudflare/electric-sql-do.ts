/// <reference types="@cloudflare/workers-types" />

/* eslint-disable promise/prefer-await-to-then -- Effect.catch is Effect error handling, not Promise chaining. */

import { Duration, Effect } from "effect";

import {
  ELECTRIC_SQL_CONTAINER_ERROR_TAG,
  ElectricSqlContainerError,
} from "./electric-sql-do-errors.js";
import type { SyncWorkerEnv } from "./env.js";

const electricPort = 3000;
const electricReadinessAttempts = 45;
const electricReadinessFetchTimeoutMs = 1000;
const maxElectricReadinessDelayMs = 1000;
const containerReadinessByState = new WeakMap<
  DurableObjectState,
  Promise<void>
>();
const monitoredContainerStates = new WeakSet<DurableObjectState>();
const readyContainerStates = new WeakSet<DurableObjectState>();

export class ElectricSql {
  private readonly ctx: DurableObjectState;
  readonly env: SyncWorkerEnv;

  constructor(ctx: DurableObjectState, env: SyncWorkerEnv) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    return await Effect.runPromise(
      handleElectricSqlFetch(request, this.ctx, this.env)
    );
  }
}

export function handleElectricSqlFetch(
  request: Request,
  state: DurableObjectState,
  env: SyncWorkerEnv
) {
  return Effect.gen(function* () {
    const { container } = state;

    if (container === undefined) {
      yield* Effect.logWarning("Electric container unavailable").pipe(
        Effect.annotateLogs(makeElectricSqlRequestAnnotations(request))
      );

      return Response.json(
        { error: "electric_container_unavailable" },
        { status: 503 }
      );
    }

    const ready = yield* Effect.tryPromise({
      catch: (cause) =>
        new ElectricSqlContainerError({
          failureCause: formatUnknownError(cause),
          failureTag: "ReadinessFailed",
          message: "Electric container readiness failed",
        }),
      try: () => ensureElectricContainerReady(state, container, env, request),
    }).pipe(
      Effect.as(true),
      Effect.catchTag(ELECTRIC_SQL_CONTAINER_ERROR_TAG, (error) =>
        Effect.logWarning("Electric container readiness failed").pipe(
          Effect.annotateLogs({
            ...makeElectricSqlRequestAnnotations(request),
            "electric.error": error.failureCause,
          }),
          Effect.as(false)
        )
      )
    );

    if (!ready) {
      return Response.json(
        { error: "electric_container_unavailable" },
        {
          headers: {
            "retry-after": "2",
          },
          status: 503,
        }
      );
    }

    const targetUrl = new URL(request.url);
    const containerUrl = new URL(
      `${targetUrl.pathname}${targetUrl.search}`,
      "http://electric"
    );
    const containerRequest = new Request(containerUrl, request);

    return yield* Effect.tryPromise({
      catch: (cause) =>
        new ElectricSqlContainerError({
          failureCause: formatUnknownError(cause),
          failureTag: "ForwardingFailed",
          message: "Electric container forwarding failed",
        }),
      try: () => container.getTcpPort(electricPort).fetch(containerRequest),
    }).pipe(
      Effect.catchTag(ELECTRIC_SQL_CONTAINER_ERROR_TAG, (error) =>
        Effect.logWarning("Electric container forwarding failed").pipe(
          Effect.annotateLogs({
            ...makeElectricSqlRequestAnnotations(request),
            "electric.error": error.failureCause,
          }),
          Effect.as(
            Response.json(
              { error: "electric_container_forwarding_failed" },
              { status: 502 }
            )
          )
        )
      )
    );
  });
}

function ensureElectricContainerReady(
  state: DurableObjectState,
  container: NonNullable<DurableObjectState["container"]>,
  env: SyncWorkerEnv,
  request: Request
) {
  const existingReadiness = containerReadinessByState.get(state);

  if (existingReadiness !== undefined) {
    return existingReadiness;
  }

  if (container.running && readyContainerStates.has(state)) {
    return Promise.resolve();
  }

  const readiness = ensureElectricContainerStarted(
    state,
    container,
    env,
    request
  )
    .then(async () => {
      await waitForElectricContainerPort(container);
      readyContainerStates.add(state);
    })
    .finally(() => {
      containerReadinessByState.delete(state);
    });

  containerReadinessByState.set(state, readiness);

  return readiness;
}

function ensureElectricContainerStarted(
  state: DurableObjectState,
  container: NonNullable<DurableObjectState["container"]>,
  env: SyncWorkerEnv,
  request: Request
) {
  return state.blockConcurrencyWhile(() => {
    if (!container.running) {
      container.start({
        enableInternet: true,
        env: makeElectricContainerStartupEnv(env),
      });
    }

    if (!monitoredContainerStates.has(state)) {
      monitoredContainerStates.add(state);
      state.waitUntil(monitorElectricContainer(state, container, request));
    }

    return Promise.resolve();
  });
}

function makeElectricContainerStartupEnv(env: SyncWorkerEnv) {
  return {
    AWS_ACCESS_KEY_ID: readRequiredElectricContainerEnv(
      env,
      "ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID"
    ),
    AWS_SECRET_ACCESS_KEY: readRequiredElectricContainerEnv(
      env,
      "ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY"
    ),
    CEIRD_ELECTRIC_STORAGE_BACKEND: "r2",
    CEIRD_ELECTRIC_STORAGE_MOUNT: "/var/lib/electric",
    DATABASE_URL: readRequiredElectricContainerEnv(
      env,
      "ELECTRIC_CONTAINER_DATABASE_URL"
    ),
    ELECTRIC_INSECURE: "false",
    ELECTRIC_LOG_LEVEL: "info",
    ELECTRIC_PERSISTENT_STATE: "file",
    ELECTRIC_PORT: "3000",
    ELECTRIC_SECRET: readRequiredElectricContainerEnv(
      env,
      "ELECTRIC_CONTAINER_ELECTRIC_SECRET"
    ),
    ELECTRIC_SHAPE_DB_EXCLUSIVE_MODE: "true",
    ELECTRIC_STORAGE: "fast_file",
    ELECTRIC_STORAGE_DIR: "/var/lib/electric",
    R2_ACCOUNT_ID: readRequiredElectricContainerEnv(
      env,
      "ELECTRIC_CONTAINER_R2_ACCOUNT_ID"
    ),
    R2_BUCKET_NAME: readRequiredElectricContainerEnv(
      env,
      "ELECTRIC_CONTAINER_R2_BUCKET_NAME"
    ),
  } satisfies Record<string, string>;
}

function readRequiredElectricContainerEnv(
  env: SyncWorkerEnv,
  key:
    | "ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID"
    | "ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY"
    | "ELECTRIC_CONTAINER_DATABASE_URL"
    | "ELECTRIC_CONTAINER_ELECTRIC_SECRET"
    | "ELECTRIC_CONTAINER_R2_ACCOUNT_ID"
    | "ELECTRIC_CONTAINER_R2_BUCKET_NAME"
) {
  const value = env[key]?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(
      `Missing required Electric container startup env var: ${key}`
    );
  }

  return value;
}

async function waitForElectricContainerPort(
  container: NonNullable<DurableObjectState["container"]>
) {
  const port = container.getTcpPort(electricPort);
  let lastError: unknown;

  for (let attempt = 0; attempt < electricReadinessAttempts; attempt += 1) {
    try {
      const response = await fetchElectricHealth(port);

      await response.body?.cancel();
      if (response.status === 200) {
        return;
      }

      lastError = new Error(
        `Electric health check returned ${String(response.status)}`
      );
    } catch (error) {
      lastError = error;
    }

    await Effect.runPromise(Effect.sleep(readinessDelay(attempt)));
  }

  throw new Error("Electric container port did not become ready", {
    cause: lastError,
  });
}

async function fetchElectricHealth(port: Fetcher) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    electricReadinessFetchTimeoutMs
  );

  try {
    return await port.fetch("http://electric/v1/health", {
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function monitorElectricContainer(
  state: DurableObjectState,
  container: NonNullable<DurableObjectState["container"]>,
  request: Request
) {
  return Effect.runPromise(
    Effect.tryPromise({
      catch: (cause) =>
        new ElectricSqlContainerError({
          failureCause: formatUnknownError(cause),
          failureTag: "MonitorFailed",
          message: "Electric container monitor failed",
        }),
      try: () => container.monitor(),
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          monitoredContainerStates.delete(state);
          readyContainerStates.delete(state);
        })
      ),
      Effect.catchTag(ELECTRIC_SQL_CONTAINER_ERROR_TAG, (error) =>
        Effect.logError("Electric container monitor failed").pipe(
          Effect.annotateLogs({
            ...makeElectricSqlRequestAnnotations(request),
            "electric.error": error.failureCause,
          })
        )
      )
    )
  );
}

function readinessDelay(attempt: number) {
  return Duration.millis(
    Math.min(100 * 2 ** attempt, maxElectricReadinessDelayMs)
  );
}

function makeElectricSqlRequestAnnotations(request: Request) {
  return {
    "http.path": requestPathname(request.url),
    "http.request_id": request.headers.get("x-request-id") ?? undefined,
  };
}

function requestPathname(url: string) {
  return new URL(url).pathname;
}

function formatUnknownError(error: unknown) {
  return redactElectricSensitiveError(
    error instanceof Error ? error.message : String(error)
  );
}

function redactElectricSensitiveError(input: string) {
  return input
    .replaceAll(/([?&]secret=)[^&\s)"']+/giu, "$1[REDACTED]")
    .replaceAll(/([?&]params%5B[^=]+%5D=)[^&\s)"']+/giu, "$1[REDACTED]")
    .replaceAll(/([?&]params\[[^\]]+\]=)[^&\s)"']+/giu, "$1[REDACTED]");
}
