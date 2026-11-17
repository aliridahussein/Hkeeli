/**
 * Local server for working on the courtyard scene.
 *
 *   node tools/courtyard-stills.mjs          (port 4323)
 *
 * Serves the repository as static files — like `npx serve .` — plus one
 * extra route used only while regenerating the still images the home page
 * shows before (and instead of) the 3D scene:
 *
 *   POST /__stills/<name>.webp   body: the image bytes
 *
 * writes assets/images/courtyard/<name>.webp. tools/courtyard-preview.html
 * renders the stills from the real scene and posts them here; see README,
 * "The courtyard". Nothing in this file is deployed (tools/ is in
 * .assetsignore) and it only listens on localhost.
 */

import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STILLS = join(ROOT, 'assets', 'images', 'courtyard');
const PORT = Number(process.env.PORT || 4323);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && url.pathname.startsWith('/__stills/')) {
    const name = url.pathname.slice('/__stills/'.length);
    if (!/^[a-z0-9-]+\.webp$/.test(name)) {
      res.writeHead(400).end('bad name');
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    await writeFile(join(STILLS, name), Buffer.concat(chunks));
    res.writeHead(200, { 'content-type': 'text/plain' }).end(`saved ${name}`);
    return;
  }

  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(file);
    if (info.isDirectory()) throw new Error('directory');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`courtyard dev server on http://localhost:${PORT}/tools/courtyard-preview.html`);
});
