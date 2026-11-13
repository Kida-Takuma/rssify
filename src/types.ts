export const FEED_FORMATS = ['rss', 'atom', 'json'] as const;

export type FeedFormat = (typeof FEED_FORMATS)[number];

export type FieldSelector = string | { selector?: string; attr?: string };

export interface ItemSpec {
  selector: string;
  title: FieldSelector;
  link?: FieldSelector;
  date?: FieldSelector;
  dateFormat?: string;
  summary?: FieldSelector;
  author?: FieldSelector;
}

export interface FeedItem {
  id: string;
  title: string;
  url: string;
  date?: Date;
  summary?: string;
  author?: string;
}

export interface FeedDefinition {
  id: string;
  url: string;
  title?: string;
  description?: string;
  language?: string;
  timezone?: string;
  encoding?: string;
  headers?: Record<string, string>;
  items: ItemSpec;
  formats?: readonly FeedFormat[];
  limit?: number;
  ttl?: number;
  transform?: (item: FeedItem, definition: FeedDefinition) => FeedItem | null | undefined;
}

export interface Feed {
  id: string;
  title: string;
  description?: string;
  language?: string;
  timezone: string;
  homePageUrl: string;
  items: FeedItem[];
  fetchedAt: Date;
}

export interface Page {
  url: string;
  html: string;
}
