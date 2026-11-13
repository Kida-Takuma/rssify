const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  shy: '­',
  copy: '©',
  reg: '®',
  trade: '™',
  yen: '¥',
  euro: '€',
  pound: '£',
  cent: '¢',
  sect: '§',
  para: '¶',
  middot: '·',
  bull: '•',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  lsaquo: '‹',
  rsaquo: '›',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  micro: 'µ',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  hearts: '♥',
  star: '☆',
};

const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));?/g;

export function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(ENTITY, (match, decimal?: string, hex?: string, name?: string) => {
    if (name) return Object.hasOwn(NAMED, name) ? NAMED[name]! : match;
    const codePoint = decimal ? Number.parseInt(decimal, 10) : Number.parseInt(hex!, 16);
    return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : '�';
  });
}

function isValidCodePoint(codePoint: number): boolean {
  return codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
}
