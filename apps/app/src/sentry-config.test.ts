import {
  SENTRY_DSN,
  applySentryRouteContext,
  clearSentryRouteContext,
  createClientSentryOptions,
  createSentryTracePropagationTargets,
  sanitizeReplayRecordingEvent,
  sanitizeSentryEvent,
} from "./sentry-config";

describe("sentry configuration", () => {
  it("uses the configured Ceird app Sentry project DSN", () => {
    expect(SENTRY_DSN).toBe(
      "https://a6db1d95f474e8443fa3435bb95eed76@o368240.ingest.us.sentry.io/4511339382964224"
    );
  });

  it("enables browser tracing, logs, and replay sampling", () => {
    const tracingIntegration = { name: "tracing" };
    const replayIntegration = { name: "replay" };
    const feedbackIntegration = { name: "feedback" };
    const profilingIntegration = { name: "browser-profiling" };

    const options = createClientSentryOptions({
      apiOrigin: "https://api.ceird.app",
      feedbackIntegration,
      profilingIntegration,
      environment: "production",
      replayIntegration,
      tracingIntegration,
    });

    expect(options).toMatchObject({
      dsn: SENTRY_DSN,
      enableLogs: true,
      environment: "production",
      profilesSampleRate: 1,
      replaysOnErrorSampleRate: 1,
      replaysSessionSampleRate: 0.05,
      tracesSampleRate: 1,
    });
    expect(
      doesPropagateTrace(
        options.tracePropagationTargets ?? [],
        "https://api.ceird.app/jobs"
      )
    ).toBeTruthy();
    expect(options.integrations).toStrictEqual([
      tracingIntegration,
      replayIntegration,
      feedbackIntegration,
      profilingIntegration,
    ]);
    expect(options.beforeSend).toBeInstanceOf(Function);
    expect(options.beforeSendLog).toBeInstanceOf(Function);
    expect(options.beforeSendSpan).toBeInstanceOf(Function);
    expect(options.beforeSendTransaction).toBeInstanceOf(Function);
  });

  it("matches production, portless, sandbox, and loopback API origins for trace propagation", () => {
    const targets = createSentryTracePropagationTargets(
      "https://agent-one.api.ceird.localhost:1355"
    );

    expect(
      doesPropagateTrace(targets, "https://api.ceird.app/jobs")
    ).toBeTruthy();
    expect(
      doesPropagateTrace(
        targets,
        "https://agent-one.api.ceird.localhost:1355/jobs"
      )
    ).toBeTruthy();
    expect(
      doesPropagateTrace(targets, "http://127.0.0.1:3001/jobs")
    ).toBeTruthy();
    expect(
      doesPropagateTrace(targets, "https://billing.example.com")
    ).toBeFalsy();
    expect(
      doesPropagateTrace(targets, "https://api.ceird.app.evil.example/jobs")
    ).toBeFalsy();
  });

  it("sets privacy-preserving Sentry route context", () => {
    const setUser = vi.fn<(user: { readonly id: string } | null) => void>();
    const setTag = vi.fn<(key: string, value: string | undefined) => void>();

    applySentryRouteContext(
      { setTag, setUser },
      {
        activeOrganizationId: "org_123",
        currentOrganizationRole: "admin",
        userId: "user_123",
      }
    );

    expect(setUser).toHaveBeenCalledWith({ id: "user_123" });
    expect(setTag).toHaveBeenCalledWith("ceird.organization_id", "org_123");
    expect(setTag).toHaveBeenCalledWith("ceird.organization_role", "admin");
  });

  it("clears organization route context when no organization is active", () => {
    const setUser = vi.fn<(user: { readonly id: string } | null) => void>();
    const setTag = vi.fn<(key: string, value: string | undefined) => void>();

    applySentryRouteContext(
      { setTag, setUser },
      {
        activeOrganizationId: null,
        currentOrganizationRole: undefined,
        userId: "user_123",
      }
    );

    expect(setUser).toHaveBeenCalledWith({ id: "user_123" });
    expect(setTag).toHaveBeenCalledWith("ceird.organization_id", undefined);
    expect(setTag).toHaveBeenCalledWith("ceird.organization_role", undefined);
  });

  it("clears Sentry user and organization context", () => {
    const setUser = vi.fn<(user: { readonly id: string } | null) => void>();
    const setTag = vi.fn<(key: string, value: string | undefined) => void>();

    clearSentryRouteContext({ setTag, setUser });

    expect(setUser).toHaveBeenCalledWith(null);
    expect(setTag).toHaveBeenCalledWith("ceird.organization_id", undefined);
    expect(setTag).toHaveBeenCalledWith("ceird.organization_role", undefined);
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
        cookies: {
          "better-auth.session_token": "session-token",
        },
        headers: {
          authorization: "Bearer token",
          cookie: "better-auth.session_token=session-token",
          "x-request-id": "req_123",
        },
        query_string: {
          code: "abc",
          email: "user@example.com",
          token: "secret",
        },
        url: "https://app.ceird.test/reset-password?token=secret&next=/",
      },
      contexts: {
        link: {
          url: "/api/auth/reset-password/token-secret?callbackURL=/settings",
        },
      },
      extra: {
        callbackUrl: "/reset-password/token-secret?next=/",
        nested: {
          resetToken: "secret",
        },
      },
      message: "failed /api/auth/reset-password/token-secret?token=secret",
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
      tags: {
        invitationToken: "invite-secret",
        stage: "production",
      },
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
    expect(event.request).not.toHaveProperty("cookies");
    expect(event.request?.headers).toStrictEqual({
      authorization: "[Filtered]",
      cookie: "[Filtered]",
      "x-request-id": "req_123",
    });
    expect(event.message).toBe(
      "failed /api/auth/reset-password/[Filtered]?token=%5BFiltered%5D"
    );
    expect(event.extra?.callbackUrl).toBe(
      "/reset-password/[Filtered]?next=%2F"
    );
    expect(event.extra?.nested).toStrictEqual({
      resetToken: "[Filtered]",
    });
    expect(event.contexts?.link).toStrictEqual({
      url: "/api/auth/reset-password/[Filtered]?callbackURL=%2Fsettings",
    });
    expect(event.tags).toStrictEqual({
      invitationToken: "[Filtered]",
      stage: "production",
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

function doesPropagateTrace(
  targets: readonly (string | RegExp)[],
  url: string
) {
  return targets.some((target) =>
    typeof target === "string" ? url.includes(target) : target.test(url)
  );
}
