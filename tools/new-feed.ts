import { access, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { unstable_startWorker } from 'wrangler';
import { fetchPage } from '../src/source/fetch.ts';
import type { FieldSelector, ItemSpec } from '../src/types.ts';
import type { DetectRequest, DetectResponse } from './detect-worker.ts';

const ROOT = join(import.meta.dirname, '..');
const FEEDS_DIR = join(ROOT, 'feeds');
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const USAGE = `Usage: pnpm new <url> [options]

Options:
  --id <id>             Feed id used in the URL (default: derived from the url)
  --title <title>       Feed title (default: the page title)
  --timezone <zone>     Time zone for dates (default: guessed from the page language)
  --candidate <n>       Use the n-th detected list instead of the best one
  --dry-run             Show the result without writing files
  --force               Overwrite an existing feed file`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    title: { type: 'string' },
    timezone: { type: 'string' },
    candidate: { type: 'string', default: '1' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const [url] = positionals;
if (values.help || !url) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

try {
  await main(url);
} catch (error) {
  console.error(`\n${(error as Error).message}`);
  process.exit(1);
}

async function main(url: string): Promise<void> {
  const id = values.id ?? idFromUrl(url);
  if (!ID_PATTERN.test(id)) throw new Error(`Invalid id "${id}". Use lowercase letters, digits and hyphens.`);

  console.log(`Fetching ${url}`);
  const page = await fetchPage({ id, url, items: { selector: '*', title: '*' } });

  console.log('Looking for lists of articles');
  const result = await detect({ page, timezone: values.timezone });
  if (result.candidates.length === 0) {
    throw new Error('No list of articles was found. The page may build its content with JavaScript.');
  }

  printCandidates(result);
  const index = Number(values.candidate) - 1;
  const chosen = result.candidates[index];
  if (!chosen) throw new Error(`There is no candidate ${values.candidate}.`);

  const title = values.title ?? result.title ?? id;
  const source = feedSource({
    id,
    url,
    title,
    language: result.language,
    timezone: result.timezone,
    items: chosen.items,
  });
  const file = join(FEEDS_DIR, `${id}.ts`);

  if (values['dry-run']) {
    console.log(`\n${basename(file)} (not written)\n\n${source}`);
    return;
  }
  if (!values.force && (await exists(file))) {
    throw new Error(`feeds/${id}.ts already exists. Use --force to overwrite it or --id to pick another id.`);
  }

  await writeFile(file, source);
  await writeIndex();
  console.log(`\nCreated feeds/${id}.ts and updated feeds/index.ts`);
  console.log(`Run "pnpm dev" and open http://localhost:8790/${id} to check it.`);
}

async function detect(body: DetectRequest): Promise<DetectResponse> {
  const worker = await unstable_startWorker({
    entrypoint: join(import.meta.dirname, 'detect-worker.ts'),
    compatibilityDate: '2026-11-01',
    dev: { server: { port: 0 }, inspector: false, watch: false },
  });
  try {
    await worker.ready;
    const response = await worker.fetch('http://detect.local/', { method: 'POST', body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Detection failed: ${await response.text()}`);
    return (await response.json()) as DetectResponse;
  } finally {
    await worker.dispose();
  }
}

function printCandidates({ candidates }: DetectResponse): void {
  candidates.forEach((candidate, index) => {
    const chosen = index === Number(values.candidate) - 1;
    console.log(`\n${chosen ? '>' : ' '} [${index + 1}] ${candidate.items.selector} (${candidate.count} items)`);
    for (const item of candidate.preview.slice(0, chosen ? 5 : 2)) {
      console.log(`      ${item.date?.slice(0, 10) ?? '          '}  ${item.title}`);
    }
  });
}

function idFromUrl(url: string): string {
  const { hostname, pathname } = new URL(url);
  return `${hostname.replace(/^www\./, '')}${pathname}`
    .toLowerCase()
    .replace(/\.(html?|php|aspx?)$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

function feedSource(definition: {
  id: string;
  url: string;
  title: string;
  language?: string;
  timezone: string;
  items: ItemSpec;
}): string {
  const lines = [
    `  id: ${quote(definition.id)},`,
    `  title: ${quote(definition.title)},`,
    `  url: ${quote(definition.url)},`,
    ...(definition.language ? [`  language: ${quote(definition.language)},`] : []),
    `  timezone: ${quote(definition.timezone)},`,
    '  items: {',
    ...Object.entries(definition.items).map(([key, value]) => `    ${key}: ${literal(value as FieldSelector)},`),
    '  },',
  ];
  return `import { defineFeed } from '../src/index.ts';\n\nexport default defineFeed({\n${lines.join('\n')}\n});\n`;
}

async function writeIndex(): Promise<void> {
  const files = (await readdir(FEEDS_DIR)).filter((file) => file.endsWith('.ts') && file !== 'index.ts').sort();
  const names = files.map((file) => identifier(basename(file, '.ts')));
  const imports = files.map((file, index) => `import ${names[index]} from './${file}';`);
  const source = [
    "import type { FeedDefinition } from '../src/index.ts';",
    ...imports,
    '',
    `const feeds: FeedDefinition[] = [${names.join(', ')}];`,
    '',
    'export default feeds;',
    '',
  ].join('\n');
  await writeFile(join(FEEDS_DIR, 'index.ts'), source);
}

function identifier(id: string): string {
  const name = id.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
  return /^[a-z]/.test(name) ? name : `feed${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

function literal(value: FieldSelector): string {
  if (typeof value === 'string') return quote(value);
  const entries = Object.entries(value).map(([key, field]) => `${key}: ${quote(field as string)}`);
  return entries.length ? `{ ${entries.join(', ')} }` : '{}';
}

function quote(value: string): string {
  return `'${JSON.stringify(value).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'")}'`;
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}
