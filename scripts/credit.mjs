/**
 * Credit block of a score ("cartouche"): origin and licence, built from its
 * meta.md. Used on the PDF (footer), in the downloaded MusicXML and MIDI
 * (metadata) and on the score page. Nothing is typed by hand: a new score
 * gets it automatically.
 */
export const SITE = "opuslibre.github.io";

const LICENCES = {
  "CC0-1.0": {
    label: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/deed.fr",
    text: "Partition libre : vous pouvez la copier, la jouer, la modifier et la diffuser sans autorisation.",
  },
  "CC-BY-4.0": {
    label: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/deed.fr",
    text: "Partition libre : vous pouvez la copier, la jouer, la modifier et la diffuser, en citant Opus Libre.",
  },
};

const LEVEL_LABELS = { debutant: "Débutant", intermediaire: "Intermédiaire", avance: "Avancé", original: "Original" };

/**
 * @param {Record<string, string>} meta front matter of meta.md
 * @param {{ name: string, short: string, dates?: string }} composer
 * @param {string} slug
 */
export function credit(meta, composer, slug) {
  const licence = LICENCES[meta.licence] ?? { label: meta.licence, url: "", text: "Partition libre." };
  const version = meta.version || LEVEL_LABELS[meta.niveau] || meta.niveau;
  const work = [meta.recueil, meta.reference].filter(Boolean).join(", ");
  const title = `${composer.dates ? `${composer.name} (${composer.dates})` : composer.name} — ${meta.titre}`;
  // A named version (« Réduction (Singer) ») stands on its own; a level reads « version Avancé ».
  const versionText = meta.version ? meta.version : `version ${version}`;
  const details = [work, versionText].filter(Boolean).join(" · ");
  // « Arrangement d'après … » becomes « Arrangement Opus Libre d'après … » ; any other source
  // (reduction, edition) is followed by who entered it.
  const transcriber = meta.transcripteur || "Opus Libre";
  const source = /^Arrangement d[’']après/.test(meta.source)
    ? meta.source.replace(/^Arrangement d[’']après/, `Arrangement ${transcriber} d’après`)
    : `${meta.source.replace(/\.$/, "")}. Saisie : ${transcriber}.`;
  const url = `${SITE}/fr/partitions/${slug}/`;
  return {
    title,
    details,
    source: source.endsWith(".") ? source : `${source}.`,
    licence: licence.label,
    licenceText: licence.text,
    licenceUrl: licence.url,
    url,
    version,
    short: `${composer.short} — ${meta.titre} · ${versionText} · Opus Libre · ${licence.label} partition libre · ${SITE}`,
  };
}

/** Plain ASCII (MIDI text events are bytes, without a declared encoding). */
export function ascii(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, "-").replace(/°/g, "o").replace(/[^\x20-\x7e]/g, "");
}

const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** MusicXML with the credit in <identification> (rights, encoding software, source, licence). */
export function musicxmlWithCredit(source, c) {
  const rights = `<rights>${xml(`${c.licence} — ${c.licenceText} ${c.licenceUrl}`)}</rights>`;
  const misc = `<miscellaneous><miscellaneous-field name="licence">${xml(c.licence)}</miscellaneous-field><miscellaneous-field name="url">${xml(`https://${c.url}`)}</miscellaneous-field></miscellaneous>`;
  const block = (inner) => `<identification>${inner}</identification>`;
  const m = /<identification>([\s\S]*?)<\/identification>/.exec(source);
  if (m) {
    const inner = m[1];
    const creators = (inner.match(/<creator\b[\s\S]*?<\/creator>/g) ?? []).join("");
    const encoding = /<encoding>([\s\S]*?)<\/encoding>/.exec(inner)?.[1] ?? "";
    const enc = `<encoding>${encoding.includes("Opus Libre") ? encoding : `${encoding}<software>Opus Libre (${SITE})</software>`}</encoding>`;
    const relations = (inner.match(/<relation\b[\s\S]*?<\/relation>/g) ?? []).join("");
    return source.replace(m[0], block(`${creators}${rights}${enc}<source>${xml(c.source)}</source>${relations}${misc}`));
  }
  const at = ["<defaults", "<credit", "<part-list"].map((t) => source.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (at === undefined) return source;
  const ident = block(`${rights}<encoding><software>Opus Libre (${SITE})</software></encoding><source>${xml(c.source)}</source>${misc}`);
  return `${source.slice(0, at)}${ident}\n  ${source.slice(at)}`;
}
