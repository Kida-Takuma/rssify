import { DefinitionError } from '../errors.ts';

export type AllowedOrigins = '*' | readonly string[];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validateOrigins(origins: AllowedOrigins | undefined): void {
  if (origins === undefined || origins === '*') return;
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new DefinitionError(`Invalid allowed origin "${origin}"`);
    }
    if (url.origin !== origin) {
      throw new DefinitionError(`Allowed origin "${origin}" must be an origin only, like "${url.origin}"`);
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
      throw new DefinitionError(`Allowed origin "${origin}" must use https`);
    }
  }
}

export function originsFor(origins: AllowedOrigins | undefined, requestUrl: URL): AllowedOrigins | undefined {
  if (!origins || origins === '*' || LOCAL_HOSTS.has(requestUrl.hostname)) return origins;
  return origins.filter((origin) => !LOCAL_HOSTS.has(new URL(origin).hostname));
}

export function corsHeaders(request: Request, origins: AllowedOrigins | undefined): Record<string, string> {
  if (!origins) return {};
  if (origins === '*') return { 'access-control-allow-origin': '*' };
  const origin = request.headers.get('origin');
  return origin && origins.includes(origin)
    ? { 'access-control-allow-origin': origin, vary: 'Origin' }
    : { vary: 'Origin' };
}

export function frameAncestors(origins: AllowedOrigins | undefined): string {
  if (!origins || origins.length === 0) return "'none'";
  return origins === '*' ? '*' : origins.join(' ');
}
