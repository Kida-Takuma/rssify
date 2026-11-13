import { describe, expect, it } from 'vitest';
import digitalAgencyNews from '../feeds/digital-agency-news.ts';
import ndlNews from '../feeds/ndl-news.ts';
import { extractFeed } from '../src/extract/extract.ts';
import digitalAgencyHtml from './fixtures/digital-agency-news.html?raw';
import ndlHtml from './fixtures/ndl-news.html?raw';

describe('public site snapshots', () => {
  it('reads the National Diet Library news list', async () => {
    const feed = await extractFeed(ndlNews, { url: ndlNews.url, html: ndlHtml });
    expect(feed.items).toHaveLength(50);
    expect(feed.items[0]).toMatchObject({
      title: '立法調査資料『調査と情報―ISSUE BRIEF―』No.1382「韓国の政治資金制度」を掲載',
      url: 'https://www.ndl.go.jp/diet/publication/issue/2026#no1382',
    });
    expect(feed.items.find((item) => item.title.includes('No.309-2'))?.url).toBe(
      'https://www.ndl.go.jp/diet/publication/legis/2026#no309-2',
    );
    expect(feed.items.find((item) => item.title.includes('No.910'))?.url).toBe(
      'https://www.ndl.go.jp/diet/publication/refer/2026#no910',
    );
    expect(feed.items[0]?.date?.toISOString()).toBe('2026-11-12T03:00:21.000Z');
    for (const item of feed.items) {
      expect(new URL(item.url).protocol).toBe('https:');
      expect(item.date).toBeInstanceOf(Date);
    }
  });

  it('reads the Digital Agency news list', async () => {
    const feed = await extractFeed(digitalAgencyNews, { url: digitalAgencyNews.url, html: digitalAgencyHtml });
    expect(feed.items).toHaveLength(10);
    expect(feed.items[0]).toMatchObject({
      title: '古川大臣記者会見（令和8年11月13日）動画を掲載しました',
      url: 'https://www.digital.go.jp/speech/minister-261113-01',
    });
    expect(feed.items[0]?.date?.toISOString()).toBe('2026-11-12T15:00:00.000Z');
    for (const item of feed.items) {
      expect(new URL(item.url).host).toBe('www.digital.go.jp');
      expect(item.date).toBeInstanceOf(Date);
    }
  });
});
