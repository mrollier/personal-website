"""The still-lifes slide's smallest and largest tiles: one tile of level 2 and one of level 6, to src/data/defence/still.json.

Levels 3 to 5 come from src/data/tiles.json (scripts/export-tiles.py). For each level here: the median-population tile,
and for level 6 the first tile within two cells of that population that is symmetric under rotation and mirroring.
Each tile is its 6L x 6L grid, row-major bits packed MSB first, base64, as in tiles.json.

Run by hand (Anaconda's Python has numpy):
    python scripts/defence/export-still.py
"""
import base64
import json
import sys
from pathlib import Path

import numpy as np

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root.parent / 'game-of-life-mosaics' / 'src'))
from gol_mosaics.tile_library import TileLibrary  # noqa: E402

out = {}
for level in (2, 6):
    t = np.asarray(TileLibrary.load(level)._tiles, dtype=np.uint8)
    pop = t.sum(axis=(1, 2))
    order = np.argsort(pop, kind='stable')
    tile = t[order[len(order) // 2]]
    if level == 6:
        near = order[np.abs(pop[order] - pop[order[len(order) // 2]]) <= 2]
        tile = next(t[j] for j in near if (t[j] == np.rot90(t[j])).all() and (t[j] == t[j][::-1]).all())
    out[str(level)] = base64.b64encode(np.packbits(tile.ravel())).decode()
    print(f'level {level}: {len(t)} tiles, population {int(tile.sum())}')

path = root / 'src' / 'data' / 'defence' / 'still.json'
path.write_text(json.dumps(out, separators=(',', ':')))
print(path, path.stat().st_size, 'bytes')
