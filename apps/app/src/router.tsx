import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import {
  createClientSentryOptions,
  sanitizeReplayRecordingEvent,
} from "./sentry-config";

type AppRouter = ReturnType<typeof createAppRouter>;

export function getRouter() {
  const router = createAppRouter();

  if (!import.meta.env.SSR && shouldInitializeClientSentry()) {
    void initializeClientSentry(router);
  }

  return router;
}

export function createAppRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });
}

export async function initializeClientSentry(router: AppRouter) {
  if (!import.meta.env.SSR && shouldInitializeClientSentry()) {
    const Sentry = await import("@sentry/tanstackstart-react");

    Sentry.init(
      createClientSentryOptions({
        environment: import.meta.env.MODE,
        replayIntegration: Sentry.replayIntegration({
          beforeAddRecordingEvent: sanitizeReplayRecordingEvent,
          blockAllMedia: true,
          maskAllText: true,
        }),
        tracingIntegration:
          Sentry.tanstackRouterBrowserTracingIntegration(router),
      })
    );
  }
}

export function shouldInitializeClientSentry() {
  return !import.meta.env.SSR && typeof window !== "undefined";
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }

  interface StaticDataRouteOption {
    breadcrumb?: {
      readonly label: string;
      readonly to?:
        | "/"
        | "/activity"
        | "/jobs"
        | "/jobs/new"
        | "/members"
        | "/organization/settings"
        | "/settings"
        | "/sites"
        | "/sites/new";
    };
  }
}
