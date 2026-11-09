#!/usr/bin/env node
/**
 * GitHub Pages output: everything is static, so the generated score files go next to the
 * site (dist/p/<slug>/<key>/) and the root page sends visitors to their language.
 */
import { cp, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
await cp(path.join(root, "build/files/p"), path.join(dist, "p"), { recursive: true });
const AVAILABLE = ["fr"];
await writeFile(
  path.join(dist, "index.html"),
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Opus Libre</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="canonical" href="/fr/">
<script>
  const wanted = (navigator.languages || [navigator.language || ""]).map((l) => l.slice(0, 2).toLowerCase()).find((l) => ${JSON.stringify(AVAILABLE)}.includes(l));
  location.replace("/" + (wanted || "fr") + "/");
</script>
<meta http-equiv="refresh" content="0; url=/fr/">
</head><body><p><a href="/fr/">Opus Libre — partitions libres</a></p></body></html>
`,
);
await writeFile(path.join(dist, ".nojekyll"), "");
console.log("✓ dist/ prêt pour GitHub Pages (fichiers des partitions sous /p/)");
