import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMapbox, renderAll } from '../pipeline/renders.js';
import { extractJson, orPost } from '../pipeline/utils.js';

const FAKE_AB = new ArrayBuffer(10);

const HEADINGS = [0, 90, 180, 270];

const MAPBOX_OPTS = {
  lat: 51.05,
  lng: 3.72,
  pitch: -50,
  mapboxToken: 'fake-token',
  onProgress: () => {},
};

// Test 1 — renderMapbox returns 4 results with correct headings
test('renderMapbox returns 4 results with correct headings', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    arrayBuffer: async () => FAKE_AB,
  }));

  const results = await renderMapbox(MAPBOX_OPTS);

  assert.equal(results.length, 4);
  assert.deepEqual(results.map((r) => r.heading), [0, 90, 180, 270]);
  results.forEach((r) => assert.ok(r.image.length > 0));
});

// Test 2 — renderAll uses the Google render function
test('renderAll uses Google render function', async () => {
  let called = false;
  const fakeGoogle = async () => {
    called = true;
    return HEADINGS.map((heading) => ({ heading, image: 'fake' }));
  };

  const results = await renderAll({ ...MAPBOX_OPTS, _googleRender: fakeGoogle });

  assert.ok(called, 'Google render function should be called');
  assert.equal(results.length, 4);
});

// Test 3 — renderAll propagates error when Google throws (no silent fallback)
test('renderAll propagates error when Google throws', async () => {
  await assert.rejects(
    () => renderAll({
      ...MAPBOX_OPTS,
      _googleRender: async () => { throw new Error('Puppeteer failed'); },
    }),
    /Puppeteer failed/,
  );
});

// Test 4 — extractJson parses clean JSON
test('extractJson parses clean JSON', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

// Test 5 — extractJson extracts JSON from markdown-wrapped response
test('extractJson extracts JSON from markdown-wrapped response', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
});

// Test 6 — orPost throws when response has no choices
test('orPost throws when response has no choices', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => ({ error: 'model not found' }),
  }));

  await assert.rejects(
    () => orPost('https://example.com', 'fake-key', {}),
    /no choices/,
  );
});
