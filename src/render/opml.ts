import { el, textEl, toXmlDocument } from './xml.ts';

export interface OpmlEntry {
  title: string;
  feedUrl: string;
  homePageUrl: string;
}

export function renderOpml(title: string, entries: readonly OpmlEntry[]): string {
  return toXmlDocument(
    el(
      'opml',
      { version: '2.0' },
      el('head', {}, textEl('title', title)),
      el(
        'body',
        {},
        ...entries.map((entry) =>
          el('outline', {
            type: 'rss',
            text: entry.title,
            title: entry.title,
            xmlUrl: entry.feedUrl,
            htmlUrl: entry.homePageUrl,
          }),
        ),
      ),
    ),
  );
}
