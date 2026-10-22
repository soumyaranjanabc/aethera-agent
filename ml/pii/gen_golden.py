#!/usr/bin/env python3
"""Writes the golden file the TypeScript tests compare against. Run from ml/pii. Needs no torch."""
import json
import sys
from pathlib import Path

from common import K, NB, decode, featurize

TEXTS = [
    "Name: Priya Menon", "Please forward this to Meera Nair before noon", "S. Nair joined at 09:30",
    "MOCKSAT-1 battery at 87%", "Zoë Müller approved", "Menon, Priya", "Aadhaar 2345 6789 0124", "a", "",
    "  spaces   and\ttabs ", "McDonald O'Brien", "INSAT-3D over Sriharikota", "RAKESH IYER", "x@y.co",
    "Operator: Dr. Anil Sharma", "T-00:12:45 elapsed", "aB1 Ab1 AB1 ab1 A", "Supercalifragilisticexpialidocious name",
]
CASES = [("Please ask Dr. Meera Nair now", {"Meera", "Nair"}), ("S. Nair joined at 09:30", {"S", ".", "Nair"}),
         ("Nair A. left", {"Nair", "A", "."}), ("Menon, Priya approved", {"Menon", ",", "Priya"}),
         ("no names here", set()), ("Rohan!", {"Rohan", "!"}), ("Thanks, Rohan and Divya.", {"Rohan", "Divya"})]

out = {"K": K, "NB": NB, "features": [], "decode": []}
for t in TEXTS:
    toks, ids, shapes = featurize(t)
    out["features"].append({"text": t, "ascii": t.isascii(), "tokens": [list(x) for x in toks],
                            "shapes": shapes, "ids": ids})
for t, marked in CASES:
    toks, _, _ = featurize(t)
    p = [0.9 if x[0] in marked else 0.1 for x in toks]
    out["decode"].append({"text": t, "p": p, "thr": 0.5, "spans": [list(s) for s in decode(toks, p, 0.5)]})

dest = Path(sys.argv[1] if len(sys.argv) > 1 else "../../extension/tests/fixtures/nameFeatures.golden.json")
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out))
print("wrote", dest)