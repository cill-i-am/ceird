export interface ExpiringPromiseCacheEntry<Value> {
  readonly expiresAt: number;
  readonly promise: Promise<Value>;
}

export function createExpiringPromiseCacheEntry<Value>(
  promise: Promise<Value>,
  ttlMs: number
): ExpiringPromiseCacheEntry<Value> {
  return {
    expiresAt: Date.now() + ttlMs,
    promise,
  };
}

export function isFreshExpiringPromiseCacheEntry<Value>(
  entry: ExpiringPromiseCacheEntry<Value> | undefined
): entry is ExpiringPromiseCacheEntry<Value> {
  return entry !== undefined && entry.expiresAt > Date.now();
}
