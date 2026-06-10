import {
  ensureTanStackDbCollectionReadyForWrite,
  markTanStackDbCollectionWrite,
  reconcileQueryCollectionDataAfterConcurrentWrite,
  replaceSyncedCollectionData,
  stripTanStackDbCollectionData,
  withoutTanStackDbVirtualProps,
} from "./tanstack-db-collection";

describe("TanStack DB collection helpers", () => {
  it("removes TanStack DB virtual props without changing row data", () => {
    expect(
      withoutTanStackDbVirtualProps({
        $collectionId: "organization:org_123:jobs",
        $key: "job_123",
        $origin: "local",
        $synced: false,
        id: "job_123",
        title: "Inspect boiler",
      })
    ).toStrictEqual({
      id: "job_123",
      title: "Inspect boiler",
    });
  });

  it("strips virtual props from collection data", () => {
    expect(
      stripTanStackDbCollectionData([
        {
          $collectionId: "organization:org_123:jobs",
          $key: "job_123",
          id: "job_123",
          title: "Inspect boiler",
        },
        {
          $origin: "local",
          $synced: false,
          id: "job_456",
          title: "Repair pump",
        },
      ])
    ).toStrictEqual([
      {
        id: "job_123",
        title: "Inspect boiler",
      },
      {
        id: "job_456",
        title: "Repair pump",
      },
    ]);
  });

  it("replaces synced collection data atomically with deletes before upserts", () => {
    const existingKeys = ["job_123", "job_456"];
    const writes: unknown[] = [];
    const collection = {
      keys: () => existingKeys.values(),
      utils: {
        writeBatch: (callback: () => void) => {
          writes.push({ type: "batch-start" });
          callback();
          writes.push({ type: "batch-end" });
        },
        writeDelete: (keys: string | string[]) => {
          writes.push({ keys, type: "delete" });
        },
        writeUpsert: (
          data:
            | { readonly id: string; readonly title: string }
            | { readonly id: string; readonly title: string }[]
        ) => {
          writes.push({ data, type: "upsert" });
        },
      },
    };

    replaceSyncedCollectionData(collection, [
      {
        id: "job_456",
        title: "Repair pump",
      },
      {
        id: "job_789",
        title: "Replace valve",
      },
    ]);

    expect(writes).toStrictEqual([
      {
        type: "batch-start",
      },
      {
        keys: ["job_123"],
        type: "delete",
      },
      {
        data: [
          {
            id: "job_456",
            title: "Repair pump",
          },
          {
            id: "job_789",
            title: "Replace valve",
          },
        ],
        type: "upsert",
      },
      {
        type: "batch-end",
      },
    ]);
  });

  it("preloads collections before manual writes when sync is not ready", async () => {
    const preload = vi.fn<() => Promise<void>>().mockResolvedValue();

    await ensureTanStackDbCollectionReadyForWrite({
      preload,
      status: "idle",
    });

    expect(preload).toHaveBeenCalledOnce();
  });

  it("does not preload collections that are already ready", async () => {
    const preload = vi.fn<() => Promise<void>>().mockResolvedValue();

    await ensureTanStackDbCollectionReadyForWrite({
      preload,
      status: "ready",
    });

    expect(preload).not.toHaveBeenCalled();
  });

  it("returns authoritative query data when no local writes raced the request", () => {
    const writeVersionRef = { current: 1 };

    expect(
      reconcileQueryCollectionDataAfterConcurrentWrite({
        collection: {
          toArray: [
            {
              id: "job_123",
              title: "Local",
            },
          ],
        },
        incomingItems: [
          {
            id: "job_456",
            title: "Server",
          },
        ],
        requestWriteVersion: 1,
        writeVersionRef,
      })
    ).toStrictEqual([
      {
        id: "job_456",
        title: "Server",
      },
    ]);
  });

  it("preserves local rows only when a write raced the query request", () => {
    const writeVersionRef = { current: 1 };
    const requestWriteVersion = writeVersionRef.current;
    markTanStackDbCollectionWrite(writeVersionRef);

    expect(
      reconcileQueryCollectionDataAfterConcurrentWrite({
        collection: {
          toArray: [
            {
              $collectionId: "organization:org_123:jobs",
              $key: "job_123",
              id: "job_123",
              title: "Local",
            },
          ],
        },
        incomingItems: [
          {
            id: "job_456",
            title: "Server",
          },
        ],
        requestWriteVersion,
        writeVersionRef,
      })
    ).toStrictEqual([
      {
        id: "job_123",
        title: "Local",
      },
      {
        id: "job_456",
        title: "Server",
      },
    ]);
  });

  it("does not promote unsynced optimistic rows into authoritative query results", () => {
    const writeVersionRef = { current: 1 };
    const requestWriteVersion = writeVersionRef.current;
    markTanStackDbCollectionWrite(writeVersionRef);

    expect(
      reconcileQueryCollectionDataAfterConcurrentWrite({
        collection: {
          toArray: [
            {
              $collectionId: "organization:org_123:labels",
              $key: "temp_123",
              $synced: false,
              id: "temp_123" as string,
              name: "Temporary optimistic row",
            },
            {
              $collectionId: "organization:org_123:labels",
              $key: "srv_123",
              $synced: true,
              id: "srv_123" as string,
              name: "Server-confirmed local row",
            },
          ],
        },
        incomingItems: [
          {
            id: "srv_456",
            name: "Fresh server row",
          },
        ],
        requestWriteVersion,
        writeVersionRef,
      })
    ).toStrictEqual([
      {
        id: "srv_123",
        name: "Server-confirmed local row",
      },
      {
        id: "srv_456",
        name: "Fresh server row",
      },
    ]);
  });
});
