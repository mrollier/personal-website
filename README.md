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
| Demos | `src/pages/demos/` (list in `index.astro`). Thesis page `thesis.astro`: one hash-routed tab per chapter, each a prose section plus figures; pure engines in `src/scripts/` (`variants`, `wolfram`, `centrality`, `genotype`, `sync`, `consensus`, `tep`, `cnn`, `lyapunov`, `linalg`, `life`, `mosaic`, `stats`, `palette`), DOM plumbing in `figure.ts` (`stepper`, `lazy`), `raster.ts`, the one Web Worker `sim.worker.ts` driven by generator jobs through `jobs.ts`, the thesis network families and best rules in `family.ts` + `src/data/thesis-rules.json`; each engine has a `scripts/check-*.ts` run by `npm test`; thesis LaTeX source under `_source/thesis/`. Cellular automata: 1-D engine `src/scripts/eca.ts` with `src/components/Eca.astro` and `EcaTable.astro`; the parity rule on a grid in `src/scripts/grid.ts` with `CaGrid.astro`, on networks (Watts–Strogatz, Erdős–Rényi, Barabási–Albert, a rewired torus lattice, force layout) in `src/scripts/net.ts` with `CaNet.astro`; Life-like network automata (rules, mean field, firing squad and majority verdicts) in `src/scripts/llna.ts`, the clickable interval diagram in `src/scripts/diagram.ts`, figures `LlnaRule.astro` and `LlnaRun.astro` (modes fssp, majority, defect), self-check `npm test`; the page is `cellular-automata.astro` with hash-routed tabs; `Deck.astro` is the fullscreen slide deck (slides are slotted, a slide can adopt a page element). Echoes: maths in `src/scripts/echoes.ts`, canvas plumbing shared by the figures in `src/scripts/figure.ts`, sound in `src/scripts/audio.ts`; figures `EchoRing.astro`, `EchoWell.astro`, `EchoTrain.astro`, `EchoNoise.astro`. These are the only components with a scoped `<style>`, on purpose, so they lift out with their script files |
| CV PDF | `public/cv.pdf` (redacted copy only) |

A wrong field in a YAML file fails `npm run build`, which is the test.

## Presenting offline

The public PhD defence (2 October 2026) is `/demos/defence/`: every slide as a live card in tabs, and a Present button. The deck lives in `src/components/defence/` (one component per block, `Deck.astro` for the shell) and `src/scripts/defence/` (`deck.ts` is the engine); its precomputed data in `src/data/defence/` comes from `npm run precompute` (`scripts/defence/precompute.ts`, seeded). The colours and the title mosaic follow the thesis cover (denim on apricot); the mosaic, `src/data/defence/mosaic.json`, comes from `python scripts/defence/export-mosaic.py`, which packs it with the cover code of `../game-of-life-mosaics` (it needs that repository, its level-7 tile census and a Python with numpy and scipy). `npm run build` also writes `dist/demos/defence/rollier-defence.html` (`scripts/inline-defence.mjs`): the whole deck in one file, no network requests, which is the file to present from.

- Launch: `firefox --kiosk "file:///path/to/rollier-defence.html"` gives true fullscreen without the fullscreen API, so Escape cannot end it. Press the clicker once to start. Without kiosk mode, click Start for fullscreen; Escape then leaves fullscreen but not the deck, and `f` goes back.
- Keys: PageDown, right arrow, space or `n` for the next build or slide; PageUp, left arrow, Backspace or `p` for back; `b` or `.` blanks the screen (the next press only unblanks); `f` fullscreen; `t` a rehearsal clock with the time the current block should end; digits and Enter jump to a slide; `Home` the start; `a` the backup slides; `c` on the rounds slide turns the countdown off; `r` on "One recipe, three outcomes" draws a new random start; `q` leaves (on the site). The pointer hides after a few still seconds. F5 and Ctrl+R do nothing while presenting.
- Test on the actual projector the day before: resolution, colours, and the clicker's buttons.

## Deploy

Push to `main`. GitHub Actions builds and publishes. DNS for the apex and `www` points at GitHub Pages from Vimexx.

`_source/` holds raw material (original CV, photos, questionnaire) and is gitignored.
