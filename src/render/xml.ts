export interface XmlElement {
  name: string;
  attributes: Record<string, string | undefined>;
  children: XmlChild[];
}

export type XmlChild = XmlElement | string | undefined;

const INDENT = '  ';
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|\p{Cs}/gu;
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

export function el(name: string, attributes: XmlElement['attributes'] = {}, ...children: XmlChild[]): XmlElement {
  return { name, attributes, children };
}

export function textEl(name: string, value: string | undefined, attributes: XmlElement['attributes'] = {}): XmlChild {
  return value ? el(name, attributes, value) : undefined;
}

export function toXmlDocument(root: XmlElement): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialize(root, 0)}\n`;
}

export function escapeXml(value: string): string {
  return value.replace(INVALID_XML_CHARS, '').replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

function serialize(node: XmlElement, depth: number): string {
  const indent = INDENT.repeat(depth);
  const attributes = Object.entries(node.attributes)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');
  const children = node.children.filter((child): child is XmlElement | string => Boolean(child));

  if (children.length === 0) return `${indent}<${node.name}${attributes}/>`;
  if (children.every((child) => typeof child === 'string')) {
    return `${indent}<${node.name}${attributes}>${escapeXml(children.join(''))}</${node.name}>`;
  }

  const inner = children
    .map((child) =>
      typeof child === 'string' ? INDENT.repeat(depth + 1) + escapeXml(child) : serialize(child, depth + 1),
    )
    .join('\n');
  return `${indent}<${node.name}${attributes}>\n${inner}\n${indent}</${node.name}>`;
}
