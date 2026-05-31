interface TanStackDbVirtualProps {
  readonly $collectionId?: unknown;
  readonly $key?: unknown;
  readonly $origin?: unknown;
  readonly $synced?: unknown;
}

export type DataPlaneCollectionData<Item extends object> = Omit<
  Item,
  keyof TanStackDbVirtualProps
>;

export interface DataPlaneCollectionSnapshot<Item extends object> {
  readonly toArray: readonly (Item & TanStackDbVirtualProps)[];
}

export interface DataPlaneCollectionWriteVersionRef {
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
): DataPlaneCollectionData<Item> {
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

  return data as DataPlaneCollectionData<Item>;
}

export function stripTanStackDbCollectionData<Item extends object>(
  items: readonly Item[]
): DataPlaneCollectionData<Item>[] {
  return items.map(withoutTanStackDbVirtualProps);
}

export function markDataPlaneCollectionWrite(
  writeVersionRef: DataPlaneCollectionWriteVersionRef
) {
  writeVersionRef.current += 1;
}

export const markTanStackDbCollectionWrite = markDataPlaneCollectionWrite;

export async function ensureDataPlaneCollectionReadyForWrite(
  collection: PreloadableSyncedCollection
) {
  if (collection.status === "ready" || collection.preload === undefined) {
    return;
  }

  await collection.preload();
}

export const ensureTanStackDbCollectionReadyForWrite =
  ensureDataPlaneCollectionReadyForWrite;

export function reconcileQueryCollectionDataAfterConcurrentWrite<
  Item extends { readonly id: string | number },
>({
  collection,
  incomingItems,
  requestWriteVersion,
  writeVersionRef,
}: {
  readonly collection: DataPlaneCollectionSnapshot<Item> | undefined;
  readonly incomingItems: readonly Item[];
  readonly requestWriteVersion: number;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}): Item[] {
  if (!collection || writeVersionRef.current === requestWriteVersion) {
    return [...incomingItems];
  }

  const mergedById = new Map<Item["id"], Item>();

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

export async function replaceDataPlaneCollectionData<
  Key extends string | number,
  Item extends { readonly id: Key },
>({
  collection,
  items,
  writeVersionRef,
}: {
  readonly collection: WritableSyncedCollection<Key, Item> &
    PreloadableSyncedCollection;
  readonly items: readonly Item[];
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  await ensureDataPlaneCollectionReadyForWrite(collection);
  markDataPlaneCollectionWrite(writeVersionRef);
  replaceSyncedCollectionData(collection, items);
}

export async function upsertDataPlaneCollectionItem<
  Key extends string | number,
  Item extends { readonly id: Key },
>({
  collection,
  item,
  writeVersionRef,
}: {
  readonly collection: WritableSyncedCollection<Key, Item> &
    PreloadableSyncedCollection;
  readonly item: Item;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  await ensureDataPlaneCollectionReadyForWrite(collection);
  markDataPlaneCollectionWrite(writeVersionRef);
  collection.utils.writeUpsert(item);
}

export async function deleteDataPlaneCollectionItem<
  Key extends string | number,
  Item extends { readonly id: Key },
>({
  collection,
  key,
  writeVersionRef,
}: {
  readonly collection: WritableSyncedCollection<Key, Item> &
    PreloadableSyncedCollection;
  readonly key: Key;
  readonly writeVersionRef: DataPlaneCollectionWriteVersionRef;
}) {
  await ensureDataPlaneCollectionReadyForWrite(collection);
  markDataPlaneCollectionWrite(writeVersionRef);
  collection.utils.writeDelete(key);
}

export function readDataPlaneCollectionData<Item extends object>(
  collection: DataPlaneCollectionSnapshot<Item>
): DataPlaneCollectionData<Item>[] {
  return stripTanStackDbCollectionData(collection.toArray);
}

function isSyncedTanStackDbCollectionItem<Item extends object>(
  item: Item
): boolean {
  return (item as Item & TanStackDbVirtualProps).$synced !== false;
}

export type TanStackDbCollectionData<Item extends object> =
  DataPlaneCollectionData<Item>;
export type TanStackDbCollectionSnapshot<Item extends object> =
  DataPlaneCollectionSnapshot<Item>;
export type TanStackDbCollectionWriteVersionRef =
  DataPlaneCollectionWriteVersionRef;
