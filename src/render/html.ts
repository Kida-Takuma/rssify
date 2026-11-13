import type { Feed, FeedItem } from '../types.ts';
import { dateFormatter, GENERATOR } from './shared.ts';
import { escapeXml } from './xml.ts';

export interface FeedLink {
  label: string;
  url: string;
}

export interface EmbedSnippet {
  code: string;
  origins: string;
}

export interface IndexEntry {
  title: string;
  sourceUrl: string;
  previewUrl: string;
  links: readonly FeedLink[];
}

export const STYLE = `
:root{color-scheme:light dark;--bg:#f7f7f5;--surface:#fff;--text:#1d1d1b;--muted:#6b6b66;--border:#e4e4df;--accent:#d9480f;--chip:#fff4ec}
@media (prefers-color-scheme:dark){:root{--bg:#121211;--surface:#1b1b19;--text:#ededea;--muted:#9c9c96;--border:#2c2c29;--accent:#ff8a4c;--chip:#2a1d15}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:760px;margin:0 auto;padding:56px 20px 72px}
a{color:inherit}
.eyebrow{margin:0 0 8px;font-size:.78rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
h1{margin:0;font-size:clamp(1.5rem,4vw,2rem);line-height:1.3}
.lead{margin:8px 0 0;color:var(--muted)}
.lead a{color:var(--muted)}
.card{margin-top:28px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:14px}
.card h2{margin:0 0 4px;font-size:.95rem}
.card p{margin:0 0 14px;font-size:.88rem;color:var(--muted)}
.links{display:grid;gap:4px;margin:0 -8px;padding:0;list-style:none}
.links li{display:flex;align-items:center;gap:10px;min-width:0;padding:6px 8px;border-radius:10px}
.links li:hover{background:var(--bg)}
.url{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);text-decoration:none}
.url:hover,.url:focus-visible{color:var(--accent);text-decoration:underline}
.copy{flex:none;padding:3px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--muted);font:600 .78rem/1.5 inherit;cursor:pointer}
.copy:hover,.copy:focus-visible{border-color:var(--accent);color:var(--accent)}
.copy[data-copied]{border-color:var(--accent);background:var(--chip);color:var(--accent)}
.chip{flex:none;min-width:86px;padding:3px 10px;border-radius:999px;background:var(--chip);color:var(--accent);font-size:.8rem;font-weight:600;text-align:center;text-decoration:none}
code{font:.85rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.items{margin:32px 0 0;padding:0;list-style:none;border-top:1px solid var(--border)}
.items li{padding:18px 2px;border-bottom:1px solid var(--border)}
.items time{display:block;font-size:.82rem;color:var(--muted)}
.items a{font-weight:600;text-decoration:none}
.items a:hover{color:var(--accent);text-decoration:underline}
.items p{margin:4px 0 0;font-size:.92rem;color:var(--muted)}
.snippet{display:block;margin:0;padding:12px 14px;overflow-x:auto;background:var(--bg);border:1px solid var(--border);border-radius:10px;color:var(--muted);white-space:pre-wrap;word-break:break-all}
.snippet-row{display:flex;align-items:flex-start;gap:10px}
.snippet-row .snippet{flex:1;min-width:0}
.feeds{margin:32px 0 0;padding:0;list-style:none;display:grid;gap:16px}
.feeds .card{margin:0}
.feeds h2{font-size:1.05rem}
.feeds h2 a{text-decoration:none}
footer{margin-top:40px;font-size:.8rem;color:var(--muted)}
`;

const NEW_WINDOW = 'target="_blank" rel="noopener noreferrer"';

export const SCRIPT = `
for (const button of document.querySelectorAll('[data-copy]')) {
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
      button.dataset.copied = '';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(button.previousElementSibling);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      button.textContent = 'Selected';
    }
    setTimeout(() => {
      button.textContent = 'Copy';
      delete button.dataset.copied;
    }, 1600);
  });
}
`;

export function renderFeedPage(feed: Feed, links: readonly FeedLink[], embed?: EmbedSnippet): string {
  const dates = dateFormatter(feed);
  const items = feed.items.map((item) => itemHtml(item, dates)).join('');
  return layout(
    feed.title,
    feed.language,
    `<p class="eyebrow">Feed preview</p>
<h1>${escapeXml(feed.title)}</h1>
<p class="lead">${feed.description ? `${escapeXml(feed.description)} · ` : ''}Source: <a href="${escapeXml(feed.homePageUrl)}" rel="noopener noreferrer">${escapeXml(new URL(feed.homePageUrl).host)}</a></p>
${subscribeCard(links)}
${embed ? embedCard(embed) : ''}
<ul class="items">${items}</ul>
<footer>${feed.items.length} items · updated ${escapeXml(dates.format(feed.fetchedAt))} · ${GENERATOR}</footer>`,
  );
}

export function renderIndexPage(title: string, entries: readonly IndexEntry[]): string {
  const cards = entries
    .map(
      (entry) => `<li class="card">
<h2><a href="${escapeXml(entry.previewUrl)}">${escapeXml(entry.title)}</a></h2>
<p>${escapeXml(new URL(entry.sourceUrl).host)}</p>
${linkList(entry.links)}
</li>`,
    )
    .join('');
  return layout(
    title,
    undefined,
    `<p class="eyebrow">Feeds</p>
<h1>${escapeXml(title)}</h1>
<p class="lead">${entries.length} feeds</p>
<ul class="feeds">${cards}</ul>
<footer>${GENERATOR}</footer>`,
  );
}

function layout(title: string, language: string | undefined, body: string): string {
  return `<!doctype html>
<html lang="${escapeXml(language ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeXml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

function subscribeCard(links: readonly FeedLink[]): string {
  return `<section class="card">
<h2>Subscribe</h2>
<p>Copy a URL into your feed reader.</p>
${linkList(links)}
</section>`;
}

function embedCard({ code, origins }: EmbedSnippet): string {
  return (
    `<section class="card">
<h2>Embed</h2>
<p>Paste this into a page on ${escapeXml(origins)}.</p>
<div class="snippet-row"><pre class="snippet"><code>${escapeXml(code)}</code></pre>` +
    `<button class="copy" type="button" data-copy="${escapeXml(code)}" aria-live="polite" hidden>Copy</button></div>
</section>`
  );
}

function linkList(links: readonly FeedLink[]): string {
  const rows = links
    .map(
      (link) =>
        `<li><a class="chip" href="${escapeXml(link.url)}" ${NEW_WINDOW}>${escapeXml(link.label)}</a>` +
        `<a class="url" href="${escapeXml(link.url)}" ${NEW_WINDOW}><code>${escapeXml(link.url)}</code></a>` +
        `<button class="copy" type="button" data-copy="${escapeXml(link.url)}" aria-live="polite" hidden>Copy</button></li>`,
    )
    .join('');
  return `<ul class="links">${rows}</ul>`;
}

function itemHtml(item: FeedItem, dates: Intl.DateTimeFormat): string {
  const time = item.date
    ? `<time datetime="${item.date.toISOString()}">${escapeXml(dates.format(item.date))}</time>`
    : '';
  const summary = item.summary ? `<p>${escapeXml(item.summary)}</p>` : '';
  return `<li>${time}<a href="${escapeXml(item.url)}" rel="noopener noreferrer">${escapeXml(item.title)}</a>${summary}</li>`;
}
