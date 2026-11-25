// Shared setup for the browser tests. The app is served on a local port, because
// browsers do not load ES modules from file:// pages.
//   PYRAMID_HTML  a single-file build to test instead of the source (e.g. dist/pyramid.html)
//   PW_CHROME     path to a Chromium binary (default: Playwright's own download)
//   SHOTS_DIR     where screenshots and scratch files go (default: tests/out)
import path from 'path'; import fs from 'fs'; import http from 'http'; import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const CHROME = process.env.PW_CHROME || undefined;
export const SHOTS = path.resolve(process.env.SHOTS_DIR || path.join(here, 'out'));
fs.mkdirSync(SHOTS, { recursive: true });

const single = process.env.PYRAMID_HTML && path.resolve(process.env.PYRAMID_HTML);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (single && url === '/') {
    res.writeHead(200, { 'content-type': TYPES['.html'] });
    return res.end('<!doctype html><html><head><meta charset="utf-8"></head><body>' + fs.readFileSync(single, 'utf8') + '</body></html>');
  }
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
server.unref(); // the test process ends when the browser closes
export const HTML_URL = `http://127.0.0.1:${server.address().port}/`;

// A test cannot replace a function inside a module. `spy` (called before page.goto) rewrites
// the served code instead: the named function first calls window.__spy[name] with its arguments,
// when the test has set one. It handles one function per page.
export async function spy(page, name) {
  await page.route(url => url.pathname === '/' || url.pathname.endsWith('.js'), async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(new RegExp(`(function ${name}\\([^)]*\\) \\{)`), `$1 window.__spy?.${name}?.(...arguments);`);
    await route.fulfill({ response, body });
  });
}
