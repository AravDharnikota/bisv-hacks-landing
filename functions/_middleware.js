// Cloudflare Pages middleware: the same Markdown content negotiation as worker/index.js,
// for when the site is hosted on Cloudflare Pages instead of behind GitHub Pages.
//   Accept: text/markdown  ->  the page's .md copy, Content-Type: text/markdown, Vary: Accept
//   a missing page         ->  404 with a Markdown body that links to the sitemap and llms.txt
//   anything else          ->  the static file, unchanged except Vary: Accept
// GitHub Pages does not run this file, so bisvhacks.com behaves exactly as before.

import { negotiate } from '../worker/index.js';

export function onRequest({ request, next, env }) {
  return negotiate(
    request,
    target => env.ASSETS.fetch(target),
    () => next(),
  );
}
