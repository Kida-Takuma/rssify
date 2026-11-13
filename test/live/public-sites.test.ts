import { describe, expect, it } from 'vitest';
import digitalAgencyNews from '../../feeds/digital-agency-news.ts';
import ndlNews from '../../feeds/ndl-news.ts';
import { extractFeed } from '../../src/extract/extract.ts';
import { fetchPage } from '../../src/source/fetch.ts';

const OFFICIAL_RSS = 'https://www.digital.go.jp/rss/news.xml';

describe('public sites (live)', () => {
  it('reads the National Diet Library news list', async () => {
    const feed = await extractFeed(ndlNews, await fetchPage(ndlNews));
    expect(feed.items.length).toBeGreaterThan(0);
    for (const item of feed.items) {
      expect(new URL(item.url).protocol).toBe('https:');
      expect(item.date).toBeInstanceOf(Date);
    }
  });

  it('matches the official Digital Agency RSS', async () => {
    const [feed, official] = await Promise.all([
      fetchPage(digitalAgencyNews).then((page) => extractFeed(digitalAgencyNews, page)),
      fetch(OFFICIAL_RSS, { headers: { 'user-agent': 'rssify' } }).then((response) => response.text()),
    ]);
    const officialTitles = [...official.matchAll(/<item>\s*<title>([^<]*)<\/title>/g)].map((match) => match[1]?.trim());
    expect(feed.items.length).toBeGreaterThan(0);
    for (const item of feed.items.slice(0, 5)) {
      expect(officialTitles).toContain(item.title);
    }
  });
});
