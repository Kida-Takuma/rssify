import { describe, expect, it } from 'vitest';
import { detectLists, guessTimezone } from '../src/detect/detect.ts';
import { extractFeed } from '../src/extract/extract.ts';
import digitalAgencyHtml from './fixtures/digital-agency-news.html?raw';
import ndlHtml from './fixtures/ndl-news.html?raw';
import syntheticHtml from './fixtures/synthetic.html?raw';

async function detectAndExtract(url: string, html: string) {
  const [best] = await detectLists(html);
  expect(best).toBeDefined();
  const feed = await extractFeed({ id: 'detected', url, timezone: 'Asia/Tokyo', items: best!.items }, { url, html });
  return { list: best!, feed };
}

describe('detectLists', () => {
  it('finds the National Diet Library news list', async () => {
    const { list, feed } = await detectAndExtract('https://www.ndl.go.jp/news', ndlHtml);
    expect(list.items).toMatchObject({ title: 'a', date: { selector: 'time', attr: 'datetime' } });
    expect(feed.items).toHaveLength(50);
    expect(feed.items[0]?.title).toBe('立法調査資料『調査と情報―ISSUE BRIEF―』No.1382「韓国の政治資金制度」を掲載');
    expect(feed.items.every((item) => item.date)).toBe(true);
  });

  it('finds the Digital Agency news list', async () => {
    const { list, feed } = await detectAndExtract('https://www.digital.go.jp/news', digitalAgencyHtml);
    expect(list.items).toMatchObject({ title: 'p.card__title', date: { selector: 'time', attr: 'datetime' } });
    expect(feed.items).toHaveLength(10);
    expect(feed.items[0]).toMatchObject({
      title: '古川大臣記者会見（令和8年11月13日）動画を掲載しました',
      url: 'https://www.digital.go.jp/speech/minister-261113-01',
    });
  });

  it('finds lists dated by plain text', async () => {
    const { list, feed } = await detectAndExtract('https://library.example/news/', syntheticHtml);
    expect(list.items).toMatchObject({ selector: 'ul.news-list > li', date: 'span.date' });
    expect(feed.items[0]?.date?.toISOString()).toBe('2026-10-19T15:00:00.000Z');
  });

  it('ranks navigation menus below content', async () => {
    const lists = await detectLists(digitalAgencyHtml);
    expect(lists[0]!.score).toBeGreaterThan(lists[1]!.score * 10);
  });

  it('returns nothing for pages without lists', async () => {
    expect(await detectLists('<html><body><p>Hello</p></body></html>')).toEqual([]);
  });
});

it('guesses the time zone from the page language', () => {
  expect(guessTimezone('ja')).toBe('Asia/Tokyo');
  expect(guessTimezone('ja-JP')).toBe('Asia/Tokyo');
  expect(guessTimezone('en')).toBe('UTC');
  expect(guessTimezone(undefined)).toBe('UTC');
});
