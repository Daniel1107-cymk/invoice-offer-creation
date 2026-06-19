# Invoice / Penawaran PDF Generator

A small, no-build web app to create **Invoice** (SIKON) and **Penawaran/Offer** (SUITUS)
PDF documents that match the company's existing layout. Fill in a form, preview, and
download a real PDF. Works offline and on your phone.

## Features
- **Two document types** — Invoice and Penawaran (Offer). Switching sets sensible defaults
  for the logo, columns, intro paragraph, and footer (Offer adds *Sisa Invoice Pertama* + *Grand Total*).
- **Logo selector** — SIKON or SUITUS (embedded; no external files needed).
- **Flexible table columns** — fixed: `No`, `Jenis Pekerjaan`, `Total`. Optional (toggle on/off):
  `Qty`, `Satuan`, `Harga`, `Keterangan`.
- **Total, two ways (per row)** — *Auto* (`Qty × Harga`, computed live) or *Manual* (type it).
  A "set all rows" control flips the whole table; `Harga`/`Total` also accept the word **Free**.
- **Brand-themed UI** — the whole interface re-skins to the active brand (SIKON crimson / SUITUS
  orange), shows the real logo in the header, and uses an industrial "spec sheet" look with
  monospaced figures. Fonts are vendored locally, so it works fully offline.
- **Indonesian Rupiah** formatting (`Rp 55.000.000`) and Indonesian date (`Batam, 18 Juni 2026`).
- **Drafts** — auto-saved in the browser; plus Save/Load a `.json` draft to move between devices.
- **Real PDF** output via [pdfmake] (vendored locally for offline use).

## Run locally
Just open `index.html` in a browser (double-click). No server or install required.

> The first PDF render loads embedded fonts, so it may take a second.

## Use on your phone
Deploy the folder as a static site and open the URL on your phone (then "Add to Home Screen").

### Option A — GitHub Pages
```bash
git init
git add .
git commit -m "Invoice/Penawaran PDF generator"
# create a repo on GitHub, then:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
In the repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
Your app is served at `https://<you>.github.io/<repo>/`.

### Option B — Netlify (drag & drop)
Go to <https://app.netlify.com/drop> and drag the whole `pdf-creation` folder onto the page.
You get an instant public URL.

## Files
```
index.html        Form UI
styles.css        Mobile-first styling
app.js            State, totals, PDF build, draft import/export
assets/logos.js   Base64 SIKON + SUITUS logos (generated)
assets/logo-*.png Extracted logo images (reference)
vendor/           pdfmake.min.js + vfs_fonts.js (PDF engine, vendored)
vendor/fonts.css  @font-face for Archivo + IBM Plex Sans/Mono (vendored, offline-safe)
vendor/fonts/     Locally hosted .woff2 font files
extract_logos.py  One-time script that extracted the logos from the sample PDFs
```

## Regenerating logos
Logos were extracted from the original sample PDFs:
```bash
pip install pymupdf
python extract_logos.py
```

[pdfmake]: https://pdfmake.org/
