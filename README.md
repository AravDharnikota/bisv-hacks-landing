# BISV Hacks 2027 site

Static site. No build step. Open `index.html` or run:

```bash
node tools/dev-server.mjs
```

## Pages

- `index.html` – home: hero, about, what to expect, links
- `register.html` – the 2027 application, one question per screen (`register.js`). Answers go to a Google Sheet; see "Registration" below
- `schedule.html`, `sponsors.html`, `team.html`, `faq.html` – one topic each
- `about.html`, `contact.html`, `privacy.html` – the pages agents and search engines check before they trust a site (linked in every footer)
- `404.html` – GitHub Pages serves this for any missing path, so its links start with `/`
- The header and footer are copied into every page. If you change the nav, change it in all five files.

## Files

- `style.css` – all styles. Colors and fonts are tokens at the top of the file
- `images/logo.png` – logo mark, pulled from the prospectus

## Before you deploy

Copy these from the old site repo into this folder. The pages link to them but they are not here yet:

- `images/2026/About.png` – hero photo
- `images/2025/team/Nicholas.png`, `images/2025/team/Anderson.jpg`, `images/2026/team/Arav.png` – team photos
- `images/BISV_Hacks.png` – social share image

## Registration

`register.html` is the application: one question per screen, Enter to continue, arrow keys to move, letters to pick a choice. It has no dependencies and no Typeform. `register.js` keeps a draft in the browser's localStorage and posts the finished answers as JSON to a Google Apps Script web app (`backend/Register.gs`) that appends one row to a Google Sheet.

Connect it to a sheet once:

1. Make a new Google Sheet (or open the one you want registrations in). Open Extensions → Apps Script.
2. Paste `backend/Register.gs` over the default code. Save.
3. In the editor, pick `setup` and run it. Approve the permission prompt. This adds a `Registrations` tab with the header row.
4. Run `testRegister`. A test row appears on the tab. Delete it.
5. Deploy → New deployment → Web app. Execute as: **Me**. Who has access: **Anyone**. Copy the `/exec` URL.
6. Paste the URL into `data-endpoint=""` on the form in `register.html`. Push.

Until step 6, the form says it is not connected and points people to the team email.

After you change `Register.gs`, deploy again: Deploy → Manage deployments → Edit → Version: New version. The URL stays the same.

- One row per applicant. A second application with the same email is refused, so students email the team to change anything.
- Set `SEND_CONFIRMATION = true` at the top of `Register.gs` to email each applicant a confirmation from the deploying account. Free Google accounts send about 100 emails a day through Apps Script.
- To close registration, replace the Start button in `register.html` with a sentence, or set the `data-endpoint` back to empty.

## Question desk

`faq.html` sends each question to a Google Apps Script web app (`backend/Code.gs`). The script lives inside one Google Sheet.

1. Rate limits run first.
2. An embedding model (Gemini, or open-source `bge-small` on Hugging Face) turns the question into a vector.
3. A close match in the hidden `Cache` tab is reused. This costs nothing.
4. With no match, Claude answers from the `KNOWLEDGE` text at the top of `Code.gs`.
5. If Claude does not know, the question goes on the `Unanswered` tab and the page asks for an email.

Set it up once:

1. In the Anthropic Console, set a monthly spend limit (for example $20). This is the hard money cap.
2. Make a new Google Sheet. Open Extensions → Apps Script.
3. Paste `backend/Code.gs` over the default code. Save.
4. Project Settings → Script properties → add `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` (free, from aistudio.google.com). To use the open-source `bge` model instead, add `HF_TOKEN` and no Gemini key. Hugging Face needs paid credits. The keys stay here. Do not put them in this repo.
5. In the editor, run `setup`, then run `testAsk`. Approve the permission prompt. Check the log.
6. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Copy the `/exec` URL.
7. Paste the URL into `data-endpoint=""` on the form in `faq.html`. Push.

After you change `Code.gs`, deploy again: Deploy → Manage deployments → Edit → Version: New version.

To teach it something new, edit `KNOWLEDGE` in `Code.gs` and deploy a new version. Old cached answers stop being used automatically.

Limits are constants at the top of `Code.gs`. Run `testMatch` to tune how close two questions must be to share an answer.

## Editing

- Date and registration: hero in `index.html`, `register.html`, and `KNOWLEDGE` in `backend/Code.gs`
- Sponsors: the `tiers` table and the "2027 partners" line in `sponsors.html`
- Schedule: the table in `schedule.html`
- Team: the list in `team.html`

## Markdown for agents

Agents read the site through these files. Keep them current.

- `llms.txt` – the guide for agents: what BISV Hacks is, when to use the site, and links to every page. Edit it by hand when facts change.
- `*.html.md` – a Markdown copy of each page, made from the page's `<main>`. Put `data-md-skip` on anything decorative that should stay out of it.
- `sitemap.xml`, `robots.txt` – every page, for crawlers.
- `mode.js` – the Humans | Agents switch. Agents mode shows the page's Markdown copy (or `llms.txt` on pages without one).

After you change any page, run:

```bash
node tools/agent-files.mjs
```

Then run the tests. They fail if a Markdown copy is out of date, a heading skips a level, the sitemap misses a page, or the structured data loses a field:

```bash
npm test
```

### Content negotiation (Cloudflare Worker)

GitHub Pages cannot change response headers, so on its own it always answers with HTML. `worker/index.js` fixes that: a request with `Accept: text/markdown` gets the page's Markdown copy with `Content-Type: text/markdown` and `Vary: Accept`, and a missing page gets a Markdown 404. Browsers get the same HTML as before.

To turn it on (needs whoever controls the bisvhacks.com domain):

1. Add bisvhacks.com to a free Cloudflare account and switch the domain's nameservers to Cloudflare's.
2. Keep the four GitHub Pages `A` records and the `www` `CNAME`, proxied (orange cloud). Set SSL/TLS to Full.
3. From `worker/`, run `npx wrangler deploy`. The routes are in `wrangler.toml`.
4. Check it:

```bash
curl -sS -i -H 'Accept: text/markdown' https://bisvhacks.com/
curl -sS -i -H 'Accept: text/markdown' https://bisvhacks.com/some-path-that-does-not-exist
curl -sS -i -H 'Accept: text/html' https://bisvhacks.com/
```

The first should be `200`, `text/markdown`, `Vary: Accept`. The second should be `404` with a Markdown body. The third should be the normal HTML page.
