# BISV Hacks 2027 site

Static site. No build step. Open `index.html` or run:

```bash
python3 -m http.server 5173
```

## Pages

- `index.html` – home: hero, about, what to expect, links
- `schedule.html`, `sponsors.html`, `team.html`, `faq.html` – one topic each
- The header and footer are copied into every page. If you change the nav, change it in all five files.

## Files

- `style.css` – all styles. Colors and fonts are tokens at the top of the file
- `images/logo.png` – logo mark, pulled from the prospectus

## Before you deploy

Copy these from the old site repo into this folder. The pages link to them but they are not here yet:

- `images/2026/About.png` – hero photo
- `images/2025/team/Nicholas.png`, `images/2025/team/Anderson.jpg`, `images/2026/team/Arav.png` – team photos
- `images/BISV_Hacks.png` – social share image

## Question desk

`faq.html` sends each question to a Google Apps Script web app (`backend/Code.gs`). The script lives inside one Google Sheet. It answers from the `Knowledge` tab, reuses answers from the `Cache` tab, and writes questions it cannot answer to the `Unanswered` tab.

Set it up once:

1. Make a new Google Sheet. Open Extensions → Apps Script.
2. Paste `backend/Code.gs` over the default code. Save.
3. Project Settings → Script properties → add `ANTHROPIC_API_KEY` with your key. The key stays here. Do not put it in this repo.
4. In the editor, run `setup`, then run `testAsk`. Approve the permission prompt. Check the log and the sheet tabs.
5. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Copy the `/exec` URL.
6. Paste the URL into `data-endpoint=""` on the form in `faq.html`.

After you change `Code.gs`, deploy again: Deploy → Manage deployments → Edit → Version: New version.

To teach it something new, add a row to the `Knowledge` tab. No deploy is needed. Old cached answers stop being used automatically.

## Editing

- Date and registration: hero in `index.html` and the `Knowledge` tab of the question desk sheet
- Sponsors: the `tiers` table and the "2027 partners" line in `sponsors.html`
- Schedule: the table in `schedule.html`
- Team: the list in `team.html`
