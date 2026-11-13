import type { FieldSelector, ItemSpec } from '../types.ts';
import { ancestors, buildTree, descendants, type TreeNode, textOf } from './tree.ts';

export interface DetectedList {
  items: ItemSpec;
  count: number;
  score: number;
}

const MIN_ITEMS = 3;
const MAX_SELECTOR_DEPTH = 6;
const IDENT = /^-?[A-Za-z_][\w-]*$/;
const DATE_TEXT = /\d{4}\s*[./\-年]\s*\d{1,2}\s*[./\-月]\s*\d{1,2}/;
const NOISE_TAGS = new Set(['nav', 'header', 'footer', 'aside', 'form', 'select']);
const NOISE_NAMES =
  /(^|[-_])(g?nav|navi|navigation|menu|breadcrumbs?|footer|header|pager|pagination|sidebar|share|sns|lang|language)($|[-_])/i;

export async function detectLists(html: string, limit = 3): Promise<DetectedList[]> {
  const root = await buildTree(html);
  const found = new Map<string, DetectedList>();

  for (const parent of descendants(root)) {
    if (parent.hidden) continue;
    for (const group of groupChildren(parent)) {
      const list = evaluate(root, parent, group);
      const existing = list && found.get(list.items.selector);
      if (list && (!existing || existing.score < list.score)) found.set(list.items.selector, list);
    }
  }

  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export function guessTimezone(language: string | undefined): string {
  return language?.toLowerCase().startsWith('ja') ? 'Asia/Tokyo' : 'UTC';
}

function groupChildren(parent: TreeNode): TreeNode[][] {
  const groups = new Map<string, TreeNode[]>();
  for (const child of parent.children) {
    if (child.hidden) continue;
    const key = `${child.tag}.${identClasses(child)[0] ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), child]);
  }
  return [...groups.values()].filter((group) => group.length >= MIN_ITEMS);
}

function evaluate(root: TreeNode, parent: TreeNode, group: TreeNode[]): DetectedList | undefined {
  const linked = group.filter((node) => linkOf(node));
  const linkRatio = linked.length / group.length;
  if (linkRatio < 0.6) return undefined;

  const averageLength = linked.reduce((sum, node) => sum + textOf(node).length, 0) / linked.length;
  if (averageLength < 8) return undefined;

  const selector = itemSelector(root, parent, group);
  if (!selector) return undefined;

  const dateRatio = group.filter(hasDate).length / group.length;
  const noisy = [parent, ...ancestors(parent)].some(isNoise);
  const score =
    Math.min(group.length, 30) *
    linkRatio *
    (1 + 2 * dateRatio) *
    (Math.min(averageLength, 60) / 60) *
    (noisy ? 0.2 : 1);

  return { items: { selector, ...fieldsOf(linked) }, count: group.length, score };
}

function fieldsOf(items: TreeNode[]): Pick<ItemSpec, 'title' | 'date'> {
  const date = dateField(items);
  return { title: titleField(items), ...(date && { date }) };
}

function titleField(items: TreeNode[]): FieldSelector {
  const titled = mostCommon(items, (item) =>
    [...descendants(item)]
      .filter(
        (node) => /^h[1-6]$/.test(node.tag) || identClasses(node).some((name) => /title|heading|subject/i.test(name)),
      )
      .filter((node) => textOf(node).length > 0)
      .map(segment),
  );
  if (titled) return titled;
  return items.every((item) => item.tag === 'a') ? {} : 'a';
}

function dateField(items: TreeNode[]): FieldSelector | undefined {
  const attributed = mostCommon(items, (item) =>
    [...descendants(item)].filter((node) => node.datetime).map((node) => node.tag),
  );
  if (attributed) return { selector: attributed, attr: 'datetime' };

  const textual = mostCommon(items, (item) =>
    [...descendants(item)]
      .filter((node) => DATE_TEXT.test(textOf(node)) && !node.children.some((child) => DATE_TEXT.test(textOf(child))))
      .map(segment),
  );
  if (textual) return textual;
  return items.filter((item) => DATE_TEXT.test(textOf(item))).length / items.length >= 0.6 ? {} : undefined;
}

function mostCommon(items: TreeNode[], candidates: (item: TreeNode) => string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const candidate of new Set(candidates(item))) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return best && best[1] / items.length >= 0.6 ? best[0] : undefined;
}

function itemSelector(root: TreeNode, parent: TreeNode, group: TreeNode[]): string | undefined {
  const shared = identClasses(group[0]!).filter((name) => group.every((node) => node.classes.includes(name)));
  const item = group[0]!.tag + shared.map((name) => `.${name}`).join('');
  const path: string[] = [];

  for (let node: TreeNode | undefined = parent; node?.parent && path.length < MAX_SELECTOR_DEPTH; node = node.parent) {
    const id = node.id && IDENT.test(node.id) ? `#${node.id}` : undefined;
    path.unshift(id ?? segment(node));
    const selector = [...path, item].join(' > ');
    if (countMatches(root, selector) === group.length) return selector;
    if (id) break;
  }
  return undefined;
}

function countMatches(root: TreeNode, selector: string): number {
  const parts = selector.split(' > ').map(parseSegment);
  let count = 0;
  for (const node of descendants(root)) if (matchesChain(node, parts, parts.length - 1)) count++;
  return count;
}

interface Segment {
  tag?: string;
  id?: string;
  classes: string[];
}

function parseSegment(text: string): Segment {
  if (text.startsWith('#')) return { id: text.slice(1), classes: [] };
  const [tag, ...classes] = text.split('.');
  return { tag, classes };
}

function matchesChain(node: TreeNode | undefined, parts: Segment[], index: number): boolean {
  const part = parts[index];
  if (!node || !part) return false;
  const matches =
    (!part.tag || node.tag === part.tag) &&
    (!part.id || node.id === part.id) &&
    part.classes.every((name) => node.classes.includes(name));
  return matches && (index === 0 || matchesChain(node.parent, parts, index - 1));
}

function segment(node: TreeNode): string {
  return (
    node.tag +
    identClasses(node)
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join('')
  );
}

function identClasses(node: TreeNode): string[] {
  return node.classes.filter((name) => IDENT.test(name));
}

function linkOf(node: TreeNode): string | undefined {
  if (node.tag === 'a' && node.href) return node.href;
  for (const child of descendants(node)) if (child.tag === 'a' && child.href) return child.href;
  return undefined;
}

function hasDate(node: TreeNode): boolean {
  return [...descendants(node)].some((child) => child.datetime) || DATE_TEXT.test(textOf(node));
}

function isNoise(node: TreeNode): boolean {
  return NOISE_TAGS.has(node.tag) || [node.id ?? '', ...node.classes].some((name) => NOISE_NAMES.test(name));
}
