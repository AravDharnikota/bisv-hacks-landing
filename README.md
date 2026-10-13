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
- `BISV Hacks Sponsorship Prospectus.pdf` – the "Read the prospectus" button points here

## Editing

- Date and registration: hero in `index.html` and the first item in `faq.html`
- Sponsors: the `tiers` table and the "2027 partners" line in `sponsors.html`
- Schedule: the table in `schedule.html`
- Team: the list in `team.html`
