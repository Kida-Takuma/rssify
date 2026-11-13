import type { Feed, FeedFormat } from '../types.ts';
import { renderAtom } from './atom.ts';
import { renderJsonFeed } from './json.ts';
import { renderRss } from './rss.ts';

export interface FormatSpec {
  label: string;
  extensions: readonly [string, ...string[]];
  contentType: string;
  render: (feed: Feed, selfUrl: string) => string;
}

export const FORMATS: Record<FeedFormat, FormatSpec> = {
  rss: {
    label: 'RSS',
    extensions: ['rss', 'xml'],
    contentType: 'application/rss+xml; charset=utf-8',
    render: renderRss,
  },
  atom: {
    label: 'Atom',
    extensions: ['atom'],
    contentType: 'application/atom+xml; charset=utf-8',
    render: renderAtom,
  },
  json: {
    label: 'JSON Feed',
    extensions: ['json'],
    contentType: 'application/feed+json; charset=utf-8',
    render: renderJsonFeed,
  },
};

const BY_EXTENSION = new Map(
  Object.entries(FORMATS).flatMap(([format, spec]) =>
    spec.extensions.map((extension) => [extension, format as FeedFormat]),
  ),
);

export function formatForExtension(extension: string): FeedFormat | undefined {
  return BY_EXTENSION.get(extension);
}

export function feedFileName(id: string, format: FeedFormat): string {
  return `${id}.${FORMATS[format].extensions[0]}`;
}
