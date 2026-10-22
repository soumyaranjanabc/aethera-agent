#!/usr/bin/env python3
"""Synthetic corpus. Names are split by hash into train/val/test. test_ood also uses templates
the model never saw. Everything here is fake."""
import argparse
import json
import random
import re
import string
from pathlib import Path

from common import fnv1a
from names import FIRST, INTL_FIRST, INTL_LAST, LAST

PLACES = ["Sriharikota", "Bengaluru", "Chennai", "Lucknow", "Port Blair", "Thiruvananthapuram", "Ahmedabad",
          "Hyderabad", "Mahendragiri", "Delhi", "Mumbai", "Kolkata", "Pune", "Dehradun", "Shillong"]
SATS = ["INSAT-3D", "GSAT-30", "Cartosat-3", "Oceansat-3", "RISAT-2B", "Chandrayaan-3", "Aditya-L1",
        "Mangalyaan", "MOCKSAT-1", "DEMOSAT-3", "NavIC-1", "Astrosat"]
ROLES = ["Flight Director", "Mission Operator", "Telemetry Engineer", "Ground Station Lead", "Orbit Analyst",
         "Payload Scientist", "Project Manager"]

TRAIN_T = [
    "Name: {N}", "Operator: {N}", "Officer: {N}", "Duty officer: {N}", "Prepared by: {N}", "Acknowledged by {N}",
    "Approved by {N} on {D}", "Reported by {N}", "Assigned to {N}", "Contact {N} at the ground station",
    "{N} spoke to {N2} about the downlink margin", "{N} and {N2} will handle the handover", "Dr. {N} reviewed the orbit plan",
    "Mr. {N} joined the call", "Shri {N} approved the launch window", "Smt. {N} is the mission director",
    "Hello {N}, your report is ready", "Thanks {N}!", "User {N} logged in from SHAR", "Ticket raised by {N} for {SAT}",
    "{N} ({ROLE})", "{N} - {ROLE}", "Escalate to {N} if the alarm persists", "Handover from {N} to {N2} at {T}",
    "Sent to {N}", "Reviewed by {N} and approved", "Welcome back, {N}", "Last edited by {N} yesterday", "Owner: {N}",
    "Lead: {N}", "Requested by {N}", "Meeting with {N} at {T} IST", "The pass over {PLACE} was monitored by {N}",
    "{N} confirmed {SAT} battery at {n}%",
]
TEST_T = [
    "According to {N}, the burn was successful", "Please forward this to {N} before noon",
    "I asked {N} whether the panel temperature was within limits", "Signed off: {N}, {ROLE}", "{N}'s shift ends at {T}",
    "cc: {N}, {N2}", "Thanks to {N} for the quick fix", "Observer - {N}", "Briefing led by {N}.",
    "Was it {N} who changed the setpoint?", "Anomaly noted by {N} during the {T} pass", "Interview panel: {N} and {N2}",
]
CLEAN_TRAIN = [
    "Bus voltage {x} V nominal", "Satellite pass over {PLACE} in {n} minutes", "{SAT} battery at {n}%",
    "Downlink rate {x} Mbps on {SAT}", "Ground station {PLACE} reachable", "Launch window opens {D} at {T} IST",
    "Click Export to download the telemetry log", "Mission clock T-{T} elapsed", "Orbit period {x} minutes",
    "Total downlink {x} GB over {n} passes", "Software version 2.4.1 build {n}", "Telemetry packets received: {n}",
    "{SAT} entered eclipse at {T}", "Status: NOMINAL", "Role: {ROLE}", "Station: {PLACE}",
    "Subsystem EPS reported WARN", "Operator console ready", "Sign in to continue", "Overview Telemetry Operators Alerts",
    "Name Role Status Updated", "Enter your username and password", "Duty Officer Roster",
    "Satish Dhawan Space Centre, {PLACE}", "Flight Director and Mission Operator roles are assigned",
    "Thermal panel temperature {x} C on {SAT}", "Mission Control handover at {T}", "Acknowledge all alerts",
    "Search telemetry", "Next pass over {PLACE} at {T} UTC",
]
CLEAN_TEST = [
    "Altitude {n} km, inclination {x} deg for {SAT}", "The {SAT} payload entered safe mode at {T}",
    "Please review the {ROLE} checklist before {D}", "Vikram Sarabhai Space Centre reported nominal telemetry",
    "Handover to the Ground Station team in {PLACE} is pending", "Export completed: {n} rows written",
    "Select a subsystem to filter the table", "Battery, Solar, and Thermal panels are green",
    "Alert history for {SAT} since {D}", "Mission Director's briefing room is booked until {T}",
    "Wheel speed {n} rpm, pointing error {x} deg", "Forgot password? Contact your station administrator",
    "Last pass over {PLACE} lasted {n} seconds", "The Operators tab lists {n} entries",
]


def name_split(n):
    r = fnv1a(n) % 5
    return "test" if r == 0 else "val" if r == 1 else "train"


def pools():
    P = {s: ([], []) for s in ("train", "val", "test")}
    for n in sorted(set(FIRST + INTL_FIRST)):
        P[name_split(n)][0].append(n)
    for n in sorted(set(LAST + INTL_LAST)):
        P[name_split(n)][1].append(n)
    return P


POOLS = pools()
ONS = ["k", "r", "m", "s", "n", "v", "d", "p", "t", "b", "j", "l", "sh", "ch", "g", "h"]
VOW = ["a", "aa", "e", "i", "o", "u", "ai"]
END = ["n", "l", "sh", "v", "t", "ya", "ni", "ta", "ri", "ka", "dha", "m", "k"]


class Sampler:
    def __init__(self, rng, split, synth=0.0):
        self.rng, self.synth = rng, synth
        self.first, self.last = POOLS[split]

    def _syll(self):
        r = self.rng
        s = "".join(r.choice(ONS) + r.choice(VOW) for _ in range(r.choice((1, 2))))
        return (s + r.choice(END)).capitalize()

    def part(self, pool):
        if self.synth and self.rng.random() < self.synth:
            for _ in range(20):
                n = self._syll()
                if name_split(n) == "train":
                    return n
        return self.rng.choice(pool)

    def render(self):
        r, f, l = self.rng.random(), self.part(self.first), self.part(self.last)
        if r < .52:
            return f"{f} {l}"
        if r < .67:
            return f
        if r < .72:
            return l
        if r < .82:
            return f"{f[0]}. {l}"
        if r < .90:
            return f"{f} {self.rng.choice(string.ascii_uppercase)}. {l}"
        if r < .95:
            return f"{f} {l}".upper()
        return f"{l}, {f}"


def lit(key, rng):
    if key == "PLACE": return rng.choice(PLACES)
    if key == "SAT": return rng.choice(SATS)
    if key == "ROLE": return rng.choice(ROLES)
    if key == "n": return str(rng.randint(2, 9999))
    if key == "x": return f"{rng.uniform(0.1, 60):.2f}"
    if key == "T": return f"{rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}"
    if key == "D": return f"2026-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"
    raise KeyError(key)


def fill(tpl, rng, sampler):
    text, spans = "", []
    for part in re.split(r"(\{[A-Za-z0-9]+\})", tpl):
        if part.startswith("{"):
            key = part[1:-1]
            if key.startswith("N"):
                s = sampler.render()
                spans.append((len(text), len(text) + len(s)))
                text += s
            else:
                text += lit(key, rng)
        else:
            text += part
    return text, spans


def make_example(rng, sampler, pos_t, clean_t, p_pos=0.6):
    if rng.random() >= p_pos:
        return {"text": fill(rng.choice(clean_t), rng, sampler)[0], "spans": [], "clean": True}
    text, spans = fill(rng.choice(pos_t), rng, sampler)
    r = rng.random()
    if r < 0.2:
        pre = fill(rng.choice(clean_t), rng, sampler)[0] + ". "
        text, spans = pre + text, [(a + len(pre), b + len(pre)) for a, b in spans]
    elif r < 0.4:
        text += ". " + fill(rng.choice(clean_t), rng, sampler)[0]
    return {"text": text, "spans": [list(s) for s in spans], "clean": False}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data")
    ap.add_argument("--n-train", type=int, default=40000)
    ap.add_argument("--n-val", type=int, default=3000)
    ap.add_argument("--n-test", type=int, default=1500)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(exist_ok=True)
    sets = {  # name: (seed, name split, synthetic-name rate, positive templates, clean templates, size)
        "train": (1, "train", 0.15, TRAIN_T, CLEAN_TRAIN, a.n_train),
        "val": (2, "val", 0.0, TRAIN_T, CLEAN_TRAIN, a.n_val),
        "test_iid": (3, "test", 0.0, TRAIN_T, CLEAN_TRAIN, a.n_test),
        "test_ood": (4, "test", 0.0, TEST_T, CLEAN_TEST, a.n_test),
    }
    for name, (seed, split, synth, pos_t, clean_t, n) in sets.items():
        rng = random.Random(seed)
        sam = Sampler(rng, split, synth)
        with open(out / f"{name}.jsonl", "w") as f:
            for _ in range(n):
                f.write(json.dumps(make_example(rng, sam, pos_t, clean_t)) + "\n")
        print(f"{name}: {n} examples")
    print({s: (len(f), len(l)) for s, (f, l) in POOLS.items()}, "(first, last) names per split")


if __name__ == "__main__":
    main()