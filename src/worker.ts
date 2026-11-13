import { kvCache, layeredCache, memoryCache } from './cache.ts';
import { createHandler, type FeedHandler, type HandlerOptions } from './server/handler.ts';
import type { FeedFormat } from './types.ts';

export interface WorkerOptions extends Omit<HandlerOptions, 'cache'> {
  kvBinding?: string;
}

export interface WorkerEnv {
  FORMATS?: string;
  OPML?: string;
  PREVIEW?: string;
  EMBED?: string;
  ALLOWED_ORIGINS?: string;
  BASE_URL?: string;
  [binding: string]: unknown;
}

export function createWorker(options: WorkerOptions): ExportedHandler<WorkerEnv> {
  let handler: FeedHandler | undefined;

  return {
    fetch(request, env, context) {
      handler ??= createHandler(resolveOptions(options, env));
      return handler(request as unknown as Request, context);
    },
  };
}

function resolveOptions({ kvBinding = 'FEED_CACHE', ...options }: WorkerOptions, env: WorkerEnv): HandlerOptions {
  const namespace = env[kvBinding] as KVNamespace | undefined;
  const staleTtl = options.staleTtl ?? 86_400;
  const origins = list(env.ALLOWED_ORIGINS);

  return {
    ...options,
    formats: options.formats ?? (list(env.FORMATS) as FeedFormat[] | undefined),
    opml: options.opml ?? flag(env.OPML),
    preview: options.preview ?? flag(env.PREVIEW),
    embed: options.embed ?? flag(env.EMBED),
    allowedOrigins: options.allowedOrigins ?? (origins?.includes('*') ? '*' : origins),
    baseUrl: options.baseUrl ?? (env.BASE_URL || undefined),
    staleTtl,
    cache: namespace ? layeredCache(memoryCache(), kvCache(namespace, staleTtl)) : memoryCache(),
  };
}

function list(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items?.length ? items : undefined;
}

function flag(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  return value === 'true' || value === '1';
}
