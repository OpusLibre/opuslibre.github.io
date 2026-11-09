---
name: opuslibre-arrangement
description: Arranger une œuvre du domaine public en versions par niveau (débutant, intermédiaire, avancé, original) pour le catalogue Opus Libre — trouver la source libre, écrire chaque niveau en ABC, produire le MusicXML, vérifier l'harmonie contre l'original et la difficulté du niveau, relire la gravure, puis publier dans contenus/partitions/. À utiliser dès qu'il faut créer, simplifier, transposer, vérifier ou intégrer une partition / un arrangement pour Opus Libre.
---

# Arrangements Opus Libre

Dépôt : `~/work/opuslibre` (voir la mémoire « Projet Opus Libre »). Outils : `tools/arrangement/`.
Opus Libre est un **catalogue de références**, pas une méthode : chaque niveau est une partition autonome pour un public différent, pas une étape d'un parcours. Pas de conseils pédagogiques dans les fiches.

## 0. Préparer l'environnement (une fois)

```sh
cd ~/work/opuslibre
python3 -m venv .venv && .venv/bin/pip install -r tools/arrangement/requirements.txt
export PATH=$HOME/.local/opt/node/bin:$PATH   # pour preview.mjs et le build
```

## 1. Source : uniquement du domaine public ou du libre compatible

- **Source autorisée** : l'œuvre originale dans une édition du domaine public (compositeur mort depuis plus de 70 ans, et édition sans apport éditorial protégé : premières éditions, Breitkopf/Simrock/Peters anciennes), ou des fichiers sous licence libre compatible (CC0, CC BY : citer l'auteur).
- **Interdit comme source** : tout arrangement publié protégé (Leuenberger, Piano Attitude, éditions récentes…). On peut s'en servir **uniquement pour contrôler** l'harmonie ou la structure, jamais pour reprendre l'écriture, les doigtés, la réduction ou la mise en page. Le noter dans le compte rendu.
- Où chercher : IMSLP (partitions d'orchestre, réductions anciennes comme Reger, Singer, Keller ; fichiers MuseScore/MusicXML sous CC), Mutopia, KernScores, OpenScore.
- IMSLP impose d'accepter une clause avant téléchargement : **ne pas l'accepter à la place de l'utilisateur** (le garde-fou le refuse). Lui demander de déposer les fichiers, ou d'ajouter une règle d'autorisation.
- Référence lisible par machine (MusicXML, MXL, MEI, kern) → contrôle automatique avec `check.py`. PDF seulement → `pdf_pages.py` pour lire les pages en image et comparer mesure par mesure à l'œil.

## 2. Écrire chaque niveau en ABC

Un fichier ABC par niveau, deux voix pour le piano (`RH`, `LH`), `L:1/8` conseillé. Garder **la même tonalité, la même structure et la même mélodie** à tous les niveaux ; seuls l'accompagnement, l'ornementation et la densité changent. Si on change la mesure (3/8 → 3/4, valeurs doublées) ou si on ne garde qu'un extrait, l'écrire dans la description (`meta.md`).

```abc
X:1
T:Poco allegretto (thème)
C:Johannes Brahms
M:3/4
L:1/8
Q:"Poco allegretto"
K:Cm
V:RH clef=treble
V:LH clef=bass
[V:RH] !p!!1!C>!2!D | !3!E4 !5!G>!4!F | ...
[V:LH] z2 | !5!C,6 | ...
```

Décorations prises en charge : doigtés `!1!`…`!5!` (plusieurs pour un accord), nuances `!pp!`…`!ff!`, `!sfz!`, `!fp!`, `!staccato!` (ou `.C`), `!>!`/`!accent!`, `!tenuto!`, `!fermata!`, `!ped!`, `!ped-up!`. Petites notes `{}` et annotations `"..."` non prises en charge (écrire les ornements en valeurs réelles ; le tempo va dans `Q:`). Altérations ABC : la tonalité s'applique, `=B` pour un bécarre, `^F` dièse, `_B` bémol ; chaque altération vaut pour la mesure.

Convertir :
```sh
.venv/bin/python tools/arrangement/abc_to_musicxml.py niveau.abc score.musicxml
```
L'outil refuse un fichier dont les deux mains n'ont pas le même nombre de mesures.

## 3. Cibles par niveau

Limites contrôlées par `check.py` (✗ = à corriger) :

| | Débutant | Intermédiaire | Avancé |
|---|---|---|---|
| Plus courte valeur | croche | double croche | triple croche |
| N-olets | aucun | quelques-uns | libres |
| Notes simultanées par main | 2 | 3 | 4 |
| Écart dans une main | quinte (7 demi-tons) | octave | dixième |
| Tessiture d'une main | ≈ 1 octave + tierce | 2 octaves | libre |
| Changements de position / 8 mes. | ≤ 2 | ≤ 5 | libre |
| Altérations accidentelles / 8 mes. | ≤ 2 | ≤ 6 | libre |

Repères d'écriture :
- **Débutant** : mélodie seule à la main droite, main gauche en notes tenues (une ou deux par mesure), mains posées, pas de passage du pouce, doigtés aux changements de position seulement (pas sur chaque note). Ornements simplifiés en valeurs ≥ croche.
- **Intermédiaire** : mélodie avec ses rythmes caractéristiques (pointés), main gauche en basses + accords simples ou arpèges lents, deux voix possibles ponctuellement.
- **Avancé** : rythmes et ornements d'origine, voix intérieures, accords brisés, pédale.
- **Original** : le texte du compositeur (ou une réduction historique libre), sans simplification.

## 4. Vérifier

```sh
.venv/bin/python tools/arrangement/check.py score.musicxml --level debutant \
  --reference original.musicxml --ref-scale 2 --ref-transpose 0 --ref-shift 0 [--ref-parts "Violoncello,Viola"] [--ref-measures 52]
```
- Partie « Difficulté » : métriques par main et dépassements du niveau.
- Partie « Harmonie » : notes de l'arrangement absentes de l'original sur le même temps, et basses différentes. Chaque ligne se tranche : erreur → corriger ; choix voulu (renversement, note de passage) → le garder et le dire dans le compte rendu.
- Sans référence machine : lire la référence en images (`pdf_pages.py source.pdf /chemin/scratchpad/ref 3-5`) et comparer chaque mesure, en notant les doutes.

Relire la gravure (même moteur que le site) :
```sh
node tools/arrangement/preview.mjs score.musicxml /chemin/scratchpad/apercu
```
Regarder chaque page : collisions doigtés/nuances, liaisons, barres de mesure, levée, clés.

## 5. Publier dans le catalogue

Pour chaque niveau, un dossier `contenus/partitions/<oeuvre>-<niveau>/` :
- `score.musicxml`
- `meta.md` :
  ```
  ---
  titre: "Poco allegretto (thème)"
  oeuvre: brahms-symphonie-3-poco-allegretto   # identique pour tous les niveaux → onglets de versions
  artiste: brahms                              # clé de contenus/compositeurs.json (l'ajouter si besoin)
  niveau: debutant | intermediaire | avance | original
  formation: piano
  reference: op. 90
  recueil: "Symphonie n° 3"
  ajout: AAAA-MM-JJ
  source: "Partition d'orchestre, Simrock 1884 (domaine public, IMSLP)"
  licence: CC0-1.0            # ou CC-BY-4.0 si la source l'impose
  transcripteur: Opus Libre   # ou le nom de la personne
  ---
  Adaptation pour piano du thème (mes. 1–52), en 3/4 (original en 3/8, valeurs doublées).
  ```
- `annotations.json` facultatif (calques affichables à l'écran, voir le doc d'architecture).

Puis : `npm run build` (échoue si un champ manque ou si l'artiste est inconnu), `npx playwright test`, commit en anglais, push avec le jeton `github-opuslibre` (la CI publie sur GitHub Pages). Envoyer à l'utilisateur les aperçus PNG et le rapport de `check.py`, en séparant ce qui est vérifié de ce qui reste un doute.
