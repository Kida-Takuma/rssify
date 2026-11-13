import type { Feed } from '../types.ts';
import { feedUri, GENERATOR, itemUri, latestDate } from './shared.ts';
import { el, textEl, toXmlDocument } from './xml.ts';

export function renderAtom(feed: Feed, selfUrl: string): string {
  const entries = feed.items.map((item) =>
    el(
      'entry',
      {},
      textEl('id', itemUri(feed, item)),
      textEl('title', item.title),
      el('link', { rel: 'alternate', href: item.url }),
      textEl('updated', (item.date ?? feed.fetchedAt).toISOString()),
      textEl('published', item.date?.toISOString()),
      textEl('summary', item.summary),
      item.author ? el('author', {}, textEl('name', item.author)) : undefined,
    ),
  );

  return toXmlDocument(
    el(
      'feed',
      { xmlns: 'http://www.w3.org/2005/Atom', 'xml:lang': feed.language },
      textEl('id', feedUri(feed)),
      textEl('title', feed.title),
      textEl('subtitle', feed.description),
      el('link', { rel: 'alternate', href: feed.homePageUrl }),
      el('link', { rel: 'self', type: 'application/atom+xml', href: selfUrl }),
      textEl('updated', latestDate(feed).toISOString()),
      el('author', {}, textEl('name', feed.title)),
      textEl('generator', GENERATOR),
      ...entries,
    ),
  );
}
