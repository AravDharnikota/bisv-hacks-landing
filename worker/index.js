// Cloudflare Worker that sits in front of GitHub Pages and gives agents Markdown.
//
// GitHub Pages cannot change response headers, so it cannot do content negotiation.
// This Worker can:
//   Accept: text/markdown  ->  the page's .md copy, Content-Type: text/markdown, Vary: Accept
//   a missing page         ->  404 with a Markdown body that links to the sitemap and llms.txt
//   anything else          ->  the GitHub Pages response, unchanged except Vary: Accept
//
// Deploy steps are in the README ("Markdown for agents").

const SITE = 'https://bisvhacks.com';

// True when the client ranks text/markdown at least as high as HTML.
// Browsers never list text/markdown, so they always get HTML.
export function prefersMarkdown(accept) {
  if (!accept) return false;
  let md = 0;
  let html = 0;
  for (const part of accept.split(',')) {
    const [type, ...params] = part.trim().split(';').map(s => s.trim().toLowerCase());
    let q = 1;
    for (const p of params) {
      const [k, v] = p.split('=');
      if (k === 'q') q = Number(v);
    }
    if (!Number.isFinite(q)) q = 0;
    if (type === 'text/markdown' || type === 'text/x-markdown') md = Math.max(md, q);
    if (type === 'text/html' || type === 'application/xhtml+xml') html = Math.max(html, q);
  }
  return md > 0 && md >= html;
}

// Which .md file holds this page. null means the path is not a page (an image, a .txt, a .md).
export function markdownPath(pathname) {
  if (pathname.endsWith('/')) return pathname + 'index.html.md';
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (last.endsWith('.html')) return pathname + '.md';
  if (last.includes('.')) return null;
  return pathname + '.html.md'; // GitHub Pages serves /sponsors as sponsors.html
}

export function notFoundMarkdown(pathname) {
  const path = pathname.replace(/[`\r\n]/g, '');
  return `# Page not found\n\n` +
    `There is no page at \`${path}\` on bisvhacks.com. It may have moved, or the link may have a typo.\n\n` +
    `- Every page: ${SITE}/sitemap.xml\n` +
    `- Guide for agents: ${SITE}/llms.txt\n` +
    `- Home page: ${SITE}/index.html.md\n` +
    `- Contact: bisvhackathon@gmail.com\n`;
}

function markdown(body, status, method) {
  return new Response(method === 'HEAD' ? null : body, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Vary': 'Accept',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function withVaryAccept(res) {
  const out = new Response(res.body, res);
  const vary = (out.headers.get('Vary') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!vary.some(v => v.toLowerCase() === 'accept')) vary.push('Accept');
  out.headers.set('Vary', vary.join(', '));
  return out;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const readable = request.method === 'GET' || request.method === 'HEAD';

    if (readable && prefersMarkdown(request.headers.get('Accept'))) {
      const mdPath = markdownPath(url.pathname);
      if (mdPath) {
        // Ask the origin for the .md file. Accept */* so this never negotiates again.
        const res = await fetch(new URL(mdPath, url.origin), { headers: { Accept: '*/*' } });
        if (res.status === 200) return markdown(await res.text(), 200, request.method);
      }
      const page = await fetch(request);
      if (page.status === 404) return markdown(notFoundMarkdown(url.pathname), 404, request.method);
      return withVaryAccept(page); // a real file with no Markdown copy (an image, llms.txt)
    }

    return withVaryAccept(await fetch(request));
  },
};
