import type { CachedFeed, FeedCache } from '../cache.ts';
import { extractFeed } from '../extract/extract.ts';
import { type FetchOptions, fetchPage } from '../source/fetch.ts';
import type { Feed, FeedDefinition } from '../types.ts';

export interface LoaderOptions {
  cache: FeedCache;
  defaultTtl: number;
  staleTtl: number;
  retryAfter: number;
  fetch?: FetchOptions;
  onError?: (error: unknown, definition: FeedDefinition) => void;
}

export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

export type FeedLoader = (definition: FeedDefinition, context?: WaitUntil) => Promise<Feed | undefined>;

export function createFeedLoader({
  cache,
  defaultTtl,
  staleTtl,
  retryAfter,
  fetch,
  onError,
}: LoaderOptions): FeedLoader {
  const inflight = new Map<string, Promise<Feed>>();
  const failures = new Map<string, number>();

  function refresh(definition: FeedDefinition): Promise<Feed> {
    let pending = inflight.get(definition.id);
    if (!pending) {
      pending = fetchPage(definition, fetch)
        .then((page) => extractFeed(definition, page))
        .finally(() => inflight.delete(definition.id));
      inflight.set(definition.id, pending);
    }
    return pending;
  }

  async function store(definition: FeedDefinition, entry: CachedFeed, context?: WaitUntil): Promise<void> {
    const pending = cache.put(definition.id, entry).catch((error: unknown) => onError?.(error, definition));
    if (context) context.waitUntil(pending);
    else await pending;
  }

  return async (definition, context) => {
    const now = Date.now();
    const cached = await cache.get(definition.id).catch(() => undefined);
    const age = cached ? now - cached.storedAt : Infinity;
    if (cached && age < (definition.ttl ?? defaultTtl) * 1000) return cached.feed;

    const stale = cached && age < staleTtl * 1000 ? cached.feed : undefined;
    const failedAt = Math.max(failures.get(definition.id) ?? 0, cached?.failedAt ?? 0);
    if (now - failedAt < retryAfter * 1000) return stale;

    try {
      const feed = await refresh(definition);
      failures.delete(definition.id);
      await store(definition, { feed, storedAt: Date.now() }, context);
      return feed;
    } catch (error) {
      onError?.(error, definition);
      failures.set(definition.id, now);
      if (cached) await store(definition, { ...cached, failedAt: now }, context);
      return stale;
    }
  };
}
