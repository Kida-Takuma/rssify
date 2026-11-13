import { ExtractError } from '../errors.ts';
import { sha256Hex } from '../hash.ts';
import type { Feed, FeedDefinition, FeedItem, Page } from '../types.ts';
import { parseDate } from './date.ts';
import { decodeEntities } from './entities.ts';
import { type RawItem, scanDocument } from './scan.ts';
import { cleanText, resolveHttpUrl } from './text.ts';

const DEFAULT_LIMIT = 50;
const MAX_TITLE = 300;
const MAX_SUMMARY = 1000;

export async function extractFeed(definition: FeedDefinition, page: Page, now = new Date()): Promise<Feed> {
  const scanned = await scanDocument(page.html, definition.items);
  const base = resolveBase(scanned.base, page.url);
  const limit = definition.limit ?? DEFAULT_LIMIT;
  const items = new Map<string, FeedItem>();

  for (const raw of scanned.items) {
    const extracted = await toItem(raw, definition, base);
    const item =
      extracted && definition.transform
        ? sanitize(definition.transform(extracted, definition), extracted, definition, base)
        : extracted;
    if (item && !items.has(item.id)) items.set(item.id, item);
    if (items.size >= limit) break;
  }

  if (items.size === 0) {
    throw new ExtractError(`No items matched "${definition.items.selector}" on ${page.url}`);
  }

  return withoutEmpty({
    id: definition.id,
    title: definition.title ?? text(scanned.title, MAX_TITLE) ?? new URL(definition.url).hostname,
    description: definition.description,
    language: definition.language ?? text(scanned.language, 35),
    timezone: definition.timezone ?? 'UTC',
    homePageUrl: definition.url,
    items: [...items.values()],
    fetchedAt: now,
  });
}

async function toItem(raw: RawItem, definition: FeedDefinition, base: URL): Promise<FeedItem | undefined> {
  const title = text(raw.title, MAX_TITLE);
  if (!title) return undefined;

  const url = resolveHttpUrl(raw.link && decodeEntities(raw.link), base) ?? definition.url;
  const date = text(raw.date, 200);

  return withoutEmpty({
    id: await sha256Hex(`${url}\n${title}`, 32),
    title,
    url,
    date: date ? parseDate(date, definition.items.dateFormat, definition.timezone) : undefined,
    summary: text(raw.summary, MAX_SUMMARY),
    author: text(raw.author, MAX_TITLE),
  });
}

function sanitize(
  result: FeedItem | null | undefined,
  original: FeedItem,
  definition: FeedDefinition,
  base: URL,
): FeedItem | undefined {
  const title = result && cleanText(result.title, MAX_TITLE);
  if (!result || !title) return undefined;

  return withoutEmpty({
    id: cleanText(result.id, 128) ?? original.id,
    title,
    url: resolveHttpUrl(result.url, base) ?? definition.url,
    date: result.date instanceof Date && !Number.isNaN(result.date.getTime()) ? result.date : undefined,
    summary: cleanText(result.summary, MAX_SUMMARY),
    author: cleanText(result.author, MAX_TITLE),
  });
}

function text(raw: string | undefined, maxLength: number): string | undefined {
  return cleanText(raw && decodeEntities(raw), maxLength);
}

function resolveBase(href: string | undefined, pageUrl: string): URL {
  try {
    return new URL(href ? decodeEntities(href) : pageUrl, pageUrl);
  } catch {
    return new URL(pageUrl);
  }
}

function withoutEmpty<T extends object>(value: { [K in keyof T]: T[K] | undefined }): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined && field !== '')) as T;
}
