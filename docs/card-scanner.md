# Scan de cartes par photo

La page `/collection/scan` est accessible depuis le catalogue et « Ma collection ».
Elle fonctionne aussi sans connexion pour identifier une carte ; un compte est
nécessaire pour confirmer un ajout.

## Fonctionnement

1. Photo avec l’appareil du téléphone ou choix d’une image existante.
2. Lecture locale de zones agrandies depuis les pixels originaux : bas à droite,
   bas de la carte, essais de contraste/inversion et image entière en dernier recours.
   Si nécessaire, tracer un cadre autour du numéro sur la photo et utiliser
   « Lire la zone sélectionnée ». Des curseurs permettent aussi de régler le cadre.
3. Recherche exacte du numéro dans le catalogue existant, réimpressions incluses.
4. Choix explicite de l’illustration, de la langue et de la quantité.
5. Ajout par le service de quantité existant, avec blocage des doubles clics.

Les photos sont traitées dans le navigateur par Tesseract.js, sans téléversement,
stockage distant ou API OCR payante. Le serveur reçoit uniquement le numéro via
`GET /api/catalogue/scan?code=OP01-001`. Les ajouts utilisent Supabase comme les
autres écrans de collection. Aucune migration SQL supplémentaire n’est nécessaire.

## Installation et hébergement

`npm install` installe le moteur et le modèle anglais (suffisant pour les numéros).
Les scripts `predev` et `prebuild` copient leurs fichiers dans `public/ocr` :

```sh
npm run dev
# ou
npm run build
npm start
```

Si Next est lancé directement sans les scripts npm, exécuter d’abord
`npm run ocr:prepare`. Le dossier généré `public/ocr` n’est pas versionné.
Les fichiers statiques sont servis par l’hébergement actuel. Cela ajoute du
trafic de téléchargement au premier scan, mais aucun serveur de calcul dédié.
Le modèle est mis en cache par le moteur dans le navigateur lorsque possible.
Le module OCR n’est chargé qu’après le choix d’une photo.

## Limites de cette version

- Une seule carte, à l’endroit ; numéro lisible, sans reflet.
- OP, ST, EB, PRB et P ; pas de reconnaissance des DON!! sans numéro.
- Le numéro ne permet pas de déduire l’illustration, la langue ou l’état.
- Photos jusqu’à 20 Mo ; JPEG, PNG ou WebP conseillés. Les autres formats dépendent
  du décodage du navigateur. Une saisie manuelle reste disponible.
- Le traitement peut être lent sur un ancien téléphone. Annulation possible et
  arrêt après 90 secondes. Un premier téléchargement nécessite une connexion.
- La sélection de la variante est obligatoire, même si une seule version existe.

## Tests

```sh
node scripts/test-card-scanner.cjs
node scripts/test-card-scanner-browser.mjs
```

Le second test nécessite le site démarré et un navigateur Playwright.
Variables facultatives : `SCANNER_TEST_URL` (défaut : `http://localhost:3000`)
et `PLAYWRIGHT_CHANNEL` (`msedge` ou `chrome` pour un navigateur installé).

Il exécute le vrai OCR sur une image synthétique et simule les appels Supabase,
y compris les ajouts. Aucune collection réelle n’est modifiée. Un essai manuel
sur plusieurs vraies cartes et téléphones reste nécessaire pour évaluer la
fiabilité photographique, notamment sur les cartes brillantes.

Référence : [installation locale de Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).
