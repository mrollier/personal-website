"""Data of /demos/nuca-cnn/ from mrollier/emulating-and-learning-CAs, at a pinned commit.

Writes src/data/nuca-cnn.json: the inputs of the paper's Figs 1, 3 and 4 as the repository decoded them from the
published figures (rules, rule allocation, spacetime diagram; the rule-54 training example), and the timings of
Fig. 5, mean and standard deviation over ten repeats, for the 2024 run and its 2026 re-run on the same laptop.

Run: python scripts/export-nuca.py          (fetches from GitHub; needs numpy)
     ELCA=../emulating-and-learning-CAs python scripts/export-nuca.py   (reads a local clone instead)
"""
import io
import json
import os
import urllib.request
from pathlib import Path

import numpy as np

REPO = 'mrollier/emulating-and-learning-CAs'
COMMIT = '94e5593118a44771528d7183a253455ec4c9dd41'  # release 1.0.1, 30 September 2026
SCENARIOS = {  # the varied parameter and the file stem of src/ca_emulators/benchmarks.py
    'Nrules': 'nuca-comparison-Nrules-N256_T32_S32_avg-from-10',
    'T': 'nuca-comparison-T-N64_Nrules4_S32_avg-from-10',
    'N': 'nuca-comparison-N-T32_Nrules4_S32_avg-from-10',
    'S': 'nuca-comparison-S-N32_T32_Nrules4_avg-from-10',
}
METHODS = ('cellpylib', 'local', 'dense')  # stored in this order after the x-values


def fetch(path: str) -> bytes:
    local = os.environ.get('ELCA')
    if local:
        return (Path(local) / path).read_bytes()
    with urllib.request.urlopen(f'https://raw.githubusercontent.com/{REPO}/{COMMIT}/{path}') as r:
        return r.read()


def ints(a) -> list:
    return np.asarray(a).astype(int).tolist()


def sig(v: float) -> float:
    return float(f'{v:.4g}')


def figure(name: str) -> dict:
    d = np.load(io.BytesIO(fetch(f'data/published_inputs/{name}.npz')))
    return {k: ints(d[k]) for k in d.files}


def timings(year: int) -> dict:
    out = {}
    for key, stem in SCENARIOS.items():
        f = io.BytesIO(fetch(f'data/benchmarks_{year}/{stem}.npy'))
        x = np.load(f)
        row = {'x': ints(x)}
        for m in METHODS:
            t = np.load(f)  # (repeats, len(x)) seconds
            assert t.shape == (10, len(x)), (stem, m, t.shape)
            row[m] = {'mean': [sig(v) for v in t.mean(0)], 'std': [sig(v) for v in t.std(0)]}
        out[key] = row
    return out


data = {
    'source': {'repo': REPO, 'commit': COMMIT},
    'fig1': figure('fig1_nuca_rules30_90'),
    'fig3': figure('fig3_training_example_rule54'),
    'fig4': figure('fig4_nuca_cellpylib_8rules'),
    'bench': {'2024': timings(2024), '2026': timings(2026)},
}
out = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'nuca-cnn.json'
out.write_text(json.dumps(data, separators=(',', ':')) + '\n')
print(f'wrote {out} ({out.stat().st_size} bytes)')
