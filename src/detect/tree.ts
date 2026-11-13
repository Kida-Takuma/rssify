export interface TreeNode {
  tag: string;
  id?: string;
  classes: string[];
  href?: string;
  datetime?: string;
  text: string;
  hidden: boolean;
  parent?: TreeNode;
  children: TreeNode[];
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const HIDDEN_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg']);

export async function buildTree(html: string): Promise<TreeNode> {
  const root: TreeNode = { tag: '#document', classes: [], text: '', hidden: false, children: [] };
  const stack: TreeNode[] = [root];
  const top = () => stack[stack.length - 1]!;

  await new HTMLRewriter()
    .on('*', {
      element(element) {
        const parent = top();
        const tag = element.tagName.toLowerCase();
        const node: TreeNode = {
          tag,
          id: element.getAttribute('id') ?? undefined,
          classes: (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean),
          href: element.getAttribute('href') ?? undefined,
          datetime: element.getAttribute('datetime') ?? undefined,
          text: '',
          hidden: parent.hidden || HIDDEN_TAGS.has(tag),
          parent,
          children: [],
        };
        parent.children.push(node);
        if (VOID_TAGS.has(tag)) return;

        stack.push(node);
        try {
          element.onEndTag(() => {
            const index = stack.lastIndexOf(node);
            if (index > 0) stack.length = index;
          });
        } catch {
          stack.pop();
        }
      },
    })
    .onDocument({
      text(chunk) {
        const node = top();
        if (!node.hidden) node.text += chunk.text;
      },
    })
    .transform(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
    .arrayBuffer();

  return root;
}

export function* descendants(node: TreeNode): Generator<TreeNode> {
  for (const child of node.children) {
    yield child;
    yield* descendants(child);
  }
}

export function textOf(node: TreeNode): string {
  if (node.hidden) return '';
  return (node.text + node.children.map(textOf).join(' ')).replace(/\s+/g, ' ').trim();
}

export function ancestors(node: TreeNode): TreeNode[] {
  const result: TreeNode[] = [];
  for (let current = node.parent; current; current = current.parent) result.push(current);
  return result;
}
