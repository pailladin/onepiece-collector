# Référencement technique

Les pages publiques à indexer sont l’accueil, le catalogue, chaque extension,
la liste des lieux et les fiches des lieux actifs.

- `src/lib/seo.ts` centralise les titres, descriptions, URL canoniques,
  métadonnées Open Graph/Twitter et fils d’Ariane JSON-LD.
- Les extensions reçoivent leurs cartes depuis le serveur ; les quantités
  personnelles sont ajoutées dans le navigateur après authentification.
  Le chargement progressif existant affiche les 100 premières cartes au départ.
- Les lieux et leurs liens sont rendus côté serveur, y compris lors de
  l’ouverture directe d’une recherche. Les filtres restent interactifs.
- Les variantes de codes (`op01`, `OP-01`) redirigent définitivement vers `OP01`.
  Une extension ou un lieu inexistant renvoie une page introuvable.
- Le sitemap est régénéré au plus une fois par heure, pagine ses lectures en
  base, déduplique les URL et ne publie que les lieux actifs. Une panne de la base
  provoque une erreur plutôt qu’un sitemap incomplet présenté comme valide.
- Les espaces personnels, sociaux, administratifs et partagés portent `noindex`.
  `robots.txt` permet leur lecture pour que les moteurs voient cette directive.
  L’authentification continue de contrôler les accès ; `noindex` ne la remplace pas.
- `/opengraph-image` fournit une image PNG de partage, sans service externe.

## Configuration

Définir `NEXT_PUBLIC_SITE_URL` avec le domaine public définitif, par exemple
`https://onepiece-collector.com`. Les URL de prévisualisation Vercel ne sont pas
utilisées comme solution de repli pour les canoniques. Le build doit pouvoir
lire Supabase afin de générer le catalogue et le sitemap.

## Vérification

```sh
npm run build
npm start
node scripts/test-seo.mjs
```

Le test utilise Playwright : Chromium doit être installé, ou la variable
`PLAYWRIGHT_CHANNEL` peut sélectionner un navigateur installé (`msedge`, `chrome`).
`SEO_TEST_URL` permet de tester un serveur local sur un autre port.

Il vérifie le HTML sans JavaScript, les canoniques, les données structurées,
le sitemap, les redirections, les 404, les directives `noindex`, l’image de partage
et les filtres interactifs. Il ne modifie aucune collection.

Les fiches individuelles de cartes et une pagination explorable au-delà des
100 premières cartes constituent des améliorations possibles pour une prochaine
étape. Les positions dans les résultats dépendent ensuite de l’exploration et
de l’indexation par les moteurs.
