import { describe, expect, it, vi } from 'vitest';
import type { CachedFeed, FeedCache } from '../src/cache.ts';
import { defineFeed } from '../src/define.ts';
import { createHandler, type HandlerOptions } from '../src/server/handler.ts';
import html from './fixtures/synthetic.html?raw';

const definition = defineFeed({
  id: 'library',
  title: 'Library <News> & Events',
  url: 'https://library.example/news/',
  timezone: 'Asia/Tokyo',
  items: { selector: '.news-list li', title: 'a', date: '.date', dateFormat: 'yyyy.MM.dd' },
});

function setup(options: Partial<HandlerOptions> = {}, status = 200) {
  const upstream = vi.fn(async () => new Response(status === 200 ? html : '', { status }));
  const handler = createHandler({
    feeds: [definition],
    fetch: { fetch: upstream as unknown as typeof fetch },
    ...options,
  });
  return { handler, upstream };
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://feeds.example${path}`, { headers });

describe('formats', () => {
  it('serves only RSS by default', async () => {
    const { handler } = setup();
    const rss = await handler(get('/library.rss'));
    expect(rss.status).toBe(200);
    expect(rss.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    expect((await handler(get('/library.atom'))).status).toBe(404);
    expect((await handler(get('/library.json'))).status).toBe(404);
    expect((await handler(get('/feeds.opml'))).status).toBe(404);
  });

  it('enables formats from options and per feed', async () => {
    const { handler } = setup({ formats: ['atom', 'json'], opml: true });
    expect((await handler(get('/library.rss'))).status).toBe(404);
    expect((await handler(get('/library.atom'))).status).toBe(200);
    expect((await handler(get('/library.json'))).status).toBe(200);
    expect(await (await handler(get('/feeds.opml'))).text()).toContain('xmlUrl="https://feeds.example/library.atom"');

    const perFeed = setup({ feeds: [{ ...definition, formats: ['json'] }] }).handler;
    expect((await perFeed(get('/library.rss'))).status).toBe(404);
    expect((await perFeed(get('/library.json'))).status).toBe(200);
  });

  it('rejects unknown formats', () => {
    expect(() => setup({ formats: ['rss', 'html' as never] })).toThrow('unknown formats: html');
  });
});

describe('output', () => {
  it('writes readable, escaped RSS', async () => {
    const { handler } = setup();
    const text = await (await handler(get('/library.rss'))).text();
    expect(text).toContain('\n    <title>Library &lt;News&gt; &amp; Events</title>\n');
    expect(text).toContain(
      '<atom:link href="https://feeds.example/library.rss" rel="self" type="application/rss+xml"/>',
    );
    expect(text).toContain('<pubDate>Mon, 19 Oct 2026 15:00:00 GMT</pubDate>');
    expect(text).not.toMatch(/<script|alert/);
  });

  it('writes Atom and JSON Feed', async () => {
    const { handler } = setup({ formats: ['atom', 'json'] });
    const atom = await (await handler(get('/library.atom'))).text();
    expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">');
    expect(atom).toContain('<updated>2026-10-19T15:00:00.000Z</updated>');

    const json = (await (await handler(get('/library.json'))).json()) as {
      version: string;
      items: { title: string }[];
    };
    expect(json.version).toBe('https://jsonfeed.org/version/1.1');
    expect(json.items.map((item) => item.title)).toContain('Unsafe link');
  });

  it('renders HTML previews with a strict CSP', async () => {
    const { handler } = setup({ formats: ['rss', 'json'] });
    const page = await handler(get('/library'));
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(page.headers.get('cache-control')).toBe('no-cache');
    expect(page.headers.get('content-security-policy')).toMatch(
      /^default-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'; script-src 'sha256-[A-Za-z0-9+/=]+';/,
    );
    const body = await page.text();
    expect(body).toContain('<h1>Library &lt;News&gt; &amp; Events</h1>');
    expect(body).toContain('data-copy="https://feeds.example/library.json"');
    expect(body).toContain(
      '<a class="url" href="https://feeds.example/library.json" target="_blank" rel="noopener noreferrer">',
    );
    expect(body.match(/<script>/g)).toHaveLength(1);
    expect(body).not.toContain('alert(1)');

    const index = await (await handler(get('/'))).text();
    expect(index).toContain('href="https://feeds.example/library"');
  });

  it('can turn previews off', async () => {
    const { handler } = setup({ preview: false });
    expect((await handler(get('/'))).status).toBe(404);
    expect((await handler(get('/library'))).status).toBe(404);
  });
});

describe('caching', () => {
  it('fetches the upstream once within the ttl', async () => {
    const { handler, upstream } = setup({ formats: ['rss', 'json'] });
    await Promise.all([handler(get('/library.rss')), handler(get('/library.json')), handler(get('/library'))]);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('answers conditional requests with 304', async () => {
    const { handler } = setup();
    const etag = (await handler(get('/library.rss'))).headers.get('etag')!;
    const second = await handler(get('/library.rss', { 'if-none-match': etag }));
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('serves a stale copy when the upstream fails', async () => {
    let fail = false;
    const upstream = vi.fn(async () => (fail ? new Response('', { status: 500 }) : new Response(html)));
    const onError = vi.fn();
    const handler = createHandler({
      feeds: [{ ...definition, ttl: 0 }],
      fetch: { fetch: upstream as unknown as typeof fetch },
      onError,
    });
    expect((await handler(get('/library.rss'))).status).toBe(200);
    fail = true;
    expect((await handler(get('/library.rss'))).status).toBe(200);
    expect(onError).toHaveBeenCalledOnce();
  });

  it('returns 502 without a cached copy', async () => {
    const { handler } = setup({}, 500);
    const response = await handler(get('/library.rss'));
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('waits before retrying a failed upstream', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 0, 1) });
    try {
      const { handler, upstream } = setup({}, 500);
      await handler(get('/library.rss'));
      await handler(get('/library.rss'));
      expect(upstream).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.UTC(2026, 0, 1, 0, 5));
      await handler(get('/library.rss'));
      expect(upstream).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('remembers failures in the cache across instances', async () => {
    const entries = new Map<string, CachedFeed>();
    const cache: FeedCache = {
      get: async (id) => entries.get(id),
      put: async (id, entry) => void entries.set(id, entry),
    };
    let fail = false;
    const upstream = vi.fn(async () => (fail ? new Response('', { status: 500 }) : new Response(html)));
    const create = () =>
      createHandler({
        feeds: [{ ...definition, ttl: 0 }],
        cache,
        fetch: { fetch: upstream as unknown as typeof fetch },
      });

    await create()(get('/library.rss'));
    fail = true;
    expect((await create()(get('/library.rss'))).status).toBe(200);
    expect((await create()(get('/library.rss'))).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
});

describe('security', () => {
  it('only fetches the defined url', async () => {
    const { handler, upstream } = setup();
    await handler(get('/library.rss?url=http://169.254.169.254/'));
    expect(upstream).toHaveBeenCalledWith('https://library.example/news/', expect.anything());
    expect((await handler(get('/unknown.rss'))).status).toBe(404);
    expect((await handler(get('/../etc/passwd'))).status).toBe(404);
  });

  it('allows only GET, HEAD and OPTIONS', async () => {
    const { handler } = setup();
    const response = await handler(new Request('https://feeds.example/library.rss', { method: 'POST' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    const head = await handler(new Request('https://feeds.example/library.rss', { method: 'HEAD' }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('sets security headers', async () => {
    const { handler } = setup();
    const response = await handler(get('/library.rss'));
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it('allows only listed origins', async () => {
    const { handler } = setup({ allowedOrigins: ['https://app.example'] });
    const allowed = await handler(get('/library.rss', { origin: 'https://app.example' }));
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example');
    const denied = await handler(get('/library.rss', { origin: 'https://evil.example' }));
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('marks feeds and previews as not embeddable', async () => {
    const { handler } = setup();
    for (const path of ['/library.rss', '/library', '/missing']) {
      const response = await handler(get(path));
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    }
  });

  it('rejects invalid allowed origins', () => {
    expect(() => setup({ allowedOrigins: ['https://app.example/path'] })).toThrow('must be an origin only');
    expect(() => setup({ allowedOrigins: ['http://app.example'] })).toThrow('must use https');
    expect(() => setup({ allowedOrigins: ['not a url'] })).toThrow('Invalid allowed origin');
    expect(() => setup({ allowedOrigins: ['http://localhost:3000'] })).not.toThrow();
  });

  it('rejects invalid definitions', () => {
    expect(() => createHandler({ feeds: [definition, definition] })).toThrow('defined more than once');
    expect(() => createHandler({ feeds: [{ ...definition, id: '../x' }] })).toThrow('Invalid feed id');
    expect(() => createHandler({ feeds: [{ ...definition, url: 'file:///etc/passwd' }] })).toThrow('http or https');
  });
});

describe('embed', () => {
  const embedSetup = () => setup({ embed: true, allowedOrigins: ['https://app.example', 'https://www.app.example'] });

  it('is off unless enabled with allowed origins', async () => {
    expect((await setup().handler(get('/library/embed'))).status).toBe(404);
    expect(() => setup({ embed: true })).toThrow('Embedding needs allowedOrigins');
  });

  it('can be framed only by allowed origins', async () => {
    const response = await embedSetup().handler(get('/library/embed'));
    expect(response.status).toBe(200);
    const csp = response.headers.get('content-security-policy')!;
    expect(csp).toMatch(
      /^default-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'; base-uri 'none'; form-action 'none';/,
    );
    expect(csp).toContain('frame-ancestors https://app.example https://www.app.example');
    expect(csp).not.toContain('script-src');
    expect(response.headers.get('x-frame-options')).toBeNull();
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('ignores local origins unless the Worker itself runs locally', async () => {
    const { handler } = setup({ embed: true, allowedOrigins: ['https://app.example', 'http://localhost:3000'] });
    const origin = { origin: 'http://localhost:3000' };

    const deployed = await handler(get('/library/embed', origin));
    expect(deployed.headers.get('content-security-policy')).toMatch(/frame-ancestors https:\/\/app\.example$/);
    expect((await handler(get('/library.rss', origin))).headers.get('access-control-allow-origin')).toBeNull();

    const local = await handler(new Request('http://localhost:8787/library/embed', { headers: origin }));
    expect(local.headers.get('content-security-policy')).toContain(
      'frame-ancestors https://app.example http://localhost:3000',
    );
    const localFeed = await handler(new Request('http://localhost:8787/library.rss', { headers: origin }));
    expect(localFeed.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('renders a script-free list with safe links', async () => {
    const body = await (await embedSetup().handler(get('/library/embed'))).text();
    expect(body).not.toContain('<script');
    expect(body).toContain('target="_blank" rel="noopener noreferrer"');
    expect(body).not.toContain('javascript:');
  });

  it('accepts only bounded options', async () => {
    const { handler } = embedSetup();
    const count = async (query: string) =>
      ((await (await handler(get(`/library/embed${query}`))).text()).match(/<li>/g) ?? []).length;
    expect(await count('?limit=2')).toBe(2);
    expect(await count('?limit=-5')).toBe(1);
    expect(await count('?limit=abc')).toBe(4);
    const dark = await (await handler(get('/library/embed?theme=dark'))).text();
    expect(dark).toContain('<html lang="en" data-theme="dark">');
    const injected = await (await handler(get('/library/embed?theme="><script>'))).text();
    expect(injected).toContain('<html lang="en">');
    expect(injected).not.toContain('<script');
  });

  it('shows a sandboxed iframe snippet on the preview page', async () => {
    const body = await (await embedSetup().handler(get('/library'))).text();
    expect(body).toContain('sandbox=&quot;allow-popups allow-popups-to-escape-sandbox&quot;');
    expect(body).toContain('https://feeds.example/library/embed');
    expect(body).toContain('https://app.example, https://www.app.example');
  });
});
