# Opus Libre

Bibliothèque de partitions libres : un catalogue statique où la partition MusicXML est la seule source musicale. Le rendu, le MIDI et les fichiers téléchargeables sont générés au build. Architecture de référence : le document « Bibliothèque de partitions — Architecture ».

En ligne : https://opuslibre.github.io/ (dépôt `OpusLibre/opuslibre.github.io`, publié par GitHub Pages)

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
  pages.mjs          # copie les fichiers générés dans dist/p/ et écrit la page racine (redirection /fr/)
  sample-scores.mjs  # génère les deux partitions de test
src/                 # site Astro (statique)
tools/arrangement/   # outils d'arrangement (ABC → MusicXML, contrôles de niveau et d'harmonie, aperçus)
```

## Commandes

```bash
npm ci
npm run build                      # pipeline des partitions (MEI, MIDI, PDF A4, ancres), site, puis dist/ complet
npm test                           # tests Playwright en 390, 768 et 1440 px (après le build)
```

Un push sur `main` construit, teste et publie `dist/` sur GitHub Pages (Settings → Pages → Source : GitHub Actions). Aucun secret n'est nécessaire.

Astro 7 demande Node ≥ 22.23 (la CI utilise Node 24).

## Reste à faire


- Fichiers `.mxl` compressés, empreinte de mesure des annotations, collections Astro typées (artistes, œuvres), i18n en/it/es, Pagefind.
- Banque de sons hébergée avec le site plutôt que chargée depuis tonejs.github.io.

## Licences

Code : propriétaire. Partitions, annotations et fichiers téléchargeables : licence ouverte indiquée sur chaque page (CC0 pour les deux pièces de test).
