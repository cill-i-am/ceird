import type { QueryClient } from "@tanstack/react-query";

export interface AppRouterContext {
  readonly queryClient: QueryClient;
}
