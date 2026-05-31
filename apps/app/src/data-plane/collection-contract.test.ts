import type { StandardSchemaV1 } from "@standard-schema/spec";

import { defineQueryCollectionContract } from "./collection-contract";

describe("data-plane collection contracts", () => {
  it("keeps the collection sync contract explicit", async () => {
    const schema: StandardSchemaV1<unknown, { readonly id: string }> = {
      "~standard": {
        validate: (value: unknown) => ({
          value: value as { readonly id: string },
        }),
        vendor: "test",
        version: 1,
      },
    };
    const contract = defineQueryCollectionContract({
      collection: "jobs",
      completeness: "complete",
      getKey: (item: { readonly id: string }) => item.id,
      id: "organization:org_123:jobs",
      queryFn: () => [{ id: "job_123" }],
      queryKey: ["jobs", "organization", "org_123"],
      schema,
      syncMode: "eager",
    });

    await expect(Promise.resolve(contract.queryFn())).resolves.toStrictEqual([
      { id: "job_123" },
    ]);
    expect(contract).toMatchObject({
      collection: "jobs",
      completeness: "complete",
      id: "organization:org_123:jobs",
      syncMode: "eager",
    });
  });

  it("fails closed when required runtime contract fields are missing", () => {
    expect(() =>
      defineQueryCollectionContract({
        collection: "jobs",
        getKey: (item: { readonly id: string }) => item.id,
        queryKey: ["jobs"],
        syncMode: "eager",
      } as never)
    ).toThrow(/missing collection contract fields/i);
  });
});
