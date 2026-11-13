import type { Feed, FeedItem } from '../types.ts';

export const GENERATOR = 'rssify';

export function feedUri(feed: Feed): string {
  return `urn:${GENERATOR}:${feed.id}`;
}

export function itemUri(feed: Feed, item: FeedItem): string {
  return `${feedUri(feed)}:${item.id}`;
}

export function latestDate(feed: Feed): Date {
  const times = feed.items.flatMap((item) => (item.date ? [item.date.getTime()] : []));
  return times.length > 0 ? new Date(Math.max(...times)) : feed.fetchedAt;
}

export function dateFormatter(feed: Feed): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(feed.language ?? 'en', { dateStyle: 'medium', timeZone: feed.timezone });
  } catch {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });
  }
}
