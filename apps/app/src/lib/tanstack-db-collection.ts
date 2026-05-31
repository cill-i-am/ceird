import {
  ensureDataPlaneCollectionReadyForWrite,
  markDataPlaneCollectionWrite,
} from "#/data-plane/collection-write";
import type { DataPlaneCollectionWriteVersionRef } from "#/data-plane/collection-write";

export {
  reconcileQueryCollectionDataAfterConcurrentWrite,
  replaceSyncedCollectionData,
  stripTanStackDbCollectionData,
  withoutTanStackDbVirtualProps,
} from "#/data-plane/collection-write";

export async function ensureTanStackDbCollectionReadyForWrite(
  collection: Parameters<typeof ensureDataPlaneCollectionReadyForWrite>[0]
) {
  await ensureDataPlaneCollectionReadyForWrite(collection);
}

export function markTanStackDbCollectionWrite(
  writeVersionRef: DataPlaneCollectionWriteVersionRef
) {
  markDataPlaneCollectionWrite(writeVersionRef);
}
