// Local preview that behaves like GitHub Pages: / -> index.html, /schedule -> schedule.html,
// a missing page -> 404.html. Run: node tools/dev-server.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
};

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const tries = path.endsWith('/') ? [path + 'index.html'] : [path, path + '.html'];
  for (const p of tries) {
    try {
      const body = await readFile(join(ROOT, p));
      res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(body);
    } catch {}
  }
  res.writeHead(404, { 'Content-Type': TYPES['.html'] });
  res.end(await readFile(join(ROOT, '404.html')));
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
