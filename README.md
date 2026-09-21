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
| Mountains | `src/content/mountains.yaml` (map outline: `src/data/ne_110m_land.json`, Natural Earth, public domain) |
| Gallery | `src/content/gallery.yaml` + image in `src/assets/mosaics/` |
| About, AI safety, Ventures, DJ, CV | `src/pages/*.md` |
| Home intro and "now" line | `src/pages/index.astro` |
| Background still-life tiles | `src/data/tiles.json`, regenerate with `PYTHONPATH=../game-of-life-mosaics/src python3 scripts/export-tiles.py` |
| Nav, footer links | `src/layouts/Base.astro` |
| Demos | `src/pages/demos/` (list in `index.astro`). ECA engine `src/scripts/eca.ts`; demo `src/components/Eca.astro` with `EcaTable.astro` and `EcaFigure.astro`; `Deck.astro` is the fullscreen slide deck (slides are slotted, a slide can adopt a page element). These are the only components with a scoped `<style>`, on purpose, so they lift out |
| CV PDF | `public/cv.pdf` (redacted copy only) |

A wrong field in a YAML file fails `npm run build`, which is the test.

## Deploy

Push to `main`. GitHub Actions builds and publishes. DNS for the apex and `www` points at GitHub Pages from Vimexx.

`_source/` holds raw material (original CV, photos, questionnaire) and is gitignored.
