"""Shared feature code. TS twin: extension/src/sanitizer/nameFeatures.ts.
tests/fixtures/nameFeatures.golden.json (made by gen_golden.py) keeps the two identical."""
import re

NB = 32768          # hash buckets; id 0 is padding
K = 20              # feature slots per token
PAD, LOWER, CAP, UPPER, DIGIT, MIXED, PUNCT = 0, 1, 2, 3, 4, 5, 6
TOKEN_RE = re.compile(r"[A-Za-z0-9]+|[^\sA-Za-z0-9]")


def tokenize(text):
    return [(m.group(), m.start(), m.end()) for m in TOKEN_RE.finditer(text)]


def fnv1a(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def bucket(s):
    return 1 + fnv1a(s) % (NB - 1)


def shape_of(w):
    if not re.fullmatch(r"[A-Za-z0-9]+", w):
        return PUNCT
    if re.fullmatch(r"[0-9]+", w):
        return DIGIT
    if re.fullmatch(r"[A-Z][a-z0-9]*", w):
        return CAP
    if re.fullmatch(r"[A-Z0-9]+", w):
        return UPPER
    if re.fullmatch(r"[a-z0-9]+", w):
        return LOWER
    return MIXED


def token_ids(w):
    lw = w.lower()
    if shape_of(w) == PUNCT:
        feats = ["w:" + lw]
    else:
        p = "<" + lw + ">"
        feats = ["w:" + lw] + ["g:" + p[i:i + n] for n in (3, 4, 2) for i in range(len(p) - n + 1)]
    ids = [bucket(f) for f in feats][:K]
    return ids + [0] * (K - len(ids))


def featurize(text):
    toks = tokenize(text)
    return toks, [token_ids(t[0]) for t in toks], [shape_of(t[0]) for t in toks]


def decode(tokens, p, thr=0.5):
    """Merge runs of NAME tokens into (start, end) char spans; trim punctuation at the ends."""
    spans, i = [], 0
    while i < len(tokens):
        if p[i] < thr:
            i += 1
            continue
        j = i
        while j + 1 < len(tokens) and p[j + 1] >= thr:
            j += 1
        a, b = i, j
        while a <= b and shape_of(tokens[a][0]) == PUNCT:
            a += 1
        while b >= a and shape_of(tokens[b][0]) == PUNCT:
            b -= 1
        if a <= b:
            spans.append((tokens[a][1], tokens[b][2]))
        i = j + 1
    return spans


def score(examples, preds, cover=0.9):
    """recall = gold names with >=90% of their characters covered (a partial mask is a leak).
    precision = predicted spans overlapping a gold name. clean_fp = clean sentences with any prediction."""
    gold = hit = pn = pok = clean = fp = 0
    for ex, ps in zip(examples, preds):
        gs = [tuple(s) for s in ex["spans"]]
        for g in gs:
            gold += 1
            cov = sum(max(0, min(g[1], p[1]) - max(g[0], p[0])) for p in ps)
            hit += cov >= cover * (g[1] - g[0])
        for p in ps:
            pn += 1
            pok += any(min(g[1], p[1]) > max(g[0], p[0]) for g in gs)
        if not gs:
            clean += 1
            fp += bool(ps)
    return {"recall": hit / max(gold, 1), "precision": pok / max(pn, 1),
            "clean_fp": fp / max(clean, 1), "n_gold": gold, "n_clean": clean}