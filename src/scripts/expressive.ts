/**
 * Expressive playback: turns the flat Verovio MIDI (every note at velocity 90,
 * no pedal) into a performance.
 *
 * - Dynamics: `<dynam val>` of the MEI (MIDI velocity written by the MusicXML
 *   import) and `<hairpin>` ramps, placed in time with the Verovio timemap.
 * - Voicing: the top note of a right-hand chord is brought out, inner and
 *   left-hand notes are softer; a little velocity jitter.
 * - Pedal: an automatic "harmonic" pedal, changed at each new bass note of the
 *   left hand: notes ring until the next change (the scores carry no pedal marks).
 *
 * Samples: Salamander Grand Piano V3 (Alexander Holm, CC BY 3.0), 3 velocity
 * layers, one sample every minor third, mono 24 kHz, served by the site
 * (public/audio/salamander/). Only the samples a score needs are loaded.
 */
import type { Midi } from "@tonejs/midi";

export const SAMPLE_BASE = "/audio/salamander/";
export const LAYERS = [5, 10, 15] as const;
const SAMPLE_NOTES = ["A0", "C1", "D#1", "F#1", "A1", "C2", "D#2", "F#2", "A2", "C3", "D#3", "F#3", "A3", "C4", "D#4", "F#4", "A4", "C5", "D#5", "F#5", "A5", "C6", "D#6", "F#6", "A6", "C7", "D#7", "F#7", "A7", "C8"];
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiOf = (name: string): number => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name)!;
  return NAMES.indexOf(m[1]!) + 12 * (Number(m[2]) + 1);
};
const SAMPLE_MIDI = SAMPLE_NOTES.map(midiOf);

export interface PerformedNote {
  name: string;
  midi: number;
  time: number;
  duration: number;
  /** 0–127 */
  velocity: number;
  track: number;
}

type TimemapEntry = { tstamp: number; qstamp: number; measureOn?: string };
type Toolkit = { renderToTimemap(options?: object): TimemapEntry[] };

/** Velocity layer (index in LAYERS) for a MIDI velocity. */
export function layerOf(velocity: number): number {
  return velocity < 52 ? 0 : velocity < 82 ? 1 : 2;
}

/** Sample note (key of the sampler) closest to a MIDI pitch. */
export function nearestSample(midi: number): string {
  let best = 0;
  for (let i = 1; i < SAMPLE_MIDI.length; i += 1) if (Math.abs(SAMPLE_MIDI[i]! - midi) < Math.abs(SAMPLE_MIDI[best]! - midi)) best = i;
  return SAMPLE_NOTES[best]!;
}

/** Sampler urls (per layer) restricted to the samples these notes need. */
export function samplerUrls(notes: PerformedNote[]): Record<string, string>[] {
  const needed = LAYERS.map(() => new Set<string>());
  for (const n of notes) needed[layerOf(n.velocity)]!.add(nearestSample(n.midi));
  return LAYERS.map((v, i) => Object.fromEntries([...needed[i]!].map((s) => [s, `${s.replace("#", "s")}v${v}.wav`])));
}

type Mark = { ms: number; vel: number };
type Ramp = { from: number; to: number; dir: 1 | -1 };

/** Dynamic marks and hairpins per staff, in milliseconds. */
function dynamics(mei: string, tk: Toolkit): { marks: Map<number, Mark[]>; ramps: Map<number, Ramp[]> } {
  const marks = new Map<number, Mark[]>();
  const ramps = new Map<number, Ramp[]>();
  const map = tk.renderToTimemap({ includeMeasures: true });
  const measureQ = new Map<string, number>();
  for (const e of map) if (e.measureOn) measureQ.set(e.measureOn, e.qstamp);
  const points = map.map((e) => [e.qstamp, e.tstamp] as const).sort((a, b) => a[0] - b[0]);
  const msAt = (q: number): number => {
    if (points.length === 0) return 0;
    if (q <= points[0]![0]) return points[0]![1];
    for (let i = 1; i < points.length; i += 1) {
      const [q1, t1] = points[i]!;
      const [q0, t0] = points[i - 1]!;
      if (q <= q1) return q1 === q0 ? t1 : t0 + ((q - q0) / (q1 - q0)) * (t1 - t0);
    }
    const [qa, ta] = points[points.length - 2] ?? points[0]!;
    const [qb, tb] = points[points.length - 1]!;
    return qb === qa ? tb : tb + ((q - qb) / (qb - qa)) * (tb - ta);
  };
  const doc = new DOMParser().parseFromString(mei, "application/xml");
  const measures = Array.from(doc.getElementsByTagName("measure"));
  const unitBefore = (el: Element): number => {
    // Last meter unit declared before this element (scoreDef/staffDef/meterSig), 4 by default.
    let unit = 4;
    const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT);
    for (let n = walker.currentNode as Element | null; n && n !== el; n = walker.nextNode() as Element | null) {
      const u = n.getAttribute("meter.unit") ?? (n.localName === "meterSig" ? n.getAttribute("unit") : null);
      if (u) unit = Number(u) || unit;
    }
    return unit;
  };
  const units = new Map<Element, number>();
  let unit = 4;
  let lastScanned: Element | undefined;
  for (const m of measures) {
    // Meter changes are rare: rescan only when a scoreDef sits between measures.
    const prev = m.previousElementSibling;
    if (lastScanned === undefined || (prev && prev.localName === "scoreDef")) unit = unitBefore(m);
    units.set(m, unit);
    lastScanned = m;
  }
  const qOf = (m: Element, tstamp: string | null): number | undefined => {
    const id = m.getAttribute("xml:id");
    const start = id ? measureQ.get(id) : undefined;
    if (start === undefined) return undefined;
    const beat = Number(tstamp ?? "1");
    return start + (Number.isFinite(beat) ? beat - 1 : 0) * (4 / (units.get(m) ?? 4));
  };
  measures.forEach((m, index) => {
    for (const d of Array.from(m.getElementsByTagName("dynam"))) {
      const val = Number(d.getAttribute("val"));
      const q = qOf(m, d.getAttribute("tstamp"));
      if (!Number.isFinite(val) || val <= 0 || q === undefined) continue;
      for (const s of (d.getAttribute("staff") ?? "1").split(/\s+/)) {
        const staff = Number(s);
        marks.set(staff, [...(marks.get(staff) ?? []), { ms: msAt(q), vel: val }]);
      }
    }
    for (const h of Array.from(m.getElementsByTagName("hairpin"))) {
      const q0 = qOf(m, h.getAttribute("tstamp"));
      const end = /^(\d+)m\+([\d.]+)$/.exec(h.getAttribute("tstamp2") ?? "");
      if (q0 === undefined || !end) continue;
      const target = measures[index + Number(end[1])];
      const q1 = target ? qOf(target, end[2]!) : undefined;
      if (q1 === undefined || q1 <= q0) continue;
      const dir = h.getAttribute("form") === "dim" ? -1 : 1;
      for (const s of (h.getAttribute("staff") ?? "1").split(/\s+/)) {
        const staff = Number(s);
        ramps.set(staff, [...(ramps.get(staff) ?? []), { from: msAt(q0), to: msAt(q1), dir }]);
      }
    }
  });
  for (const list of marks.values()) list.sort((a, b) => a.ms - b.ms);
  return { marks, ramps };
}

/** Builds the performance of a Verovio MIDI from its MEI. */
export function perform(midi: Midi, mei: string, tk: Toolkit): PerformedNote[] {
  const { marks, ramps } = dynamics(mei, tk);
  const all = [...marks.values()].flat().sort((a, b) => a.ms - b.ms);
  const levelAt = (staff: number, ms: number): number => {
    const list = marks.get(staff)?.length ? marks.get(staff)! : all;
    let vel = 64;
    let next: Mark | undefined;
    for (const m of list) {
      if (m.ms <= ms + 1) vel = m.vel;
      else { next = m; break; }
    }
    for (const r of ramps.get(staff) ?? ramps.get(1) ?? []) {
      if (ms > r.from && ms < r.to) {
        const goal = next && next.ms >= r.to - 50 && Math.sign(next.vel - vel) === r.dir ? next.vel : vel + 18 * r.dir;
        return vel + ((ms - r.from) / (r.to - r.from)) * (goal - vel);
      }
    }
    return vel;
  };

  const notes: PerformedNote[] = [];
  midi.tracks.forEach((track, i) => {
    const byOnset = new Map<number, typeof track.notes>();
    for (const n of track.notes) {
      const key = Math.round(n.time * 100);
      byOnset.set(key, [...(byOnset.get(key) ?? []), n]);
    }
    for (const chord of byOnset.values()) {
      const top = Math.max(...chord.map((n) => n.midi));
      const bottom = Math.min(...chord.map((n) => n.midi));
      for (const n of chord) {
        let v = levelAt(i + 1, n.time * 1000);
        if (i === 0) v += n.midi === top ? 8 : -6;
        else v += n.midi === bottom ? -2 : -10;
        v += (Math.random() - 0.5) * 6;
        notes.push({ name: n.name, midi: n.midi, time: n.time, duration: n.duration, velocity: Math.max(12, Math.min(124, Math.round(v))), track: i });
      }
    }
  });

  // Automatic pedal: a new pedal at each change of the lowest left-hand note.
  const left = midi.tracks[1]?.notes ?? [];
  const onsets = new Map<number, number>();
  for (const n of left) {
    const key = Math.round(n.time * 100);
    onsets.set(key, Math.min(onsets.get(key) ?? 999, n.midi));
  }
  const changes: number[] = [];
  let bass = -1;
  let last = -10;
  for (const [key, low] of [...onsets.entries()].sort((a, b) => a[0] - b[0])) {
    const t = key / 100;
    if (low !== bass || t - last > 2) changes.push(t);
    bass = low;
    last = t;
  }
  changes.push(midi.duration + 1);
  for (const n of notes) {
    const next = changes.find((t) => t > n.time + 0.02);
    if (next === undefined) continue;
    const pedalled = next - n.time - 0.04;
    if (pedalled > n.duration) n.duration = Math.min(pedalled, n.duration + 3);
  }
  return notes;
}
