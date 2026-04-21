import { ConfigProvider, Effect } from "effect";

import {
  AuthEmailRejectedError,
  AuthEmailRequestError,
} from "./auth-email-errors.js";
import type { TransportMessage } from "./auth-email.js";
import { makeCloudflareAuthEmailTransport } from "./cloudflare-auth-email-transport.js";

function makeConfigProvider() {
  return ConfigProvider.fromMap(
    new Map([
      ["AUTH_APP_ORIGIN", "https://app.task-tracker.localhost"],
      ["AUTH_EMAIL_FROM", "auth@task-tracker.localhost"],
      ["AUTH_EMAIL_FROM_NAME", "Task Tracker Auth"],
      ["CLOUDFLARE_ACCOUNT_ID", "account_123"],
      ["CLOUDFLARE_API_TOKEN", "token_123"],
    ])
  );
}

function makeMessage(overrides?: Partial<TransportMessage>): TransportMessage {
  return {
    to: "alice@example.com",
    subject: "Reset your password",
    text: "Reset link",
    html: "<p>Reset link</p>",
    deliveryKey:
      "password-reset/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ...overrides,
  };
}

describe("makeCloudflareAuthEmailTransport()", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the configured Cloudflare account path and sender payload", async () => {
    const requests: unknown[] = [];

    await Effect.runPromise(
      Effect.flatMap(
        makeCloudflareAuthEmailTransport({
          cloudflare: {
            send: (params) => {
              requests.push(params);

              return Promise.resolve({
                delivered: ["alice@example.com"],
                permanent_bounces: [],
                queued: [],
              });
            },
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()))
    );

    expect(requests).toStrictEqual([
      {
        account_id: "account_123",
        from: {
          address: "auth@task-tracker.localhost",
          name: "Task Tracker Auth",
        },
        to: ["alice@example.com"],
        subject: "Reset your password",
        text: "Reset link",
        html: "<p>Reset link</p>",
      },
    ]);
  }, 10_000);

  it("keeps deliveryKey out of the Cloudflare provider payload", async () => {
    const requests: unknown[] = [];

    await Effect.runPromise(
      Effect.flatMap(
        makeCloudflareAuthEmailTransport({
          cloudflare: {
            send: (params) => {
              requests.push(params);

              return Promise.resolve({
                delivered: [],
                permanent_bounces: [],
                queued: ["alice@example.com"],
              });
            },
          },
        }),
        (transport) =>
          transport.send({
            ...makeMessage(),
            deliveryKey:
              "password-reset/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          })
      ).pipe(Effect.withConfigProvider(makeConfigProvider()))
    );

    expect(requests).toStrictEqual([
      {
        account_id: "account_123",
        from: {
          address: "auth@task-tracker.localhost",
          name: "Task Tracker Auth",
        },
        to: ["alice@example.com"],
        subject: "Reset your password",
        text: "Reset link",
        html: "<p>Reset link</p>",
      },
    ]);
  }, 10_000);

  it("maps permanent bounces into AuthEmailRejectedError", async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(
        makeCloudflareAuthEmailTransport({
          cloudflare: {
            send: () =>
              Promise.resolve({
                delivered: [],
                permanent_bounces: ["alice@example.com"],
                queued: [],
              }),
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()), Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailRejectedError);
    expect(result.left).toMatchObject({
      _tag: "AuthEmailRejectedError",
      message: "Auth email was rejected",
      cause: "Cloudflare permanently bounced recipient at example.com",
    });
    expect(result.left.cause).not.toContain("alice@example.com");
  }, 10_000);

  it("suppresses duplicate sends with the same deliveryKey", async () => {
    const requests: unknown[] = [];

    const transport = await Effect.runPromise(
      makeCloudflareAuthEmailTransport({
        cloudflare: {
          send: (params) => {
            requests.push(params);

            return Promise.resolve({
              delivered: ["alice@example.com"],
              permanent_bounces: [],
              queued: [],
            });
          },
        },
      }).pipe(Effect.withConfigProvider(makeConfigProvider()))
    );

    await Effect.runPromise(transport.send(makeMessage()));
    await Effect.runPromise(transport.send(makeMessage()));

    expect(requests).toHaveLength(1);
  }, 10_000);

  it("keeps request-failure reservations alive long enough to dedupe immediate retries", async () => {
    const requests: unknown[] = [];
    let attempt = 0;

    const transport = await Effect.runPromise(
      makeCloudflareAuthEmailTransport({
        cloudflare: {
          send: (params) => {
            requests.push(params);
            attempt += 1;

            if (attempt === 1) {
              return Promise.reject(new Error("socket hang up"));
            }

            return Promise.resolve({
              delivered: ["alice@example.com"],
              permanent_bounces: [],
              queued: [],
            });
          },
        },
      }).pipe(Effect.withConfigProvider(makeConfigProvider()))
    );

    const firstAttempt = await Effect.runPromise(
      transport.send(makeMessage()).pipe(Effect.either)
    );

    expect(firstAttempt._tag).toBe("Left");

    await Effect.runPromise(transport.send(makeMessage()));

    expect(requests).toHaveLength(1);
  }, 10_000);

  it("expires stale deliveryKey reservations after the ttl elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T12:00:00.000Z"));

    const requests: unknown[] = [];

    const transport = await Effect.runPromise(
      makeCloudflareAuthEmailTransport({
        cloudflare: {
          send: (params) => {
            requests.push(params);

            return Promise.resolve({
              delivered: ["alice@example.com"],
              permanent_bounces: [],
              queued: [],
            });
          },
        },
      }).pipe(Effect.withConfigProvider(makeConfigProvider()))
    );

    await Effect.runPromise(transport.send(makeMessage()));

    vi.setSystemTime(new Date("2026-04-21T12:10:01.000Z"));

    await Effect.runPromise(transport.send(makeMessage()));

    expect(requests).toHaveLength(2);
  }, 10_000);

  it("maps Cloudflare request failures into AuthEmailRequestError", async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(
        makeCloudflareAuthEmailTransport({
          cloudflare: {
            send: () => Promise.reject(new Error("socket hang up")),
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()), Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailRequestError);
    expect(result.left).toMatchObject({
      _tag: "AuthEmailRequestError",
      message: "Auth email request failed",
      cause: "socket hang up",
    });
  }, 10_000);

  it("fails when Cloudflare returns an unexpected single-recipient response", async () => {
    const result = await Effect.runPromise(
      Effect.flatMap(
        makeCloudflareAuthEmailTransport({
          cloudflare: {
            send: () =>
              Promise.resolve({
                delivered: ["alice@example.com"],
                permanent_bounces: [],
                queued: ["other@example.com"],
              }),
          },
        }),
        (transport) => transport.send(makeMessage())
      ).pipe(Effect.withConfigProvider(makeConfigProvider()), Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailRequestError);
    expect(result.left).toMatchObject({
      _tag: "AuthEmailRequestError",
      message: "Auth email request failed",
      cause:
        "Cloudflare returned an unexpected single-recipient delivery status",
    });
  }, 10_000);
});
