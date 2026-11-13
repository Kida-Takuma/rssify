import { formatForExtension } from '../render/formats.ts';
import type { FeedFormat } from '../types.ts';

export type Route =
  | { type: 'index' }
  | { type: 'opml' }
  | { type: 'preview'; id: string }
  | { type: 'embed'; id: string }
  | { type: 'feed'; id: string; format: FeedFormat; extension: string }
  | { type: 'unknown' };

const FEED_PATH = /^\/([a-z0-9][a-z0-9-]{0,63})(?:\.([a-z]{2,4})|\/(embed))?\/?$/;

export function matchRoute(pathname: string): Route {
  if (pathname === '/') return { type: 'index' };
  if (pathname === '/feeds.opml') return { type: 'opml' };

  const match = pathname.match(FEED_PATH);
  if (!match) return { type: 'unknown' };
  const [, id, extension, embed] = match as unknown as [string, string, string | undefined, string | undefined];
  if (embed) return { type: 'embed', id };
  if (!extension) return { type: 'preview', id };

  const format = formatForExtension(extension);
  return format ? { type: 'feed', id, format, extension } : { type: 'unknown' };
}
