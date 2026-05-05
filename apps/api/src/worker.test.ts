import type { AuthEmailQueueMessage } from "./domains/identity/authentication/auth-email-queue.js";
import type {
  CloudflareEmailBindingMessage,
  CloudflareEmailBindingSendResult,
} from "./domains/identity/authentication/cloudflare-email-binding-auth-email-transport.js";
import type { ApiWorkerEnv } from "./platform/cloudflare/env.js";
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
  it("acks messages after sending through the configured email binding", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    await worker.queue(makeBatch([message]), makeEnv({ sendEmail }));

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);

  it("retries messages when email binding delivery fails", async () => {
    const sendEmail = makeSendEmailMock(() =>
      Promise.reject(new Error("binding down"))
    );
    const message = makeMessage(makePasswordResetQueueMessage());

    await worker.queue(makeBatch([message]), makeEnv({ sendEmail }));

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  }, 10_000);

  it("acks malformed queue messages without calling the email binding", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage({ kind: "password-reset", payload: {} });

    await worker.queue(makeBatch([message]), makeEnv({ sendEmail }));

    expect(sendEmail).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  }, 10_000);

  it("honors noop transport mode for queued auth email", async () => {
    const sendEmail = makeSendEmailMock();
    const message = makeMessage(makePasswordResetQueueMessage());

    await worker.queue(
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
