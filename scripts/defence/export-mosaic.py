"""The defence deck's title and closing art: a 16:9 multi-level still-life mosaic in the style of the thesis cover.

Packed with the cover's own code (game-of-life-mosaics/studies/cover/cover.py): tiles of levels 7 down to 2, then
ponds, on the pond lattice, levels rising with the distance from the shore. The coast sits in the bottom-right corner
and breaks up into islands towards the text. What stays clear is the text itself: every line and logo of the title
slide and of the closing slide at each of its builds, as measured in the browser (scripts/defence/title-boxes.json,
in design pixels of the 1920 × 1080 slide), grown by a few cells; the sea is let in round it by a soft dip in the
terrain, so the coast follows the terrain's own noise instead of a box. As on the cover, the page is packed with a margin
of MARGIN cells on a torus and cut at the trim, so tiles run off the edges; the whole padded torus is a still life
(checked), and the deck runs the Game of Life on all of it while showing the page.

Run by hand (Anaconda's Python has numpy and scipy; the level-7 tiles come from the 1.2 GB census at the root of
game-of-life-mosaics, not in git):
    python scripts/defence/export-mosaic.py

Writes src/data/defence/mosaic.json: the page's ground level per cell (0 = field, 1-7, holes closed in their host's
level as the cover does) run-length encoded, the padded torus's live cells bit-packed, and the colours of the cover's
denim-on-apricot palette with its COAST steps.
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

SITE = Path(__file__).resolve().parents[2]
MOSAICS = SITE.parent / "game-of-life-mosaics"
sys.path.insert(0, str(MOSAICS / "studies" / "cover"))
import cover as C  # noqa: E402  (puts the repository's src and studies on the path itself)

W, H, SEED, TARGET = 288, 162, 20261002, 0.46  # 16:9 page, multiples of 6; 1920 / 288 = 6.67 design pixels a cell
BOXES = json.loads((SITE / "scripts" / "defence" / "title-boxes.json").read_text())
GROW, DIP, REACH = 4, 0.8, 6  # cells kept clear round the text; depth and reach (cells) of the dip in the terrain


def keep_clear(M):
    """The padded page's cells under the text and logos, grown by GROW."""
    px, m = 1920 / W, np.zeros((H + 2 * M, W + 2 * M), bool)
    for x, y, w, h in BOXES["title"] + BOXES["closing"]:
        x0, y0 = int(x / px) + M - GROW, int(y / px) + M - GROW
        x1, y1 = int(np.ceil((x + w) / px)) + M + GROW, int(np.ceil((y + h) / px)) + M + GROW
        m[max(0, y0):y1, max(0, x0):x1] = True
    return m


def design(seed):
    """Label map of the padded page and the live cells of the padded torus."""
    M = C.MARGIN
    C.set_page(W + 2 * M, H + 2 * M)
    try:
        c = C.Cover(seed)
        x, y = (C.XX - M) / W, (C.YY - M) / H                    # page coordinates, 0..1 on the page
        w = (0.95 * x + 0.75 * y - 0.95) / 0.55                 # 1 in the bottom-right corner, 0 towards the text
        keep = keep_clear(M)
        # a drowned coast, as on the front cover: hills rising towards the corner, valleys running up towards the
        # text, the terrain dipping round the text, the sea let in to a level
        T = C.terrain(c.rng, w, -140, gain=2.2, vdepth=1.5, vwidth=0.3, along=70, across=18)
        T = T - DIP * np.exp(-ndi.distance_transform_edt(~keep) / REACH)
        land = C.flood(np.where(keep, -9, T), TARGET, smooth=4) & ~keep
        c.fill(land, C.shore_field(c.rng, land, scale=6, base=2.2))
        lab, ok = c.labels(), c.verify()
        placed = dict(sorted(c.placed.items()))
        live = c.live.astype(np.uint8)
    finally:
        C.set_page(*C.PAGE)
    return lab, live, ok, placed


def ground_of(lab):
    """The level whose ground colour each cell takes (0 = field), as `cover.layers` paints it."""
    lab = lab.astype(int)
    level = np.where(lab < 20, lab, np.where(lab < 40, lab - 20, 0))
    host = np.where(lab >= 200, lab - 200, 0)
    small = np.where((lab >= 40) & (lab < 100), lab - 40, np.where((lab >= 140) & (lab < 200), lab - 140, -1))
    host = np.where(small >= 0, small // 10 + 3, host)
    return np.where(host > 0, host, level).astype(np.uint8)


def rle(a):
    """(value, run) byte pairs over the flattened array, runs of at most 255."""
    flat, out, i = a.ravel(), bytearray(), 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i] and j - i < 255:
            j += 1
        out += bytes((int(flat[i]), j - i))
        i = j
    return base64.b64encode(bytes(out)).decode()


def main():
    global SEED, TARGET
    if len(sys.argv) > 1:
        SEED = int(sys.argv[1])
    if len(sys.argv) > 2:
        TARGET = float(sys.argv[2])
    lab, live, ok, placed = design(SEED)
    assert ok, "the padded mosaic is not a still life"
    M = C.MARGIN
    page = np.s_[M:M + H, M:M + W]
    ground = ground_of(lab)[page]
    assert not (live[page].astype(bool) & (ground == 0)).any(), "a live cell on the field"
    pal = C.load_palettes()
    v, field = pal["ramps"]["denim"], pal["fields"]["apricot"]["hex"]
    out = {
        "about": "16:9 still-life mosaic for the defence deck's title and closing slides, packed with "
                 "game-of-life-mosaics/studies/cover/cover.py (levels 7 to 2, then ponds). Regenerate with "
                 "scripts/defence/export-mosaic.py.",
        "seed": SEED, "W": W, "H": H, "margin": M, "PW": W + 2 * M, "PH": H + 2 * M,
        "placed": {str(k): int(n) for k, n in placed.items()},
        "field": field,
        "grounds": [v["grounds"][s - 1] for s in C.COAST],
        "inks": [v["tone_subtle"][s - 1] for s in C.COAST],
        "ground": rle(ground),
        "live": base64.b64encode(np.packbits(live.ravel()).tobytes()).decode(),
    }
    path = Path(sys.argv[3]) if len(sys.argv) > 3 else SITE / "src" / "data" / "defence" / "mosaic.json"
    path.write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(f"tiles {placed}; padded torus a still life: {ok}; {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
