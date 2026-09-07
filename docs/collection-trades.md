# Cartes à échanger

## Activer la fonction

Exécuter `supabase/collection-trades.sql` dans le SQL Editor du projet Supabase **avant** le déploiement du code. Ce script est réexécutable, ne propose aucune carte automatiquement et conserve les quantités possédées. Il utilise les politiques RLS existantes de `collections` (`supabase/collections-rls.sql`). La migration des langues doit déjà être appliquée.

La migration a été testée dans un PostgreSQL local isolé. Elle n'a pas été exécutée sur le projet Supabase distant depuis cette session.

## Utilisation

- Ma Collection → **Mes cartes à échanger** (`/collection/trades`).
- Bouton **À l’échange** sous chaque carte possédée, dans la vue par extension et la recherche de collection.
- Dans la fenêtre, choisir les quantités par langue avec +/− ; 0 retire l'offre. Enregistrement automatique. Un exemplaire unique peut être proposé.
- Recherche et filtres par extension, rareté, type, variante et langue ; liste paginée.
- Les coups de cœur restent indépendants. Proposer ne diminue pas la collection.
- Dans les échanges avec un ami, cocher **Cartes proposées à l’échange uniquement**. Le mode précédent, basé sur les doubles, reste disponible. Les critères existants de cartes manquantes par langue et d'extensions déjà collectionnées restent appliqués.
- La liste personnelle n'est pas un catalogue public de tous les membres. Les amis peuvent retrouver les offres pertinentes via la comparaison existante.

## Quantités et droits

La colonne `collections.trade_quantity` démarre à 0. Une contrainte impose une valeur comprise entre 0 et la quantité possédée. La fonction `set_collection_trade_quantity` verrouille la ligne et utilise exclusivement `auth.uid()` ; aucune mutation d'un autre utilisateur n'est autorisée. Un déclencheur réduit les offres lorsque la quantité possédée baisse, pour tous les chemins de mise à jour. Supprimer l'entrée de collection supprime donc aussi l'offre. Les modifications de quantité par le client rafraîchissent les offres affichées.

## Vérification reproductible de la migration

Les données ci-dessous sont créées uniquement en mémoire, sans connexion à Supabase :

```sh
npm install --prefix .next/trade-tests --no-save --package-lock=false --ignore-scripts @electric-sql/pglite
node scripts/test-collection-trades.cjs
```

Tests : migration répétée, valeurs initiales, langues, RLS, limites, suppression, réajout, RPC de collection et mises à jour directes. Le test en mémoire ne simule pas plusieurs connexions concurrentes ; la sérialisation repose sur les verrous de ligne PostgreSQL.

L'interface a aussi été testée dans un navigateur mobile avec données simulées : plusieurs enregistrements successifs, limites par langue, retrait de la dernière offre, navigation clavier, ouverture et fermeture de la fenêtre.
