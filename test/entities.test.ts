import { expect, it } from 'vitest';
import { decodeEntities } from '../src/extract/entities.ts';

it('decodes named and numeric entities', () => {
  expect(decodeEntities('Tom &amp; Jerry &lt;3 &#x3042;&#12354; &mdash;&nbsp;&copy;')).toBe('Tom & Jerry <3 ああ — ©');
});

it('keeps unknown entities and replaces invalid code points', () => {
  expect(decodeEntities('&unknown; &#0; &#xD800;')).toBe('&unknown; � �');
});

it('ignores names inherited from Object.prototype', () => {
  expect(decodeEntities('&constructor; &toString; &__proto__;')).toBe('&constructor; &toString; &__proto__;');
});
