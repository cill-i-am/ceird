interface TanStackDbVirtualProps {
  readonly $collectionId?: unknown;
  readonly $key?: unknown;
  readonly $origin?: unknown;
  readonly $synced?: unknown;
}

export type TanStackDbCollectionData<Item extends object> = Omit<
  Item,
  keyof TanStackDbVirtualProps
>;

export interface TanStackDbCollectionSnapshot<Item extends object> {
  readonly toArray: readonly Item[];
}

export interface TanStackDbCollectionWriteVersionRef {
  current: number;
}

export const ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS = 30_000;

interface WritableSyncedCollection<
  Key extends string | number,
  Item extends { readonly id: Key },
> {
  readonly keys: () => IterableIterator<Key>;
  readonly utils: {
    readonly writeDelete: (key: Key | Key[]) => void;
    readonly writeUpsert: (data: Item | Item[]) => void;
    readonly writeBatch: (callback: () => void) => void;
  };
}

interface PreloadableSyncedCollection {
  readonly preload?: () => Promise<void>;
  readonly status?: string;
}

export function withoutTanStackDbVirtualProps<Item extends object>(
  item: Item
): TanStackDbCollectionData<Item> {
  const {
    $collectionId: _collectionId,
    $key: _key,
    $origin: _origin,
    $synced: _synced,
    ...data
  } = item as Item & TanStackDbVirtualProps;

  void _collectionId;
  void _key;
  void _origin;
  void _synced;

  return data as TanStackDbCollectionData<Item>;
}

export function stripTanStackDbCollectionData<Item extends object>(
  items: readonly Item[]
): TanStackDbCollectionData<Item>[] {
  return items.map(withoutTanStackDbVirtualProps);
}

export function markTanStackDbCollectionWrite(
  writeVersionRef: TanStackDbCollectionWriteVersionRef
) {
  writeVersionRef.current += 1;
}

export async function ensureTanStackDbCollectionReadyForWrite(
  collection: PreloadableSyncedCollection
) {
  if (collection.status === "ready" || collection.preload === undefined) {
    return;
  }

  await collection.preload();
}

export function reconcileQueryCollectionDataAfterConcurrentWrite<
  Key extends string | number,
  Item extends { readonly id: Key },
>({
  collection,
  incomingItems,
  requestWriteVersion,
  writeVersionRef,
}: {
  readonly collection: TanStackDbCollectionSnapshot<Item> | undefined;
  readonly incomingItems: readonly Item[];
  readonly requestWriteVersion: number;
  readonly writeVersionRef: TanStackDbCollectionWriteVersionRef;
}): Item[] {
  // Query Collection fetches are authoritative unless a local write raced the
  // request. In that case, preserve local-only rows for this response; the next
  // non-racing refetch can still remove rows deleted on the server.
  if (!collection || writeVersionRef.current === requestWriteVersion) {
    return [...incomingItems];
  }

  const mergedById = new Map<Key, Item>();

  for (const item of collection.toArray) {
    if (!isSyncedTanStackDbCollectionItem(item)) {
      continue;
    }

    const data = withoutTanStackDbVirtualProps(item);
    mergedById.set(data.id, data as Item);
  }

  for (const item of incomingItems) {
    mergedById.set(item.id, item);
  }

  return [...mergedById.values()];
}

export function replaceSyncedCollectionData<
  Key extends string | number,
  Item extends { readonly id: Key },
>(collection: WritableSyncedCollection<Key, Item>, items: readonly Item[]) {
  const incomingKeys = new Set(items.map((item) => item.id));
  const keysToDelete = [...collection.keys()].filter(
    (key) => !incomingKeys.has(key)
  );

  collection.utils.writeBatch(() => {
    if (keysToDelete.length > 0) {
      collection.utils.writeDelete(keysToDelete);
    }

    if (items.length > 0) {
      collection.utils.writeUpsert([...items]);
    }
  });
}

function isSyncedTanStackDbCollectionItem<Item extends object>(
  item: Item
): boolean {
  return (item as Item & TanStackDbVirtualProps).$synced !== false;
}
