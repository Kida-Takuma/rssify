import { describe, expect, it } from 'vitest';
import { defineFeed } from '../src/define.ts';
import { extractFeed } from '../src/extract/extract.ts';
import html from './fixtures/synthetic.html?raw';

const page = { url: 'https://library.example/news/', html };

const definition = defineFeed({
  id: 'library',
  url: 'https://library.example/news/',
  timezone: 'Asia/Tokyo',
  items: {
    selector: '.news-list li',
    title: 'a',
    date: '.date',
    dateFormat: 'yyyy.MM.dd',
    summary: '.lead',
  },
});

describe('extractFeed', () => {
  it('extracts items with decoded text, resolved links and dates', async () => {
    const feed = await extractFeed(definition, page);
    expect(feed).toMatchObject({ title: 'Riverside Library & Archive | News', language: 'en', timezone: 'Asia/Tokyo' });
    expect(feed.items).toHaveLength(4);

    const [first, second, unsafe, external] = feed.items;
    expect(first).toMatchObject({
      title: 'Autumn reading week starts',
      url: 'https://library.example/news/42',
      summary: 'Join us for a week of readings.',
    });
    expect(first?.date?.toISOString()).toBe('2026-10-19T15:00:00.000Z');
    expect(second).toMatchObject({
      title: "Opening hours changed — Tom & Jerry's corner",
      url: 'https://library.example/news/news/41?ref=list&page=1',
    });
    expect(unsafe).toMatchObject({ title: 'Unsafe link', url: 'https://library.example/news/' });
    expect(external?.date).toBeUndefined();
  });

  it('gives stable and unique ids', async () => {
    const [a, b] = await Promise.all([extractFeed(definition, page), extractFeed(definition, page)]);
    expect(a.items.map((item) => item.id)).toEqual(b.items.map((item) => item.id));
    expect(new Set(a.items.map((item) => item.id)).size).toBe(a.items.length);
  });

  it('reads attributes and the item element itself', async () => {
    const feed = await extractFeed(
      { ...definition, items: { selector: '.news-list a', title: { attr: 'href' } } },
      page,
    );
    expect(feed.items[0]).toMatchObject({ title: '/news/42', url: 'https://library.example/news/42' });
  });

  it('applies limit and transform', async () => {
    const feed = await extractFeed(
      {
        ...definition,
        limit: 2,
        transform: (item) =>
          item.title.startsWith('Opening')
            ? null
            : { ...item, title: item.title.toUpperCase(), url: 'javascript:void(0)' },
      },
      page,
    );
    expect(feed.items.map((item) => item.title)).toEqual(['AUTUMN READING WEEK STARTS', 'UNSAFE LINK']);
    expect(feed.items[0]?.url).toBe('https://library.example/news/');
  });

  it('fails when nothing matches', async () => {
    const missing = { ...definition, items: { ...definition.items, selector: '.missing' } };
    await expect(extractFeed(missing, page)).rejects.toThrow('No items matched');
  });

  it('reports unsupported selectors', async () => {
    const invalid = { ...definition, items: { ...definition.items, selector: 'li ~ li' } };
    await expect(extractFeed(invalid, page)).rejects.toThrow('Could not read the page');
  });
});
