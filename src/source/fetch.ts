import { FetchError } from '../errors.ts';
import type { FeedDefinition, Page } from '../types.ts';
import { decode, detectCharset } from './charset.ts';

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  fetch?: typeof fetch;
}

const ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1';

export async function fetchPage(definition: FeedDefinition, options: FetchOptions = {}): Promise<Page> {
  const {
    timeoutMs = 10_000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 3,
    userAgent = 'rssify (+https://github.com/Kida-Takuma/rssify)',
  } = options;
  const request = options.fetch ?? fetch;
  const signal = AbortSignal.timeout(timeoutMs);
  const origin = new URL(definition.url);
  let url = origin;

  for (let redirects = 0; ; redirects++) {
    const response = await request(url.href, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': userAgent, accept: ACCEPT, ...definition.headers },
    }).catch((error: Error) => {
      throw new FetchError(`Request to ${url.href} failed: ${error.message}`);
    });

    const location = isRedirect(response) ? response.headers.get('location') : null;
    if (location) {
      await response.body?.cancel();
      if (redirects >= maxRedirects) throw new FetchError(`Too many redirects from ${origin.href}`);
      url = sameHostRedirect(location, url, origin);
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new FetchError(`${url.href} responded with ${response.status}`);
    }

    const bytes = await readBody(response, maxBytes);
    const charset = detectCharset(bytes, response.headers.get('content-type'), definition.encoding);
    return { url: url.href, html: decode(bytes, charset) };
  }
}

function isRedirect(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

function sameHostRedirect(location: string, current: URL, origin: URL): URL {
  const next = new URL(location, current);
  if (next.protocol !== 'http:' && next.protocol !== 'https:') {
    throw new FetchError(`Refused redirect to ${next.protocol} url`);
  }
  if (next.hostname !== origin.hostname || next.port !== origin.port) {
    throw new FetchError(`Refused redirect to another host: ${next.host}`);
  }
  if (current.protocol === 'https:' && next.protocol !== 'https:') {
    throw new FetchError(`Refused redirect from https to ${next.href}`);
  }
  return next;
}

async function readBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const tooLarge = () => new FetchError(`Response is larger than ${maxBytes} bytes`);
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
