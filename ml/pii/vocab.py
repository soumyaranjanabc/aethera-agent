"""Common-English word list, used so the model can't treat 'unfamiliar capitalized word' as 'name'."""
import json
from pathlib import Path

from names import FIRST, INTL_FIRST, INTL_LAST, LAST

FALLBACK = """alert altitude handover payload battery solar thermal telemetry status overview summary report history
settings profile account dashboard console network signal antenna receiver orbit launch mission control station ground
command uplink downlink spectrum frequency bandwidth latency throughput capacity inventory schedule calendar archive
download upload export import filter search select confirm cancel submit review approve reject pending complete active
inactive online offline warning critical nominal normal standby backup restore update upgrade install version release
build deploy monitor diagnostics events notifications messages inbox drafts tasks projects documents files folders
images videos charts tables graphs metrics analytics performance security privacy access permissions policies
compliance audit budget invoice payment orders shipments customers suppliers vendors products services support help
contact feedback training tutorial guide reference glossary index contents introduction conclusion appendix section
chapter figure pressure temperature voltage current power energy torque velocity acceleration gravity radiation magnetic
thruster propellant fuel valve sensor actuator gyroscope wheel camera lens mirror detector panel array charger
regulator converter harness connector radiator heater cooler pump reservoir capacitor circuit processor memory storage
firmware software hardware driver kernel buffer packet frame header footer sidebar toolbar menu button dropdown
checkbox slider toggle tooltip dialog modal banner badge label caption title paragraph window browser session cache
server client gateway router firewall proxy cluster node instance container volume snapshot replica queue stream
channel thread process daemon planner optimizer simulator validator parser compiler""".split()


def load_vocab(cache="data/vocab.json"):
    p = Path(cache)
    if p.exists():
        return json.loads(p.read_text())
    words, source = None, "brown corpus"
    try:
        import collections

        import nltk
        nltk.download("brown", quiet=True)
        from nltk.corpus import brown
        cnt, proper = collections.Counter(), set()
        for w, t in brown.tagged_words():
            base = t.split("-")[0].split("+")[0]
            lw = w.lower()
            if base.startswith("NP"):
                proper.add(lw)                      # anything ever tagged as a proper noun is excluded
            elif base in ("NN", "NNS", "JJ", "VB", "VBG", "VBN", "VBD") and w.isalpha() and w.islower():
                cnt[lw] += 1
        bad = {n.lower() for n in FIRST + LAST + INTL_FIRST + INTL_LAST}
        words = sorted(w for w, c in cnt.items() if c >= 4 and 3 <= len(w) <= 14 and w not in proper and w not in bad)
    except Exception as e:
        print("nltk unavailable:", e)
    if not words or len(words) < 500:
        words, source = sorted(set(FALLBACK)), "FALLBACK list (small, weaker fix)"
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(words))
    print(f"vocab: {len(words)} words from {source}")
    return words