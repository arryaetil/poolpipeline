import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, makeSlug } from '../pipeline/utils.js';

test('extractJson: parses clean JSON', () => {
  const result = extractJson('{"foo": "bar"}');
  assert.deepEqual(result, { foo: 'bar' });
});

test('extractJson: extracts JSON embedded in prose', () => {
  const result = extractJson('Here is the result:\n{"front_side": "north"}\nDone.');
  assert.deepEqual(result, { front_side: 'north' });
});

test('extractJson: throws on no JSON', () => {
  assert.throws(() => extractJson('no json here'), /No JSON/);
});

test('makeSlug: lowercases and hyphenates address + feature', () => {
  const result = makeSlug('7756 Caran Ave, Stockton CA 95207, USA', 'pool');
  assert.equal(result, '7756-caran-ave-stockton-ca-95207-usa-pool');
});

test('makeSlug: strips special chars', () => {
  const result = makeSlug("123 O'Brien St., Austin TX", 'deck');
  assert.equal(result, '123-obrien-st-austin-tx-deck');
});
