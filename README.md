# Musicalis

Bibliothèque de partitions libres : un catalogue statique où la partition MusicXML est la seule source musicale. Le rendu, le MIDI et les fichiers téléchargeables sont générés au build. Architecture de référence : le document « Bibliothèque de partitions — Architecture ».

En ligne (prototype) : https://musicalis.grainedigitale.workers.dev/

## Prototype (novembre 2026)

La page partition avec :
- le rendu Verovio dans le navigateur, qui se recalcule selon la largeur ;
- la lecture MIDI au piano échantillonné (Salamander Grand Piano), avec la note jouée surlignée ;
- la main droite ou la main gauche seule, et un tempo de 50 % à 150 % ;
- les doigtés alternatifs en surimpression, ancrés par adresse musicale.

Deux pièces de test : le début du Prélude en ut majeur BWV 846 (piano) et « Au clair de la lune » (voix avec paroles), pour qu'aucune hypothèse « deux portées » ne s'installe.

## Arborescence

```
contenus/partitions/<slug>/
  meta.md            # titre, œuvre, niveau, formation, source, licence, transcripteur (obligatoires)
  score.musicxml     # source musicale
  annotations.json   # annotations ancrées par adresse musicale (mesure, offset, portée, hauteur)
scripts/
  build-scores.mjs   # MusicXML → MEI, MIDI, ancres, annotations résolues (échoue si une ancre est introuvable)
  upload-files.mjs   # envoie les fichiers générés sur R2 (clés immuables, jamais renvoyées)
  sample-scores.mjs  # génère les deux partitions de test
src/                 # site Astro (statique)
worker/index.ts      # Worker : site statique + fichiers R2 sous /p/<slug>/<empreinte>/
```

## Commandes

```bash
npm ci
npm run build                      # pipeline des partitions (MEI, MIDI, PDF A4, ancres) puis site
npm test                           # tests Playwright en 390, 768 et 1440 px (après le build)
node scripts/upload-files.mjs      # fichiers générés → R2 (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)
npx wrangler deploy                # Worker « musicalis » (compte grainedigitale)
```

Un push sur `main` fait tout cela automatiquement (GitHub Actions : secret `CLOUDFLARE_API_TOKEN`, variable `CLOUDFLARE_ACCOUNT_ID`).

Astro 7 demande Node ≥ 22.23 (la CI utilise Node 24).

## Reste à faire


- Fichiers `.mxl` compressés, empreinte de mesure des annotations, collections Astro typées (artistes, œuvres), i18n en/it/es, Pagefind.
- Banque de sons hébergée sur R2 plutôt que chargée depuis tonejs.github.io.

## Licences

Code : propriétaire. Partitions, annotations et fichiers téléchargeables : licence ouverte indiquée sur chaque page (CC0 pour les deux pièces de test).
