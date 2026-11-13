const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value: string | undefined, maxLength: number): string | undefined {
  const text = value?.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function resolveHttpUrl(href: string | undefined, base: URL): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
