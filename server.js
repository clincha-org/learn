import { createServer } from 'node:http';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('./web/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
};
const ID = /^[0-9a-f-]{8,64}$/;
const MAX_BODY = 4 * 1024 * 1024;
const SECURITY = {
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'",
};

export function createApp(dataDir) {
  const decksDir = join(dataDir, 'decks');
  const file = (id) => join(decksDir, `${id}.json`);

  const readDeck = async (id) => {
    try {
      return JSON.parse(await readFile(file(id), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  };

  const writeDeck = async (id, deck) => {
    await mkdir(decksDir, { recursive: true });
    const tmp = join(decksDir, `.${id}.${process.pid}.tmp`);
    await writeFile(tmp, JSON.stringify(deck));
    await rename(tmp, file(id));
  };

  const body = async (req) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 });
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };

  const json = (res, status, data) => {
    res.writeHead(status, { ...SECURITY, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  async function api(req, res, path) {
    if (path === '/api/decks' && req.method === 'GET') {
      await mkdir(decksDir, { recursive: true });
      const names = (await readdir(decksDir)).filter((n) => n.endsWith('.json') && !n.startsWith('.'));
      const decks = await Promise.all(names.map((n) => readDeck(n.slice(0, -5))));
      return json(res, 200, { decks: decks.filter(Boolean) });
    }
    const m = path.match(/^\/api\/decks\/([^/]+)$/);
    if (!m || !ID.test(m[1])) return json(res, 404, { error: 'not found' });
    const id = m[1];
    const current = await readDeck(id);
    if (req.method === 'PUT') {
      const deck = await body(req);
      if (deck.id !== id || typeof deck.updated !== 'number') return json(res, 400, { error: 'bad deck' });
      if (current && current.updated > deck.updated) return json(res, 409, current);
      await writeDeck(id, deck);
      return json(res, 200, deck);
    }
    if (req.method === 'DELETE') {
      const tombstone = { id, deleted: true, updated: Date.now() };
      await writeDeck(id, tombstone);
      return json(res, 200, tombstone);
    }
    return json(res, 405, { error: 'method not allowed' });
  }

  async function serveStatic(res, path) {
    const rel = normalize(path === '/' ? '/index.html' : path);
    const full = join(WEB, rel);
    if (!full.startsWith(WEB.endsWith(sep) ? WEB : WEB + sep)) return json(res, 404, { error: 'not found' });
    try {
      const data = await readFile(full);
      res.writeHead(200, { ...SECURITY, 'Content-Type': MIME[extname(full)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      json(res, 404, { error: 'not found' });
    }
  }

  return createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://x');
      if (pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('ok\n');
      }
      if (pathname.startsWith('/api/')) return await api(req, res, pathname);
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
      return await serveStatic(res, pathname);
    } catch (e) {
      if (!res.headersSent) json(res, e.status ?? (e instanceof SyntaxError ? 400 : 500), { error: e.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.DATA_DIR ?? './data';
  await mkdir(join(dataDir, 'decks'), { recursive: true });
  createApp(dataDir).listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
}
