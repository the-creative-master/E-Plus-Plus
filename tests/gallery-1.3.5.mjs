import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { GalleryStore, createServer, parseStore } = require('../server.js');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'epp-gallery-'));
const filename = path.join(temp, 'shared.js');
let server;
try {
  const store = await new GalleryStore(filename).init();
  server = createServer(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (pathname) => fetch(base + pathname);
  const publish = (project, headers = {}) => fetch(base + '/api/gallery', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(project)
  });
  const valid = n => ({ title: `Project ${n}`, author: 'Test author', description: 'Shared safely', code: `say ${n}`, pictures: {} });
  assert.deepEqual((await (await get('/api/gallery')).json()).projects, []);
  assert.equal((await get('/api/gallery')).headers.get('cache-control'), 'no-store');
  assert.equal((await get('/shared.js')).status, 404, 'server-side store is not served as executable JavaScript');
  assert.equal((await get('/server.js')).status, 404, 'server source is not public');
  assert.equal((await publish(valid(0), { Origin: 'https://different.example' })).status, 403, 'cross-origin posts are rejected');
  assert.equal((await publish({ ...valid(0), title: '' })).status, 400);
  assert.equal((await publish({ ...valid(0), code: 'x'.repeat(128 * 1024 + 1) })).status, 400);
  assert.equal((await publish({ ...valid(0), pictures: { hero: { name: 'hero', data: 'https://example.org/hero.png' } } })).status, 400);
  assert.equal((await fetch(base + '/api/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })).status, 400);
  assert.equal((await fetch(base + '/api/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(2 * 1024 * 1024 + 1) })).status, 413);

  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>').toString('base64');
  const picture = { name: 'hero', data: 'data:image/svg+xml;base64,' + svg, width: 2, height: 2 };
  const special = { title: '<img src=x onerror=alert(1)>', author: 'A', description: 'Text, not HTML', code: 'say "</script>"', pictures: { hero: picture } };
  const requests = Array.from({ length: 32 }, (_, i) => publish(valid(i + 1)));
  requests.push(publish(special));
  const responses = await Promise.all(requests);
  assert(responses.every(response => response.status === 201), 'concurrent valid submissions succeed');
  const ids = await Promise.all(responses.map(async r => (await r.json()).project.id));
  assert.equal(new Set(ids).size, 33);
  const list = (await (await get('/api/gallery')).json()).projects;
  assert.equal(list.length, 33, 'no writes were lost');
  assert(!('code' in list[0]) && !('pictures' in list[0]), 'list is metadata only');
  const opened = (await (await get('/api/gallery/' + ids.at(-1))).json()).project;
  assert.equal(opened.title, special.title);
  assert.equal(opened.code, special.code);
  assert.equal(opened.pictures.hero.data, picture.data);
  const fileText = await fs.readFile(filename, 'utf8');
  assert(fileText.startsWith('// E++ community gallery data.'));
  assert.equal(parseStore(fileText).projects.length, 33);
  assert(!(await fs.readdir(temp)).some(name => name.endsWith('.tmp')), 'no temporary files remain');

  // A fresh server/store has no browser state and still sees all publications.
  await new Promise(resolve => server.close(resolve));
  server = null;
  const restarted = await new GalleryStore(filename).init();
  assert.equal(restarted.list().length, 33);
  assert.equal(restarted.get(ids.at(-1)).pictures.hero.data, picture.data);

  // A malformed existing file must never be replaced by an empty gallery.
  const corrupt = path.join(temp, 'corrupt', 'shared.js');
  await fs.mkdir(path.dirname(corrupt));
  await fs.writeFile(corrupt, 'not a gallery');
  await assert.rejects(new GalleryStore(corrupt).init());
  assert.equal(await fs.readFile(corrupt, 'utf8'), 'not a gallery');
  console.log('E++ 1.3.5 gallery: validation, concurrency, atomic storage, restart and safety checks passed.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
