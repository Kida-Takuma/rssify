import { describe, expect, it } from 'vitest';
import { parseDate } from '../src/extract/date.ts';

const iso = (text: string, format?: string, timeZone?: string) => parseDate(text, format, timeZone)?.toISOString();

describe('parseDate', () => {
  it('uses the given format and time zone', () => {
    expect(iso('2026.10.20', 'yyyy.MM.dd', 'Asia/Tokyo')).toBe('2026-10-19T15:00:00.000Z');
    expect(iso('Posted 10/2/2026 09:30', 'M/d/yyyy HH:mm')).toBe('2026-10-02T09:30:00.000Z');
  });

  it('reads common year-month-day forms without a format', () => {
    expect(iso('2026年10月20日', undefined, 'Asia/Tokyo')).toBe('2026-10-19T15:00:00.000Z');
    expect(iso('2026-10-20 18:05')).toBe('2026-10-20T18:05:00.000Z');
  });

  it('respects explicit offsets', () => {
    expect(iso('2026-10-20T09:00:00+09:00')).toBe('2026-10-20T00:00:00.000Z');
  });

  it('handles daylight saving time', () => {
    expect(iso('2026-07-01 12:00', undefined, 'America/New_York')).toBe('2026-07-01T16:00:00.000Z');
    expect(iso('2026-12-01 12:00', undefined, 'America/New_York')).toBe('2026-12-01T17:00:00.000Z');
  });

  it('rejects impossible or missing dates', () => {
    expect(iso('2026.02.30', 'yyyy.MM.dd')).toBeUndefined();
    expect(iso('nothing here')).toBeUndefined();
  });
});
