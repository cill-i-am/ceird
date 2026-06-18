"use client";
import {
  createCollection,
  localStorageCollectionOptions,
} from "@tanstack/react-db";
import * as React from "react";
import { z } from "zod";

import { useDataPlaneLiveQuery } from "./live-query";
import type { OrganizationDataScope } from "./query-scope";
import type { DataPlaneSession } from "./session";
import { useDataPlaneSession } from "./session";

export const LOCAL_CONVENIENCE_SURFACES = ["jobs", "sites"] as const;
export type LocalConvenienceSurface =
  (typeof LOCAL_CONVENIENCE_SURFACES)[number];

export type JobsLocalWorkspaceView = "list" | "board";
export type SitesLocalWorkspaceFilter =
  | "all"
  | "needs-location"
  | "with-active-jobs";
export type SitesLocalWorkspaceSort = "active-jobs" | "name" | "updated";

const LocalConvenienceSurfaceSchema = z.enum(LOCAL_CONVENIENCE_SURFACES);
const LocalConvenienceRecentSearchRecordSchema = z.object({
  committedAtMs: z.number().int().nonnegative(),
  id: z.string(),
  kind: z.literal("recent-search"),
  query: z.string().trim().min(1),
  surface: LocalConvenienceSurfaceSchema,
});
const LocalConvenienceWorkspacePreferenceRecordSchema = z.object({
  filter: z.enum(["all", "needs-location", "with-active-jobs"]).optional(),
  id: z.string(),
  kind: z.literal("workspace-preferences"),
  sort: z.enum(["active-jobs", "name", "updated"]).optional(),
  surface: LocalConvenienceSurfaceSchema,
  updatedAtMs: z.number().int().nonnegative(),
  view: z.enum(["board", "list"]).optional(),
});
const LocalConvenienceSelectedEntityRecordSchema = z.object({
  entityId: z.string().trim().min(1),
  id: z.string(),
  kind: z.literal("selected-entity"),
  surface: LocalConvenienceSurfaceSchema,
  updatedAtMs: z.number().int().nonnegative(),
});
const LocalConvenienceRecordSchema = z.discriminatedUnion("kind", [
  LocalConvenienceRecentSearchRecordSchema,
  LocalConvenienceWorkspacePreferenceRecordSchema,
  LocalConvenienceSelectedEntityRecordSchema,
]);

export type LocalConvenienceRecentSearchRecord = z.infer<
  typeof LocalConvenienceRecentSearchRecordSchema
>;
export type LocalConvenienceWorkspacePreferenceRecord = z.infer<
  typeof LocalConvenienceWorkspacePreferenceRecordSchema
>;
export type LocalConvenienceSelectedEntityRecord = z.infer<
  typeof LocalConvenienceSelectedEntityRecordSchema
>;
export type LocalConvenienceRecord = z.infer<
  typeof LocalConvenienceRecordSchema
>;
export type LocalConvenienceCollection = ReturnType<
  typeof createLocalConvenienceCollection
>;

const LOCAL_CONVENIENCE_COLLECTION_REGISTRY_KEY =
  "local-convenience-collection";
const LOCAL_CONVENIENCE_STORAGE_VERSION = "v1";
const MAX_RECENT_SEARCHES_PER_SURFACE = 3;

export function getLocalConvenienceStorageKey({
  environmentKey = getBrowserLocalPersistenceEnvironmentKey(),
  scope,
}: {
  readonly environmentKey?: string | undefined;
  readonly scope: OrganizationDataScope;
}) {
  return [
    "ceird",
    "local-convenience",
    LOCAL_CONVENIENCE_STORAGE_VERSION,
    sanitizeStorageKeyPart(environmentKey ?? "unknown-environment"),
    "org",
    sanitizeStorageKeyPart(scope.organizationId),
    "user",
    sanitizeStorageKeyPart(scope.userId ?? "unknown-user"),
    "role",
    sanitizeStorageKeyPart(scope.role ?? "unknown-role"),
  ].join(":");
}

export function getBrowserLocalPersistenceEnvironmentKey() {
  if (typeof window === "undefined") {
    return "server";
  }

  return window.location.host || "browser";
}

export function getOrCreateLocalConvenienceCollection(
  session: Pick<DataPlaneSession, "registry" | "scope">
) {
  const storageKey = getLocalConvenienceStorageKey({ scope: session.scope });
  const registryKey = `${LOCAL_CONVENIENCE_COLLECTION_REGISTRY_KEY}:${storageKey}`;
  const existing = session.registry.get(registryKey);

  if (existing !== undefined) {
    return existing as LocalConvenienceCollection;
  }

  const collection = createLocalConvenienceCollection({ storageKey });
  session.registry.set(registryKey, collection);
  return collection;
}

export function createLocalConvenienceCollection({
  storage,
  storageEventApi,
  storageKey,
}: {
  readonly storage?: Storage | undefined;
  readonly storageEventApi?:
    | {
        addEventListener: (
          type: "storage",
          listener: (event: StorageEvent) => void
        ) => void;
        removeEventListener: (
          type: "storage",
          listener: (event: StorageEvent) => void
        ) => void;
      }
    | undefined;
  readonly storageKey: string;
}) {
  const resolvedStorage = storage ?? getSafeBrowserStorage();

  return createCollection(
    localStorageCollectionOptions({
      getKey: (item) => item.id,
      id: `local-convenience:${storageKey}`,
      schema: LocalConvenienceRecordSchema,
      storage: resolvedStorage,
      storageEventApi,
      storageKey,
    })
  );
}

export function useLocalConvenienceCollection() {
  const session = useDataPlaneSession();

  return React.useMemo(
    () => getOrCreateLocalConvenienceCollection(session),
    [session]
  );
}

export function useLocalConvenienceRecords() {
  const collection = useLocalConvenienceCollection();
  const query = useDataPlaneLiveQuery(() => collection, [collection]);

  return {
    collection,
    records: decodeLocalConvenienceRecords(query.data ?? []),
    status: query.status,
  };
}

export function getRecentSearchesForSurface(
  records: readonly unknown[],
  surface: LocalConvenienceSurface
) {
  return decodeLocalConvenienceRecords(records)
    .filter(
      (record): record is LocalConvenienceRecentSearchRecord =>
        record.kind === "recent-search" && record.surface === surface
    )
    .toSorted((left, right) => right.committedAtMs - left.committedAtMs)
    .map((record) => record.query)
    .slice(0, MAX_RECENT_SEARCHES_PER_SURFACE);
}

export function getWorkspacePreferencesForSurface(
  records: readonly unknown[],
  surface: LocalConvenienceSurface
) {
  return decodeLocalConvenienceRecords(records).find(
    (record): record is LocalConvenienceWorkspacePreferenceRecord =>
      record.kind === "workspace-preferences" && record.surface === surface
  );
}

export function getSelectedEntityForSurface(
  records: readonly unknown[],
  surface: LocalConvenienceSurface
) {
  return decodeLocalConvenienceRecords(records).find(
    (record): record is LocalConvenienceSelectedEntityRecord =>
      record.kind === "selected-entity" && record.surface === surface
  );
}

export function decodeLocalConvenienceRecords(records: readonly unknown[]) {
  return records.flatMap((record) => {
    const result = LocalConvenienceRecordSchema.safeParse(record);

    return result.success ? [result.data] : [];
  });
}

export function commitRecentSearch({
  collection,
  nowMs = Date.now(),
  query,
  surface,
}: {
  readonly collection: LocalConvenienceCollection;
  readonly nowMs?: number | undefined;
  readonly query: string | undefined;
  readonly surface: LocalConvenienceSurface;
}) {
  const normalized = normalizeRecentSearch(query);

  if (normalized === undefined) {
    return;
  }

  const existing = getRecentSearchesForSurface(
    decodeLocalConvenienceRecords(collection.toArray),
    surface
  );
  const nextQueries = [
    normalized,
    ...existing.filter((search) => search !== normalized),
  ].slice(0, MAX_RECENT_SEARCHES_PER_SURFACE);
  const nextIds = new Set(
    nextQueries.map((search) => getRecentSearchRecordId(surface, search))
  );

  for (const record of decodeLocalConvenienceRecords(collection.toArray)) {
    if (
      record.kind === "recent-search" &&
      record.surface === surface &&
      !nextIds.has(record.id)
    ) {
      deleteLocalConvenienceRecord(collection, record.id);
    }
  }

  for (const [index, nextQuery] of nextQueries.entries()) {
    const id = getRecentSearchRecordId(surface, nextQuery);
    upsertLocalConvenienceRecord(collection, {
      committedAtMs: nowMs - index,
      id,
      kind: "recent-search",
      query: nextQuery,
      surface,
    });
  }

  return normalized;
}

export function saveWorkspacePreferences({
  collection,
  filter,
  nowMs = Date.now(),
  sort,
  surface,
  view,
}: {
  readonly collection: LocalConvenienceCollection;
  readonly filter?: SitesLocalWorkspaceFilter | undefined;
  readonly nowMs?: number | undefined;
  readonly sort?: SitesLocalWorkspaceSort | undefined;
  readonly surface: LocalConvenienceSurface;
  readonly view?: JobsLocalWorkspaceView | undefined;
}) {
  upsertLocalConvenienceRecord(collection, {
    ...(filter === undefined ? {} : { filter }),
    id: getWorkspacePreferencesRecordId(surface),
    kind: "workspace-preferences",
    ...(sort === undefined ? {} : { sort }),
    surface,
    updatedAtMs: nowMs,
    ...(view === undefined ? {} : { view }),
  });
}

export function saveSelectedEntity({
  collection,
  entityId,
  nowMs = Date.now(),
  surface,
}: {
  readonly collection: LocalConvenienceCollection;
  readonly entityId: string | undefined;
  readonly nowMs?: number | undefined;
  readonly surface: LocalConvenienceSurface;
}) {
  const id = getSelectedEntityRecordId(surface);

  if (entityId === undefined) {
    deleteLocalConvenienceRecord(collection, id);
    return;
  }

  upsertLocalConvenienceRecord(collection, {
    entityId,
    id,
    kind: "selected-entity",
    surface,
    updatedAtMs: nowMs,
  });
}

export function normalizeRecentSearch(query: string | undefined) {
  const trimmed = query?.trim();

  return trimmed && trimmed.length >= 2 ? trimmed : undefined;
}

function upsertLocalConvenienceRecord(
  collection: LocalConvenienceCollection,
  record: LocalConvenienceRecord
) {
  try {
    if (collection.state.has(record.id)) {
      collection.update(record.id, (draft) => {
        Object.assign(draft, record);
      });
      return;
    }

    collection.insert(record);
  } catch {
    // Local convenience state is best-effort and must never block route state.
  }
}

function deleteLocalConvenienceRecord(
  collection: LocalConvenienceCollection,
  id: string
) {
  try {
    if (collection.state.has(id)) {
      collection.delete(id);
    }
  } catch {
    // Local convenience state is best-effort and must never block route state.
  }
}

function getSafeBrowserStorage() {
  if (typeof window === "undefined") {
    return createMemoryStorage();
  }

  try {
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function getRecentSearchRecordId(
  surface: LocalConvenienceSurface,
  query: string
) {
  return `${surface}:recent-search:${query.toLocaleLowerCase()}`;
}

function getWorkspacePreferencesRecordId(surface: LocalConvenienceSurface) {
  return `${surface}:workspace-preferences`;
}

function getSelectedEntityRecordId(surface: LocalConvenienceSurface) {
  return `${surface}:selected-entity`;
}

function sanitizeStorageKeyPart(value: string) {
  return encodeURIComponent(value.trim() || "unknown");
}
