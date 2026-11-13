import { DefinitionError } from './errors.ts';
import { FEED_FORMATS, type FeedDefinition, type FeedFormat } from './types.ts';

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function defineFeed(definition: FeedDefinition): FeedDefinition {
  validateDefinition(definition);
  return definition;
}

export function validateDefinitions(definitions: readonly FeedDefinition[]): void {
  const ids = new Set<string>();
  for (const definition of definitions) {
    validateDefinition(definition);
    if (ids.has(definition.id)) fail(definition, 'is defined more than once');
    ids.add(definition.id);
  }
}

export function validateDefinition(definition: FeedDefinition): void {
  if (!ID_PATTERN.test(definition.id)) {
    throw new DefinitionError(`Invalid feed id "${definition.id}": use lowercase letters, digits and hyphens`);
  }
  if (!isHttpUrl(definition.url)) fail(definition, 'needs an http or https url');
  if (!definition.items?.selector) fail(definition, 'needs items.selector');
  if (definition.limit !== undefined && !(Number.isInteger(definition.limit) && definition.limit > 0)) {
    fail(definition, 'has an invalid limit');
  }
  if (definition.ttl !== undefined && !(Number.isFinite(definition.ttl) && definition.ttl >= 0)) {
    fail(definition, 'has an invalid ttl');
  }
  if (definition.timezone && !isTimeZone(definition.timezone)) {
    fail(definition, `has an unknown timezone "${definition.timezone}"`);
  }
  if (definition.formats) validateFormats(definition.formats, `Feed "${definition.id}"`);
}

export function validateFormats(formats: readonly string[], owner: string): asserts formats is readonly FeedFormat[] {
  if (formats.length === 0) throw new DefinitionError(`${owner} enables no formats`);
  const unknown = formats.filter((format) => !(FEED_FORMATS as readonly string[]).includes(format));
  if (unknown.length > 0) {
    throw new DefinitionError(`${owner} has unknown formats: ${unknown.join(', ')}`);
  }
}

function fail(definition: FeedDefinition, reason: string): never {
  throw new DefinitionError(`Feed "${definition.id}" ${reason}`);
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
