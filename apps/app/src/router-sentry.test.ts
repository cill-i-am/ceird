import type * as SentrySdk from "@sentry/tanstackstart-react";

import {
  createAppRouter,
  getRouter,
  initializeClientSentry,
  shouldInitializeClientSentry,
} from "./router";
import { SENTRY_DSN } from "./sentry-config";

type SentryInit = typeof SentrySdk.init;
type ReplayIntegration = typeof SentrySdk.replayIntegration;
type FeedbackIntegration = typeof SentrySdk.feedbackIntegration;
type ProfilingIntegration = typeof SentrySdk.browserProfilingIntegration;
type TracingIntegration =
  typeof SentrySdk.tanstackRouterBrowserTracingIntegration;

const sentryInit = vi.hoisted(() => vi.fn<SentryInit>());
const replayIntegration = vi.hoisted(() =>
  vi.fn<ReplayIntegration>(
    () => ({ name: "replay" }) as ReturnType<ReplayIntegration>
  )
);
const feedbackIntegration = vi.hoisted(() =>
  vi.fn<FeedbackIntegration>(
    () => ({ name: "feedback" }) as ReturnType<FeedbackIntegration>
  )
);
const profilingIntegration = vi.hoisted(() =>
  vi.fn<ProfilingIntegration>(
    () => ({ name: "browser-profiling" }) as ReturnType<ProfilingIntegration>
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
  browserProfilingIntegration: profilingIntegration,
  feedbackIntegration,
  init: sentryInit,
  replayIntegration,
  tanstackRouterBrowserTracingIntegration: tracingIntegration,
}));

describe("router sentry integration", () => {
  beforeEach(() => {
    sentryInit.mockClear();
    feedbackIntegration.mockClear();
    profilingIntegration.mockClear();
    replayIntegration.mockClear();
    tracingIntegration.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes Sentry with tracing and replay for each router", async () => {
    const router = getRouter();

    await vi.waitFor(() => {
      expect(tracingIntegration).toHaveBeenCalledWith(router);
      expect(feedbackIntegration).toHaveBeenCalledWith(
        expect.objectContaining({
          autoInject: true,
          colorScheme: "system",
          enableScreenshot: true,
          showEmail: false,
          showName: false,
        })
      );
      expect(profilingIntegration).toHaveBeenCalledWith();
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
            expect.objectContaining({ name: "feedback" }),
            expect.objectContaining({ name: "browser-profiling" }),
          ],
          profilesSampleRate: 1,
          tracesSampleRate: 1,
        })
      );
    });
  });

  it("keeps browser-only Sentry setup behind a runtime guard", () => {
    const originalWindow = globalThis.window;

    expect(shouldInitializeClientSentry()).toBeTruthy();

    Reflect.deleteProperty(globalThis, "window");

    expect(shouldInitializeClientSentry()).toBeFalsy();

    restoreWindow(originalWindow);
  });

  it("does not import the browser SDK on the server", async () => {
    const router = createAppRouter();
    sentryInit.mockClear();
    feedbackIntegration.mockClear();
    profilingIntegration.mockClear();
    replayIntegration.mockClear();
    tracingIntegration.mockClear();

    const originalWindow = globalThis.window;
    Reflect.deleteProperty(globalThis, "window");

    await initializeClientSentry(router);

    expect(sentryInit).not.toHaveBeenCalled();
    expect(feedbackIntegration).not.toHaveBeenCalled();
    expect(profilingIntegration).not.toHaveBeenCalled();
    expect(replayIntegration).not.toHaveBeenCalled();
    expect(tracingIntegration).not.toHaveBeenCalled();

    restoreWindow(originalWindow);
  });
});

function restoreWindow(windowValue: Window & typeof globalThis) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
    writable: true,
  });
}
