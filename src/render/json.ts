import type { Feed } from '../types.ts';
import { itemUri } from './shared.ts';

export function renderJsonFeed(feed: Feed, selfUrl: string): string {
  const document = {
    version: 'https://jsonfeed.org/version/1.1',
    title: feed.title,
    home_page_url: feed.homePageUrl,
    feed_url: selfUrl,
    description: feed.description,
    language: feed.language,
    items: feed.items.map((item) => ({
      id: itemUri(feed, item),
      url: item.url,
      title: item.title,
      content_text: item.summary ?? item.title,
      summary: item.summary,
      date_published: item.date?.toISOString(),
      authors: item.author ? [{ name: item.author }] : undefined,
    })),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}
