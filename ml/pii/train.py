#!/usr/bin/env python3
import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from common import K, decode, featurize, score
from model import NameNet


def load(path):
    return [json.loads(l) for l in open(path)]


def encode(examples):
    out = []
    for ex in examples:
        toks, ids, shapes = featurize(ex["text"])
        y = [int(any(a <= s and e <= b for a, b in ex["spans"])) for _, s, e in toks]
        out.append((np.array(ids, dtype=np.int32).reshape(-1, K), np.array(shapes, dtype=np.int64),
                    np.array(y, dtype=np.int64)))
    return out


def collate(batch, dev):
    T = max(len(b[1]) for b in batch)
    ids = torch.zeros(len(batch), T, K, dtype=torch.long)
    sh = torch.zeros(len(batch), T, dtype=torch.long)
    y = torch.full((len(batch), T), -100, dtype=torch.long)
    for i, (a, s, l) in enumerate(batch):
        n = len(s)
        ids[i, :n], sh[i, :n], y[i, :n] = torch.from_numpy(a).long(), torch.from_numpy(s), torch.from_numpy(l)
    return ids.to(dev), sh.to(dev), y.to(dev)


@torch.no_grad()
def predict(model, examples, thr, dev):
    model.eval()
    out = []
    for ex in examples:
        toks, ids, shapes = featurize(ex["text"])
        if not toks:
            out.append([])
            continue
        lg = model(torch.tensor([ids], device=dev), torch.tensor([shapes], device=dev))[0].cpu().numpy()
        out.append(decode(toks, 1 / (1 + np.exp(lg[:, 0] - lg[:, 1])), thr))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", default="out")
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--bs", type=int, default=64)
    ap.add_argument("--lr", type=float, default=3e-3)
    a = ap.parse_args()
    random.seed(0), np.random.seed(0), torch.manual_seed(0)
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    out = Path(a.out)
    out.mkdir(exist_ok=True)

    train_ex, val = load(f"{a.data}/train.jsonl"), load(f"{a.data}/val.jsonl")
    enc = encode(train_ex)
    model = NameNet().to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epochs)
    lossf = nn.CrossEntropyLoss(ignore_index=-100)
    best = -1.0
    print(f"device={dev} train={len(enc)} params={sum(p.numel() for p in model.parameters()):,}")

    for ep in range(1, a.epochs + 1):
        model.train()
        order = list(range(len(enc)))
        random.shuffle(order)
        tot = 0.0
        for i in range(0, len(order), a.bs):
            ids, sh, y = collate([enc[j] for j in order[i:i + a.bs]], dev)
            loss = lossf(model(ids, sh).reshape(-1, 2), y.reshape(-1))
            opt.zero_grad()
            loss.backward()
            opt.step()
            tot += loss.item()
        sched.step()
        s = score(val, predict(model, val, 0.5, dev))
        f1 = 2 * s["precision"] * s["recall"] / max(s["precision"] + s["recall"], 1e-9)
        print(f"epoch {ep:2d} loss {tot / (len(order) / a.bs):.4f} | val recall {s['recall']:.3f} "
              f"precision {s['precision']:.3f} clean_fp {s['clean_fp']:.3f} f1 {f1:.3f}")
        if f1 > best:
            best = f1
            torch.save({"state": model.state_dict()}, out / "name_net.pt")
    print("best val f1", round(best, 4), "->", out / "name_net.pt")


if __name__ == "__main__":
    main()