import type { Feed } from '../types.ts';
import { GENERATOR, itemUri } from './shared.ts';
import { el, textEl, toXmlDocument } from './xml.ts';

export function renderRss(feed: Feed, selfUrl: string): string {
  const items = feed.items.map((item) =>
    el(
      'item',
      {},
      textEl('title', item.title),
      textEl('link', item.url),
      textEl('guid', itemUri(feed, item), { isPermaLink: 'false' }),
      textEl('pubDate', item.date?.toUTCString()),
      textEl('description', item.summary),
      textEl('dc:creator', item.author),
    ),
  );

  return toXmlDocument(
    el(
      'rss',
      { version: '2.0', 'xmlns:atom': 'http://www.w3.org/2005/Atom', 'xmlns:dc': 'http://purl.org/dc/elements/1.1/' },
      el(
        'channel',
        {},
        textEl('title', feed.title),
        textEl('link', feed.homePageUrl),
        textEl('description', feed.description ?? feed.title),
        textEl('language', feed.language),
        textEl('lastBuildDate', feed.fetchedAt.toUTCString()),
        textEl('generator', GENERATOR),
        el('atom:link', { href: selfUrl, rel: 'self', type: 'application/rss+xml' }),
        ...items,
      ),
    ),
  );
}
