import { Option } from "effect";

import {
  apiSentryConfigFromWorkerEnv,
  formatApiSentryLogMessage,
  isApiSentryEnabled,
  makeApiSentryLayer,
  makeSentryOptions,
  scrubApiSentryEvent,
  scrubApiSentryLog,
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
        query_string: "token=secret",
        url: "https://api.example.com/api/auth/reset-password?token=secret",
      },
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
      url: "https://api.example.com/api/auth/reset-password",
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
