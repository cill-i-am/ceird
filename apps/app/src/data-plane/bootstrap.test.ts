import { QueryClient } from "@tanstack/query-core";

import {
  applyDataPlaneSeed,
  applyDataPlaneSeeds,
  createDataPlaneSeed,
} from "./bootstrap";

describe("data-plane bootstrap seeds", () => {
  it("seeds query data into the shared query client", () => {
    const queryClient = new QueryClient();
    const seed = createDataPlaneSeed({
      collection: "jobs",
      completeness: "complete",
      data: [{ id: "job_123" }],
      queryKey: ["jobs", "organization", "org_123"],
      requestStartedAt: 1000,
    });

    expect(applyDataPlaneSeed(queryClient, seed)).toStrictEqual([
      { id: "job_123" },
    ]);
    expect(queryClient.getQueryData(seed.queryKey)).toStrictEqual([
      { id: "job_123" },
    ]);
  });

  it("does not overwrite cache data written after the route request started", () => {
    const queryClient = new QueryClient();
    const queryKey = ["jobs", "organization", "org_123"] as const;
    queryClient.setQueryData(queryKey, [{ id: "newer" }], {
      updatedAt: 1001,
    });

    const seeded = applyDataPlaneSeed(
      queryClient,
      createDataPlaneSeed({
        collection: "jobs",
        completeness: "complete",
        data: [{ id: "stale-loader" }],
        queryKey,
        requestStartedAt: 1000,
      })
    );

    expect(seeded).toStrictEqual([{ id: "newer" }]);
    expect(queryClient.getQueryData(queryKey)).toStrictEqual([{ id: "newer" }]);
  });

  it("applies multiple seed envelopes", () => {
    const queryClient = new QueryClient();
    const seeds = [
      createDataPlaneSeed({
        collection: "jobs",
        completeness: "complete",
        data: [{ id: "job_123" }],
        queryKey: ["jobs"],
      }),
      createDataPlaneSeed({
        collection: "sites",
        completeness: "complete",
        data: [{ id: "site_123" }],
        queryKey: ["sites"],
      }),
    ];

    applyDataPlaneSeeds(queryClient, seeds);

    expect(queryClient.getQueryData(["jobs"])).toStrictEqual([
      { id: "job_123" },
    ]);
    expect(queryClient.getQueryData(["sites"])).toStrictEqual([
      { id: "site_123" },
    ]);
  });
});
