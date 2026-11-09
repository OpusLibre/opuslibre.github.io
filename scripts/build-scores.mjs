#!/usr/bin/env node
/**
 * Score pipeline (build time). For every contenus/partitions/<slug>/:
 *   score.musicxml ──Verovio──▶ score.mei (stable element ids)
 *                              ├─▶ score.pdf (A4, same engraving as the screen)
 *                              ├─▶ score.mid (one track per staff)
 *                              └─▶ anchors.json (musical address → element ids)
 *   annotations.json ──anchors──▶ annotations.resolved.json (ids ready for the browser)
 *
 * Generated files go to build/files/p/<slug>/<key>/ where <key> = hash(source + annotations
 * + pipeline version): immutable, so they can be cached forever and uploaded to R2 once.
 * src/generated/scores.json tells the site where each score's files are.
 *
 * A broken annotation anchor fails the build (see the architecture doc, « Ancrage des annotations »).
 */
import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import path from "node:path";

const PIPELINE_VERSION = "2";
const root = path.resolve(import.meta.dirname, "..");
const scoresDir = path.join(root, "contenus/partitions");
const outFiles = path.join(root, "build/files");
const outManifest = path.join(root, "src/generated/scores.json");
const outPreviews = path.join(root, "src/generated/previews");
const composers = JSON.parse(await readFile(path.join(root, "contenus/compositeurs.json"), "utf8"));
const LEVELS = ["debutant", "intermediaire", "avance", "original"];

/** Minimal front matter reader (key: value lines between --- fences). */
function frontMatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) throw new Error("front matter manquant");
  return Object.fromEntries(
    match[1].split("\n").filter((l) => l.includes(":")).map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")];
    }),
  );
}

const REQUIRED = ["titre", "oeuvre", "niveau", "formation", "source", "licence", "transcripteur"];

/** Exact fraction of a quarter-note float (Verovio qstamps), on a 1/48 grid (covers triplets and 32nds). */
function fraction(q) {
  const n = Math.round(q * 48);
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.abs(n), 48) || 1;
  return n % 48 === 0 ? String(n / 48) : `${n / g}/${48 / g}`;
}

/** note xml:id → { staff, layer, pitch } by walking the MEI text. */
function meiNotes(mei) {
  const notes = new Map();
  let staff = 0;
  let layer = 0;
  for (const tag of mei.matchAll(/<(staff|layer|note)\b([^>]*)>/g)) {
    const attrs = Object.fromEntries([...tag[2].matchAll(/([\w.:]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    if (tag[1] === "staff") staff = Number(attrs.n);
    else if (tag[1] === "layer") layer = Number(attrs.n);
    else if (attrs["xml:id"]) {
      const accid = attrs["accid.ges"] ?? attrs.accid ?? "";
      const sign = accid === "s" ? "#" : accid === "f" ? "b" : "";
      notes.set(attrs["xml:id"], { staff, layer, pitch: attrs.pname ? `${attrs.pname.toUpperCase()}${sign}${attrs.oct}` : "" });
    }
  }
  // Accidentals written as child <accid> elements.
  for (const m of mei.matchAll(/<note xml:id="([^"]+)"[^>]*>\s*<accid[^>]*accid(?:\.ges)?="([sf])"/g)) {
    const n = notes.get(m[1]);
    if (n && !/[#b]/.test(n.pitch)) n.pitch = n.pitch.replace(/(\d)$/, `${m[2] === "s" ? "#" : "b"}$1`);
  }
  return notes;
}

/**
 * Verovio's SVG relies on a stylesheet (stroke: currentColor, hidden placeholders)
 * that the SVG-to-PDF converter ignores: make those rules explicit attributes.
 */
function svgForPdf(svg) {
  return svg
    .replace(/<g [^>]*class="[^"]*\bplaceholder\b[^"]*"[^>]*>[\s\S]*?<\/g>/g, "")
    .replaceAll("currentColor", "#000")
    .replace(/<(path|polyline|polygon|rect|ellipse)\b(?![^>]*\bstroke=)([^>]*\bstroke-width=)/g, '<$1 stroke="#000"$2');
}

/** A4 PDF (595 × 842 pt) engraved by Verovio: page units are tenths of a millimetre. */
function renderPdf(toolkit, title, licence) {
  toolkit.setOptions({ pageWidth: 2100, pageHeight: 2970, pageMarginLeft: 100, pageMarginRight: 100, pageMarginTop: 100, pageMarginBottom: 120, scale: 45, footer: "none", header: "auto", breaks: "auto", svgViewBox: true, adjustPageHeight: false });
  toolkit.redoLayout();
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: title, Creator: "Opus Libre", Subject: `Partition libre — ${licence}` } });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  for (let page = 1; page <= toolkit.getPageCount(); page += 1) {
    if (page > 1) doc.addPage();
    SVGtoPDF(doc, svgForPdf(toolkit.renderToSVG(page)), 0, 0, { width: 595.28, height: 841.89, preserveAspectRatio: "xMidYMin meet" });
    doc.font("Times-Roman").fontSize(8).fillColor("#555").text(`Opus Libre — partition libre (${licence}) — page ${page}/${toolkit.getPageCount()}`, 0, 812, { width: 595.28, align: "center" });
  }
  doc.end();
  return done;
}

/** First page of the score at a fixed width, inlined by the home page (no Verovio in the browser there). */
function renderPreview(toolkit) {
  toolkit.setOptions({ pageWidth: 1600, pageHeight: 1150, scale: 40, adjustPageHeight: true, breaks: "auto", svgViewBox: true, footer: "none", header: "none" });
  toolkit.redoLayout();
  return toolkit.renderToSVG(1);
}

const tk = new VerovioToolkit(await createVerovioModule());
const manifest = {};
const slugs = (await readdir(scoresDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const problems = [];

for (const slug of slugs) {
  const dir = path.join(scoresDir, slug);
  const meta = frontMatter(await readFile(path.join(dir, "meta.md"), "utf8"));
  const missing = REQUIRED.filter((k) => !meta[k]);
  if (missing.length > 0) {
    problems.push(`${slug} : champs manquants dans meta.md (${missing.join(", ")}) — une partition sans source ni licence n'est pas publiée.`);
    continue;
  }
  if (!composers[meta.artiste]) { problems.push(`${slug} : artiste « ${meta.artiste} » absent de contenus/compositeurs.json.`); continue; }
  if (!LEVELS.includes(meta.niveau)) { problems.push(`${slug} : niveau « ${meta.niveau} » inconnu (${LEVELS.join(", ")}).`); continue; }
  const source = await readFile(path.join(dir, "score.musicxml"), "utf8");
  const annotationsPath = path.join(dir, "annotations.json");
  const annotationsText = existsSync(annotationsPath) ? await readFile(annotationsPath, "utf8") : "[]";
  const key = createHash("sha256").update(PIPELINE_VERSION).update(source).update(annotationsText).digest("hex").slice(0, 16);
  const out = path.join(outFiles, "p", slug, key);
  await mkdir(out, { recursive: true });

  // MusicXML → MEI with deterministic ids, then everything else from the MEI so ids match the browser render.
  tk.setOptions({ xmlIdSeed: 1 });
  if (!tk.loadData(source)) { problems.push(`${slug} : MusicXML illisible par Verovio.`); continue; }
  const mei = tk.getMEI({});
  tk.loadData(mei);
  const midi = Buffer.from(tk.renderToMIDI(), "base64");

  // Musical addresses: measure rank (1 = first, pickup included) + offset in quarter notes from the bar start.
  const notes = meiNotes(mei);
  const anchors = [];
  let measure = 0;
  let measureStart = 0;
  for (const entry of tk.renderToTimemap({ includeMeasures: true })) {
    if (entry.measureOn) { measure += 1; measureStart = entry.qstamp; }
    for (const id of entry.on ?? []) {
      const n = notes.get(id);
      if (n) anchors.push({ id, measure, offset: fraction(entry.qstamp - measureStart), staff: n.staff, voice: n.layer, pitch: n.pitch });
    }
  }

  // Annotations: an address that resolves to nothing fails the build.
  const annotations = JSON.parse(annotationsText);
  const resolved = annotations.map((a) => {
    const matches = anchors.filter((x) =>
      x.measure === a.anchor.measure && x.offset === String(a.anchor.offset) &&
      (a.anchor.staff === undefined || x.staff === a.anchor.staff) &&
      (a.anchor.voice === undefined || x.voice === a.anchor.voice) &&
      (a.anchor.pitch === undefined || x.pitch === a.anchor.pitch));
    if (matches.length === 0) problems.push(`${slug} : annotation « ${a.id} » introuvable (mesure ${a.anchor.measure}, offset ${a.anchor.offset}${a.anchor.pitch ? `, ${a.anchor.pitch}` : ""}).`);
    return { ...a, ids: matches.map((m) => m.id) };
  });

  await writeFile(path.join(out, "score.mei"), mei);
  await writeFile(path.join(out, "score.mid"), midi);
  await writeFile(path.join(out, "score.pdf"), await renderPdf(tk, meta.titre, meta.licence));
  await mkdir(outPreviews, { recursive: true });
  await writeFile(path.join(outPreviews, `${slug}.svg`), renderPreview(tk));
  await copyFile(path.join(dir, "score.musicxml"), path.join(out, "score.musicxml"));
  await writeFile(path.join(out, "anchors.json"), JSON.stringify(anchors));
  await writeFile(path.join(out, "annotations.json"), JSON.stringify(resolved));
  manifest[slug] = { key, base: `/p/${slug}/${key}/`, meta, staves: Math.max(...anchors.map((a) => a.staff)), annotations: resolved.length };
  console.log(`✓ ${slug} (${key}) — ${anchors.length} notes, ${resolved.length} annotation(s)`);
}

if (problems.length > 0) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
await mkdir(path.dirname(outManifest), { recursive: true });
await writeFile(outManifest, JSON.stringify(manifest, null, 2) + "\n");
await writeFile(path.join(outFiles, "manifest.json"), JSON.stringify(Object.fromEntries(Object.entries(manifest).map(([s, m]) => [s, m.key])), null, 2) + "\n");
