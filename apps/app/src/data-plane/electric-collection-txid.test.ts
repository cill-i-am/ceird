import { Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { syncBackedCollectionCompleteness } from "./collection-contract";
import {
  createElectricCollectionFromContract,
  defineElectricCollectionContract,
} from "./electric-collection";

const TestRowSchema = Schema.Struct({
  createdAt: Schema.String,
  id: Schema.String,
  name: Schema.String,
});
const TestRowStandardSchema = Schema.toStandardSchemaV1(TestRowSchema);

type TestRow = Schema.Schema.Type<typeof TestRowSchema>;
interface ElectricMessageWithOffset {
  readonly headers:
    | {
        readonly operation: "insert";
        readonly txids: readonly number[];
      }
    | {
        readonly control: "snapshot-end";
        readonly xmax: string;
        readonly xmin: string;
        readonly xip_list: readonly string[];
      }
    | {
        readonly control: "up-to-date";
      };
  readonly key?: string;
  readonly offset: string;
  readonly value?: Record<string, string>;
}

const testContract = defineElectricCollectionContract({
  collection: "labels",
  completeness: syncBackedCollectionCompleteness({
    covers: { mode: "complete-tenant" },
    source: "electric",
    subscriptionName: "labels",
  }),
  getKey: (row: TestRow) => row.id,
  id: "organization:org_123:user:user_123:role:owner:labels:electric:txid",
  schema: TestRowStandardSchema,
  shapeName: "labels",
});

describe("Ceird Electric txid mutation confirmation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves wrapped mutation handlers after the expected Electric txid signal is committed", async () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");
    const syncFetch = makeControlledElectricFetch();
    const onInsert = vi.fn<
      () => Promise<{ readonly timeout: number; readonly txid: number }>
    >(() => Promise.resolve({ timeout: 1000, txid: 105 }));
    const result = createElectricCollectionFromContract(
      defineElectricCollectionContract({
        ...testContract,
        mutationHandlers: {
          onInsert,
        },
      }),
      {
        runtime: {
          fetch: syncFetch.fetch,
          isBrowser: true,
        },
      }
    );

    expect(result.status).toBe("enabled");
    if (result.status !== "enabled") {
      throw new Error("Expected Electric collection to be enabled");
    }

    const subscription = result.collection.subscribeChanges(() => {});
    void result.collection.preload();
    await vi.waitFor(() => {
      expect(syncFetch.fetch.mock.calls.length).toBeGreaterThan(0);
    });

    const mutation = result.collection.config.onInsert?.({
      collection: result.collection,
      transaction: {
        mutations: [
          {
            modified: {
              createdAt: "2026-06-14T00:00:00.000Z",
              id: "row_105",
              name: "Matched",
            },
          },
        ],
      },
    } as unknown as Parameters<
      NonNullable<typeof result.collection.config.onInsert>
    >[0]);
    await vi.waitFor(() => {
      expect(onInsert).toHaveBeenCalledOnce();
    });
    // Electric can satisfy txid waits from explicit txids or snapshot visibility.
    // Initial-sync txids are paired here with a snapshot that proves txid 105 is visible.
    syncFetch.resolveNext(
      makeElectricJsonResponse(
        [
          {
            headers: { operation: "insert", txids: [105] },
            key: "row_105",
            offset: "0_0",
            value: {
              created_at: "2026-06-14T00:00:00.000Z",
              id: "row_105",
              name: "Matched",
            },
          },
          {
            headers: {
              control: "snapshot-end",
              xmin: "100",
              xmax: "110",
              xip_list: [],
            },
            offset: "0_1",
          },
          {
            headers: { control: "up-to-date" },
            offset: "0_2",
          },
        ],
        "0_2"
      )
    );
    await expect(mutation).resolves.toStrictEqual({
      timeout: 1000,
      txid: 105,
    });
    subscription.unsubscribe();
  });
});

function makeControlledElectricFetch() {
  const pendingFetches: ((response: Response) => void)[] = [];
  const fetchMock = vi.fn<
    (
      ...args: Parameters<typeof globalThis.fetch>
    ) => ReturnType<typeof globalThis.fetch>
  >(() => {
    const pending = Promise.withResolvers<Response>();
    pendingFetches.push(pending.resolve);

    return pending.promise;
  });
  const fetch = Object.assign(fetchMock, {
    preconnect: vi.fn<typeof globalThis.fetch.preconnect>(),
  }) as typeof fetchMock & typeof globalThis.fetch;

  return {
    fetch,
    resolveNext(response: Response) {
      const resolveFetch = pendingFetches.shift();

      if (resolveFetch === undefined) {
        throw new Error("No pending Electric fetch to resolve");
      }

      resolveFetch(response);
    },
  };
}

function makeElectricJsonResponse(
  messages: readonly ElectricMessageWithOffset[],
  offset: string
) {
  return Response.json(messages, {
    headers: {
      "electric-handle": "labels-test-shape",
      "electric-offset": offset,
      "electric-schema": `{"id":{"type":"text"}}`,
    },
  });
}
