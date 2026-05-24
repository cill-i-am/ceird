import { describe, expect, it, vi } from "@effect/vitest";
import { Config, ConfigProvider, Effect, Logger, References } from "effect";

import {
  AuthEmailConfigurationError,
  AUTH_EMAIL_CONFIGURATION_ERROR_TAG,
} from "./domains/identity/authentication/auth-email-errors.js";
import type { AuthEmailQueueMessage } from "./domains/identity/authentication/auth-email-queue.js";
import { AuthenticationBackgroundTaskHandler } from "./domains/identity/authentication/auth.js";
import type {
  CloudflareEmailBindingMessage,
  CloudflareEmailBindingSendResult,
} from "./domains/identity/authentication/cloudflare-email-binding-auth-email-transport.js";
import { SiteGeocoder } from "./domains/sites/geocoder.js";
import type { DomainWorkerEnv } from "./platform/cloudflare/env.js";
import { domainWorkerEnvConfigMap } from "./platform/cloudflare/env.js";
import {
  disposeDomainWorkerHandler,
  DomainWorkerSiteGeocoderLive,
  getDomainWorkerMcpAuthorizedAppCache,
  handleWorkerFetch,
  handleWorkerQueue,
  makeDomainWorkerRuntimeLayers,
  makeWorkerBaseLive,
  makeWorkerAuthenticationBackgroundTaskHandlerLive,
  runWithDomainWorkerExecutionContext,
} from "./platform/cloudflare/runtime.js";
import {
  configProviderFromMap,
  effectEither,
} from "./test/effect-test-helpers.js";
import worker from "./worker.js";

type TestSendEmail = (
  message: CloudflareEmailBindingMessage
) => Promise<CloudflareEmailBindingSendResult>;

function captureLogs() {
  const logs: unknown[] = [];
  const logger = Logger.make((input) => {
    logs.push({
      annotations: input.fiber.getRef(References.CurrentLogAnnotations),
      level: input.logLevel.toUpperCase(),
      message: input.message,
    });
  });

  return { logger, logs };
}

function makePasswordResetQueueMessage(): AuthEmailQueueMessage {
  return {
    kind: "password-reset",
    payload: {
      deliveryKey:
        "password-reset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      recipientEmail: "alice@example.com",
      recipientName: "Alice",
      resetUrl: "https://app.example.com/reset-password?token=abc",
    },
  };
}

function makeMessage(body: unknown) {
  return {
    body,
    ack: vi.fn<() => void>(),
    retry: vi.fn<(options?: { readonly delaySeconds?: number }) => void>(),
  };
}

function makeBatch(messages: ReturnType<typeof makeMessage>[]) {
  return { messages } as unknown as MessageBatch<unknown>;
}

function makeExecutionContext() {
  return {
    passThroughOnException: vi.fn<() => void>(),
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
  } as unknown as ExecutionContext;
}

async function runWorkerQueue(
  batch: MessageBatch<unknown>,
  env: DomainWorkerEnv
) {
  await Effect.runPromise(handleWorkerQueue(batch, env));
}

async function runWorkerQueueAdapter(
  batch: MessageBatch<unknown>,
  env: DomainWorkerEnv
) {
  const queue = worker.queue as (
    batch: MessageBatch<unknown>,
    env: DomainWorkerEnv,
    context: ExecutionContext
  ) => Promise<void>;

  await queue(batch, env, makeExecutionContext());
}

function makeSendEmailMock(
  send: TestSendEmail = () => Promise.resolve({ messageId: "email_123" })
) {
  return vi.fn<TestSendEmail>(send);
}

function makeEnv(
  overrides?: Partial<DomainWorkerEnv> & {
    readonly sendEmail?: TestSendEmail;
  }
): DomainWorkerEnv {
  const { sendEmail: overrideSendEmail, ...envOverrides } = overrides ?? {};
  const sendEmail =
    overrideSendEmail ?? (() => Promise.resolve({ messageId: "email_123" }));

  return {
    AUTH_APP_ORIGIN: "https://app.example.com",
    AUTH_EMAIL: {
      send: sendEmail as SendEmail["send"],
    },
    AUTH_EMAIL_FROM: "auth@example.com",
    AUTH_EMAIL_FROM_NAME: "Ceird",
    AUTH_EMAIL_QUEUE: {
      send: () => Promise.resolve(),
    } as unknown as Queue<unknown>,
    AGENT_INTERNAL_SECRET: "agent-secret",
    BETTER_AUTH_BASE_URL: "https://api.example.com/api/auth",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    DATABASE: {
      connectionString: "postgresql://postgres:postgres@localhost:5432/app",
    } as Hyperdrive,
    GOOGLE_MAPS_API_KEY: "google-key",
    NODE_ENV: "test",
    ...envOverrides,
  };
}

describe("worker queue auth email delivery", () => {
  it("assembles request runtime layers from Cloudflare Worker bindings", async () => {
    const env = makeEnv();
    const runtimeLayers = makeDomainWorkerRuntimeLayers(env);

    const baseUrl = await Effect.runPromise(
      Config.string("BETTER_AUTH_BASE_URL").pipe(
        Effect.provide(runtimeLayers.baseLive)
      )
    );
    const geocoderRuntime = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* SiteGeocoder;
      }).pipe(
        Effect.provide(runtimeLayers.siteGeocoderLive),
        Effect.provide(runtimeLayers.baseLive),
        effectEither
      )
    );

    expect(baseUrl).toBe(env.BETTER_AUTH_BASE_URL);
    expect(geocoderRuntime._tag).toBe("Right");
    expect(runtimeLayers.authenticationLive).toBeDefined();
    expect(runtimeLayers.databaseRuntimeLive).toBeDefined();
  }, 10_000);

  it("keys the isolate MCP authorized app cache by Worker env cache options", () => {
    const oneEntryCache = getDomainWorkerMcpAuthorizedAppCache(
      makeWorkerBaseLive(
        makeEnv({
          MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES: "1",
          MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS: "60",
        })
      )
    );
    const sameOptionsCache = getDomainWorkerMcpAuthorizedAppCache(
      makeWorkerBaseLive(
        makeEnv({
          MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES: "1",
          MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS: "60",
        })
      )
    );
    const twoEntryCache = getDomainWorkerMcpAuthorizedAppCache(
      makeWorkerBaseLive(
        makeEnv({
          MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES: "2",
          MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS: "60",
        })
      )
    );

    expect(sameOptionsCache).toBe(oneEntryCache);
    expect(twoEntryCache).not.toBe(oneEntryCache);
  });

  it("logs sanitized diagnostics when Worker handler disposal fails", async () => {
    const { logger, logs } = captureLogs();
    const webHandler = {
      dispose: () =>
        Promise.reject(
          new Error(
            "dispose failed for https://api.example.com/mcp?token=secret-token"
          )
        ),
    } as Parameters<typeof disposeDomainWorkerHandler>[0];

    await disposeDomainWorkerHandler(webHandler).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    const serializedLogs = JSON.stringify(logs);

    expect(serializedLogs).toContain("web_handler_disposal_failed");
    expect(serializedLogs).toContain("https://api.example.com/mcp?");
    expect(serializedLogs).not.toContain("secret-token");
    expect(serializedLogs).not.toContain("token=secret");
  });

  it("logs domain Worker request IDs, Cloudflare ray IDs, and phase timings", async () => {
    const { logger, logs } = captureLogs();

    const response = await handleWorkerFetch(
      new Request("https://api.example.com/", {
        headers: {
          "cf-ray": "cf-ray-domain",
          "x-request-id": "req_domain_log",
        },
      }),
      makeEnv({
        ALCHEMY_STACK_NAME: "ceird",
        ALCHEMY_STAGE: "codex-signup-observability",
      }),
      makeExecutionContext()
    ).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    await expect(response.text()).resolves.toBe('"ceird api"');
    expect(response.headers.get("x-request-id")).toBe("req_domain_log");

    const requestLog = logs.find(
      (log) =>
        (log as { readonly message?: readonly unknown[] }).message?.[0] ===
        "Handled domain Worker request"
    );

    expect(requestLog).toMatchObject({
      annotations: expect.objectContaining({
        "alchemy.stackName": "ceird",
        "alchemy.stage": "codex-signup-observability",
        "ceird.adapter": "domain",
        "ceird.requestId": "req_domain_log",
        "cf.ray": "cf-ray-domain",
        "db.initMs": expect.any(Number),
        "db.preflightQuery": false,
        "domain.handlerInitMs": expect.any(Number),
        "domain.handlerMs": expect.any(Number),
        "http.durationMs": expect.any(Number),
        "http.method": "GET",
        "http.path": "/",
        "http.status": 200,
      }),
      level: "INFO",
      message: ["Handled domain Worker request"],
    });
  });

  it("routes authentication background tasks through Worker waitUntil", async () => {
    const context = makeExecutionContext();
    const waitUntil = vi.mocked(context.waitUntil);
    const task = Promise.resolve("done");

    await Effect.runPromise(
      Effect.gen(function* () {
        const scheduleBackgroundTask =
          yield* AuthenticationBackgroundTaskHandler;

        runWithDomainWorkerExecutionContext(context, () => {
          scheduleBackgroundTask(task);
        });
      }).pipe(
        Effect.provide(makeWorkerAuthenticationBackgroundTaskHandlerLive())
      )
    );

    expect(waitUntil).toHaveBeenCalledOnce();
    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
  });

  it("isolates failed authentication background tasks from Worker requests", async () => {
    const context = makeExecutionContext();
    const waitUntil = vi.mocked(context.waitUntil);
    const task = Promise.reject(new Error("queue unavailable"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await Effect.runPromise(
        Effect.gen(function* () {
          const scheduleBackgroundTask =
            yield* AuthenticationBackgroundTaskHandler;

          runWithDomainWorkerExecutionContext(context, () => {
            scheduleBackgroundTask(task);
          });
        }).pipe(
          Effect.provide(makeWorkerAuthenticationBackgroundTaskHandlerLive())
        )
      );

      expect(waitUntil).toHaveBeenCalledOnce();
      await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uses the active request context when scheduling background tasks", async () => {
    const firstContext = makeExecutionContext();
    const secondContext = makeExecutionContext();

    await Effect.runPromise(
      Effect.gen(function* () {
        const scheduleBackgroundTask =
          yield* AuthenticationBackgroundTaskHandler;

        runWithDomainWorkerExecutionContext(firstContext, () => {
          scheduleBackgroundTask(Promise.resolve("first"));
        });
        runWithDomainWorkerExecutionContext(secondContext, () => {
          scheduleBackgroundTask(Promise.resolve("second"));
        });
      }).pipe(
        Effect.provide(makeWorkerAuthenticationBackgroundTaskHandlerLive())
      )
    );

    expect(firstContext.waitUntil).toHaveBeenCalledOnce();
    expect(secondContext.waitUntil).toHaveBeenCalledOnce();
    await expect(
      vi.mocked(firstContext.waitUntil).mock.calls[0]?.[0]
    ).resolves.toBeUndefined();
    await expect(
      vi.mocked(secondContext.waitUntil).mock.calls[0]?.[0]
    ).resolves.toBeUndefined();
  });

  it("uses the Google geocoder layer with Worker environment config", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* SiteGeocoder;
      }).pipe(
        Effect.provide(DomainWorkerSiteGeocoderLive),
        Effect.provide(
          ConfigProvider.layer(
            configProviderFromMap(domainWorkerEnvConfigMap(makeEnv()))
          )
        ),
        effectEither
      )
    );

    expect(result._tag).toBe("Right");
  }, 10_000);

  it("acks messages after sending through the configured email binding", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    await runWorkerQueue(makeBatch([message]), makeEnv({ sendEmail }));

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);

  it("exposes queue delivery through the Cloudflare Worker adapter", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    await runWorkerQueueAdapter(makeBatch([message]), makeEnv({ sendEmail }));

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);

  it("retries messages when email binding delivery fails", async () => {
    const sendEmail = makeSendEmailMock(() =>
      Promise.reject(new Error("binding down"))
    );
    const message = makeMessage(makePasswordResetQueueMessage());

    await runWorkerQueue(makeBatch([message]), makeEnv({ sendEmail }));

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  }, 10_000);

  it("acks malformed queue messages without calling the email binding", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage({ kind: "password-reset", payload: {} });

    await runWorkerQueue(makeBatch([message]), makeEnv({ sendEmail }));

    expect(sendEmail).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);

  it("redacts malformed queue message diagnostics from Worker logs", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage({
      kind: "password-reset",
      payload: {
        deliveryKey: "password-reset/raw-token-like-value",
        recipientEmail: "alice@example.com",
        resetUrl: "https://app.example.com/reset-password?token=secret-token",
      },
    });
    const { logger, logs } = captureLogs();

    await handleWorkerQueue(makeBatch([message]), makeEnv({ sendEmail })).pipe(
      Effect.provide(Logger.layer([logger])),
      Effect.provideService(References.MinimumLogLevel, "Trace"),
      Effect.runPromise
    );

    const serializedLogs = JSON.stringify(logs);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(serializedLogs).toContain("schema_decode_failed");
    expect(serializedLogs).not.toContain("alice@example.com");
    expect(serializedLogs).not.toContain("secret-token");
    expect(serializedLogs).not.toContain("reset-password?token");
    expect(serializedLogs).not.toContain("raw-token-like-value");
  }, 10_000);

  it("fails fast when the Worker email binding is missing", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    const result = await Effect.runPromise(
      handleWorkerQueue(
        makeBatch([message]),
        makeEnv({
          AUTH_EMAIL: undefined as unknown as SendEmail,
          sendEmail,
        })
      ).pipe(effectEither)
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailConfigurationError);
    expect(result.left).toMatchObject({
      _tag: AUTH_EMAIL_CONFIGURATION_ERROR_TAG,
      message:
        "Worker auth email delivery requires the AUTH_EMAIL Worker binding",
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);

  it("fails fast when deployed auth email sender config is invalid", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    const result = await Effect.runPromise(
      handleWorkerQueue(
        makeBatch([message]),
        makeEnv({
          AUTH_EMAIL_FROM: "not-an-email",
          sendEmail,
        })
      ).pipe(effectEither)
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailConfigurationError);
    expect(result.left).toMatchObject({
      _tag: AUTH_EMAIL_CONFIGURATION_ERROR_TAG,
      message: "Invalid auth email configuration",
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);
});
