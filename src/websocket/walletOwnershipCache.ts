const TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

type Entry = {
  addresses: Set<string>;
  expiresAt: number;
};

const cache = new Map<string, Entry>();

function evictIfNeeded(): void {
  if (cache.size <= MAX_ENTRIES) return;
  const firstKey = cache.keys().next().value;
  if (firstKey) cache.delete(firstKey);
}

export async function prefetchOwnedAddresses(
  userId: string,
  loader: () => Promise<string[]>
): Promise<Set<string>> {
  const owned = await loader();
  const set = new Set(owned.map((a) => a.toLowerCase()));
  cache.set(userId, { addresses: set, expiresAt: Date.now() + TTL_MS });
  evictIfNeeded();
  return set;
}

export function getOwnedAddressesCached(userId: string): Set<string> | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(userId);
    return null;
  }
  return entry.addresses;
}

export function invalidateOwnedAddresses(userId: string): void {
  cache.delete(userId);
}
