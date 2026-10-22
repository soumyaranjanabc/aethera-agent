#!/usr/bin/env python3
import argparse
import json

import numpy as np
import onnx
import onnxruntime as ort
import torch

from common import featurize
from model import NameNet

ap = argparse.ArgumentParser()
ap.add_argument("--ckpt", default="out/name_net.pt")
ap.add_argument("--out", default="out/name_net.onnx")
ap.add_argument("--data", default="data")
a = ap.parse_args()

model = NameNet()
model.load_state_dict(torch.load(a.ckpt, map_location="cpu")["state"])
model.eval()
ids, sh = torch.randint(1, 100, (1, 7, 20)), torch.ones(1, 7, dtype=torch.long)
kw = dict(input_names=["ids", "shapes"], output_names=["logits"], opset_version=17,
          dynamic_axes={"ids": {0: "b", 1: "t"}, "shapes": {0: "b", 1: "t"}, "logits": {0: "b", 1: "t"}})
try:
    torch.onnx.export(model, (ids, sh), a.out, dynamo=False, **kw)   # legacy exporter keeps the opset we ask for
except TypeError:
    torch.onnx.export(model, (ids, sh), a.out, **kw)
print("operators:", sorted({n.op_type for n in onnx.load(a.out).graph.node}))

sess = ort.InferenceSession(a.out, providers=["CPUExecutionProvider"])
worst = 0.0
texts = [json.loads(l)["text"] for l in list(open(f"{a.data}/val.jsonl"))[:200]]
texts += ["a", "Name: Priya Menon", "x " * 150]          # T=1 and a long sequence: checks the dynamic axes
for t in texts:
    toks, i, s = featurize(t)
    if not toks:
        continue
    ref = model(torch.tensor([i]), torch.tensor([s]))[0].detach().numpy()
    got = sess.run(None, {"ids": np.array([i], dtype=np.int64), "shapes": np.array([s], dtype=np.int64)})[0][0]
    worst = max(worst, float(np.abs(ref - got).max()))
print(f"max |torch - onnx| logit difference over {len(texts)} texts: {worst:.2e}  (expect < 1e-4)")