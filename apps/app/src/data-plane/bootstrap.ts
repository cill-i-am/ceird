import type { QueryClient, QueryKey } from "@tanstack/query-core";

import type { DataPlaneCollectionName } from "./collection-contract";

type DataPlaneSeedCompleteness = "complete" | "partial";

export interface DataPlaneSeed<
  Data,
  Collection extends string = DataPlaneCollectionName,
> {
  readonly collection: Collection;
  readonly completeness: DataPlaneSeedCompleteness;
  readonly data: Data;
  readonly queryKey: QueryKey;
  readonly requestStartedAt?: number | undefined;
}

export function createDataPlaneSeed<
  Data,
  Collection extends DataPlaneCollectionName = DataPlaneCollectionName,
>(seed: DataPlaneSeed<Data, Collection>): DataPlaneSeed<Data, Collection> {
  return seed;
}

export function applyDataPlaneSeed<
  Data,
  Collection extends string = DataPlaneCollectionName,
>(queryClient: QueryClient, seed: DataPlaneSeed<Data, Collection>): Data {
  const currentData = queryClient.getQueryData<Data>(seed.queryKey);
  const currentState = queryClient.getQueryState(seed.queryKey);

  if (
    currentData !== undefined &&
    seed.requestStartedAt !== undefined &&
    (currentState?.dataUpdatedAt ?? 0) > seed.requestStartedAt
  ) {
    return currentData;
  }

  queryClient.setQueryData(seed.queryKey, seed.data);
  return seed.data;
}

export function applyDataPlaneSeeds(
  queryClient: QueryClient,
  seeds: readonly DataPlaneSeed<unknown>[]
) {
  for (const seed of seeds) {
    applyDataPlaneSeed(queryClient, seed);
  }
}

export function seedQueryCollectionInitialData<Data>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  data: Data
): Data {
  if (queryClient.getQueryData(queryKey) === undefined) {
    queryClient.setQueryData(queryKey, data);
  }

  return data;
}
