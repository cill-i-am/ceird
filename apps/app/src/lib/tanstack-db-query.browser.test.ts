import { QueryClient } from "@tanstack/query-core";

import {
  seedQueryCollectionInitialData,
  seedRouteQueryData,
} from "./tanstack-db-query";

describe("TanStack DB query helpers", () => {
  it("seeds route query data by replacing stale cached data", () => {
    const queryClient = new QueryClient();
    const queryKey = ["organization", "org_123", "sites"];

    queryClient.setQueryData(queryKey, [{ id: "old" }]);

    seedRouteQueryData(queryClient, queryKey, [{ id: "fresh" }]);

    expect(queryClient.getQueryData(queryKey)).toStrictEqual([{ id: "fresh" }]);
  });

  it("does not replace cache data written after a route request started", () => {
    const queryClient = new QueryClient();
    const queryKey = ["organization", "org_123", "sites"];

    queryClient.setQueryData(queryKey, [{ id: "optimistic" }], {
      updatedAt: 1001,
    });

    const seeded = seedRouteQueryData(
      queryClient,
      queryKey,
      [{ id: "stale-loader" }],
      {
        requestStartedAt: 1000,
      }
    );

    expect(seeded).toStrictEqual([{ id: "optimistic" }]);
    expect(queryClient.getQueryData(queryKey)).toStrictEqual([
      { id: "optimistic" },
    ]);
  });

  it("seeds collection initial data without overwriting an active cache", () => {
    const queryClient = new QueryClient();
    const queryKey = ["organization", "org_123", "sites"];

    queryClient.setQueryData(queryKey, [{ id: "optimistic" }]);

    seedQueryCollectionInitialData(queryClient, queryKey, [{ id: "loader" }]);

    expect(queryClient.getQueryData(queryKey)).toStrictEqual([
      { id: "optimistic" },
    ]);
  });
});
