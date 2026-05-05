import {
  SENTRY_DSN,
  createClientSentryOptions,
  createServerSentryOptions,
  sanitizeReplayRecordingEvent,
  sanitizeSentryEvent,
} from "./sentry-config";

describe("sentry configuration", () => {
  it("uses the configured Ceird Sentry project DSN", () => {
    expect(SENTRY_DSN).toBe(
      "https://3917e2b6a24f49a20d625a1e3b2b1674@o368240.ingest.us.sentry.io/4511339367563264"
    );
  });

  it("enables browser tracing, logs, and replay sampling", () => {
    const tracingIntegration = { name: "tracing" };
    const replayIntegration = { name: "replay" };

    const options = createClientSentryOptions({
      environment: "production",
      replayIntegration,
      tracingIntegration,
    });

    expect(options).toMatchObject({
      dsn: SENTRY_DSN,
      enableLogs: true,
      environment: "production",
      replaysOnErrorSampleRate: 1,
      replaysSessionSampleRate: 0.05,
      tracesSampleRate: 0.2,
    });
    expect(options.integrations).toStrictEqual([
      tracingIntegration,
      replayIntegration,
    ]);
    expect(options.beforeSend).toBeInstanceOf(Function);
    expect(options.beforeSendLog).toBeInstanceOf(Function);
    expect(options.beforeSendSpan).toBeInstanceOf(Function);
    expect(options.beforeSendTransaction).toBeInstanceOf(Function);
  });

  it("enables server tracing and logs", () => {
    expect(
      createServerSentryOptions({ environment: "production" })
    ).toMatchObject({
      dsn: SENTRY_DSN,
      enableLogs: true,
      environment: "production",
      tracesSampleRate: 0.2,
    });
  });

  it("redacts sensitive query parameters from Sentry events", () => {
    const event = sanitizeSentryEvent({
      breadcrumbs: [
        {
          data: {
            target: "/reset-password?token=secret&email=user@example.com",
          },
          message: "visit /oauth?code=abc&state=xyz",
        },
      ],
      request: {
        query_string: {
          code: "abc",
          email: "user@example.com",
          token: "secret",
        },
        url: "https://app.ceird.test/reset-password?token=secret&next=/",
      },
      spans: [
        {
          data: {
            "http.query": "token=secret&keep=value",
            url: "/accept-invite?invitation=invite-secret",
          },
          span_id: "span",
          start_timestamp: 1,
          trace_id: "trace",
        },
      ],
      transaction: "GET /reset-password?token=secret",
      type: "transaction",
    });

    expect(event.request?.url).toBe(
      "https://app.ceird.test/reset-password?token=%5BFiltered%5D&next=%2F"
    );
    expect(event.request?.query_string).toStrictEqual({
      code: "[Filtered]",
      email: "user@example.com",
      token: "[Filtered]",
    });
    expect(event.transaction).toBe("GET /reset-password?token=%5BFiltered%5D");
    expect(event.breadcrumbs?.[0]?.data?.target).toBe(
      "/reset-password?token=%5BFiltered%5D&email=user%40example.com"
    );
    expect(event.breadcrumbs?.[0]?.message).toBe(
      "visit /oauth?code=%5BFiltered%5D&state=%5BFiltered%5D"
    );
    expect(event.spans?.[0]?.data["http.query"]).toBe(
      "token=%5BFiltered%5D&keep=value"
    );
    expect(event.spans?.[0]?.data.url).toBe(
      "/accept-invite?invitation=%5BFiltered%5D"
    );
  });

  it("redacts sensitive query parameters from replay recording events", () => {
    const event = sanitizeReplayRecordingEvent({
      data: {
        payload: {
          to: "/reset-password?token=secret",
        },
      },
    });

    expect(event.data.payload.to).toBe("/reset-password?token=%5BFiltered%5D");
  });
});
