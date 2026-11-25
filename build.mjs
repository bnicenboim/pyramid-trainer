// Writes the whole app as one file, in two forms:
//   dist/pyramid.html  a page fragment (it starts at <title>, with no doctype, <html>, <head> or <body>),
//                      which is the form the Claude artifact host publishes
//   dist/index.html    the same inside a complete document, which opens by double-click
import fs from 'fs'; import path from 'path'; import vm from 'vm'; import { fileURLToPath } from 'url';
const root = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// The modules in evaluation order (a module's imports come before it), with the import lines
// and the `export` keywords removed. This works because top-level names are unique across modules.
const seen = new Set(), parts = [];
function add(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = read(file);
  for (const m of src.matchAll(/^import .* from '(.+)';$/gm)) add(path.posix.join(path.posix.dirname(file), m[1]));
  parts.push(`// ── ${file} ──\n` + src.replace(/^import .* from '.+';\n/gm, '').replace(/^export /gm, ''));
}
add('js/main.js');
const js = parts.join('\n');
new vm.Script(js, { filename: 'dist/pyramid.html <script>' }); // throws on a syntax error or a duplicate const, let or class
const fns = [...js.matchAll(/^(?:async )?function (\w+)/gm)].map(m => m[1]);
const dup = fns.find((n, i) => fns.indexOf(n) !== i);
if (dup) throw new Error(`function ${dup} is declared in two modules`);

const version = js.match(/const VERSION = '(.+)';/)[1];
if (version !== JSON.parse(read('package.json')).version) throw new Error('js/version.js and package.json disagree on the version');

const html = read('index.html');
const title = html.match(/<title>.*<\/title>/)[0];
const fonts = html.match(/<link [^>]*fonts\.googleapis[^>]*>/)[0];
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module"')).trim();
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const fragment =
  `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${read('style.css')}</style>\n\n${body}\n\n<script>\n${js}</script>\n`;
fs.writeFileSync(path.join(root, 'dist/pyramid.html'), fragment);
fs.writeFileSync(path.join(root, 'dist/index.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(read('favicon.svg'))}">\n</head>\n<body>\n${fragment}</body>\n</html>\n`);
console.log('wrote dist/pyramid.html and dist/index.html');
