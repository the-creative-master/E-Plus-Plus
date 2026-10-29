#!/usr/bin/env node
'use strict';

// E++ Studio's public gallery. The browser never writes this file directly:
// projects are validated here and stored as data in shared.js on the server.
// Use one server process per gallery file and mount that file on durable storage.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PREFIX = '// E++ community gallery data. Read as JSON; do not execute.\nmodule.exports = ';
const SUFFIX = ';\n';
const MAX_BODY = 2 * 1024 * 1024;
const MAX_CODE = 128 * 1024;
const MAX_PICTURE_BYTES = 1200 * 1024;
const MAX_STORE_BYTES = 50 * 1024 * 1024;
const MAX_PROJECTS = 2000;
const MAX_PICTURES = 24;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function bytes(value) { return Buffer.byteLength(value, 'utf8'); }
function cleanText(value, label, max, required) {
  if (typeof value !== 'string') throw httpError(400, label + ' must be text.');
  const text = value.trim();
  if ((required && !text) || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw httpError(400, label + ' must be ' + (required ? '1–' : '0–') + max + ' characters on one line.');
  }
  return text;
}
function validateProject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(400, 'Send a project object.');
  const title = cleanText(input.title, 'Title', 80, true);
  const author = cleanText(input.author === undefined ? '' : input.author, 'Author', 60, false) || 'Anonymous';
  const description = cleanText(input.description === undefined ? '' : input.description, 'Description', 300, false);
  if (typeof input.code !== 'string' || !input.code.trim() || bytes(input.code) > MAX_CODE || input.code.includes('\u0000')) {
    throw httpError(400, 'Program code is required and must be at most 128 KB.');
  }
  const rawPictures = input.pictures === undefined ? {} : input.pictures;
  if (!rawPictures || typeof rawPictures !== 'object' || Array.isArray(rawPictures)) throw httpError(400, 'Pictures must be a picture book.');
  const entries = Object.entries(rawPictures);
  if (entries.length > MAX_PICTURES) throw httpError(400, 'A project can share at most 24 pictures.');
  const pictures = Object.create(null);
  let pictureBytes = 0;
  for (const [key, value] of entries) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'A picture is malformed.');
    const name = cleanText(value.name || key, 'Picture name', 40, true);
    if (!/^[A-Za-z][A-Za-z0-9 _-]*$/.test(name)) throw httpError(400, 'A picture name must start with a letter and use letters, numbers, spaces, - or _.');
    const data = value.data;
    // Shared games must carry their own pictures, not rely on private paths or
    // another server. Data is only ever rendered as an image, never as markup.
    if (typeof data !== 'string' || !/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/i.test(data)) {
      throw httpError(400, `Picture '${name}' is not embedded. Re-upload it through Image before publishing.`);
    }
    pictureBytes += bytes(data);
    if (pictureBytes > MAX_PICTURE_BYTES) throw httpError(400, 'All pictures together must be at most 1.2 MB.');
    if (pictures[name.toLowerCase()]) throw httpError(400, 'Picture names must be unique.');
    pictures[name.toLowerCase()] = {
      name, data,
      added: '',
      width: Number.isFinite(value.width) && value.width > 0 && value.width <= 8192 ? Math.round(value.width) : 0,
      height: Number.isFinite(value.height) && value.height > 0 && value.height <= 8192 ? Math.round(value.height) : 0
    };
  }
  return { id: crypto.randomUUID(), title, author, description, code: input.code, pictures, createdAt: new Date().toISOString() };
}

function serialize(data) { return PREFIX + JSON.stringify(data, null, 2) + SUFFIX; }
function parseStore(text) {
  if (!text.startsWith(PREFIX) || !text.endsWith(SUFFIX)) throw new Error('Gallery file has an invalid format; it was not overwritten.');
  const data = JSON.parse(text.slice(PREFIX.length, -SUFFIX.length));
  if (!data || data.version !== 1 || !Array.isArray(data.projects)) throw new Error('Gallery file has an unsupported format; it was not overwritten.');
  return data;
}

class GalleryStore {
  constructor(filename) {
    this.filename = path.resolve(filename);
    this.data = null;
    this.queue = Promise.resolve();
  }
  async init() {
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    try {
      // Exclusive create: never replace an existing gallery, even on startup.
      await fs.writeFile(this.filename, serialize({ version: 1, projects: [] }), { flag: 'wx', mode: 0o600 });
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await fs.stat(this.filename);
    if (!stat.isFile() || stat.size > MAX_STORE_BYTES) throw new Error('Gallery file is invalid or too large; it was not overwritten.');
    this.data = parseStore(await fs.readFile(this.filename, 'utf8'));
    return this;
  }
  async add(project) {
    // Serialize all read/modify/write operations, then rename an fsynced temp
    // file over shared.js. Readers see the complete old or new file, never half.
    const work = this.queue.then(async () => {
      if (this.data.projects.length >= MAX_PROJECTS) throw httpError(507, 'The gallery is full. Please contact its operator.');
      const next = { version: 1, projects: [project, ...this.data.projects] };
      const text = serialize(next);
      if (bytes(text) > MAX_STORE_BYTES) throw httpError(507, 'The gallery storage is full. Please contact its operator.');
      const temporary = this.filename + '.' + crypto.randomUUID() + '.tmp';
      try {
        const handle = await fs.open(temporary, 'wx', 0o600);
        try { await handle.writeFile(text, 'utf8'); await handle.sync(); }
        finally { await handle.close(); }
        await fs.rename(temporary, this.filename);
        // Persist the directory entry where the platform supports directory fsync.
        try {
          const directory = await fs.open(path.dirname(this.filename), 'r');
          try { await directory.sync(); } finally { await directory.close(); }
        } catch { /* Some platforms/filesystems do not support directory fsync. */ }
      } catch (error) {
        await fs.unlink(temporary).catch(() => {});
        throw error;
      }
      this.data = next;
      return project;
    });
    this.queue = work.catch(() => {});
    return work;
  }
  list() {
    return this.data.projects.map(({ id, title, author, description, createdAt }) => ({ id, title, author, description, createdAt }));
  }
  get(id) { return this.data.projects.find(project => project.id === id) || null; }
}

function sendJson(res, status, object) {
  const body = JSON.stringify(object);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, tooBig = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        if (!tooBig) { tooBig = true; reject(httpError(413, 'The project is too large to publish.')); }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(httpError(400, 'Send valid JSON.')); }
    });
    req.on('error', reject);
  });
}
function sameOrigin(req) {
  if (!req.headers.origin) return true; // Command-line clients have no Origin.
  try {
    const origin = new URL(req.headers.origin);
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host;
  } catch { return false; }
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const PUBLIC_FILES = new Set(['index.html', 'wiki.html', 'WIKI.md', 'README.md', 'LANGUAGE.md', 'E++.zip', 'epp_language.zip']);
async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  let name;
  try { name = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html'; }
  catch { res.writeHead(400); res.end(); return; }
  const segments = name.split('/');
  const allowed = PUBLIC_FILES.has(name) || ((segments[0] === 'js' || segments[0] === 'css') && segments.length === 2 && !segments[1].startsWith('.'));
  if (!allowed || segments.some(segment => !segment || segment === '.' || segment === '..') || name.includes('\\')) { res.writeHead(404); res.end(); return; }
  const file = path.join(ROOT, ...segments);
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error('Not a file');
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': data.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
}

function createServer(store) {
  return http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://epp.local').pathname;
      if (pathname === '/api/gallery') {
        if (req.method === 'GET') return sendJson(res, 200, { projects: store.list() });
        if (req.method === 'POST') {
          if (!sameOrigin(req)) throw httpError(403, 'Publish from this Studio, not a different website.');
          if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw httpError(415, 'Send application/json.');
          const project = validateProject(await readBody(req));
          await store.add(project);
          return sendJson(res, 201, { project: { id: project.id, title: project.title, createdAt: project.createdAt } });
        }
        res.writeHead(405, { Allow: 'GET, POST' }); res.end(); return;
      }
      const match = pathname.match(/^\/api\/gallery\/([0-9a-f-]{36})$/i);
      if (match) {
        if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return; }
        const project = store.get(match[1]);
        return project ? sendJson(res, 200, { project }) : sendJson(res, 404, { error: 'Project not found.' });
      }
      if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' });
      await serveStatic(req, res, pathname);
    } catch (error) {
      if (!error.status) console.error('Gallery request failed:', error);
      if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'The gallery could not be saved. Please try again.' });
      else res.end();
    }
  });
}

if (require.main === module) {
  const filename = process.env.EPP_GALLERY_PATH || path.join(ROOT, 'shared.js');
  const port = Number(process.env.PORT || 8000);
  const host = process.env.HOST || '0.0.0.0';
  new GalleryStore(filename).init().then(store => {
    createServer(store).listen(port, host, () => console.log(`E++ Studio: http://${host}:${port} · gallery: ${store.filename}`));
  }).catch(error => { console.error('Could not open the gallery; existing data was not changed:', error.message); process.exitCode = 1; });
}
module.exports = { GalleryStore, createServer, validateProject, parseStore };
