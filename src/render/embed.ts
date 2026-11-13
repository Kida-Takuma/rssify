import type { Feed } from '../types.ts';
import { dateFormatter } from './shared.ts';
import { escapeXml } from './xml.ts';

type EmbedTheme = 'auto' | 'light' | 'dark';

export interface EmbedOptions {
  limit: number;
  theme: EmbedTheme;
}

const LIGHT = '--bg:#fff;--text:#1d1d1b;--muted:#6b6b66;--border:#e4e4df;--accent:#d9480f';
const DARK = '--bg:#1b1b19;--text:#ededea;--muted:#9c9c96;--border:#2c2c29;--accent:#ff8a4c';

export const EMBED_STYLE = `
:root{color-scheme:light dark;${LIGHT}}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}
:root[data-theme=dark]{${DARK}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;-webkit-font-smoothing:antialiased}
header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border)}
h1{margin:0;font-size:.95rem;line-height:1.4}
header a{flex:none;font-size:.78rem;color:var(--muted)}
ul{margin:0;padding:0;list-style:none}
li{padding:10px 16px;border-bottom:1px solid var(--border)}
li:last-child{border-bottom:0}
time{display:block;font-size:.76rem;color:var(--muted)}
a{color:inherit}
li a{font-weight:600;text-decoration:none}
li a:hover,li a:focus-visible{color:var(--accent);text-decoration:underline}
`;

export function parseEmbedOptions(params: URLSearchParams): EmbedOptions {
  const limit = Number.parseInt(params.get('limit') ?? '', 10);
  const theme = params.get('theme');
  return {
    limit: Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 10,
    theme: theme === 'light' || theme === 'dark' ? theme : 'auto',
  };
}

export function renderEmbedPage(feed: Feed, { limit, theme }: EmbedOptions): string {
  const dates = dateFormatter(feed);
  const items = feed.items
    .slice(0, limit)
    .map((item) => {
      const time = item.date
        ? `<time datetime="${item.date.toISOString()}">${escapeXml(dates.format(item.date))}</time>`
        : '';
      return `<li>${time}<a href="${escapeXml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeXml(item.title)}</a></li>`;
    })
    .join('');

  return `<!doctype html>
<html lang="${escapeXml(feed.language ?? 'en')}"${theme === 'auto' ? '' : ` data-theme="${theme}"`}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeXml(feed.title)}</title>
<style>${EMBED_STYLE}</style>
</head>
<body>
<header><h1>${escapeXml(feed.title)}</h1><a href="${escapeXml(feed.homePageUrl)}" target="_blank" rel="noopener noreferrer">${escapeXml(new URL(feed.homePageUrl).host)}</a></header>
<ul>${items}</ul>
</body>
</html>
`;
}
