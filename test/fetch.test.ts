import { describe, expect, it } from 'vitest';
import { defineFeed } from '../src/define.ts';
import { fetchPage } from '../src/source/fetch.ts';

const definition = defineFeed({ id: 'site', url: 'https://site.example/news', items: { selector: 'li', title: 'a' } });

const SHIFT_JIS_NOTICE = new Uint8Array([0x82, 0xa8, 0x92, 0x6d, 0x82, 0xe7, 0x82, 0xb9]);

function upstream(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const route = routes[url];
    if (!route) throw new Error(`unexpected request ${url}`);
    return route();
  }) as typeof fetch;
}

describe('fetchPage', () => {
  it('follows redirects on the same host', async () => {
    const page = await fetchPage(definition, {
      fetch: upstream({
        'https://site.example/news': () => new Response(null, { status: 301, headers: { location: '/news/' } }),
        'https://site.example/news/': () => new Response('<p>ok</p>'),
      }),
    });
    expect(page).toEqual({ url: 'https://site.example/news/', html: '<p>ok</p>' });
  });

  it('refuses redirects to another host', async () => {
    const fetch = upstream({
      'https://site.example/news': () =>
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
    });
    await expect(fetchPage(definition, { fetch })).rejects.toThrow('Refused redirect to another host');
  });

  it('refuses redirects to another port or from https to http', async () => {
    const redirectTo = (location: string) =>
      upstream({ 'https://site.example/news': () => new Response(null, { status: 302, headers: { location } }) });
    await expect(fetchPage(definition, { fetch: redirectTo('https://site.example:8443/news') })).rejects.toThrow(
      'Refused redirect to another host',
    );
    await expect(fetchPage(definition, { fetch: redirectTo('http://site.example/news') })).rejects.toThrow(
      'Refused redirect from https',
    );
  });

  it('stops reading oversized responses', async () => {
    const fetch = upstream({ 'https://site.example/news': () => new Response('x'.repeat(100)) });
    await expect(fetchPage(definition, { fetch, maxBytes: 10 })).rejects.toThrow('larger than 10 bytes');
  });

  it('rejects error statuses', async () => {
    const fetch = upstream({ 'https://site.example/news': () => new Response('', { status: 503 }) });
    await expect(fetchPage(definition, { fetch })).rejects.toThrow('503');
  });

  it('decodes Shift_JIS from the header or a meta tag', async () => {
    const fromHeader = await fetchPage(definition, {
      fetch: upstream({
        'https://site.example/news': () =>
          new Response(SHIFT_JIS_NOTICE, { headers: { 'content-type': 'text/html; charset=Shift_JIS' } }),
      }),
    });
    expect(fromHeader.html).toBe('お知らせ');

    const body = new Uint8Array([...new TextEncoder().encode('<meta charset="shift_jis">'), ...SHIFT_JIS_NOTICE]);
    const fromMeta = await fetchPage(definition, {
      fetch: upstream({ 'https://site.example/news': () => new Response(body) }),
    });
    expect(fromMeta.html.endsWith('お知らせ')).toBe(true);
  });
});
