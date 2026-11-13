import type { FeedDefinition } from '../src/index.ts';
import digitalAgencyNews from './digital-agency-news.ts';
import ndlNews from './ndl-news.ts';

const feeds: FeedDefinition[] = [digitalAgencyNews, ndlNews];

export default feeds;
