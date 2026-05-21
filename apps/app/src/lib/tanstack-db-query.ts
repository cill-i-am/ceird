import type { QueryClient, QueryKey } from "@tanstack/query-core";

export interface SeedRouteQueryDataOptions {
  readonly requestStartedAt?: number | undefined;
}

export function seedRouteQueryData<Data>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  data: Data,
  options: SeedRouteQueryDataOptions = {}
): Data {
  const currentData = queryClient.getQueryData<Data>(queryKey);
  const currentState = queryClient.getQueryState(queryKey);

  if (
    currentData !== undefined &&
    options.requestStartedAt !== undefined &&
    (currentState?.dataUpdatedAt ?? 0) > options.requestStartedAt
  ) {
    return currentData;
  }

  queryClient.setQueryData(queryKey, data);
  return data;
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
