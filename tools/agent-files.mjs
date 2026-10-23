// Builds the files agents read: a Markdown copy of each page (page.html.md) and sitemap.xml.
// Run after you change any page:   node tools/agent-files.mjs
// The tests run it with --check, which fails if a Markdown copy is out of date.
//
// The Markdown comes from each page's <main>. Mark anything that should not appear in it
// with data-md-skip (decorative bits like the empty partner grid).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://bisvhacks.com';
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Pages that get a Markdown copy. faq.html is interactive (answers come from the question desk),
// so it has no static content worth mirroring.
export const MD_PAGES = ['index.html', 'schedule.html', 'sponsors.html', 'team.html', 'about.html', 'contact.html', 'privacy.html'];

/* --- HTML to Markdown, for the plain markup these pages use --------------- */

const VOID = new Set(['br', 'img', 'meta', 'link', 'input', 'hr', 'source', 'wbr']);
const DROP = new Set(['script', 'style', 'noscript', 'form', 'svg', 'button', 'nav', 'header', 'footer', 'template', 'input', 'label', 'img', 'figure']);
const BLOCK = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'table', 'dl', 'section', 'div', 'main', 'article', 'blockquote']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', copy: '©', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };
function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attrs(raw) {
  const out = {};
  for (const m of raw.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) out[m[1].toLowerCase()] = m[2] === undefined ? '' : decode(m[2]);
  return out;
}

export function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.children.push({ text: m[5] }); continue; }
    if (!m[2]) continue; // comment
    const tag = m[2].toLowerCase();
    if (m[1]) { // closing tag: pop back to the matching open tag, if there is one
      const i = stack.map(n => n.tag).lastIndexOf(tag);
      if (i > 0) stack.length = i;
      continue;
    }
    const node = { tag, attrs: attrs(m[3]), children: [] };
    top.children.push(node);
    if (!VOID.has(tag) && !m[4]) {
      stack.push(node);
      // Raw text elements: skip their contents entirely.
      if (tag === 'script' || tag === 'style') {
        const end = html.indexOf(`</${tag}`, m.index + m[0].length);
        re.lastIndex = end === -1 ? html.length : end;
      }
    }
  }
  return root;
}

const isEl = n => n.tag !== undefined;
const skipped = n => isEl(n) && (DROP.has(n.tag) || 'data-md-skip' in n.attrs || n.attrs['aria-hidden'] === 'true');

function absolute(href, pageUrl) {
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith('#')) return pageUrl + href;
  return SITE + '/' + href.replace(/^\.?\//, '').replace(/\.html(?=#|$)/, '');
}

// An element whose visible text is all aria-hidden (like the typing line) uses its aria-label instead.
function labelled(n) {
  const els = n.children.filter(isEl);
  return n.attrs['aria-label'] && els.length > 0 && els.every(c => c.attrs['aria-hidden'] === 'true') && n.children.filter(c => !isEl(c)).every(c => !c.text.trim());
}

function inline(n, ctx) {
  if (!isEl(n)) return decode(n.text).replace(/\s+/g, ' ');
  if (skipped(n)) return '';
  if (labelled(n)) return n.tag === 'a' && n.attrs.href ? `[${n.attrs['aria-label']}](${absolute(n.attrs.href, ctx.url)})` : n.attrs['aria-label'];
  const inner = () => n.children.map(c => inline(c, ctx)).join('');
  switch (n.tag) {
    case 'br': return '\n';
    case 'strong': case 'b': { const t = inner().trim(); return t ? `**${t}**` : ''; }
    case 'em': case 'i': { const t = inner().trim(); return t ? `*${t}*` : ''; }
    case 'a': {
      const t = inner().trim();
      return n.attrs.href ? `[${t}](${absolute(n.attrs.href, ctx.url)})` : t;
    }
    default: return inner();
  }
}

const clean = s => s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
const cellText = (n, ctx) => clean(inline(n, ctx)).replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(n, ctx) {
  const rows = [];
  const walk = node => node.children.filter(isEl).forEach(c => {
    if (c.tag === 'tr') rows.push(c.children.filter(x => isEl(x) && (x.tag === 'td' || x.tag === 'th')).map(x => cellText(x, ctx)));
    else walk(c);
  });
  walk(n);
  if (!rows.length) return [];
  const width = Math.max(...rows.map(r => r.length));
  const pad = r => [...r, ...Array(width - r.length).fill('')];
  const line = r => '| ' + pad(r).join(' | ') + ' |';
  return [[line(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n')];
}

function blocks(n, ctx) {
  const out = [];
  let buf = '';
  const flush = () => { const t = clean(buf); if (t) out.push(t); buf = ''; };
  for (const c of n.children) {
    if (isEl(c) && skipped(c)) continue;
    if (isEl(c) && (BLOCK.has(c.tag) || c.tag === 'li' || c.tag === 'tr')) { flush(); out.push(...block(c, ctx)); }
    else buf += inline(c, ctx);
  }
  flush();
  return out;
}

function block(n, ctx) {
  const t = n.tag;
  if (/^h[1-6]$/.test(t)) return ['#'.repeat(Number(t[1])) + ' ' + clean(inline(n, ctx))];
  if (t === 'p') { const s = clean(inline(n, ctx)); return s ? [s] : []; }
  if (t === 'ul' || t === 'ol') {
    const items = n.children.filter(c => isEl(c) && c.tag === 'li' && !skipped(c));
    return [items.map((li, i) => (t === 'ol' ? `${i + 1}. ` : '- ') + blocks(li, ctx).join(' ')).join('\n')];
  }
  if (t === 'table') return table(n, ctx);
  if (t === 'dl') {
    const lines = [];
    const walk = node => node.children.filter(isEl).forEach(c => {
      if (c.tag === 'dt') lines.push(`**${clean(inline(c, ctx))}**`);
      else if (c.tag === 'dd') lines[lines.length - 1] += ': ' + clean(inline(c, ctx));
      else walk(c);
    });
    walk(n);
    return [lines.map(l => '- ' + l).join('\n')];
  }
  if (t === 'blockquote') return blocks(n, ctx).map(b => '> ' + b);
  return blocks(n, ctx);
}

function find(n, tag) {
  if (n.tag === tag) return n;
  for (const c of n.children || []) { const f = isEl(c) && find(c, tag); if (f) return f; }
  return null;
}

export function pageUrl(file) {
  return file === 'index.html' ? SITE + '/' : `${SITE}/${file.replace(/\.html$/, '')}`;
}

export function toMarkdown(html, file) {
  const ctx = { url: pageUrl(file) };
  const tree = parse(html);
  const main = find(tree, 'main');
  if (!main) throw new Error(`${file} has no <main>`);
  const body = blocks(main, ctx).join('\n\n');
  return body + '\n\n---\n\n' +
    `This is the Markdown version of ${ctx.url}. ` +
    `BISV Hacks is a student-led organization at BASIS Independent Silicon Valley, fiscally sponsored by Hack Club Bank, a 501(c)(3). ` +
    `Contact: bisvhackathon@gmail.com. Every page: ${SITE}/sitemap.xml. Guide for agents: ${SITE}/llms.txt\n`;
}

/* --- Sitemap ---------------------------------------------------------------- */

// Every page a person or agent should find. 404.html is not a real page.
export function sitemapPages() {
  return readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== '404.html').sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
}

function lastmod(file) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (dirty) return today;
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim() || today;
  } catch {
    return today;
  }
}

export function sitemap() {
  const urls = sitemapPages().map(f => `  <url>\n    <loc>${pageUrl(f)}</loc>\n    <lastmod>${lastmod(f)}</lastmod>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/* --- Run ------------------------------------------------------------------ */

function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const file of MD_PAGES) {
    const md = toMarkdown(readFileSync(join(ROOT, file), 'utf8'), file);
    const out = join(ROOT, file + '.md');
    const current = existsSync(out) ? readFileSync(out, 'utf8') : null;
    if (current === md) continue;
    if (check) stale.push(file + '.md'); else writeFileSync(out, md);
  }
  const sm = sitemap();
  const smPath = join(ROOT, 'sitemap.xml');
  const locs = s => [...s.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).join('\n');
  const currentSm = existsSync(smPath) ? readFileSync(smPath, 'utf8') : '';
  if (check) { if (locs(currentSm) !== locs(sm)) stale.push('sitemap.xml'); }
  else if (currentSm !== sm) writeFileSync(smPath, sm);

  if (check && stale.length) {
    console.error('Out of date: ' + stale.join(', ') + '\nRun: node tools/agent-files.mjs');
    process.exit(1);
  }
  console.log(check ? 'Agent files are up to date.' : 'Wrote Markdown copies and sitemap.xml.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
