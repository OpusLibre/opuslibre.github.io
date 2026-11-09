#!/usr/bin/env python3
"""
ABC (one voice per hand) -> MusicXML for Opus Libre.

The arrangement is written as a standard multi-voice ABC file:

    X:1
    T:Poco allegretto
    C:Johannes Brahms
    M:3/4
    L:1/8
    Q:"Poco allegretto"
    K:Cm
    V:RH clef=treble
    V:LH clef=bass
    [V:RH] !p!!1!C>!2!D | !3!E4 !5!G>!4!F | ...
    [V:LH] z2 | C,6 | ...

music21's ABC reader handles one voice and drops decorations, so this tool
splits the voices, records the decorations of each note event itself
(fingerings !1!..!5!, dynamics, staccato, accent, fermata, pedal), parses each
voice alone, re-attaches the decorations, and writes a single piano part with
two staves (or one staff when there is a single voice).

    .venv/bin/python tools/arrangement/abc_to_musicxml.py score.abc score.musicxml
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from music21 import articulations, converter, dynamics, expressions, instrument, layout, metadata, stream, tempo

DYNAMICS = {"ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "sfz", "sf", "fp"}
ARTICULATIONS = {"staccato": articulations.Staccato, ".": articulations.Staccato, ">": articulations.Accent, "accent": articulations.Accent, "tenuto": articulations.Tenuto}

# One note event: optional accidentals, a pitch letter or rest, octave marks, length, broken rhythm.
NOTE = re.compile(r"[_=^]*[A-Ga-gzx][,']*[0-9]*/*[0-9]*")


def split_voices(text: str) -> tuple[list[str], dict[str, list[str]], dict[str, str]]:
    """Header lines, body lines per voice id, clef per voice id."""
    header: list[str] = []
    bodies: dict[str, list[str]] = {}
    clefs: dict[str, str] = {}
    current: str | None = None
    for raw in text.splitlines():
        line = raw.split("%", 1)[0].rstrip() if not raw.startswith("%%") else ""
        if not line:
            continue
        m = re.match(r"^V:\s*(\S+)(.*)$", line)
        if m:
            vid = m.group(1)
            bodies.setdefault(vid, [])
            clef = re.search(r"clef=(\w+)", m.group(2))
            if clef:
                clefs[vid] = clef.group(1)
            current = vid
            continue
        m = re.match(r"^\[V:\s*(\S+?)\]\s*(.*)$", line)
        if m:
            current = m.group(1)
            bodies.setdefault(current, []).append(m.group(2))
            continue
        if re.match(r"^[A-Za-z]:", line) and not bodies:
            header.append(line)
            continue
        if current is None:
            current = "1"
            bodies.setdefault(current, [])
        bodies[current].append(line)
    return header, bodies, clefs


def scan_events(body: str) -> tuple[str, list[list[str]]]:
    """Removes !decorations! and returns the clean body plus the decorations of each note event, in order."""
    clean: list[str] = []
    events: list[list[str]] = []
    pending: list[str] = []
    i = 0
    while i < len(body):
        c = body[i]
        if c == "!":
            j = body.index("!", i + 1)
            pending.append(body[i + 1 : j])
            i = j + 1
            continue
        if c == '"':  # annotations / chord symbols: kept out of the score (use the header Q: for tempo text)
            j = body.index('"', i + 1)
            i = j + 1
            continue
        if c == "{":
            raise SystemExit("Les petites notes {…} ne sont pas prises en charge : écrivez-les en valeurs réelles.")
        if c == "[" and re.match(r"\[[A-Za-z]:", body[i:]):  # inline field
            j = body.index("]", i)
            clean.append(body[i : j + 1])
            i = j + 1
            continue
        if c == "[":  # chord = one event
            j = body.index("]", i)
            m = re.match(r"[0-9]*/*[0-9]*", body[j + 1 :])
            end = j + 1 + (m.end() if m else 0)
            clean.append(body[i:end])
            events.append(pending)
            pending = []
            i = end
            continue
        if c == "(" and i + 1 < len(body) and body[i + 1].isdigit():  # tuplet marker
            clean.append(body[i : i + 2])
            i += 2
            continue
        m = NOTE.match(body, i)
        if m and m.group(0):
            clean.append(m.group(0))
            events.append(pending)
            pending = []
            i = m.end()
            continue
        if c == "." and i + 1 < len(body) and NOTE.match(body, i + 1):
            pending.append("staccato")
            i += 1
            continue
        clean.append(c)
        i += 1
    return "".join(clean), events


def parse_voice(header: list[str], body: list[str]) -> tuple[stream.Part, list[list[str]]]:
    clean, events = scan_events(" ".join(body))
    abc = "\n".join(["X:1", *[h for h in header if not h.startswith(("X:", "T:", "C:", "Q:"))], clean]) + "\n"
    part = converter.parse(abc, format="abc").parts[0]
    count = len(list(part.recurse().notesAndRests))
    if count != len(events):
        raise SystemExit(f"Décompte des notes incohérent ({count} lues par music21, {len(events)} repérées) : vérifiez la syntaxe ABC.")
    return part, events


def decorate(part: stream.Part, events: list[list[str]]) -> None:
    for note, decos in zip(part.recurse().notesAndRests, events):
        fingers = [d for d in decos if d.isdigit()]
        for f in fingers:
            note.articulations.append(articulations.Fingering(int(f)))
        for d in decos:
            if d in DYNAMICS:
                note.activeSite.insert(note.offset, dynamics.Dynamic(d))
            elif d in ARTICULATIONS:
                note.articulations.append(ARTICULATIONS[d]())
            elif d == "fermata":
                note.expressions.append(expressions.Fermata())
            elif d in ("ped", "ped-up"):
                note.activeSite.insert(note.offset, expressions.TextExpression("Ped." if d == "ped" else "*"))
            elif d.isdigit():
                pass
            else:
                raise SystemExit(f"Décoration inconnue : !{d}!")


def build(path: Path) -> stream.Score:
    header, bodies, clefs = split_voices(path.read_text(encoding="utf-8"))
    field = lambda k: next((h[2:].strip() for h in header if h.startswith(k + ":")), "")
    score = stream.Score()
    score.metadata = metadata.Metadata(title=field("T"), composer=field("C"))
    staves = []
    for n, (vid, body) in enumerate(bodies.items()):
        part, events = parse_voice(header, body)
        decorate(part, events)
        staff = stream.PartStaff(id=vid) if len(bodies) > 1 else stream.Part(id=vid)
        for el in part:
            staff.append(el)
        if n == 0:
            staff.insert(0, instrument.Piano())
            q = field("Q").strip('"')
            if q:
                staff.measure(staff.getElementsByClass("Measure")[0].number).insert(0, tempo.MetronomeMark(text=q, placement="above"))
        clef = clefs.get(vid)
        if clef:
            from music21 import clef as clefs_mod
            first = staff.getElementsByClass("Measure")[0]
            for old in first.getElementsByClass("Clef"):
                first.remove(old)
            first.insert(0, clefs_mod.BassClef() if clef == "bass" else clefs_mod.TrebleClef())
        staves.append(staff)
        score.insert(0, staff)
    if len(staves) > 1:
        score.insert(0, layout.StaffGroup(staves, name="Piano", abbreviation="Pno.", symbol="brace"))
    lengths = {len(s.getElementsByClass("Measure")) for s in staves}
    if len(lengths) > 1:
        raise SystemExit(f"Les voix n'ont pas le même nombre de mesures : {[len(s.getElementsByClass('Measure')) for s in staves]}")
    return score


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    build(Path(sys.argv[1])).write("musicxml", fp=sys.argv[2])
    print(f"✓ {sys.argv[2]}")
