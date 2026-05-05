import type * as SentrySdk from "@sentry/tanstackstart-react";

import { getRouter, shouldInitializeClientSentry } from "./router";
import { SENTRY_DSN } from "./sentry-config";

type SentryInit = typeof SentrySdk.init;
type ReplayIntegration = typeof SentrySdk.replayIntegration;
type TracingIntegration =
  typeof SentrySdk.tanstackRouterBrowserTracingIntegration;

const sentryInit = vi.hoisted(() => vi.fn<SentryInit>());
const replayIntegration = vi.hoisted(() =>
  vi.fn<ReplayIntegration>(
    () => ({ name: "replay" }) as ReturnType<ReplayIntegration>
  )
);
const tracingIntegration = vi.hoisted(() =>
  vi.fn<TracingIntegration>(
    (router) =>
      ({
        name: "tracing",
        router,
      }) as ReturnType<TracingIntegration>
  )
);

vi.mock(import("@sentry/tanstackstart-react"), () => ({
  init: sentryInit,
  replayIntegration,
  tanstackRouterBrowserTracingIntegration: tracingIntegration,
}));

describe("router sentry integration", () => {
  beforeEach(() => {
    sentryInit.mockClear();
    replayIntegration.mockClear();
    tracingIntegration.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes Sentry with tracing and replay for each router", () => {
    const router = getRouter();

    expect(tracingIntegration).toHaveBeenCalledWith(router);
    expect(replayIntegration).toHaveBeenCalledWith({
      beforeAddRecordingEvent: expect.any(Function),
      blockAllMedia: true,
      maskAllText: true,
    });
    expect(sentryInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: SENTRY_DSN,
        enableLogs: true,
        integrations: [
          expect.objectContaining({ name: "tracing" }),
          expect.objectContaining({ name: "replay" }),
        ],
        tracesSampleRate: 1,
      })
    );
  });

  it("keeps browser-only Sentry setup behind a runtime guard", () => {
    const originalWindow = globalThis.window;

    expect(shouldInitializeClientSentry()).toBeTruthy();

    Reflect.deleteProperty(globalThis, "window");

    expect(shouldInitializeClientSentry()).toBeFalsy();

    vi.stubGlobal("window", originalWindow);
  });
});
