import { FetchError } from '../errors.ts';

const SNIFF_BYTES = 2048;

export function detectCharset(bytes: Uint8Array, contentType: string | null, override?: string): string {
  return override ?? fromContentType(contentType) ?? fromMeta(bytes) ?? 'utf-8';
}

export function decode(bytes: Uint8Array, charset: string): string {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    throw new FetchError(`Unsupported charset "${charset}" in this runtime`);
  }
  return decoder.decode(bytes);
}

function fromContentType(contentType: string | null): string | undefined {
  return contentType?.match(/charset\s*=\s*["']?([\w.:-]+)/i)?.[1];
}

function fromMeta(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, SNIFF_BYTES));
  return head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i)?.[1];
}
