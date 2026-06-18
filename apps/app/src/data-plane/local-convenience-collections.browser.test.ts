import type { OrganizationId } from "@ceird/identity-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  commitRecentSearch,
  createLocalConvenienceCollection,
  decodeLocalConvenienceRecords,
  getLocalConvenienceStorageKey,
  getRecentSearchesForSurface,
  getWorkspacePreferencesForSurface,
  saveSelectedEntity,
  saveWorkspacePreferences,
} from "./local-convenience-collections";
import type { LocalConvenienceCollection } from "./local-convenience-collections";

const noopStorageEventApi = {
  addEventListener:
    vi.fn<(type: "storage", listener: (event: StorageEvent) => void) => void>(),
  removeEventListener:
    vi.fn<(type: "storage", listener: (event: StorageEvent) => void) => void>(),
};

describe("local convenience collections", () => {
  beforeEach(() => {
    window.localStorage.clear();
    noopStorageEventApi.addEventListener.mockClear();
    noopStorageEventApi.removeEventListener.mockClear();
  });

  it("scopes storage by environment, organization, user, and role", () => {
    expect(
      getLocalConvenienceStorageKey({
        environmentKey: "app.codex-task.ceird.localhost",
        scope: {
          organizationId: "org_123" as OrganizationId,
          role: "owner",
          userId: "user_123",
        },
      })
    ).toBe(
      "ceird:local-convenience:v1:app.codex-task.ceird.localhost:org:org_123:user:user_123:role:owner"
    );
  });

  it("serializes and restores recent searches and workspace preferences", async () => {
    const storageKey = "ceird:test:local-convenience:restore";
    const firstCollection = createLocalConvenienceCollection({
      storage: window.localStorage,
      storageEventApi: noopStorageEventApi,
      storageKey,
    });
    await firstCollection.preload();

    commitRecentSearch({
      collection: firstCollection,
      nowMs: 10,
      query: "  boiler  ",
      surface: "jobs",
    });
    commitRecentSearch({
      collection: firstCollection,
      nowMs: 20,
      query: "pump",
      surface: "jobs",
    });
    saveWorkspacePreferences({
      collection: firstCollection,
      nowMs: 30,
      surface: "jobs",
      view: "board",
    });

    await vi.waitFor(() => {
      expect(window.localStorage.getItem(storageKey)).toContain("pump");
    });

    const restoredCollection = createLocalConvenienceCollection({
      storage: window.localStorage,
      storageEventApi: noopStorageEventApi,
      storageKey,
    });
    await restoredCollection.preload();
    const records = restoredCollection.toArray;

    expect(getRecentSearchesForSurface(records, "jobs")).toStrictEqual([
      "pump",
      "boiler",
    ]);
    expect(getWorkspacePreferencesForSurface(records, "jobs")?.view).toBe(
      "board"
    );
  });

  it("ignores unavailable or corrupt local data", async () => {
    const storageKey = "ceird:test:local-convenience:corrupt";
    window.localStorage.setItem(storageKey, "{not-json");

    const collection = createLocalConvenienceCollection({
      storage: window.localStorage,
      storageEventApi: noopStorageEventApi,
      storageKey,
    });
    await collection.preload();

    expect(collection.toArray).toStrictEqual([]);
  });

  it("discards JSON-valid rows that fail the local convenience schema", async () => {
    const storageKey = "ceird:test:local-convenience:invalid-records";
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        "jobs%3Aworkspace-preferences": {
          data: {
            id: "jobs:workspace-preferences",
            kind: "workspace-preferences",
            surface: "jobs",
            updatedAtMs: 10,
            view: "grid",
          },
          versionKey: "invalid-jobs-view",
        },
        "sites%3Arecent-search%3Adepot": {
          data: {
            committedAtMs: 20,
            id: "sites:recent-search:depot",
            kind: "recent-search",
            query: "depot",
            surface: "sites",
          },
          versionKey: "valid-sites-search",
        },
        "sites%3Aworkspace-preferences": {
          data: {
            filter: "archived",
            id: "sites:workspace-preferences",
            kind: "workspace-preferences",
            sort: "updated",
            surface: "sites",
            updatedAtMs: 30,
          },
          versionKey: "invalid-sites-filter",
        },
      })
    );

    const collection = createLocalConvenienceCollection({
      storage: window.localStorage,
      storageEventApi: noopStorageEventApi,
      storageKey,
    });
    await collection.preload();

    expect(decodeLocalConvenienceRecords(collection.toArray)).toStrictEqual([
      {
        committedAtMs: 20,
        id: "sites:recent-search:depot",
        kind: "recent-search",
        query: "depot",
        surface: "sites",
      },
    ]);
    expect(
      getWorkspacePreferencesForSurface(collection.toArray, "jobs")
    ).toBeUndefined();
    expect(
      getWorkspacePreferencesForSurface(collection.toArray, "sites")
    ).toBeUndefined();
    expect(
      getRecentSearchesForSurface(collection.toArray, "sites")
    ).toStrictEqual(["depot"]);
  });

  it("falls back to memory storage when the browser localStorage accessor throws", async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "localStorage"
    );
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new Error("localStorage unavailable");
      },
    });

    try {
      const collection = createLocalConvenienceCollection({
        storageKey: "ceird:test:local-convenience:throwing-accessor",
      });

      await expect(collection.preload()).resolves.toBeUndefined();
      expect(() =>
        commitRecentSearch({
          collection,
          nowMs: 10,
          query: "pump",
          surface: "jobs",
        })
      ).not.toThrow();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, "localStorage", originalDescriptor);
      }
    }
  });

  it("treats local write failures as non-fatal convenience misses", () => {
    const insertFailureCollection = makeThrowingCollection({
      hasRecord: false,
      toArray: [],
    });

    expect(() =>
      commitRecentSearch({
        collection: insertFailureCollection,
        nowMs: 10,
        query: "pump",
        surface: "jobs",
      })
    ).not.toThrow();
    expect(
      commitRecentSearch({
        collection: insertFailureCollection,
        nowMs: 10,
        query: "pump",
        surface: "jobs",
      })
    ).toBe("pump");
    expect(() =>
      saveWorkspacePreferences({
        collection: insertFailureCollection,
        nowMs: 20,
        surface: "jobs",
        view: "board",
      })
    ).not.toThrow();

    const updateFailureCollection = makeThrowingCollection({
      hasRecord: true,
      toArray: [],
    });

    expect(() =>
      saveWorkspacePreferences({
        collection: updateFailureCollection,
        nowMs: 20,
        surface: "jobs",
        view: "board",
      })
    ).not.toThrow();
    expect(() =>
      saveSelectedEntity({
        collection: updateFailureCollection,
        entityId: undefined,
        nowMs: 30,
        surface: "sites",
      })
    ).not.toThrow();
  });
});

function makeThrowingCollection({
  hasRecord,
  toArray,
}: {
  readonly hasRecord: boolean;
  readonly toArray: readonly unknown[];
}) {
  return {
    delete: vi.fn<(id: string) => void>(() => {
      throw new Error("local delete failed");
    }),
    insert: vi.fn<(record: unknown) => void>(() => {
      throw new Error("local insert failed");
    }),
    state: {
      has: vi.fn<(id: string) => boolean>(() => hasRecord),
    },
    toArray,
    update: vi.fn<(id: string, updater: (draft: unknown) => void) => void>(
      () => {
        throw new Error("local update failed");
      }
    ),
  } as unknown as LocalConvenienceCollection;
}
