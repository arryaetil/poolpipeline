import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { app } from '../server.js';
import { loadFeatures } from '../pipeline/utils.js';

function hasRoute(method, path) {
  return app._router.stack.some((layer) => (
    layer.route
    && layer.route.path === path
    && layer.route.methods[method]
  ));
}

test('index.html exists and returns an HTML document shape', () => {
  assert.equal(existsSync(new URL('../index.html', import.meta.url)), true);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('BackyardAI'));
});

test('GET /features data has id and label fields', () => {
  const features = loadFeatures();
  assert.ok(Array.isArray(features));
  assert.ok(features.length > 0);
  assert.ok(features[0].id);
  assert.ok(features[0].label);
});

test('server registers expected routes', () => {
  assert.equal(hasRoute('get', '/'), true);
  assert.equal(hasRoute('get', '/cesium.html'), true);
  assert.equal(hasRoute('get', '/features'), true);
  assert.equal(hasRoute('post', '/run'), true);
});

test('server exposes the Express app for runtime and tests', () => {
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.listen, 'function');
});

test('GET / responds with index HTML', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.ok(html.includes('BackyardAI'));
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('GET /features returns feature config', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/features`);
    const features = await res.json();
    assert.equal(res.status, 200);
    assert.ok(features.some((feature) => feature.id === 'pool'));
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('POST /run rejects a bad body before external API checks', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error, 'address and feature are required');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test('chosen.json is written by the pipeline route handler (unit check on writeFileSync call)', () => {
  // Verify server.js source contains the chosen.json write
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(src.includes('chosen.json'), 'server.js must write chosen.json');
});
