"use client";
import * as React from "react";

import { useIsHydrated } from "#/hooks/use-is-hydrated";

import type { DataPlaneCollectionData } from "./collection-write";
import { withoutTanStackDbVirtualProps } from "./collection-write";

const noopUnsubscribe = () => null;

interface HydratableCollection<Item extends object> {
  readonly status: string;
  entries: () => Iterable<[string | number, Item]>;
  subscribeChanges: (callback: () => void) => {
    requestSnapshot?: (options?: { readonly optimizedOnly?: boolean }) => void;
    unsubscribe: () => void;
  };
}

export function useHydratedCollectionItems<Item extends object>(
  collection: HydratableCollection<Item> | null,
  fallbackItems: readonly NoInfer<DataPlaneCollectionData<Item>>[]
): readonly DataPlaneCollectionData<Item>[] {
  const isHydrated = useIsHydrated();
  const versionRef = React.useRef(0);
  const snapshotRef = React.useRef<{
    readonly collection: HydratableCollection<Item> | null;
    readonly fallbackItems: readonly DataPlaneCollectionData<Item>[];
    readonly isHydrated: boolean;
    readonly items: readonly DataPlaneCollectionData<Item>[];
    readonly version: number;
  } | null>(null);

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (!collection) {
        return noopUnsubscribe;
      }

      let isSubscribed = true;
      const notifyCollectionChanged = () => {
        if (!isSubscribed) {
          return;
        }

        versionRef.current += 1;
        onStoreChange();
      };

      const subscription = collection.subscribeChanges(notifyCollectionChanged);

      if (collection.status === "ready") {
        queueMicrotask(notifyCollectionChanged);
      }
      queueMicrotask(() => {
        if (!isSubscribed) {
          return;
        }

        subscription.requestSnapshot?.({ optimizedOnly: false });
      });

      return () => {
        isSubscribed = false;
        subscription.unsubscribe();
      };
    },
    [collection]
  );

  const getSnapshot = React.useCallback(() => {
    const currentVersion = versionRef.current;
    const cachedSnapshot = snapshotRef.current;

    if (
      cachedSnapshot &&
      cachedSnapshot.collection === collection &&
      cachedSnapshot.fallbackItems === fallbackItems &&
      cachedSnapshot.isHydrated === isHydrated &&
      cachedSnapshot.version === currentVersion
    ) {
      return cachedSnapshot.items;
    }

    const items: readonly DataPlaneCollectionData<Item>[] =
      isHydrated && collection
        ? Array.from(collection.entries(), ([, item]) =>
            withoutTanStackDbVirtualProps(item)
          )
        : fallbackItems;

    snapshotRef.current = {
      collection,
      fallbackItems,
      isHydrated,
      items,
      version: currentVersion,
    };

    return items;
  }, [collection, fallbackItems, isHydrated]);

  const getServerSnapshot = React.useCallback(
    () => fallbackItems,
    [fallbackItems]
  );

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
