/// <reference types="@cloudflare/workers-types" />

/* eslint-disable promise/prefer-await-to-then -- Effect.catch is Effect error handling, not Promise chaining. */

import { Duration, Effect } from "effect";

import type { SyncWorkerEnv } from "./env.js";

const electricPort = 3000;
const electricReadinessAttempts = 8;
const maxElectricReadinessDelayMs = 1000;
const containerReadinessByState = new WeakMap<
  DurableObjectState,
  Promise<void>
>();
const readyContainerStates = new WeakSet<DurableObjectState>();

export class ElectricSql {
  private readonly ctx: DurableObjectState;
  readonly env: SyncWorkerEnv;

  constructor(ctx: DurableObjectState, env: SyncWorkerEnv) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    return await Effect.runPromise(handleElectricSqlFetch(request, this.ctx));
  }
}

export function handleElectricSqlFetch(
  request: Request,
  state: DurableObjectState
) {
  return Effect.tryPromise({
    catch: (cause) =>
      cause instanceof Error
        ? cause
        : new Error("Electric container request failed", { cause }),
    try: async () => {
      const { container } = state;

      if (container === undefined) {
        await Effect.runPromise(
          Effect.logWarning("Electric container unavailable").pipe(
            Effect.annotateLogs(makeElectricSqlRequestAnnotations(request))
          )
        );

        return Response.json(
          { error: "electric_container_unavailable" },
          { status: 503 }
        );
      }

      try {
        await ensureElectricContainerReady(state, container, request);
      } catch (error) {
        await Effect.runPromise(
          Effect.logWarning("Electric container readiness failed").pipe(
            Effect.annotateLogs({
              ...makeElectricSqlRequestAnnotations(request),
              "electric.error": formatUnknownError(error),
            })
          )
        );

        return Response.json(
          { error: "electric_container_unavailable" },
          {
            headers: {
              "retry-after": "1",
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

      return await container.getTcpPort(electricPort).fetch(containerRequest);
    },
  }).pipe(
    Effect.catch((error: Error) =>
      Effect.gen(function* () {
        yield* Effect.logWarning("Electric container forwarding failed").pipe(
          Effect.annotateLogs({
            "electric.error": error.message,
            "http.path": requestPathname(request.url),
            "http.request_id": request.headers.get("x-request-id") ?? undefined,
          })
        );

        return Response.json(
          { error: "electric_container_forwarding_failed" },
          { status: 502 }
        );
      })
    )
  );
}

function ensureElectricContainerReady(
  state: DurableObjectState,
  container: NonNullable<DurableObjectState["container"]>,
  request: Request
) {
  const existingReadiness = containerReadinessByState.get(state);

  if (existingReadiness !== undefined) {
    return existingReadiness;
  }

  if (container.running && readyContainerStates.has(state)) {
    return Promise.resolve();
  }

  const readiness = state
    .blockConcurrencyWhile(async () => {
      if (!container.running) {
        container.start();
        state.waitUntil(monitorElectricContainer(state, container, request));
      }

      await waitForElectricContainerPort(container);
      readyContainerStates.add(state);
    })
    .finally(() => {
      containerReadinessByState.delete(state);
    });

  containerReadinessByState.set(state, readiness);

  return readiness;
}

async function waitForElectricContainerPort(
  container: NonNullable<DurableObjectState["container"]>
) {
  const port = container.getTcpPort(electricPort);
  let lastError: unknown;

  for (let attempt = 0; attempt < electricReadinessAttempts; attempt += 1) {
    try {
      const response = await port.fetch("http://electric/v1/health");

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

function monitorElectricContainer(
  state: DurableObjectState,
  container: NonNullable<DurableObjectState["container"]>,
  request: Request
) {
  return Effect.runPromise(
    Effect.tryPromise({
      catch: (cause) =>
        cause instanceof Error
          ? cause
          : new Error("Electric container monitor failed", { cause }),
      try: () => container.monitor(),
    }).pipe(
      Effect.ensuring(Effect.sync(() => readyContainerStates.delete(state))),
      Effect.catch((error: Error) =>
        Effect.logError("Electric container monitor failed").pipe(
          Effect.annotateLogs({
            ...makeElectricSqlRequestAnnotations(request),
            "electric.error": error.message,
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
  return error instanceof Error ? error.message : String(error);
}
