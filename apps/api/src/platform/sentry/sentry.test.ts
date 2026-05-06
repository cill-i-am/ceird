import { Option } from "effect";

import {
  apiSentryConfigFromWorkerEnv,
  formatApiSentryLogMessage,
  isApiSentryEnabled,
  makeApiSentryLayer,
  makeSentryOptions,
  scrubApiSentryEvent,
  scrubApiSentryLog,
  scrubApiSentrySpan,
  scrubApiSentryTransaction,
} from "./sentry.js";

describe("API Sentry configuration", () => {
  it("builds Sentry options with tracing and logs enabled", () => {
    const options = makeSentryOptions({
      dsn: Option.some(
        "https://3917e2b6a24f49a20d625a1e3b2b1674@o368240.ingest.us.sentry.io/4511339367563264"
      ),
      environment: "production",
      release: Option.some("api@abc123"),
      tracesSampleRate: 0.25,
    });

    expect(options).toStrictEqual({
      beforeSend: scrubApiSentryEvent,
      beforeSendLog: scrubApiSentryLog,
      beforeSendSpan: scrubApiSentrySpan,
      beforeSendTransaction: scrubApiSentryTransaction,
      dsn: "https://3917e2b6a24f49a20d625a1e3b2b1674@o368240.ingest.us.sentry.io/4511339367563264",
      enableMetrics: true,
      enableLogs: true,
      environment: "production",
      release: "api@abc123",
      tracesSampleRate: 0.25,
    });
  });

  it("omits optional Sentry options when no DSN is configured", () => {
    const options = makeSentryOptions({
      dsn: Option.none(),
      environment: "development",
      release: Option.none(),
      tracesSampleRate: 1,
    });

    expect(options).toStrictEqual({
      beforeSend: scrubApiSentryEvent,
      beforeSendLog: scrubApiSentryLog,
      beforeSendSpan: scrubApiSentrySpan,
      beforeSendTransaction: scrubApiSentryTransaction,
      dsn: undefined,
      enableMetrics: true,
      enableLogs: true,
      environment: "development",
      release: undefined,
      tracesSampleRate: 1,
    });
  });

  it("maps Cloudflare Worker env values into API Sentry config", () => {
    expect(
      apiSentryConfigFromWorkerEnv({
        NODE_ENV: "production",
        SENTRY_DSN: "https://public@example.com/1",
        SENTRY_ENVIRONMENT: "preview",
        SENTRY_RELEASE: "api@worker",
        SENTRY_TRACES_SAMPLE_RATE: "0.5",
      })
    ).toStrictEqual({
      dsn: Option.some("https://public@example.com/1"),
      environment: "preview",
      release: Option.some("api@worker"),
      tracesSampleRate: 0.5,
    });
  });

  it("falls back to full tracing when Worker trace sample rate is invalid", () => {
    expect(
      apiSentryConfigFromWorkerEnv({
        SENTRY_TRACES_SAMPLE_RATE: "0.5x",
      }).tracesSampleRate
    ).toBe(1);
  });

  it("scrubs request query strings and sensitive event attributes", () => {
    const event = scrubApiSentryEvent({
      type: undefined,
      request: {
        cookies: { session: "abc" },
        headers: {
          authorization: "Bearer session-token",
          cookie: "better-auth.session_token=session-token",
          "x-request-id": "req_123",
        },
        query_string: "token=secret",
        url: "https://api.example.com/api/auth/reset-password/token-secret?token=secret",
      },
      message:
        "failed https://api.example.com/api/auth/reset-password/token-secret?token=secret",
      spans: [
        {
          data: {
            callbackUrl:
              "https://api.example.com/api/auth/reset-password/token-secret?callbackURL=/settings",
            resetToken: "token-secret",
          },
          description: "GET /api/auth/reset-password/token-secret?token=secret",
          span_id: "span",
          start_timestamp: 1,
          trace_id: "trace",
        },
      ],
      transaction: "GET /api/auth/reset-password/token-secret?token=secret",
      extra: {
        authEmailQueueDeliveryKey: "organization-invitation/inv_123",
        jobId: "job_123",
      },
      tags: {
        resetToken: "secret",
        stage: "production",
      },
    });

    expect(event.request).toStrictEqual({
      headers: {
        authorization: "[Filtered]",
        cookie: "[Filtered]",
        "x-request-id": "req_123",
      },
      url: "https://api.example.com/api/auth/reset-password/[Filtered]",
    });
    expect(event.message).toBe(
      "failed https://api.example.com/api/auth/reset-password/[Filtered]"
    );
    expect(event.transaction).toBe("GET /api/auth/reset-password/[Filtered]");
    expect(event.spans?.[0]?.description).toBe(
      "GET /api/auth/reset-password/[Filtered]"
    );
    expect(event.spans?.[0]?.data).toStrictEqual({
      callbackUrl: "https://api.example.com/api/auth/reset-password/[Filtered]",
      resetToken: "[Filtered]",
    });
    expect(event.extra).toStrictEqual({
      authEmailQueueDeliveryKey: "[Filtered]",
      jobId: "job_123",
    });
    expect(event.tags).toStrictEqual({
      resetToken: "[Filtered]",
      stage: "production",
    });
  });

  it("scrubs sensitive log attributes before sending logs to Sentry", () => {
    const log = scrubApiSentryLog({
      attributes: {
        authEmailQueueDeliveryKey: "organization-invitation/inv_123",
        authEmailQueueFailureTag: "AuthEmailQueueDeliveryError",
      },
      level: "warn",
      message:
        '{"deliveryKey":"organization-invitation/inv_123","outcomeBucket":"request_failed"}',
    });

    expect(log.attributes).toStrictEqual({
      authEmailQueueDeliveryKey: "[Filtered]",
      authEmailQueueFailureTag: "AuthEmailQueueDeliveryError",
    });
    expect(log.message).toBe(
      '{"deliveryKey":"[Filtered]","outcomeBucket":"request_failed"}'
    );
  });

  it("scrubs sensitive span attributes before sending traces to Sentry", () => {
    const span = scrubApiSentrySpan({
      data: {
        authorization: "Bearer session-token",
        route: "/api/auth/reset-password/token-secret?token=secret",
      },
      description:
        "POST https://api.example.com/reset-password/token-secret?token=secret",
      span_id: "span",
      start_timestamp: 1,
      trace_id: "trace",
    });

    expect(span.description).toBe(
      "POST https://api.example.com/reset-password/[Filtered]"
    );
    expect(span.data).toStrictEqual({
      authorization: "[Filtered]",
      route: "/api/auth/reset-password/[Filtered]",
    });
  });

  it("formats Effect log message arguments as scrubbed Sentry attributes", () => {
    expect(
      formatApiSentryLogMessage([
        "Auth email transport send attempt",
        {
          deliveryKey: "organization-invitation/inv_123",
          outcomeBucket: "attempt",
          resetUrl: "https://app.example.com/reset-password?token=secret",
        },
      ])
    ).toStrictEqual({
      attributes: {
        deliveryKey: "[Filtered]",
        outcomeBucket: "attempt",
        resetUrl: "https://app.example.com/reset-password",
      },
      message: "Auth email transport send attempt",
    });
  });

  it("does not install Sentry layers without a DSN", () => {
    const config = {
      dsn: Option.none(),
      environment: "test",
      release: Option.none(),
      tracesSampleRate: 1,
    };

    expect(isApiSentryEnabled(config)).toBeFalsy();
    expect(makeApiSentryLayer(config)).toBeDefined();
  });
});
