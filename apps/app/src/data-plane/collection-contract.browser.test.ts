import type { StandardSchemaV1 } from "@standard-schema/spec";

import {
  COMPLETE_TENANT_COLLECTION,
  assertCompleteTenantCollection,
  defineQueryCollectionContract,
  entityDetailCollectionCompleteness,
  filteredQueryCollectionCompleteness,
  isCompleteTenantCollection,
  pagedQueryCollectionCompleteness,
  syncBackedCollectionCompleteness,
} from "./collection-contract";

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
      completeness: COMPLETE_TENANT_COLLECTION,
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
      completeness: { mode: "complete-tenant" },
      id: "organization:org_123:jobs",
      syncMode: "eager",
    });
  });

  it("keeps page-scoped collection data out of complete tenant helpers", () => {
    const pagedCompleteness = pagedQueryCollectionCompleteness({
      filters: [{ field: "status", operator: "eq", value: "open" }],
      page: {
        cursor: "cursor_2",
        hasNextPage: true,
        limit: 25,
        type: "cursor",
      },
      queryName: "jobs-list-page",
    });

    expect(isCompleteTenantCollection(pagedCompleteness)).toBeFalsy();
    expect(() =>
      assertCompleteTenantCollection(pagedCompleteness, "Jobs list")
    ).toThrow(/jobs list requires complete tenant data; received paged-query/i);
  });

  it("represents filtered, entity, and sync-backed collection scopes", () => {
    const filteredCompleteness = filteredQueryCollectionCompleteness({
      filters: [
        {
          field: "siteId",
          operator: "eq",
          value: "site_123",
        },
      ],
      queryName: "site-related-jobs",
    });
    const entityCompleteness = entityDetailCollectionCompleteness({
      entityId: "job_123",
      entityType: "job",
    });
    const syncCompleteness = syncBackedCollectionCompleteness({
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "jobs-shape",
    });

    expect(filteredCompleteness).toMatchObject({
      mode: "filtered-query",
      queryName: "site-related-jobs",
    });
    expect(entityCompleteness).toMatchObject({
      entityId: "job_123",
      entityType: "job",
      mode: "entity-detail",
    });
    expect(syncCompleteness).toMatchObject({
      covers: { mode: "complete-tenant" },
      mode: "sync-backed",
      source: "electric",
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
