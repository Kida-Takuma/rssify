import type { Feed } from './types.ts';

export interface CachedFeed {
  feed: Feed;
  storedAt: number;
  failedAt?: number;
}

export interface FeedCache {
  get(id: string): Promise<CachedFeed | undefined>;
  put(id: string, entry: CachedFeed): Promise<void>;
}

export function memoryCache(maxEntries = 100): FeedCache {
  const entries = new Map<string, CachedFeed>();
  return {
    async get(id) {
      return entries.get(id);
    },
    async put(id, entry) {
      entries.delete(id);
      entries.set(id, entry);
      const oldest = entries.keys().next().value;
      if (entries.size > maxEntries && oldest !== undefined) entries.delete(oldest);
    },
  };
}

export function kvCache(namespace: KVNamespace, expirationTtl: number, prefix = 'feed:'): FeedCache {
  return {
    async get(id) {
      const text = await namespace.get(prefix + id);
      return text ? parseEntry(text) : undefined;
    },
    async put(id, entry) {
      await namespace.put(prefix + id, JSON.stringify(entry), { expirationTtl: Math.max(60, expirationTtl) });
    },
  };
}

export function layeredCache(...layers: FeedCache[]): FeedCache {
  return {
    async get(id) {
      for (const [index, layer] of layers.entries()) {
        const entry = await layer.get(id).catch(() => undefined);
        if (!entry) continue;
        await Promise.all(layers.slice(0, index).map((upper) => upper.put(id, entry).catch(() => undefined)));
        return entry;
      }
      return undefined;
    },
    async put(id, entry) {
      await Promise.all(layers.map((layer) => layer.put(id, entry)));
    },
  };
}

function parseEntry(text: string): CachedFeed | undefined {
  try {
    const entry = JSON.parse(text, (key, value) =>
      (key === 'date' || key === 'fetchedAt') && typeof value === 'string' ? new Date(value) : value,
    ) as CachedFeed;
    return Number.isFinite(entry.storedAt) && Array.isArray(entry.feed?.items) ? entry : undefined;
  } catch {
    return undefined;
  }
}
