/**
 * The catalogue as the site sees it: one entry per published score, built from
 * src/generated/scores.json (written by scripts/build-scores.mjs) and the composer list.
 * Levels are audiences, not steps: each one is a separate reference in the catalogue.
 */
import scores from "../generated/scores.json";
import composerList from "../../contenus/compositeurs.json";

export type Level = "debutant" | "intermediaire" | "avance" | "original";
export const LEVELS: { id: Level; label: string; short: string }[] = [
  { id: "debutant", label: "Débutant", short: "Débutant" },
  { id: "intermediaire", label: "Intermédiaire", short: "Interm." },
  { id: "avance", label: "Avancé", short: "Avancé" },
  { id: "original", label: "Original", short: "Original" },
];
export const INSTRUMENTS: Record<string, string> = { piano: "Piano", voix: "Voix", guitare: "Guitare", violon: "Violon", flute: "Flûte" };

export type Composer = { id: string; name: string; short: string; dates?: string };
export const COMPOSERS: Record<string, Composer> = Object.fromEntries(
  Object.entries(composerList as Record<string, Omit<Composer, "id">>).map(([id, c]) => [id, { id, ...c }]),
);

export type Entry = {
  slug: string;
  title: string;
  work: string;
  composer: Composer;
  reference?: string;
  collection?: string;
  instrument: string;
  level: Level;
  added: string;
  licence: string;
  source: string;
  transcriber: string;
  base: string;
  staves: number;
  annotations: number;
};

type Generated = Record<string, { base: string; staves: number; annotations: number; meta: Record<string, string> }>;

export const ENTRIES: Entry[] = Object.entries(scores as Generated)
  .map(([slug, s]) => ({
    slug,
    title: s.meta.titre!,
    work: s.meta.oeuvre!,
    composer: COMPOSERS[s.meta.artiste!]!,
    reference: s.meta.reference,
    collection: s.meta.recueil,
    instrument: s.meta.formation!,
    level: s.meta.niveau as Level,
    added: s.meta.ajout ?? "",
    licence: s.meta.licence!,
    source: s.meta.source!,
    transcriber: s.meta.transcripteur!,
    base: s.base,
    staves: s.staves,
    annotations: s.annotations,
  }))
  .sort((a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title, "fr"));

export const levelLabel = (id: string) => LEVELS.find((l) => l.id === id)?.label ?? id;
export const instrumentLabel = (id: string) => INSTRUMENTS[id] ?? id;

/** Other versions of the same work (same `oeuvre`), in level order. */
export function versionsOf(entry: Entry): Entry[] {
  const rank = (l: Level) => LEVELS.findIndex((x) => x.id === l);
  return ENTRIES.filter((e) => e.work === entry.work).sort((a, b) => rank(b.level) - rank(a.level));
}

export const countBy = <K extends string>(key: (e: Entry) => K) =>
  ENTRIES.reduce<Record<string, number>>((acc, e) => ({ ...acc, [key(e)]: (acc[key(e)] ?? 0) + 1 }), {});

export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Lower-case, accent-free text used by the catalogue search. */
export const searchText = (e: Entry) =>
  [e.title, e.composer.name, e.reference, e.collection, instrumentLabel(e.instrument), levelLabel(e.level)]
    .filter(Boolean).join(" ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export const catalogueUrl = (filters: Record<string, string> = {}) => {
  const q = new URLSearchParams(filters).toString();
  return `/fr/partitions/${q ? `?${q}` : ""}`;
};
