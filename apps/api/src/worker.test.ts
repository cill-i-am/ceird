import { describe, expect, it, vi } from "@effect/vitest";
import { Config, ConfigProvider, Effect, Layer } from "effect";

import type { AuthEmailQueueMessage } from "./domains/identity/authentication/auth-email-queue.js";
import { AuthenticationBackgroundTaskHandler } from "./domains/identity/authentication/auth.js";
import type {
  CloudflareEmailBindingMessage,
  CloudflareEmailBindingSendResult,
} from "./domains/identity/authentication/cloudflare-email-binding-auth-email-transport.js";
import type { SiteGeocoder } from "./domains/sites/geocoder.js";
import type { ApiWorkerEnv } from "./platform/cloudflare/env.js";
import { apiWorkerEnvConfigMap } from "./platform/cloudflare/env.js";
import {
  WorkerApiSiteGeocoderLive,
  handleWorkerQueue,
  makeWorkerApiRuntimeLayers,
  makeWorkerAuthenticationBackgroundTaskHandlerLive,
} from "./platform/cloudflare/runtime.js";
import worker from "./worker.js";

type TestSendEmail = (
  message: CloudflareEmailBindingMessage
) => Promise<CloudflareEmailBindingSendResult>;

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

async function runWorkerQueue(batch: MessageBatch<unknown>, env: ApiWorkerEnv) {
  await Effect.runPromise(handleWorkerQueue(batch, env));
}

async function runWorkerQueueAdapter(
  batch: MessageBatch<unknown>,
  env: ApiWorkerEnv
) {
  const queue = worker.queue as (
    batch: MessageBatch<unknown>,
    env: ApiWorkerEnv,
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
  overrides?: Partial<ApiWorkerEnv> & {
    readonly sendEmail?: TestSendEmail;
  }
): ApiWorkerEnv {
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
    const runtimeLayers = makeWorkerApiRuntimeLayers(
      env,
      makeExecutionContext()
    );

    const baseUrl = await Effect.runPromise(
      Config.string("BETTER_AUTH_BASE_URL").pipe(
        Effect.provide(runtimeLayers.baseLive)
      )
    );
    const geocoderRuntime = await Effect.runPromise(
      Effect.runtime<SiteGeocoder>().pipe(
        Effect.provide(runtimeLayers.siteGeocoderLive),
        Effect.provide(runtimeLayers.baseLive),
        Effect.either
      )
    );

    expect(baseUrl).toBe(env.BETTER_AUTH_BASE_URL);
    expect(geocoderRuntime._tag).toBe("Right");
    expect(runtimeLayers.authenticationLive).toBeDefined();
    expect(runtimeLayers.databaseRuntimeLive).toBeDefined();
  }, 10_000);

  it("routes authentication background tasks through Worker waitUntil", async () => {
    const context = makeExecutionContext();
    const task = Promise.resolve("done");

    await Effect.runPromise(
      Effect.gen(function* () {
        const scheduleBackgroundTask =
          yield* AuthenticationBackgroundTaskHandler;

        scheduleBackgroundTask(task);
      }).pipe(
        Effect.provide(
          makeWorkerAuthenticationBackgroundTaskHandlerLive(context)
        )
      )
    );

    expect(context.waitUntil).toHaveBeenCalledWith(task);
  });

  it("uses the Google geocoder layer with Worker environment config", async () => {
    const result = await Effect.runPromise(
      Effect.runtime<SiteGeocoder>().pipe(
        Effect.provide(WorkerApiSiteGeocoderLive),
        Effect.provide(
          Layer.setConfigProvider(
            ConfigProvider.fromMap(apiWorkerEnvConfigMap(makeEnv()))
          )
        ),
        Effect.either
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

  it("fails fast when the Worker email binding is missing", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    await expect(
      runWorkerQueue(
        makeBatch([message]),
        makeEnv({
          AUTH_EMAIL: undefined as unknown as SendEmail,
          sendEmail,
        })
      )
    ).rejects.toThrow(/AUTH_EMAIL Worker binding/);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);

  it("fails fast when deployed auth email sender config is invalid", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    await expect(
      runWorkerQueue(
        makeBatch([message]),
        makeEnv({
          AUTH_EMAIL_FROM: "not-an-email",
          sendEmail,
        })
      )
    ).rejects.toThrow(/Invalid auth email configuration/);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);
});
