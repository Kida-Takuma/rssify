import { type FeedCache, memoryCache } from '../cache.ts';
import { validateDefinitions, validateFormats } from '../define.ts';
import { DefinitionError } from '../errors.ts';
import { sha256Base64 } from '../hash.ts';
import { EMBED_STYLE, parseEmbedOptions, renderEmbedPage } from '../render/embed.ts';
import { FORMATS, feedFileName } from '../render/formats.ts';
import { type FeedLink, renderFeedPage, renderIndexPage, SCRIPT, STYLE } from '../render/html.ts';
import { renderOpml } from '../render/opml.ts';
import { escapeXml } from '../render/xml.ts';
import type { FetchOptions } from '../source/fetch.ts';
import type { Feed, FeedDefinition, FeedFormat } from '../types.ts';
import { createFeedLoader, type WaitUntil } from './loader.ts';
import { type AllowedOrigins, corsHeaders, frameAncestors, originsFor, validateOrigins } from './origins.ts';
import { ALLOWED_METHODS, sendBody, sendPreflight, sendStatus } from './response.ts';
import { matchRoute } from './routes.ts';

export interface HandlerOptions {
  feeds: readonly FeedDefinition[];
  formats?: readonly FeedFormat[];
  opml?: boolean;
  preview?: boolean;
  embed?: boolean;
  allowedOrigins?: AllowedOrigins;
  title?: string;
  baseUrl?: string;
  cache?: FeedCache;
  defaultTtl?: number;
  staleTtl?: number;
  retryAfter?: number;
  fetch?: FetchOptions;
  onError?: (error: unknown, definition: FeedDefinition) => void;
}

export type FeedHandler = (request: Request, context?: WaitUntil) => Promise<Response>;

const HTML_TYPE = 'text/html; charset=utf-8';
const OPML_TYPE = 'text/x-opml; charset=utf-8';
const PAGE_POLICY = "base-uri 'none'; form-action 'none'";
const EMBED_HEIGHT = 420;

export function createHandler(options: HandlerOptions): FeedHandler {
  validateDefinitions(options.feeds);
  validateOrigins(options.allowedOrigins);
  const defaultFormats = options.formats ?? ['rss'];
  validateFormats(defaultFormats, 'Handler options');
  if (options.embed && !options.allowedOrigins) {
    throw new DefinitionError('Embedding needs allowedOrigins to list the sites that may embed feeds');
  }

  const title = options.title ?? 'Feeds';
  const preview = options.preview ?? true;
  const embed = options.embed ?? false;
  const defaultTtl = options.defaultTtl ?? 1800;
  const definitions = new Map(options.feeds.map((definition) => [definition.id, definition]));
  const formatsOf = (definition: FeedDefinition) => definition.formats ?? defaultFormats;
  const policies = Promise.all([sha256Base64(STYLE), sha256Base64(SCRIPT), sha256Base64(EMBED_STYLE)]).then(
    ([style, script, embedStyle]) => ({
      preview: `default-src 'none'; style-src 'sha256-${style}'; script-src 'sha256-${script}'; ${PAGE_POLICY}; frame-ancestors 'none'`,
      embed: (origins: AllowedOrigins | undefined) =>
        `default-src 'none'; style-src 'sha256-${embedStyle}'; ${PAGE_POLICY}; frame-ancestors ${frameAncestors(origins)}`,
    }),
  );
  const load = createFeedLoader({
    cache: options.cache ?? memoryCache(),
    defaultTtl,
    staleTtl: options.staleTtl ?? 86_400,
    retryAfter: options.retryAfter ?? 300,
    fetch: options.fetch,
    onError: options.onError,
  });

  return async (request, context) => {
    const requestUrl = new URL(request.url);
    const origins = originsFor(options.allowedOrigins, requestUrl);
    const cors = corsHeaders(request, origins);
    if (request.method === 'OPTIONS') return sendPreflight(cors);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return sendStatus(405, { ...cors, allow: ALLOWED_METHODS });
    }

    const publicUrl = (path: string) => new URL(path, options.baseUrl ?? requestUrl.origin).href;
    const linksOf = (definition: FeedDefinition): FeedLink[] =>
      formatsOf(definition).map((format) => ({
        label: FORMATS[format].label,
        url: publicUrl(`/${feedFileName(definition.id, format)}`),
      }));
    const embedSnippet = (feed: Feed) =>
      embed
        ? {
            code: iframeSnippet(publicUrl(`/${feed.id}/embed`), feed.title),
            origins: origins === '*' ? 'any site' : origins?.join(', ') || 'none',
          }
        : undefined;
    const route = matchRoute(requestUrl.pathname);

    if (route.type === 'index' && preview) {
      const page = renderIndexPage(
        title,
        options.feeds.map((definition) => ({
          title: definition.title ?? definition.id,
          sourceUrl: definition.url,
          previewUrl: publicUrl(`/${definition.id}`),
          links: linksOf(definition),
        })),
      );
      const csp = (await policies).preview;
      return sendBody(request, { content: page, contentType: HTML_TYPE, maxAge: 0, csp }, cors);
    }

    if (route.type === 'opml' && options.opml) {
      const entries = options.feeds.map((definition) => ({
        title: definition.title ?? definition.id,
        feedUrl: publicUrl(`/${feedFileName(definition.id, formatsOf(definition)[0]!)}`),
        homePageUrl: definition.url,
      }));
      return sendBody(
        request,
        { content: renderOpml(title, entries), contentType: OPML_TYPE, maxAge: defaultTtl },
        cors,
      );
    }

    const definition =
      route.type !== 'index' && route.type !== 'opml' && route.type !== 'unknown' && definitions.get(route.id);
    if (!definition) return sendStatus(404, cors);
    if (route.type === 'preview' && !preview) return sendStatus(404, cors);
    if (route.type === 'embed' && !embed) return sendStatus(404, cors);
    if (route.type === 'feed' && !formatsOf(definition).includes(route.format)) return sendStatus(404, cors);

    const feed = await load(definition, context);
    if (!feed) return sendStatus(502, cors);
    const maxAge = definition.ttl ?? defaultTtl;

    if (route.type === 'preview') {
      const page = renderFeedPage(feed, linksOf(definition), embedSnippet(feed));
      const csp = (await policies).preview;
      return sendBody(request, { content: page, contentType: HTML_TYPE, maxAge: 0, csp }, cors);
    }

    if (route.type === 'embed') {
      const page = renderEmbedPage(feed, parseEmbedOptions(requestUrl.searchParams));
      const csp = (await policies).embed(origins);
      return sendBody(request, { content: page, contentType: HTML_TYPE, maxAge, csp, embeddable: true }, {});
    }

    const format = FORMATS[route.format];
    const content = format.render(feed, publicUrl(`/${definition.id}.${route.extension}`));
    return sendBody(request, { content, contentType: format.contentType, maxAge }, cors);
  };
}

function iframeSnippet(src: string, title: string): string {
  return (
    `<iframe src="${escapeXml(src)}" title="${escapeXml(title)}" loading="lazy" ` +
    'sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" ' +
    `style="width:100%;height:${EMBED_HEIGHT}px;border:0"></iframe>`
  );
}
