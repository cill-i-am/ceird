import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import type { AppRouterContext } from "./router-context";
import { routeTree } from "./routeTree.gen";

export const ROUTER_LOADER_STALE_TIME_MS = 10_000;
export const ROUTER_PRELOAD_DELAY_MS = 100;
export const ROUTER_PRELOAD_STALE_TIME_MS = 30_000;

export function getRouter() {
  return createAppRouter();
}

function createAppRouter() {
  const queryClient = new QueryClient();
  const router = createTanStackRouter({
    context: {
      queryClient,
    } satisfies AppRouterContext,
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: ROUTER_PRELOAD_DELAY_MS,
    defaultPreloadStaleTime: ROUTER_PRELOAD_STALE_TIME_MS,
    defaultStaleTime: ROUTER_LOADER_STALE_TIME_MS,
  });

  setupRouterSsrQueryIntegration({
    queryClient,
    router,
  });

  return router;
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
        | "/members"
        | "/organization/security"
        | "/organization/settings/labels"
        | "/organization/settings"
        | "/settings"
        | "/sites";
    };
  }
}
