import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../server.js';

let server;
let base;
let dir;
const id = '11111111-2222-3333-4444-555555555555';

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'learn-'));
  server = createApp(dir).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const put = (deck, path = id) =>
  fetch(`${base}/api/decks/${path}`, { method: 'PUT', body: JSON.stringify(deck) });

test('serves the app and health check', async () => {
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Learn<\/title>/);
});

test('blocks path traversal', async () => {
  const r = await fetch(`${base}/..%2fserver.js`);
  assert.equal(r.status, 404);
});

test('stores, lists and survives a new server on the same directory', async () => {
  const deck = { id, name: 'Food', cards: [], updated: 10 };
  assert.equal((await put(deck)).status, 200);
  const again = createApp(dir).listen(0);
  await new Promise((r) => again.once('listening', r));
  const list = await (await fetch(`http://127.0.0.1:${again.address().port}/api/decks`)).json();
  again.close();
  assert.deepEqual(list.decks.map((d) => d.name), ['Food']);
});

test('older writes are rejected with the stored deck', async () => {
  const r = await put({ id, name: 'Stale', cards: [], updated: 5 });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).name, 'Food');
});

test('rejects mismatched ids, bad json and bad paths', async () => {
  assert.equal((await put({ id: 'other', updated: 1 })).status, 400);
  assert.equal((await fetch(`${base}/api/decks/${id}`, { method: 'PUT', body: '{' })).status, 400);
  assert.equal((await fetch(`${base}/api/decks/..%2f..%2fetc`)).status, 404);
});

test('delete leaves a tombstone and no temp files', async () => {
  const r = await fetch(`${base}/api/decks/${id}`, { method: 'DELETE' });
  assert.equal((await r.json()).deleted, true);
  const list = await (await fetch(`${base}/api/decks`)).json();
  assert.equal(list.decks[0].deleted, true);
  assert.deepEqual((await readdir(join(dir, 'decks'))).filter((n) => n.endsWith('.tmp')), []);
});
