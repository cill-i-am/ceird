import {
  ensureDataPlaneCollectionReadyForWrite,
  markDataPlaneCollectionWrite,
  reconcileQueryCollectionDataAfterConcurrentWrite,
  replaceSyncedCollectionData,
  stripTanStackDbCollectionData,
  withoutTanStackDbVirtualProps,
} from "./collection-write";
import type { DataPlaneCollectionSnapshot } from "./collection-write";

describe("data-plane collection write helpers", () => {
  it("removes TanStack DB virtual props", () => {
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

    expect(
      stripTanStackDbCollectionData([
        {
          $collectionId: "organization:org_123:jobs",
          id: "job_123",
        },
      ])
    ).toStrictEqual([{ id: "job_123" }]);
  });

  it("preloads collections before manual writes when sync is not ready", async () => {
    const preload = vi.fn<() => Promise<void>>().mockResolvedValue();

    await ensureDataPlaneCollectionReadyForWrite({
      preload,
      status: "idle",
    });

    expect(preload).toHaveBeenCalledOnce();
  });

  it("replaces synced collection data atomically", () => {
    const writes: unknown[] = [];
    replaceSyncedCollectionData(
      {
        keys: () => ["old", "kept"].values(),
        utils: {
          writeBatch: (callback: () => void) => {
            writes.push("batch:start");
            callback();
            writes.push("batch:end");
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
      },
      [
        { id: "kept", title: "Keep" },
        { id: "new", title: "New" },
      ]
    );

    expect(writes).toStrictEqual([
      "batch:start",
      { keys: ["old"], type: "delete" },
      {
        data: [
          { id: "kept", title: "Keep" },
          { id: "new", title: "New" },
        ],
        type: "upsert",
      },
      "batch:end",
    ]);
  });

  it("does not promote unsynced optimistic rows into fetched results", () => {
    interface Row {
      readonly id: string;
      readonly title: string;
    }
    const writeVersionRef = { current: 1 };
    const requestWriteVersion = writeVersionRef.current;
    markDataPlaneCollectionWrite(writeVersionRef);
    const collection = {
      toArray: [
        {
          $synced: false,
          id: "temp",
          title: "Temporary",
        },
        {
          $synced: true,
          id: "confirmed",
          title: "Confirmed",
        },
      ],
    } satisfies DataPlaneCollectionSnapshot<Row>;

    expect(
      reconcileQueryCollectionDataAfterConcurrentWrite({
        collection,
        incomingItems: [{ id: "server", title: "Server" }],
        requestWriteVersion,
        writeVersionRef,
      })
    ).toStrictEqual([
      { id: "confirmed", title: "Confirmed" },
      { id: "server", title: "Server" },
    ]);
  });
});
