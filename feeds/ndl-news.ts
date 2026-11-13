import { defineFeed } from '../src/index.ts';

export default defineFeed({
  id: 'ndl-news',
  title: '国立国会図書館 おしらせ',
  url: 'https://www.ndl.go.jp/news',
  language: 'ja',
  timezone: 'Asia/Tokyo',
  items: {
    selector: '.ui-parts-list-article li',
    title: 'a',
    date: { selector: 'time', attr: 'datetime' },
  },
  transform(item) {
    const issue = item.title.match(/No\.(\d+(?:-\d+)?)/)?.[1];
    const url = new URL(item.url);
    if (!issue || url.hash || !/^\/diet\/publication\/(issue|legis|refer)\/\d{4}$/.test(url.pathname)) return item;
    url.hash = `no${issue}`;
    return { ...item, url: url.href };
  },
});
