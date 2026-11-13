# rssify

Generate RSS, Atom and JSON Feed for websites that don't publish one. Runs on Cloudflare Workers with zero runtime dependencies.

- Parses pages with the built-in `HTMLRewriter`
- Fetches only the URLs you define; requests can't make it fetch anything else
- Handles Shift_JIS / EUC-JP pages, `2026.10.20` / `2026年10月20日` style dates and time zones
- Optional preview pages and iframe embeds, restricted to the origins you allow
- Feeds are created with a local command; the deployed Worker has no way to add them

## Quick start

Requires Node.js 24+ and pnpm.

```bash
pnpm install
pnpm new https://www.ndl.go.jp/news   # detect the article list and create feeds/ndl-go-jp-news.ts
pnpm dev                              # open http://localhost:8790
pnpm run deploy                       # requires `wrangler login`
```

`pnpm dev` runs the Worker locally with every format, OPML and embedding turned on. Deployed Workers use only the settings in `wrangler.jsonc`.

`pnpm new` prints the lists it found, best first, and writes the top one.

| Option              | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `--id <id>`         | Feed id (default: derived from the URL)                       |
| `--title <title>`   | Feed title (default: the page title)                          |
| `--timezone <zone>` | Time zone for dates (default: guessed from the page language) |
| `--candidate <n>`   | Use the n-th list instead of the best one                     |
| `--dry-run`         | Print the definition without writing files                    |
| `--force`           | Overwrite an existing feed                                    |

Pages that render their content with JavaScript can't be detected.

## Endpoints

| Path          | Content                           | Default |
| ------------- | --------------------------------- | ------- |
| `/`           | Feed index page                   | on      |
| `/<id>`       | Feed preview page                 | on      |
| `/<id>.rss`   | RSS 2.0 (`.xml` also works)       | on      |
| `/<id>.atom`  | Atom 1.0                          | off     |
| `/<id>.json`  | JSON Feed 1.1                     | off     |
| `/<id>/embed` | List for embedding with an iframe | off     |
| `/feeds.opml` | OPML of all feeds                 | off     |

## Defining a feed

`pnpm new` writes files like this into `feeds/` and registers them in `feeds/index.ts`. You can also write them by hand.

```ts
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
});
```

| Field                                              | Description                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`                                               | Lowercase letters, digits and hyphens                                  |
| `url`                                              | Page to read                                                           |
| `title`, `description`, `language`                 | Defaults to the page's `<title>` and `<html lang>`                     |
| `timezone`                                         | Time zone for dates without an offset (default `UTC`)                  |
| `encoding`                                         | Force a charset; otherwise detected from headers and `<meta>`          |
| `headers`                                          | Extra request headers                                                  |
| `items.selector`                                   | Selects one element per item                                           |
| `items.title`, `link`, `date`, `summary`, `author` | Selectors inside the item                                              |
| `items.dateFormat`                                 | Tokens `yyyy MM M dd d HH H mm ss`; common formats are read without it |
| `formats`                                          | Formats for this feed, overriding the global setting                   |
| `limit`                                            | Maximum items (default 50)                                             |
| `ttl`                                              | Cache lifetime in seconds (default 1800)                               |
| `transform`                                        | Edit or drop (`null`) each item                                        |

A field selector is either `'a'` (text of the first match) or `{ selector: 'a', attr: 'href' }` (an attribute; omit `selector` for the item itself). `link` defaults to the first `<a href>` in the item. Selectors follow [`HTMLRewriter` support](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/#selectors); sibling combinators are not available.

## Configuration

Pass options to `createWorker()` in `worker.ts`, or set `vars` in `wrangler.jsonc`. Options in code take precedence.

| Option                   | Variable          | Description                                                    | Default        |
| ------------------------ | ----------------- | -------------------------------------------------------------- | -------------- |
| `formats`                | `FORMATS`         | `rss`, `atom`, `json` (comma-separated)                        | `rss`          |
| `opml`                   | `OPML`            | Enable `/feeds.opml`                                           | `false`        |
| `preview`                | `PREVIEW`         | Enable `/` and `/<id>`                                         | `true`         |
| `embed`                  | `EMBED`           | Enable `/<id>/embed` (requires `allowedOrigins`)               | `false`        |
| `allowedOrigins`         | `ALLOWED_ORIGINS` | Origins allowed to embed and fetch from browsers, or `*`       | none           |
| `baseUrl`                | `BASE_URL`        | Public URL used in feed links                                  | request origin |
| `title`                  |                   | Title of the index and OPML                                    | `Feeds`        |
| `defaultTtl`, `staleTtl` |                   | Cache lifetime / how long a stale copy may be served on errors | 1800 / 86400   |
| `retryAfter`             |                   | Seconds to wait before retrying a source that failed           | 300            |

```jsonc
"vars": { "FORMATS": "rss,json", "EMBED": "true", "ALLOWED_ORIGINS": "https://example.com" }
```

### Cache

The Cache API is a no-op on `*.workers.dev`, so use Workers KV to keep feeds between instances. Without it, each instance caches in memory.

```bash
pnpm wrangler kv namespace create FEED_CACHE
```

```jsonc
"kv_namespaces": [{ "binding": "FEED_CACHE", "id": "<namespace id>" }]
```

### Embedding

With `embed` on, the preview page shows a snippet like this:

```html
<iframe src="https://<worker>/ndl-news/embed" title="国立国会図書館 おしらせ" loading="lazy"
  sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"
  style="width:100%;height:420px;border:0"></iframe>
```

`?limit=1-50` and `?theme=light|dark` adjust the list. If the host page has a CSP, add the Worker to its `frame-src`.

## Security

- Only defined URLs are fetched. Redirects to another host or port, or from https to http, are refused. Fetches stop after 10 s or 2 MB.
- A source that fails is not fetched again for `retryAfter` seconds; the last good copy is served meanwhile.
- Links other than `http(s)` are replaced, `<script>`/`<style>` content is dropped, and all output is escaped.
- Feeds use `default-src 'none'`. HTML pages allow only their own hashed style and script.
- Only the embed page can be framed, and only by `allowedOrigins` (`frame-ancestors`). It runs no script.
- Everything else sends `frame-ancestors 'none'`, `X-Frame-Options: DENY` and `Cross-Origin-Resource-Policy: same-origin`.
- `allowedOrigins` accepts https origins only. `localhost`, `127.0.0.1` and `[::1]` may use http, but take effect only while the Worker itself runs locally; a deployed Worker ignores them.
- Only `GET`, `HEAD` and `OPTIONS` are accepted.
- `tools/` runs on Node.js only and is not part of the deployed Worker.

`allowedOrigins` relies on browser enforcement (CSP and CORS). Feed readers fetching from a server are not restricted, since feeds are meant to be public.

Requests are identified by the `rssify` user agent. Check the terms of use and `robots.txt` of the sites you read. To limit traffic to the Worker itself, add a [rate limiting rule](https://developers.cloudflare.com/waf/rate-limiting-rules/) in Cloudflare. See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Development

```bash
pnpm test        # runs in workerd against saved pages
pnpm test:live   # reads the real sites and compares with an official RSS feed
pnpm typecheck
pnpm lint        # Biome and knip (unused files, exports and dependencies)
pnpm format
```

CI runs lint, typecheck, tests and a deploy dry run on every push and pull request.

Test fixtures are public-sector pages published under the Public Data License 1.0 (CC BY 4.0 compatible). See [test/fixtures/SOURCES.md](test/fixtures/SOURCES.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Takuma Kida
