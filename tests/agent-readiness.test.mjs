// Checks the things agents and crawlers read. Run: npm test (or node --test tests/)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, SITE, MD_PAGES, sitemapPages, parse, toMarkdown } from '../tools/agent-files.mjs';
import worker, { prefersMarkdown, markdownPath } from '../worker/index.js';
import { onRequest as pagesMiddleware } from '../functions/_middleware.js';

const read = f => readFileSync(join(ROOT, f), 'utf8');
const CORE = ['index.html', 'schedule.html', 'sponsors.html', 'team.html', 'faq.html', 'about.html', 'contact.html', 'privacy.html', '404.html'];

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mainText(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/i);
  return m ? visibleText(m[0]) : '';
}

/* --- Content without JavaScript ------------------------------------------- */

test('homepage has a clear H1 and 500+ characters of content in raw HTML', () => {
  const html = read('index.html');
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'exactly one h1');
  assert.ok(mainText(html).length >= 500, `main text is ${mainText(html).length} chars`);
});

for (const f of CORE) {
  test(`${f}: headings never skip a level`, () => {
    const levels = [...read(f).matchAll(/<h([1-6])[\s>]/g)].map(m => Number(m[1]));
    assert.equal(levels[0], 1, 'first heading is h1');
    for (let i = 1; i < levels.length; i++) {
      assert.ok(levels[i] <= levels[i - 1] + 1, `h${levels[i - 1]} is followed by h${levels[i]}`);
    }
  });
}

/* --- Metadata: canonical, lang, and the four required Open Graph properties ---- */

const og = (html, prop) => (html.match(new RegExp(`<meta property="og:${prop}" content="([^"]*)">`)) || [])[1];

test('homepage has canonical, lang, og:type, og:image, og:url, and og:title', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/bisvhacks\.com\/">/);
  assert.equal(og(html, 'type'), 'website');
  assert.equal(og(html, 'url'), 'https://bisvhacks.com/');
  assert.ok(og(html, 'title'));
  assert.equal(og(html, 'image'), `${SITE}/images/og.png`);
});

for (const f of CORE) {
  test(`${f}: og:image is an absolute URL to a file that exists, and og:type is set`, () => {
    const html = read(f);
    const img = og(html, 'image');
    assert.ok(img && img.startsWith(SITE + '/'), `og:image must be absolute (the Open Graph protocol requires a URL), got ${img}`);
    assert.ok(existsSync(join(ROOT, img.slice(SITE.length + 1))), `${img} does not exist in the repo`);
    assert.equal(og(html, 'type'), 'website');
    const canon = (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
    if (canon) assert.equal(og(html, 'url'), canon, 'og:url matches the canonical URL');
  });
}

test('the share image is 1200x630 as declared', () => {
  const png = readFileSync(join(ROOT, 'images/og.png'));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  const html = read('index.html');
  assert.equal(og(html, 'image:width'), '1200');
  assert.equal(og(html, 'image:height'), '630');
});

/* --- Trust pages ------------------------------------------------------------ */

for (const f of ['about.html', 'contact.html', 'privacy.html']) {
  test(`${f} is a real page with 500+ characters`, () => {
    assert.ok(mainText(read(f)).length >= 500, `${f} main text is ${mainText(read(f)).length} chars`);
  });
}

for (const f of CORE) {
  test(`${f} footer links to About, Contact, and Privacy`, () => {
    const footer = read(f).match(/<footer[\s\S]*?<\/footer>/)[0];
    for (const p of ['about', 'contact', 'privacy']) assert.match(footer, new RegExp(`href="/?${p}"`));
  });
}

test('404.html uses root-absolute paths so it works at any depth', () => {
  const html = read('404.html');
  const relative = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1])
    .filter(u => !/^(https?:|mailto:|\/|#)/.test(u));
  assert.deepEqual(relative, []);
});

/* --- Structured data -------------------------------------------------------- */

test('Organization JSON-LD has description, contactPoint, and address', () => {
  const m = read('index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'JSON-LD block exists');
  const data = JSON.parse(m[1]);
  const org = data['@graph'].find(n => n['@type'] === 'Organization');
  assert.ok(org.description && org.description.length > 40);
  assert.equal(org.address['@type'], 'PostalAddress');
  for (const k of ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry']) assert.ok(org.address[k], k);
  const points = [].concat(org.contactPoint);
  assert.ok(points.length >= 1);
  for (const p of points) {
    assert.equal(p['@type'], 'ContactPoint');
    assert.ok(p.contactType);
    assert.ok(p.email || p.telephone);
  }
});

/* --- Sitemap, robots, llms.txt ---------------------------------------------- */

test('sitemap.xml lists every page with a lastmod date', () => {
  const xml = read('sitemap.xml');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const entries = [...xml.matchAll(/<url>\s*<loc>(.*?)<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>\s*<\/url>/g)];
  const expected = sitemapPages().map(f => (f === 'index.html' ? SITE + '/' : `${SITE}/${f.replace(/\.html$/, '')}`));
  assert.deepEqual(entries.map(e => e[1]), expected);
  assert.equal((xml.match(/<url>/g) || []).length, entries.length, 'every <url> has loc and lastmod');
  assert.ok(!xml.includes('404.html'));
  assert.ok(statSync(join(ROOT, 'sitemap.xml')).size < 50 * 1024 * 1024);
});

test('robots.txt points to the sitemap', () => {
  assert.match(read('robots.txt'), /^Sitemap: https:\/\/bisvhacks\.com\/sitemap\.xml$/m);
});

test('llms.txt follows the llms.txt format and has a When to use section', () => {
  const txt = read('llms.txt');
  const lines = txt.split('\n');
  assert.match(lines[0], /^# \S/, 'starts with an H1');
  assert.match(txt, /\n> \S/, 'has a blockquote summary');
  assert.match(txt, /\n## When to use\n/);
  const when = txt.split('\n## When to use\n')[1].split('\n## ')[0];
  assert.ok(when.length > 300, 'When to use section is specific, not a one-liner');
  const sections = [...txt.matchAll(/\n## (.+)\n/g)].map(m => m[1]);
  assert.equal(sections[sections.length - 1], 'Optional', 'Optional is the last section');
  // Every link in a list points at a file in this repo.
  for (const m of txt.matchAll(/^- \[[^\]]+\]\((https:\/\/bisvhacks\.com\/[^)]*)\)/gm)) {
    const file = m[1].replace(SITE + '/', '') || 'index.html';
    // GitHub Pages serves /faq from faq.html.
    assert.ok(existsSync(join(ROOT, file)) || existsSync(join(ROOT, file + '.html')), `llms.txt links to missing ${file}`);
  }
});

/* --- Markdown copies -------------------------------------------------------- */

test('Markdown copies are up to date with the HTML', () => {
  execFileSync('node', [join(ROOT, 'tools/agent-files.mjs'), '--check'], { cwd: ROOT, stdio: 'pipe' });
});

for (const f of MD_PAGES) {
  test(`${f}.md starts with the page H1 and links back to llms.txt`, () => {
    const md = read(f + '.md');
    const h1 = parse(read(f)).children.length && read(f).match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, '').trim();
    assert.ok(md.startsWith('# ' + h1 + '\n'), `${f}.md begins with "# ${h1}"`);
    assert.match(md, /https:\/\/bisvhacks\.com\/llms\.txt/);
    assert.ok(!/<[a-z][^>]*>/i.test(md.split('\n---\n')[0]), 'no HTML tags left in the body');
  });
}

test('the converter handles headings, links, tables, lists, skips, and aria labels', () => {
  const md = toMarkdown(`<main>
    <h1>Title</h1>
    <p class="x" aria-label="Spoken line"><span aria-hidden="true">typed</span></p>
    <p>Go to <a href="sponsors.html">sponsors</a> &amp; <a href="#top">top</a>.</p>
    <table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>x | y</td></tr></tbody></table>
    <dl class="list"><div><dt>Eat</dt><dd>Lunch</dd></div></dl>
    <ul><li>one</li><li>two</li></ul>
    <ol data-md-skip><li>01</li></ol>
    <script>var hidden = "<p>no</p>";</script>
  </main>`, 'test.html');
  const body = md.split('\n---\n')[0];
  assert.equal(body, [
    '# Title',
    'Spoken line',
    'Go to [sponsors](https://bisvhacks.com/sponsors) & [top](https://bisvhacks.com/test#top).',
    '| A | B |\n| --- | --- |\n| 1 | x \\| y |',
    '- **Eat**: Lunch',
    '- one\n- two',
  ].join('\n\n') + '\n');
});

/* --- Worker: content negotiation and Markdown 404s --------------------------- */

const TYPES = { '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.css': 'text/css', '.png': 'image/png' };

// Behaves like GitHub Pages: / -> index.html, /page -> page.html, missing -> 404.html with status 404.
function pagesOrigin(req) {
  const url = new URL(typeof req === 'string' || req instanceof URL ? req : req.url);
  let p = decodeURIComponent(url.pathname).replace(/^\//, '');
  const candidates = p === '' || p.endsWith('/') ? [p + 'index.html'] : [p, p + '.html'];
  const hit = candidates.find(c => !c.includes('..') && existsSync(join(ROOT, c)) && statSync(join(ROOT, c)).isFile());
  const headers = { 'Vary': 'Accept-Encoding' };
  if (!hit) return new Response(read('404.html'), { status: 404, headers: { ...headers, 'Content-Type': TYPES['.html'] } });
  return new Response(readFileSync(join(ROOT, hit)), { status: 200, headers: { ...headers, 'Content-Type': TYPES[extname(hit)] || 'application/octet-stream' } });
}

async function call(path, accept, method = 'GET') {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => pagesOrigin(input);
  try {
    return await worker.fetch(new Request(SITE + path, { method, headers: accept ? { Accept: accept } : {} }));
  } finally {
    globalThis.fetch = realFetch;
  }
}

test('prefersMarkdown reads Accept q-values', () => {
  assert.equal(prefersMarkdown('text/markdown'), true);
  assert.equal(prefersMarkdown('text/markdown, text/html;q=0.9'), true);
  assert.equal(prefersMarkdown('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'), false);
  assert.equal(prefersMarkdown('text/html;q=1, text/markdown;q=0.5'), false);
  assert.equal(prefersMarkdown('text/markdown;q=0'), false);
  assert.equal(prefersMarkdown('*/*'), false);
  assert.equal(prefersMarkdown(''), false);
  assert.equal(prefersMarkdown(null), false);
});

test('markdownPath maps pages to their .md copies', () => {
  assert.equal(markdownPath('/'), '/index.html.md');
  assert.equal(markdownPath('/index.html'), '/index.html.md');
  assert.equal(markdownPath('/sponsors'), '/sponsors.html.md');
  assert.equal(markdownPath('/sponsors.html'), '/sponsors.html.md');
  assert.equal(markdownPath('/llms.txt'), null);
  assert.equal(markdownPath('/images/logo.png'), null);
});

test('homepage: Accept text/markdown returns Markdown with Vary: Accept', async () => {
  const res = await call('/', 'text/markdown');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /^text\/markdown/);
  assert.match(res.headers.get('Vary'), /\bAccept\b/);
  const body = await res.text();
  assert.equal(body, read('index.html.md'));
  assert.ok(body.length > 500);
});

test('homepage: Accept text/html still returns HTML, with Vary: Accept', async () => {
  const res = await call('/', 'text/html');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /^text\/html/);
  assert.match(res.headers.get('Vary'), /\bAccept\b/);
  assert.match(res.headers.get('Vary'), /Accept-Encoding/, 'keeps the origin Vary value');
  assert.equal(await res.text(), read('index.html'));
});

test('a browser Accept header gets HTML', async () => {
  const res = await call('/sponsors.html', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  assert.match(res.headers.get('Content-Type'), /^text\/html/);
});

test('extensionless and .html paths both negotiate', async () => {
  for (const p of ['/sponsors', '/sponsors.html']) {
    const res = await call(p, 'text/markdown');
    assert.equal(res.status, 200, p);
    assert.equal(await res.text(), read('sponsors.html.md'), p);
  }
});

test('missing page: 404 with a Markdown body that links to the sitemap and llms.txt', async () => {
  const res = await call('/__ora-404-probe-9d8fb4qu', 'text/markdown');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('Content-Type'), /^text\/markdown/);
  assert.match(res.headers.get('Vary'), /\bAccept\b/);
  const body = await res.text();
  assert.ok(body.length >= 20);
  assert.match(body, /https:\/\/bisvhacks\.com\/llms\.txt/);
  assert.match(body, /https:\/\/bisvhacks\.com\/sitemap\.xml/);
});

test('missing page for a browser: HTML 404 page, status 404', async () => {
  const res = await call('/nope', 'text/html');
  assert.equal(res.status, 404);
  assert.match(res.headers.get('Content-Type'), /^text\/html/);
  assert.match(await res.text(), /Page not found/);
});

test('a real file with no Markdown copy passes through when Markdown is asked for', async () => {
  const res = await call('/llms.txt', 'text/markdown');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), read('llms.txt'));
});

test('HEAD with Accept text/markdown returns headers and no body', async () => {
  const res = await call('/', 'text/markdown', 'HEAD');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /^text\/markdown/);
  assert.equal(await res.text(), '');
});

test('a //other-host path never fetches from another host', async () => {
  const realFetch = globalThis.fetch;
  const hosts = [];
  globalThis.fetch = async (input) => { hosts.push(new URL(input instanceof Request ? input.url : input).host); return pagesOrigin(input); };
  try {
    const res = await worker.fetch(new Request(SITE + '//evil.com/x', { headers: { Accept: 'text/markdown' } }));
    assert.equal(res.status, 404);
    assert.deepEqual([...new Set(hosts)], ['bisvhacks.com']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* --- Cloudflare Pages middleware: same negotiation, for hosting on Cloudflare Pages --- */

// Behaves like Cloudflare Pages: env.ASSETS serves files, next() serves the request (404.html on a miss).
async function callPages(path, accept, method = 'GET') {
  const request = new Request(SITE + path, { method, headers: accept ? { Accept: accept } : {} });
  return pagesMiddleware({ request, next: async () => pagesOrigin(request), env: { ASSETS: { fetch: async (u) => pagesOrigin(u) } } });
}

test('Pages middleware: homepage Accept text/markdown returns Markdown with Vary: Accept', async () => {
  const res = await callPages('/', 'text/markdown');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /^text\/markdown/);
  assert.equal(res.headers.get('Vary'), 'Accept');
  assert.match(await res.text(), /^# BISV Hacks 2027/);
});

test('Pages middleware: Accept text/html returns HTML with Vary: Accept', async () => {
  const res = await callPages('/', 'text/html');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Type'), /^text\/html/);
  assert.ok(res.headers.get('Vary').split(',').map(v => v.trim().toLowerCase()).includes('accept'), `Vary is ${res.headers.get('Vary')}`);
  assert.match(await res.text(), /<h1/);
});

test('Pages middleware: missing page returns a Markdown 404 for agents and the HTML 404 for browsers', async () => {
  const md = await callPages('/__ora-404-probe-test', 'text/markdown');
  assert.equal(md.status, 404);
  assert.match(md.headers.get('Content-Type'), /^text\/markdown/);
  const body = await md.text();
  assert.ok(body.length >= 20);
  assert.match(body, /sitemap\.xml/);
  assert.match(body, /llms\.txt/);
  const html = await callPages('/__ora-404-probe-test', 'text/html');
  assert.equal(html.status, 404);
  assert.match(html.headers.get('Content-Type'), /^text\/html/);
});

/* --- Humans | Agents switch ------------------------------------------------- */

for (const f of CORE) {
  test(`${f} loads the Humans | Agents switch and its Markdown source exists`, () => {
    const html = read(f);
    assert.match(html, /<script src="\/?mode\.js" defer><\/script>/);
    const alt = html.match(/<link rel="alternate" type="text\/markdown" href="([^"]+)">/);
    const src = alt ? alt[1] : 'llms.txt'; // mode.js falls back to /llms.txt
    assert.ok(existsSync(join(ROOT, src.replace(/^\//, ''))), `${f} agent view source ${src} exists`);
  });
}

test('every page with a Markdown copy advertises it', () => {
  for (const f of MD_PAGES) assert.match(read(f), new RegExp(`<link rel="alternate" type="text/markdown" href="${f}\\.md">`), f);
});
