import { sha256Hex } from '../hash.ts';

export const ALLOWED_METHODS = 'GET, HEAD, OPTIONS';

const FEED_CSP = "default-src 'none'; frame-ancestors 'none'";

const BASE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
};

const NOT_EMBEDDABLE = {
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
};

export interface Body {
  content: string;
  contentType: string;
  maxAge: number;
  csp?: string;
  embeddable?: boolean;
}

export async function sendBody(request: Request, body: Body, headers: Record<string, string>): Promise<Response> {
  const etag = `"${await sha256Hex(body.content, 32)}"`;
  const responseHeaders = {
    ...BASE_HEADERS,
    ...(body.embeddable ? { 'cross-origin-resource-policy': 'cross-origin' } : NOT_EMBEDDABLE),
    ...headers,
    'content-security-policy': body.csp ?? FEED_CSP,
    'content-type': body.contentType,
    'cache-control': body.maxAge > 0 ? `public, max-age=${body.maxAge}` : 'no-cache',
    etag,
  };
  if (matchesEtag(request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers: responseHeaders });
  }
  return new Response(request.method === 'HEAD' ? null : body.content, { headers: responseHeaders });
}

export function sendStatus(status: number, headers: Record<string, string> = {}): Response {
  const text = `${status} ${STATUS_TEXT[status] ?? ''}`.trim();
  return new Response(text, {
    status,
    headers: {
      ...BASE_HEADERS,
      ...NOT_EMBEDDABLE,
      ...headers,
      'content-security-policy': FEED_CSP,
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function sendPreflight(cors: Record<string, string>): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...BASE_HEADERS,
      ...cors,
      'access-control-allow-methods': ALLOWED_METHODS,
      'access-control-max-age': '86400',
    },
  });
}

const STATUS_TEXT: Record<number, string> = {
  404: 'Not Found',
  405: 'Method Not Allowed',
  502: 'Upstream Unavailable',
};

function matchesEtag(header: string | null, etag: string): boolean {
  return header?.split(',').some((tag) => tag.trim() === etag || tag.trim() === '*') ?? false;
}
