#!/usr/bin/env python3
"""
Checks an arrangement before it goes into the catalogue.

1. Difficulty, per hand, against the targets of its level (see LEVELS below and SKILL.md).
2. Harmony against a reference (the original or a public-domain reduction), beat by beat:
   every arrangement note whose pitch class does not sound in the reference during that
   beat is reported, and so is every beat where the bass differs.

    .venv/bin/python tools/arrangement/check.py score.musicxml --level debutant \
        [--reference original.musicxml --ref-scale 2 --ref-transpose 0 --ref-shift 0 --ref-parts "Violoncello,Viola"]

--ref-scale     multiply reference durations (2 when the original is in 3/8 and the arrangement in 3/4)
--ref-transpose semitones added to the reference (when the arrangement changes key)
--ref-shift     quarter notes to add to the reference offsets (to align the starts)
--ref-measures  only compare the first N measures of the arrangement

Exit code 1 when a hard limit of the level is exceeded.
"""
from __future__ import annotations

import argparse
import math
from collections import defaultdict

from music21 import converter, key as m21key, pitch as m21pitch, stream

LEVELS = {
    # hard limits (errors) and soft targets (warnings) per level
    "debutant": {"shortest": 0.5, "tuplets": 0, "notes_per_hand": 2, "span": 7, "hand_range": 16, "shifts_per_8": 2, "accidentals_per_8": 2},
    "intermediaire": {"shortest": 0.25, "tuplets": 4, "notes_per_hand": 3, "span": 12, "hand_range": 24, "shifts_per_8": 5, "accidentals_per_8": 6},
    "avance": {"shortest": 0.125, "tuplets": 999, "notes_per_hand": 4, "span": 14, "hand_range": 36, "shifts_per_8": 99, "accidentals_per_8": 99},
    "original": {"shortest": 0, "tuplets": 999, "notes_per_hand": 5, "span": 16, "hand_range": 60, "shifts_per_8": 999, "accidentals_per_8": 999},
}
NAMES_FR = {"C": "do", "D": "ré", "E": "mi", "F": "fa", "G": "sol", "A": "la", "B": "si"}


def fr(p: m21pitch.Pitch) -> str:
    acc = {"-": "♭", "#": "♯", "--": "𝄫", "##": "𝄪"}.get(p.accidental.modifier if p.accidental else "", "")
    if p.accidental and p.accidental.name == "natural":
        acc = "♮"
    return f"{NAMES_FR[p.step]}{acc}{p.octave}"


def events(s: stream.Stream, scale: float = 1, transpose: int = 0, shift: float = 0):
    """(start, end, pitch, staff index) for every sounding note, ties merged."""
    out = []
    for i, part in enumerate(s.parts):
        flat = part.stripTies().flatten()
        for n in flat.notes:
            for p in n.pitches:
                q = p.transpose(transpose) if transpose else p
                start = float(n.getOffsetInHierarchy(part)) * scale + shift
                out.append((start, start + float(n.quarterLength) * scale, q, i))
    return out


def difficulty(score: stream.Score, level: str) -> tuple[list[str], list[str]]:
    lim = LEVELS[level]
    errors, notes_ = [], []
    k = score.recurse().getElementsByClass(m21key.KeySignature).first()
    scale_pcs = {p.pitchClass for p in (k.asKey().getScale().getPitches() if k else [])}
    measures = max(1, len(score.parts[0].getElementsByClass("Measure")))
    per8 = 8 / measures
    for i, part in enumerate(score.parts):
        hand = "main droite" if i == 0 and len(score.parts) > 1 else ("main gauche" if i == 1 else "voix")
        flat = part.stripTies().flatten()
        notes = list(flat.notes)
        if not notes:
            continue
        pitches = [p for n in notes for p in n.pitches]
        lo, hi = min(pitches), max(pitches)
        shortest = min(float(n.quarterLength) for n in notes)
        tuplets = sum(1 for n in notes if n.duration.tuplets)
        by_offset = defaultdict(list)
        for n in notes:
            by_offset[float(n.offset)].extend(n.pitches)
        most = max(len(v) for v in by_offset.values())
        span = max(max(v).ps - min(v).ps for v in by_offset.values())
        accidentals = sum(1 for p in pitches if p.pitchClass not in scale_pcs) if scale_pcs else 0
        # Hand positions: a new position whenever the notes no longer fit in a window of a sixth.
        shifts, window = 0, None
        for v in by_offset.values():
            a, b = min(x.ps for x in v), max(x.ps for x in v)
            if window is None:
                window = [a, b]
            elif max(b, window[1]) - min(a, window[0]) > 9:
                shifts += 1
                window = [a, b]
            else:
                window = [min(a, window[0]), max(b, window[1])]
        fingered = sum(1 for n in notes if any(type(a).__name__ == "Fingering" for a in n.articulations))
        notes_.append(
            f"{hand} : {fr(lo)}–{fr(hi)} ({int(hi.ps - lo.ps)} demi-tons), plus courte valeur {shortest:g} noire, "
            f"{tuplets} note(s) en n-olet, jusqu'à {most} note(s) ensemble, écart max {int(span)} demi-tons, "
            f"{shifts} changement(s) de position, {accidentals} altération(s) accidentelle(s), doigtés sur {round(100 * fingered / len(notes))} % des notes"
        )
        checks = [
            (shortest < lim["shortest"], f"{hand} : valeur de {shortest:g} noire plus courte que la limite du niveau ({lim['shortest']:g})"),
            (tuplets > lim["tuplets"], f"{hand} : {tuplets} notes en n-olets (limite {lim['tuplets']})"),
            (most > lim["notes_per_hand"], f"{hand} : {most} notes simultanées (limite {lim['notes_per_hand']})"),
            (span > lim["span"], f"{hand} : écart de {int(span)} demi-tons dans un accord (limite {lim['span']})"),
            (hi.ps - lo.ps > lim["hand_range"], f"{hand} : tessiture de {int(hi.ps - lo.ps)} demi-tons (limite {lim['hand_range']})"),
            (shifts * per8 > lim["shifts_per_8"], f"{hand} : {shifts} changements de position, soit {shifts * per8:.1f} pour 8 mesures (limite {lim['shifts_per_8']})"),
            (accidentals * per8 > lim["accidentals_per_8"], f"{hand} : {accidentals} altérations accidentelles, soit {accidentals * per8:.1f} pour 8 mesures (limite {lim['accidentals_per_8']})"),
        ]
        errors += [msg for bad, msg in checks if bad]
    return errors, notes_


def measure_label(score: stream.Score, offset: float) -> str:
    for meas in score.parts[0].getElementsByClass("Measure"):
        if meas.offset <= offset < meas.offset + float(meas.duration.quarterLength):
            return f"mes. {meas.number}, temps {math.floor(offset - meas.offset + meas.paddingLeft) + 1}"
    return f"offset {offset:g}"


def harmony(score: stream.Score, reference: stream.Score, scale: float, transpose: int, shift: float, max_measures: int | None) -> list[str]:
    arr = events(score)
    ref = events(reference, scale, transpose, shift)
    end = max(e[1] for e in arr)
    if max_measures:
        ms = score.parts[0].getElementsByClass("Measure")
        if len(ms) > max_measures:
            end = float(ms[max_measures].offset)
    report = []
    t = 0.0
    while t < end:
        win = (t, t + 1)
        a = [e for e in arr if e[0] < win[1] and e[1] > win[0]]
        r = [e for e in ref if e[0] < win[1] and e[1] > win[0]]
        if a and r:
            ref_pcs = {e[2].pitchClass for e in r}
            foreign = sorted({fr(e[2]) for e in a if e[2].pitchClass not in ref_pcs and e[0] >= win[0]})
            if foreign:
                report.append(f"{measure_label(score, t)} : {', '.join(foreign)} absent(s) de l'original ici (original : {', '.join(sorted({NAMES_FR[e[2].step] + ('♭' if e[2].accidental and e[2].accidental.modifier == '-' else '♯' if e[2].accidental and e[2].accidental.modifier == '#' else '') for e in r}))})")
            a_on = [e for e in a if e[0] <= t < e[1]]
            r_on = [e for e in r if e[0] <= t < e[1]]
            if a_on and r_on:
                ab, rb = min(e[2].ps for e in a_on), min(e[2].ps for e in r_on)
                if int(ab) % 12 != int(rb) % 12:
                    pa = min((e[2] for e in a_on), key=lambda p: p.ps)
                    pr = min((e[2] for e in r_on), key=lambda p: p.ps)
                    report.append(f"{measure_label(score, t)} : basse {fr(pa)}, l'original a {fr(pr)} (renversement ou erreur ?)")
        t += 1
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("score")
    ap.add_argument("--level", required=True, choices=LEVELS)
    ap.add_argument("--reference")
    ap.add_argument("--ref-scale", type=float, default=1)
    ap.add_argument("--ref-transpose", type=int, default=0)
    ap.add_argument("--ref-shift", type=float, default=0)
    ap.add_argument("--ref-parts", help="comma-separated part names to keep from the reference")
    ap.add_argument("--ref-measures", type=int)
    args = ap.parse_args()

    score = converter.parse(args.score)
    errors, info = difficulty(score, args.level)
    print(f"== Difficulté (niveau {args.level})")
    for line in info:
        print(f"  {line}")
    for e in errors:
        print(f"  ✗ {e}")
    if not errors:
        print("  ✓ dans les limites du niveau")

    if args.reference:
        ref = converter.parse(args.reference)
        if args.ref_parts:
            keep = [x.strip().lower() for x in args.ref_parts.split(",")]
            r2 = stream.Score()
            for p in ref.parts:
                if any(k in (p.partName or "").lower() for k in keep):
                    r2.insert(0, p)
            ref = r2
        print("\n== Harmonie comparée à la référence")
        lines = harmony(score, ref, args.ref_scale, args.ref_transpose, args.ref_shift, args.ref_measures)
        for line in lines:
            print(f"  • {line}")
        if not lines:
            print("  ✓ aucune note étrangère, basses identiques")
    raise SystemExit(1 if errors else 0)


if __name__ == "__main__":
    main()
