"""Export diamond still-life tiles from game-of-life-mosaics to src/data/tiles.json.

Run by hand when the tile bank changes:
    PYTHONPATH=../game-of-life-mosaics/src python3 scripts/export-tiles.py

Each tile is its 6L x 6L grid, row-major bits packed MSB first, base64.
Tiles are sorted by population. Level 5 keeps at most 3 tiles per population.
"""
import base64
import json
from pathlib import Path

import numpy as np
from gol_mosaics.patterns import PatternLibrary

rng = np.random.default_rng(0)
out = {}
for level in (3, 4, 5):
    tiles = np.asarray(PatternLibrary.load(level).solutions, dtype=np.uint8)
    pop = tiles.sum(axis=(1, 2))
    keep = [i for p in np.unique(pop)
            for i in rng.permutation(np.flatnonzero(pop == p))[:3 if level == 5 else None]]
    keep.sort(key=lambda i: pop[i])
    out[str(level)] = [base64.b64encode(np.packbits(tiles[i].ravel())).decode() for i in keep]
    print(f"level {level}: {len(keep)} tiles")

path = Path(__file__).resolve().parent.parent / "src" / "data" / "tiles.json"
path.write_text(json.dumps(out, separators=(",", ":")))
print(path, path.stat().st_size, "bytes")
