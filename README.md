# michielrollier.be

Personal site. Astro, plain CSS, GitHub Pages.

## Run

```sh
nvm use          # Node 22
npm install
npm run dev      # http://localhost:4321
npm run check    # build + link check
```

## Edit content

| What | Where |
|---|---|
| Publications | `src/content/publications.yaml` |
| Projects | `src/content/projects.yaml` |
| Mountains | photos in `src/pages/mountains.astro` (files in `src/assets/photos/`); summits in `src/content/mountains.yaml` (map outline: `src/data/ne_110m_land.json`, Natural Earth, public domain) |
| Gallery | `src/content/gallery.yaml` + image in `src/assets/mosaics/` |
| About, AI safety, Ventures, CV | `src/pages/*.md` |
| DJ sets (prose + record wall) | `src/pages/dj.astro` |
| Records, books, films | `npm run sync` refreshes `src/content/{records,books,films}.json` and the covers in `public/covers/` from Discogs, Goodreads (RSS) and Letterboxd (diary RSS, latest 100), then commit. Builds never fetch anything; if a source is down the old file stays. Bandcamp has no API and is a plain link |
| Home intro and "now" line | `src/pages/index.astro` |
| Background still-life tiles | `src/data/tiles.json`, regenerate with `PYTHONPATH=../game-of-life-mosaics/src python3 scripts/export-tiles.py` |
| Nav, footer links | `src/layouts/Base.astro` |
| Demos | `src/pages/demos/` (list in `index.astro`). ECA engine `src/scripts/eca.ts`; demo `src/components/Eca.astro` with `EcaTable.astro`; `Deck.astro` is the fullscreen slide deck (slides are slotted, a slide can adopt a page element). These are the only components with a scoped `<style>`, on purpose, so they lift out |
| CV PDF | `public/cv.pdf` (redacted copy only) |

A wrong field in a YAML file fails `npm run build`, which is the test.

## Deploy

Push to `main`. GitHub Actions builds and publishes. DNS for the apex and `www` points at GitHub Pages from Vimexx.

`_source/` holds raw material (original CV, photos, questionnaire) and is gitignored.
