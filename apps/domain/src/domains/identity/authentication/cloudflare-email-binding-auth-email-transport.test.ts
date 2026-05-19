import { describe, expect, it, vi } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";

import { AuthEmailRequestError } from "./auth-email-errors.js";
import { AuthEmailTransport } from "./auth-email.js";
import type { TransportMessage } from "./auth-email.js";
import { CloudflareEmailBinding } from "./cloudflare-email-binding-auth-email-transport.js";

function makeConfigProvider() {
  return ConfigProvider.fromMap(
    new Map([
      ["AUTH_APP_ORIGIN", "https://app.ceird.localhost"],
      ["AUTH_EMAIL_FROM", "auth@ceird.localhost"],
      ["AUTH_EMAIL_FROM_NAME", "Ceird Auth"],
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

describe("cloudflare email binding auth email transport", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends a structured email through the worker email binding", async () => {
    const requests: unknown[] = [];
    const bindingLive = Layer.succeed(CloudflareEmailBinding, {
      send: (message) => {
        requests.push(message);
        return Promise.resolve({ messageId: "email_123" });
      },
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* AuthEmailTransport;
        yield* transport.send(makeMessage());
      }).pipe(
        Effect.provide(AuthEmailTransport.CloudflareBinding),
        Effect.provide(bindingLive),
        Effect.withConfigProvider(makeConfigProvider())
      )
    );

    expect(requests).toStrictEqual([
      {
        from: {
          email: "auth@ceird.localhost",
          name: "Ceird Auth",
        },
        to: "alice@example.com",
        subject: "Reset your password",
        text: "Reset link",
        html: "<p>Reset link</p>",
      },
    ]);
  }, 10_000);

  it("suppresses duplicate sends with the same deliveryKey", async () => {
    const requests: unknown[] = [];
    const bindingLive = Layer.succeed(CloudflareEmailBinding, {
      send: (message) => {
        requests.push(message);
        return Promise.resolve({ messageId: "email_123" });
      },
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* AuthEmailTransport;
        yield* transport.send(makeMessage());
        yield* transport.send(makeMessage());
      }).pipe(
        Effect.provide(AuthEmailTransport.CloudflareBinding),
        Effect.provide(bindingLive),
        Effect.withConfigProvider(makeConfigProvider())
      )
    );

    expect(requests).toHaveLength(1);
  }, 10_000);

  it("maps binding failures into AuthEmailRequestError", async () => {
    const bindingLive = Layer.succeed(CloudflareEmailBinding, {
      send: () => Promise.reject(new Error("sender domain not verified")),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* AuthEmailTransport;
        yield* transport.send(makeMessage());
      }).pipe(
        Effect.provide(AuthEmailTransport.CloudflareBinding),
        Effect.provide(bindingLive),
        Effect.withConfigProvider(makeConfigProvider()),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailRequestError);
    expect(result.left).toMatchObject({
      _tag: "AuthEmailRequestError",
      message: "Auth email request failed",
      cause: "sender domain not verified",
    });
  }, 10_000);

  it("redacts recipient addresses from binding failure causes", async () => {
    const bindingLive = Layer.succeed(CloudflareEmailBinding, {
      send: () =>
        Promise.reject(
          new Error("binding rejected alice@example.com for policy")
        ),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* AuthEmailTransport;
        yield* transport.send(makeMessage());
      }).pipe(
        Effect.provide(AuthEmailTransport.CloudflareBinding),
        Effect.provide(bindingLive),
        Effect.withConfigProvider(makeConfigProvider()),
        Effect.either
      )
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      return;
    }

    expect(result.left).toBeInstanceOf(AuthEmailRequestError);
    expect(result.left.cause).toBe(
      "binding rejected [redacted-email] for policy"
    );
    expect(result.left.cause).not.toContain("alice@example.com");
  }, 10_000);

  it("releases deliveryKey reservations after binding failures", async () => {
    const requests: unknown[] = [];
    let attempt = 0;
    const bindingLive = Layer.succeed(CloudflareEmailBinding, {
      send: (message) => {
        requests.push(message);
        attempt += 1;

        if (attempt === 1) {
          return Promise.reject(new Error("sender domain not verified"));
        }

        return Promise.resolve({ messageId: "email_123" });
      },
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const transport = yield* AuthEmailTransport;
        yield* transport.send(makeMessage()).pipe(Effect.either);
        yield* transport.send(makeMessage());
      }).pipe(
        Effect.provide(AuthEmailTransport.CloudflareBinding),
        Effect.provide(bindingLive),
        Effect.withConfigProvider(makeConfigProvider())
      )
    );

    expect(requests).toHaveLength(2);
  }, 10_000);
});
