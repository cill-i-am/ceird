import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";

import type { AppRouterContext } from "./router-context";
import { routeTree } from "./routeTree.gen";

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
    defaultPreloadStaleTime: 0,
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
        | "/jobs/new"
        | "/members"
        | "/organization/settings"
        | "/settings"
        | "/sites"
        | "/sites/new";
    };
  }
}
