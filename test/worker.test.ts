import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { defineFeed } from '../src/define.ts';
import { createWorker } from '../src/worker.ts';
import html from './fixtures/synthetic.html?raw';

const definition = defineFeed({
  id: 'library',
  url: 'https://library.example/news/',
  items: { selector: '.news-list li', title: 'a' },
});

const pending: Promise<unknown>[] = [];
const context = {
  waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;

function worker() {
  const upstream = vi.fn(async () => new Response(html));
  return createWorker({ feeds: [definition], fetch: { fetch: upstream as unknown as typeof fetch } });
}

describe('createWorker', () => {
  it('reads formats, OPML, embedding and origins from the environment', async () => {
    const app = worker();
    const vars = { FORMATS: 'json, atom', OPML: 'true', ALLOWED_ORIGINS: 'https://app.example', EMBED: 'true' };
    const call = (path: string) =>
      app.fetch!(
        new Request(`https://feeds.example${path}`, { headers: { origin: 'https://app.example' } }) as never,
        vars,
        context,
      );

    expect((await call('/library.rss')).status).toBe(404);
    const json = await call('/library.json');
    expect(json.status).toBe(200);
    expect(json.headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect((await call('/feeds.opml')).status).toBe(200);
    const embed = await call('/library/embed');
    expect(embed.headers.get('content-security-policy')).toContain('frame-ancestors https://app.example');
  });

  it('stores feeds in the KV namespace binding', async () => {
    const namespace = (env as unknown as { FEED_CACHE: KVNamespace }).FEED_CACHE;
    const response = await worker().fetch!(
      new Request('https://feeds.example/library.rss') as never,
      { FEED_CACHE: namespace },
      context,
    );
    expect(response.status).toBe(200);
    await Promise.all(pending);
    const stored = JSON.parse((await namespace.get('feed:library'))!) as { feed: { items: unknown[] } };
    expect(stored.feed.items).toHaveLength(4);
  });
});
