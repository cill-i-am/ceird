import * as Sentry from "@sentry/tanstackstart-react";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import {
  createClientSentryOptions,
  sanitizeReplayRecordingEvent,
} from "./sentry-config";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  if (shouldInitializeClientSentry()) {
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

  return router;
}

export function shouldInitializeClientSentry() {
  return typeof window !== "undefined";
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
