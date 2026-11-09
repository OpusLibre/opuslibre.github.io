#!/usr/bin/env node
/**
 * Writes the two test scores of the prototype as MusicXML:
 * - Bach, Prelude in C major BWV 846, bars 1–8 (piano, two staves, two voices in the left hand);
 * - « Au clair de la lune » (traditional, voice with lyrics) — the "not only piano" safeguard.
 * Both works are in the public domain; these transcriptions are the project's own (CC0).
 *
 *   node scripts/sample-scores.mjs
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const DIV = 4; // divisions per quarter note: a sixteenth = 1

const STEP_ALTER = /^([A-G])(#|b)?(\d)$/;
function pitch(name) {
  const [, step, acc, octave] = STEP_ALTER.exec(name);
  return `<pitch><step>${step}</step>${acc ? `<alter>${acc === "#" ? 1 : -1}</alter>` : ""}<octave>${octave}</octave></pitch>`;
}
const TYPES = { 1: "16th", 2: "eighth", 3: "eighth", 4: "quarter", 8: "half", 12: "half", 16: "whole" };
function note(p, dur, o = {}) {
  const dot = dur === 3 || dur === 12 ? "<dot/>" : "";
  const tie = o.tie ? `<tie type="${o.tie}"/>` : "";
  const tied = o.tie ? `<notations><tied type="${o.tie}"/></notations>` : "";
  const lyric = o.lyric ? `<lyric number="1"><syllabic>${o.lyric[1]}</syllabic><text>${o.lyric[0]}</text></lyric>` : "";
  return `<note>${p === null ? "<rest/>" : pitch(p)}<duration>${dur}</duration>${tie}<voice>${o.voice ?? 1}</voice><type>${TYPES[dur]}</type>${dot}${o.staff ? `<staff>${o.staff}</staff>` : ""}${tied}${lyric}</note>`;
}
const header = (title, composer, parts) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <identification><creator type="composer">${composer}</creator><rights>CC0 1.0 — transcription Opus Libre</rights></identification>
  <part-list>${parts}</part-list>`;

// ---------- Bach BWV 846, bars 1–8 ----------
const CHORDS = [
  ["C4", "E4", "G4", "C5", "E5"], ["C4", "D4", "A4", "D5", "F5"], ["B3", "D4", "G4", "D5", "F5"], ["C4", "E4", "G4", "C5", "E5"],
  ["C4", "E4", "A4", "E5", "A5"], ["C4", "D4", "F#4", "A4", "D5"], ["B3", "D4", "G4", "D5", "G5"], ["B3", "C4", "E4", "G4", "C5"],
];
const bachMeasures = CHORDS.map(([n1, n2, n3, n4, n5], i) => {
  const half = () => [note(null, 2, { staff: 1 }), ...[n3, n4, n5, n3, n4, n5].map((n) => note(n, 1, { staff: 1 }))].join("");
  const lhV1 = () => note(n1, 8, { staff: 2, voice: 5 });
  const lhV2 = () => [note(null, 1, { staff: 2, voice: 6 }), note(n2, 3, { staff: 2, voice: 6, tie: "start" }), note(n2, 4, { staff: 2, voice: 6, tie: "stop" })].join("");
  const attrs = i === 0
    ? `<attributes><divisions>${DIV}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction placement="above"><direction-type><words>Moderato</words></direction-type><sound tempo="72"/></direction>`
    : "";
  return `<measure number="${i + 1}">${attrs}${half()}${half()}<backup><duration>16</duration></backup>${lhV1()}${lhV1()}<backup><duration>16</duration></backup>${lhV2()}${lhV2()}</measure>`;
});
const bach = `${header("Prélude en ut majeur, BWV 846 (mesures 1–8)", "Johann Sebastian Bach", `<score-part id="P1"><part-name>Piano</part-name><score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-program>1</midi-program></midi-instrument></score-part>`)}
  <part id="P1">${bachMeasures.join("")}</part>
</score-partwise>
`;

// ---------- Au clair de la lune ----------
const tune = [
  [["C4", 4, ["Au", "single"]], ["C4", 4, ["clair", "single"]], ["C4", 4, ["de", "single"]], ["D4", 4, ["la", "single"]]],
  [["E4", 8, ["lu", "begin"]], ["D4", 8, ["ne,", "end"]]],
  [["C4", 4, ["mon", "single"]], ["E4", 4, ["a", "begin"]], ["D4", 4, ["mi", "end"]], ["D4", 4, ["Pier", "begin"]]],
  [["C4", 16, ["rot", "end"]]],
];
const lune = `${header("Au clair de la lune", "Traditionnel", `<score-part id="P1"><part-name>Voix</part-name><score-instrument id="P1-I1"><instrument-name>Voix</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-program>53</midi-program></midi-instrument></score-part>`)}
  <part id="P1">${tune
    .map((m, i) => `<measure number="${i + 1}">${i === 0 ? `<attributes><divisions>${DIV}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><words>Allegretto</words></direction-type><sound tempo="96"/></direction>` : ""}${m.map(([p, d, l]) => note(p, d, { lyric: l })).join("")}${i === tune.length - 1 ? '<barline location="right"><bar-style>light-heavy</bar-style></barline>' : ""}</measure>`)
    .join("")}</part>
</score-partwise>
`;

await writeFile(path.join(root, "contenus/partitions/bach-bwv-846-preludio/score.musicxml"), bach);
await writeFile(path.join(root, "contenus/partitions/au-clair-de-la-lune/score.musicxml"), lune);
console.log("Partitions écrites.");
