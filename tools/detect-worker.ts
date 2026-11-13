import { detectLists, guessTimezone } from '../src/detect/detect.ts';
import { extractFeed } from '../src/extract/extract.ts';
import type { ItemSpec, Page } from '../src/types.ts';

export interface DetectRequest {
  page: Page;
  timezone?: string;
}

interface DetectedCandidate {
  items: ItemSpec;
  count: number;
  preview: { title: string; url: string; date?: string }[];
}

export interface DetectResponse {
  title?: string;
  language?: string;
  timezone: string;
  candidates: DetectedCandidate[];
}

export default {
  async fetch(request: Request): Promise<Response> {
    const { page, timezone: requested } = await request.json<DetectRequest>();
    const candidates: DetectedCandidate[] = [];
    let title: string | undefined;
    let language: string | undefined;
    let timezone = requested ?? 'UTC';

    for (const list of await detectLists(page.html)) {
      const probe = await extractFeed({ id: 'probe', url: page.url, items: list.items }, page).catch(() => undefined);
      if (!probe) continue;
      title ??= probe.title;
      language ??= probe.language;
      timezone = requested ?? guessTimezone(language);

      const feed = await extractFeed({ id: 'preview', url: page.url, timezone, items: list.items }, page);
      candidates.push({
        items: list.items,
        count: feed.items.length,
        preview: feed.items.map((item) => ({ title: item.title, url: item.url, date: item.date?.toISOString() })),
      });
    }

    return Response.json({ title, language, timezone, candidates } satisfies DetectResponse);
  },
};
