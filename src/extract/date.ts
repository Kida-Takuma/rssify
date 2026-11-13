type Field = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
type DateParts = Record<Field, number>;

const TOKENS: Record<string, { pattern: string; field: Field }> = {
  yyyy: { pattern: '(\\d{4})', field: 'year' },
  MM: { pattern: '(\\d{2})', field: 'month' },
  M: { pattern: '(\\d{1,2})', field: 'month' },
  dd: { pattern: '(\\d{2})', field: 'day' },
  d: { pattern: '(\\d{1,2})', field: 'day' },
  HH: { pattern: '(\\d{2})', field: 'hour' },
  H: { pattern: '(\\d{1,2})', field: 'hour' },
  mm: { pattern: '(\\d{2})', field: 'minute' },
  ss: { pattern: '(\\d{2})', field: 'second' },
};

const TOKEN_PATTERN = /yyyy|MM|M|dd|d|HH|H|mm|ss/g;
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)\s*$/i;
const COMMON_FORMAT = {
  regex: /(\d{4})\s*[./\-年]\s*(\d{1,2})\s*[./\-月]\s*(\d{1,2})\s*日?(?:\D{0,12}?(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  fields: ['year', 'month', 'day', 'hour', 'minute', 'second'] as Field[],
};

const compiledFormats = new Map<string, typeof COMMON_FORMAT>();
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

export function parseDate(text: string, format?: string, timeZone = 'UTC'): Date | undefined {
  const value = text.trim();
  if (!value) return undefined;

  if (!format && HAS_OFFSET.test(value)) {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return new Date(time);
  }

  const parts = matchParts(value, format ? compileFormat(format) : COMMON_FORMAT);
  return parts && zonedTimeToDate(parts, timeZone);
}

function compileFormat(format: string): typeof COMMON_FORMAT {
  const cached = compiledFormats.get(format);
  if (cached) return cached;

  const fields: Field[] = [];
  let source = '';
  let last = 0;
  for (const match of format.matchAll(TOKEN_PATTERN)) {
    const token = TOKENS[match[0]]!;
    source += escapeRegExp(format.slice(last, match.index)) + token.pattern;
    fields.push(token.field);
    last = match.index + match[0].length;
  }
  source += escapeRegExp(format.slice(last));

  const compiled = { regex: new RegExp(source), fields };
  compiledFormats.set(format, compiled);
  return compiled;
}

function matchParts(value: string, { regex, fields }: typeof COMMON_FORMAT): DateParts | undefined {
  const match = value.match(regex);
  if (!match) return undefined;
  const parts: DateParts = { year: NaN, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  fields.forEach((field, index) => {
    const captured = match[index + 1];
    if (captured !== undefined) parts[field] = Number(captured);
  });
  return parts;
}

function zonedTimeToDate({ year, month, day, hour, minute, second }: DateParts, timeZone: string): Date | undefined {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) {
    return undefined;
  }
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  if (new Date(wallClock).getUTCDate() !== day) return undefined;

  const guess = wallClock - offsetAt(wallClock, timeZone);
  return new Date(wallClock - offsetAt(guess, timeZone));
}

function offsetAt(time: number, timeZone: string): number {
  let formatter = offsetFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    offsetFormatters.set(timeZone, formatter);
  }
  const part = Object.fromEntries(
    formatter.formatToParts(new Date(time)).map(({ type, value }) => [type, Number(value)]),
  ) as Record<Intl.DateTimeFormatPartTypes, number>;
  const local = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second);
  return local - Math.floor(time / 1000) * 1000;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
