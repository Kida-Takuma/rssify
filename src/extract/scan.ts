import { ExtractError } from '../errors.ts';
import type { FieldSelector, ItemSpec } from '../types.ts';

const FIELDS = ['title', 'link', 'date', 'summary', 'author'] as const;
const DEFAULT_LINK = { selector: 'a[href]', attr: 'href' };
const HIDDEN = 'script, style, noscript, template';

type FieldName = (typeof FIELDS)[number];
export type RawItem = Partial<Record<FieldName, string>>;

export interface ScannedDocument {
  title?: string;
  language?: string;
  base?: string;
  items: RawItem[];
}

type Slot = Record<string, string | undefined>;

export async function scanDocument(html: string, spec: ItemSpec): Promise<ScannedDocument> {
  const document: ScannedDocument = { items: [] };
  const head: Slot = {};
  const itemCaptures: Array<() => void> = [];
  let hiddenDepth = 0;
  const isHidden = () => hiddenDepth > 0;

  try {
    let rewriter = new HTMLRewriter()
      .on(HIDDEN, {
        element(element) {
          hiddenDepth++;
          afterEnd(element, () => hiddenDepth--);
        },
      })
      .on('html[lang]', {
        element(element) {
          document.language ??= element.getAttribute('lang') ?? undefined;
        },
      })
      .on('base[href]', {
        element(element) {
          document.base ??= element.getAttribute('href') ?? undefined;
        },
      })
      .on(
        'title',
        capture(() => head, 'title', undefined, isHidden),
      )
      .on(spec.selector, {
        element(element) {
          for (const stop of itemCaptures) stop();
          const item: RawItem = {};
          if (!spec.link && element.tagName === 'a') item.link = element.getAttribute('href') ?? undefined;
          document.items.push(item);
        },
      });

    for (const name of FIELDS) {
      const field: FieldSelector | undefined = name === 'link' ? (spec.link ?? DEFAULT_LINK) : spec[name];
      if (!field) continue;
      const { selector, attr } = typeof field === 'string' ? { selector: field, attr: undefined } : field;
      const handler = capture(() => document.items.at(-1) as Slot | undefined, name, attr, isHidden, itemCaptures);
      rewriter = rewriter.on(selector ? descendant(spec.selector, selector) : spec.selector, handler);
    }

    await rewriter
      .transform(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
      .arrayBuffer();
  } catch (error) {
    throw new ExtractError(`Could not read the page with the given selectors: ${(error as Error).message}`);
  }
  return { ...document, title: head.title };
}

function descendant(parent: string, child: string): string {
  const split = (selector: string) => selector.split(',').map((part) => part.trim());
  return split(parent)
    .flatMap((outer) => split(child).map((inner) => `${outer} ${inner}`))
    .join(', ');
}

function capture(
  slot: () => Slot | undefined,
  key: string,
  attr: string | undefined,
  isHidden: () => boolean,
  stops?: Array<() => void>,
): HTMLRewriterElementContentHandlers {
  let active: Slot | undefined;
  stops?.push(() => (active = undefined));

  return {
    element(element) {
      const target = slot();
      if (!target || active || target[key] !== undefined) return;
      if (attr) {
        target[key] = element.getAttribute(attr) ?? undefined;
        return;
      }
      target[key] = '';
      active = target;
      afterEnd(element, () => (active = undefined));
    },
    text(chunk) {
      if (active && !isHidden()) active[key] += chunk.text;
    },
  };
}

function afterEnd(element: Element, callback: () => void): void {
  try {
    element.onEndTag(callback);
  } catch {
    callback();
  }
}
