import type * as SentryCloudflare from "@sentry/cloudflare";

import type { AuthEmailQueueMessage } from "./domains/identity/authentication/auth-email-queue.js";
import type {
  CloudflareEmailBindingMessage,
  CloudflareEmailBindingSendResult,
} from "./domains/identity/authentication/cloudflare-email-binding-auth-email-transport.js";
import type { ApiWorkerEnv } from "./platform/cloudflare/env.js";
import worker from "./worker.js";

const sentryContinueTrace = vi.hoisted(() =>
  vi.fn<typeof SentryCloudflare.continueTrace>((_options, callback) =>
    callback()
  )
);
const sentryCaptureMessage = vi.hoisted(() =>
  vi.fn<typeof SentryCloudflare.captureMessage>()
);
const sentryStartSpan = vi.hoisted(() =>
  vi.fn<typeof SentryCloudflare.startSpan>((_options, callback) =>
    callback(
      {} as Parameters<Parameters<typeof SentryCloudflare.startSpan>[1]>[0]
    )
  )
);
const sentryWithSentry = vi.hoisted(() =>
  vi.fn<typeof SentryCloudflare.withSentry>(
    (_options, handler) => handler as never
  )
);

vi.mock(
  import("@sentry/cloudflare"),
  () =>
    ({
      captureMessage: sentryCaptureMessage,
      continueTrace: sentryContinueTrace,
      getTraceData: () => ({
        baggage: "sentry-environment=test",
        "sentry-trace": "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
      }),
      logger: {
        debug:
          vi.fn<
            (message: string, attributes?: Record<string, unknown>) => void
          >(),
        error:
          vi.fn<
            (message: string, attributes?: Record<string, unknown>) => void
          >(),
        fatal:
          vi.fn<
            (message: string, attributes?: Record<string, unknown>) => void
          >(),
        info: vi.fn<
          (message: string, attributes?: Record<string, unknown>) => void
        >(),
        trace:
          vi.fn<
            (message: string, attributes?: Record<string, unknown>) => void
          >(),
        warn: vi.fn<
          (message: string, attributes?: Record<string, unknown>) => void
        >(),
      },
      startSpan: sentryStartSpan,
      withSentry: sentryWithSentry,
    }) as unknown as typeof SentryCloudflare
);

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

function makeMessage(body: unknown, id = "msg_123") {
  return {
    attempts: 1,
    body,
    id,
    timestamp: new Date("2026-05-06T00:00:00.000Z"),
    ack: vi.fn<() => void>(),
    retry: vi.fn<(options?: { readonly delaySeconds?: number }) => void>(),
  };
}

function makeBatch(
  messages: ReturnType<typeof makeMessage>[],
  queue = "ceird-auth-email"
) {
  return {
    ackAll: vi.fn<() => void>(),
    messages,
    metadata: {},
    queue,
    retryAll: vi.fn<(options?: { readonly delaySeconds?: number }) => void>(),
  } as unknown as MessageBatch<unknown>;
}

function makeExecutionContext() {
  return {
    passThroughOnException: vi.fn<() => void>(),
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
  } as unknown as ExecutionContext;
}

async function runWorkerQueue(batch: MessageBatch<unknown>, env: ApiWorkerEnv) {
  const queue = worker.queue as (
    batch: MessageBatch<unknown>,
    env: ApiWorkerEnv,
    context: ExecutionContext
  ) => Promise<void>;

  await queue(batch, env, makeExecutionContext());
}

async function runWorkerFetch(request: Request, env: ApiWorkerEnv) {
  const fetch = worker.fetch as (
    request: Request,
    env: ApiWorkerEnv,
    context: ExecutionContext
  ) => Promise<Response>;

  return await fetch(request, env, makeExecutionContext());
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
    } as unknown as Queue<AuthEmailQueueMessage>,
    AUTH_EMAIL_TRANSPORT: "cloudflare-binding",
    BETTER_AUTH_BASE_URL: "https://api.example.com/api/auth",
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    DATABASE: {
      connectionString: "postgresql://postgres:postgres@localhost:5432/app",
    } as Hyperdrive,
    NODE_ENV: "test",
    ...envOverrides,
  };
}

describe("worker queue auth email delivery", () => {
  beforeEach(() => {
    sentryCaptureMessage.mockClear();
    sentryContinueTrace.mockClear();
    sentryStartSpan.mockClear();
  });

  it("acks messages after sending through the configured email binding", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    await runWorkerQueue(makeBatch([message]), makeEnv({ sendEmail }));

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);

  it("continues Sentry trace context around queued auth email delivery", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage({
      ...makePasswordResetQueueMessage(),
      traceContext: {
        baggage: "sentry-environment=production",
        sentryTrace: "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
      },
    });

    await runWorkerQueue(makeBatch([message]), makeEnv({ sendEmail }));

    expect(sentryContinueTrace).toHaveBeenCalledWith(
      {
        baggage: "sentry-environment=production",
        sentryTrace: "0123456789abcdef0123456789abcdef-0123456789abcdef-1",
      },
      expect.any(Function)
    );
    expect(sentryStartSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          "ceird.auth_email.kind": "password-reset",
          "messaging.destination.name": "ceird-auth-email",
          "messaging.message.id": "msg_123",
          "messaging.system": "cloudflare-queues",
        }),
        name: "AuthEmailQueue.process password-reset",
        op: "queue.process",
      }),
      expect.any(Function)
    );
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(message.ack).toHaveBeenCalledOnce();
  }, 10_000);

  it("captures dead-letter auth email queue messages in Sentry and acks them", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(
      makePasswordResetQueueMessage(),
      "dead_msg_123"
    );

    await runWorkerQueue(
      makeBatch([message], "ceird-auth-email-dlq"),
      makeEnv({
        AUTH_EMAIL_DEAD_LETTER_QUEUE_NAME: "ceird-auth-email-dlq",
        sendEmail,
      })
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sentryCaptureMessage).toHaveBeenCalledWith(
      "Auth email queue dead-letter message received",
      expect.objectContaining({
        extra: expect.objectContaining({
          authEmailQueueKind: "password-reset",
          authEmailQueueMessageId: "dead_msg_123",
          authEmailQueueName: "ceird-auth-email-dlq",
        }),
        level: "error",
        tags: expect.objectContaining({
          "ceird.queue": "auth-email-dead-letter",
        }),
      })
    );
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

  it("honors noop transport mode for queued auth email", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    await runWorkerQueue(
      makeBatch([message]),
      makeEnv({
        AUTH_EMAIL: undefined,
        AUTH_EMAIL_TRANSPORT: "noop",
        sendEmail,
      })
    );

    expect(sendEmail).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);
});

describe("worker fetch", () => {
  it("uses the Worker email scheduler when Cloudflare email binding auth is configured", async () => {
    await expect(
      runWorkerFetch(
        new Request("https://api.example.com/health"),
        makeEnv({ SITE_GEOCODER_MODE: "stub" })
      )
    ).rejects.toMatchObject({
      name: "(FiberFailure) @ceird/platform/database/AppDatabaseConnectionError",
    });
  }, 10_000);
});
