import { defineFeed } from '../src/index.ts';

export default defineFeed({
  id: 'digital-agency-news',
  title: 'デジタル庁 新着・更新',
  url: 'https://www.digital.go.jp/news',
  language: 'ja',
  timezone: 'Asia/Tokyo',
  items: {
    selector: 'ul.stack a.card',
    title: '.card__title',
    date: { selector: 'time', attr: 'datetime' },
  },
});
