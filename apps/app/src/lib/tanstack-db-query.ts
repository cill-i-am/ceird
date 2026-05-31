import type { QueryClient, QueryKey } from "@tanstack/query-core";

import {
  applyDataPlaneSeed,
  seedQueryCollectionInitialData,
} from "#/data-plane/bootstrap";
import type { DataPlaneSeed } from "#/data-plane/bootstrap";

export { seedQueryCollectionInitialData };

export interface SeedRouteQueryDataOptions {
  readonly requestStartedAt?: number | undefined;
}

export function seedRouteQueryData<Data>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  data: Data,
  options: SeedRouteQueryDataOptions = {}
): Data {
  return applyDataPlaneSeed<Data, string>(queryClient, {
    collection: String(queryKey[0] ?? "unknown"),
    completeness: "complete",
    data,
    queryKey,
    requestStartedAt: options.requestStartedAt,
  } satisfies DataPlaneSeed<Data, string>);
}
