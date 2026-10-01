"""Data of /demos/cnn-classification/: a retraining of the trimmed CNN of the chapter "Convolutional neural networks for
automated cellular automaton classification" (Rollier, Daly and Baetens, Advances in Cellular Automata 2, 2025), and the
rule-table scan it is measured against.

What the chapter fixes, and this script follows:
- data: all 256 elementary rules, 64 cells, periodic boundaries, 64 rows from a fair-coin start; 1024 diagrams per rule
  split 3/4 training and 1/4 validation, and 128 more per rule as the test set;
- labels: the five Li-Packard classes (Li and Packard 1990, Table 2), and the 88 classes of rules equal up to mirror and
  colour swap;
- network (Fig. 8.9): four 2 x 2 convolutions with four channels and a ReLU each, a 2 x 2 max pool after the second, a
  global max pool, a linear 16-node dense layer and a 5-node softmax (389 parameters); for the 88 rules, the dense layers
  are replaced by one 88-node softmax (664 parameters); Glorot-uniform weights and zero biases, as Keras initialises them;
- training: categorical cross-entropy, Adam with learning rate 1e-3, batches of 64, at most 50 epochs, stopped when the
  validation accuracy has not improved by 1e-5 for 5 epochs;
- augmentation, online: each diagram of a batch is left alone with probability 1/(n + 1) and otherwise gets one of the n
  augmentations, here colour inversion, a left-right mirror and 2 x 2 coarse-graining (block averages, so grey values),
  the combination of the chapter's final model.
What it does not know and chooses: the seeds, keeping the best of three runs by validation accuracy as the chapter kept
the best of a few, and that the final model is the early-stopped one rather than one trained again on training and
validation together. The networks are therefore a retraining, not the chapter's networks.

Run: /opt/miniconda3/bin/python3.13 scripts/train-lp-cnn.py     (needs numpy and torch; about two hours on a laptop)
Writes src/data/lp-cnn.json.
"""
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

W = T = 64
PER_RULE, TEST_PER_RULE = 1024, 128
BATCH, LR, EPOCHS, PATIENCE, MIN_DELTA = 64, 1e-3, 50, 5, 1e-5
RUNS = 3  # the chapter reports the best of a small number of runs
NAMES = ['null', 'fixed point', 'periodic', 'locally chaotic', 'chaotic']
# Li and Packard (1990), Table 2: one rule per class of equivalent rules, as they list them.
LP_TABLE = {
    0: [0, 8, 32, 40, 128, 136, 160, 168],
    1: [2, 4, 10, 12, 13, 24, 34, 36, 42, 44, 46, 56, 57, 58, 72, 76, 77, 78, 104, 130, 132, 138, 140, 152, 162, 164,
        170, 172, 184, 200, 204, 232],
    2: [1, 3, 5, 6, 7, 9, 11, 14, 15, 19, 23, 25, 27, 28, 29, 33, 35, 37, 38, 41, 43, 50, 51, 74, 108, 131, 133, 134,
        142, 156, 178],
    3: [26, 73, 154],
    4: [18, 22, 30, 45, 54, 60, 90, 105, 106, 129, 137, 146, 150, 161],
}
DEVICE = 'mps' if torch.backends.mps.is_available() else 'cpu'
PROBE = np.arange(0, 256, 17)
OUT = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'lp-cnn.json'


def mirror(r: int) -> int:
    return sum(((r >> ((n & 1) << 2 | (n & 2) | (n >> 2) & 1)) & 1) << n for n in range(8))


def complement(r: int) -> int:
    return sum((1 - ((r >> (7 - n)) & 1)) << n for n in range(8))


def orbit(r: int) -> set:
    return {r, mirror(r), complement(r), mirror(complement(r))}


LP = np.full(256, -1)
for c, reps in LP_TABLE.items():
    for rep in reps:
        for r in orbit(rep):
            assert LP[r] in (-1, c)
            LP[r] = c
assert (LP >= 0).all() and np.bincount(LP).tolist() == [24, 97, 89, 10, 36]
REPS = sorted({min(orbit(r)) for r in range(256)})
assert len(REPS) == 88
INDEP = np.array([REPS.index(min(orbit(r))) for r in range(256)])


def diagrams(per_rule: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """per_rule diagrams for each rule, rows in time order, as uint8 (n, 64, 64), with their rules."""
    rng = np.random.default_rng(seed)
    rules = np.repeat(np.arange(256), per_rule)
    bits = ((rules[:, None] >> np.arange(8)) & 1).astype(np.uint8)
    d = np.empty((len(rules), T, W), np.uint8)
    d[:, 0] = rng.integers(0, 2, (len(rules), W), dtype=np.uint8)
    rows = np.arange(len(rules))[:, None]
    for t in range(1, T):
        p = d[:, t - 1]
        d[:, t] = bits[rows, (np.roll(p, 1, 1) << 2) | (p << 1) | np.roll(p, -1, 1)]
    return d, rules


def seen(d: np.ndarray, pad: str) -> np.ndarray:
    """Per diagram, the 8-bit set of neighbourhoods met by a 3-cell window on rows 0 to 62, the rows whose next row is in
    the picture. pad='wrap' wraps the window round the ring, as the automaton does; pad='edge' pads each row with a copy
    of its own first and last cell, as the chapter's scan did, which adds two windows per row that the ring does not have."""
    out = np.zeros(len(d), np.int64)
    for i in range(0, len(d), 8192):
        a = d[i:i + 8192, :-1].astype(np.int64)
        p = np.concatenate([a[:, :, -1:], a, a[:, :, :1]] if pad == 'wrap' else [a[:, :, :1], a, a[:, :, -1:]], 2)
        n = (p[:, :, :-2] << 2) | (p[:, :, 1:-1] << 1) | p[:, :, 2:]
        out[i:i + 8192] = np.bitwise_or.reduce((1 << n).reshape(len(a), -1), axis=1)
    return out


def scan(d: np.ndarray, rules: np.ndarray, pad: str) -> dict:
    """The benchmark of Sec. 8.2.1, and with pad='wrap' also the hand-set CNN of Sec. 8.3.1 given a wrapped (cylindrical)
    input, which reads an absent neighbourhood as a 0 in the table."""
    s = seen(d, pad)
    known = ((s[:, None] >> np.arange(8)) & 1).astype(bool)
    count = known.sum(1)
    inc = count < 8
    truth = ((rules[:, None] >> np.arange(8)) & 1).astype(bool)
    # A diagram missing entries is consistent with every rule that agrees on the rest; ambiguous when their classes differ.
    amb = 0
    for i in np.flatnonzero(inc):
        cands = [int(rules[i])]
        for n in np.flatnonzero(~known[i]):
            cands = [c ^ (b << int(n)) for c in cands for b in (0, 1)]
        amb += len({int(LP[c]) for c in cands}) > 1
    out = {'diagrams': int(len(d)), 'incomplete': int(inc.sum()), 'fewest': int(count.min()), 'ambiguous': amb}
    if pad == 'wrap':
        out['handsetWrong'] = int((inc & (truth & ~known).any(1)).sum())
        out['perRule'] = np.bincount(rules[inc], minlength=256).tolist()
        out['perClass'] = np.bincount(LP[rules[inc]], minlength=5).tolist()
        out['missing'] = np.bincount(np.flatnonzero((~known[inc]).ravel()) % 8, minlength=8).tolist()
    return out


class Trimmed(nn.Module):
    def __init__(self, out: int):
        super().__init__()
        self.convs = nn.ModuleList([nn.Conv2d(1 if i == 0 else 4, 4, 2) for i in range(4)])
        self.head = nn.Sequential(nn.Linear(4, 16), nn.Linear(16, 5)) if out == 5 else nn.Linear(4, out)
        for m in self.modules():
            if isinstance(m, (nn.Conv2d, nn.Linear)):
                nn.init.xavier_uniform_(m.weight)
                nn.init.zeros_(m.bias)

    def forward(self, x):
        for i, conv in enumerate(self.convs):
            x = torch.relu(conv(x))
            if i == 1:
                x = nn.functional.max_pool2d(x, 2)
        return self.head(x.amax((2, 3)))  # logits; the softmax is in the loss


def augment(x: torch.Tensor, gen: torch.Generator) -> torch.Tensor:
    """Each diagram: unchanged with probability 1/4, else inverted, mirrored or coarse-grained, one of the three."""
    pick = torch.randint(0, 4, (len(x),), generator=gen, device='cpu').to(x.device)
    inv, mir, coarse = (pick == 1)[:, None, None, None], (pick == 2)[:, None, None, None], (pick == 3)[:, None, None, None]
    blocks = nn.functional.avg_pool2d(x, 2).repeat_interleave(2, 2).repeat_interleave(2, 3)
    return torch.where(inv, 1 - x, torch.where(mir, x.flip(3), torch.where(coarse, blocks, x)))


def accuracy(model, x, y) -> tuple[float, np.ndarray]:
    model.eval()
    preds = []
    with torch.no_grad():
        for i in range(0, len(x), 4096):
            xb = torch.from_numpy(x[i:i + 4096]).to(DEVICE, torch.float32)[:, None]
            preds.append(model(xb).argmax(1).cpu().numpy())
    p = np.concatenate(preds)
    return float((p == y).mean()), p


def train(out: int, x_tr, y_tr, x_va, y_va, seed: int) -> tuple[Trimmed, list]:
    torch.manual_seed(seed)
    gen = torch.Generator().manual_seed(seed)
    model = Trimmed(out).to(DEVICE)
    opt = torch.optim.Adam(model.parameters(), lr=LR, eps=1e-7)  # Keras's epsilon
    best, best_state, since, history = -1.0, None, 0, []
    yt = torch.from_numpy(y_tr)
    for epoch in range(EPOCHS):
        model.train()
        t0 = time.time()
        order = torch.randperm(len(x_tr), generator=gen)
        for i in range(0, len(order), BATCH):
            idx = order[i:i + BATCH]
            xb = torch.from_numpy(x_tr[idx.numpy()]).to(DEVICE, torch.float32)[:, None]
            loss = nn.functional.cross_entropy(model(augment(xb, gen)), yt[idx].to(DEVICE))
            opt.zero_grad()
            loss.backward()
            opt.step()
        acc, _ = accuracy(model, x_va, y_va)
        history.append(acc)
        print(f'  {out}-way epoch {epoch + 1}: validation {acc:.4%} ({time.time() - t0:.0f} s)', flush=True)
        if acc > best + MIN_DELTA:
            best, since = acc, 0
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        else:
            since += 1
            if since >= PATIENCE:
                break
    model.load_state_dict(best_state)
    return model, history


def sig(v: float) -> float:
    return float(f'{v:.6g}')


def export(model: Trimmed) -> dict:
    """Weights rounded to six significant digits, convolution kernels as [out][in][row][col], dense as [out][in]."""
    layers = [{'w': [sig(v) for v in c.weight.detach().cpu().numpy().ravel()], 'b': [sig(v) for v in c.bias.detach().cpu().numpy()]} for c in model.convs]
    dense = [model.head] if isinstance(model.head, nn.Linear) else list(model.head)
    return {'conv': layers, 'dense': [{'w': [sig(v) for v in d.weight.detach().cpu().numpy().ravel()], 'b': [sig(v) for v in d.bias.detach().cpu().numpy()], 'out': d.out_features} for d in dense]}


def load_rounded(model: Trimmed, w: dict):
    """Put the rounded weights back, so the reference outputs below are those of the exported network."""
    with torch.no_grad():
        for c, l in zip(model.convs, w['conv']):
            c.weight.copy_(torch.tensor(l['w']).reshape(c.weight.shape))
            c.bias.copy_(torch.tensor(l['b']))
        dense = [model.head] if isinstance(model.head, nn.Linear) else list(model.head)
        for d, l in zip(dense, w['dense']):
            d.weight.copy_(torch.tensor(l['w']).reshape(d.weight.shape))
            d.bias.copy_(torch.tensor(l['b']))


def main():
    t0 = time.time()
    x, rules = diagrams(PER_RULE, 2023)
    x_te, rules_te = diagrams(TEST_PER_RULE, 2024)
    print(f'data: {len(x)} + {len(x_te)} diagrams ({time.time() - t0:.0f} s)', flush=True)
    bench = {f'{k}_{pad}': scan(dd, rr, pad) for k, dd, rr in (('trainval', x, rules), ('test', x_te, rules_te)) for pad in ('wrap', 'edge')}
    print('scan:', {k: {kk: vv for kk, vv in v.items() if kk != 'perRule'} for k, v in bench.items()}, flush=True)

    perm = np.random.default_rng(7).permutation(len(x))
    tr, va = perm[: 3 * len(x) // 4], perm[3 * len(x) // 4:]
    data = {'source': {'paper': '10.1007/978-3-031-81097-8_3', 'labels': 'Li and Packard (1990), Complex Systems 4: 281-297, Table 2'},
            'classes': NAMES, 'lp': LP.tolist(), 'reps': REPS, 'scan': bench, 'nets': {}}
    probe_x, _ = diagrams(1, 99)  # one diagram per rule; the check runs PROBE of them through the browser's network
    for key, out, labels in (('class', 5, LP), ('indep', 88, INDEP)):
        runs = [train(out, x[tr], labels[rules[tr]], x[va], labels[rules[va]], seed=10 * out + k) for k in range(RUNS)]
        model, history = max(runs, key=lambda r: max(r[1]))
        w = export(model)
        load_rounded(model, w)
        val, _ = accuracy(model, x[va], labels[rules[va]])
        test, pred = accuracy(model, x_te, labels[rules_te])
        entry = {'weights': w, 'history': [round(h, 5) for h in history], 'runs': [round(max(r[1]), 5) for r in runs], 'val': round(val, 5), 'test': round(test, 5),
                 'params': int(sum(p.numel() for p in model.parameters()))}
        if out == 5:
            conf = np.zeros((5, 5), int)
            np.add.at(conf, (LP[rules_te], pred), 1)
            entry['confusion'] = conf.tolist()  # rows actual, columns predicted
        # Reference outputs for scripts/check-lpcnn.ts: one diagram per rule, plain, through the exported network.
        model.eval()
        with torch.no_grad():
            p = torch.softmax(model(torch.from_numpy(probe_x).to(DEVICE, torch.float32)[:, None]), 1).cpu().numpy()
        entry['probe'] = [sig(v) for v in p[PROBE].ravel()]
        with torch.no_grad():  # the same diagrams coarse-grained, to check the grey values too
            xc = nn.functional.avg_pool2d(torch.from_numpy(probe_x[PROBE]).to(DEVICE, torch.float32)[:, None], 2).repeat_interleave(2, 2).repeat_interleave(2, 3)
            entry['probeCoarse'] = [sig(v) for v in torch.softmax(model(xc), 1).cpu().numpy().ravel()]
        data['nets'][key] = entry
        print(f'{key}: {entry["params"]} parameters, validation {val:.4%}, test {test:.4%}', flush=True)
    data['probe'] = {'rules': PROBE.tolist(), 'starts': [''.join(map(str, probe_x[r, 0])) for r in PROBE]}
    OUT.write_text(json.dumps(data, separators=(',', ':')) + '\n')
    print(f'wrote {OUT} ({OUT.stat().st_size} bytes) in {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
