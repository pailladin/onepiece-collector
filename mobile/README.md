# Mobile

Base Expo / React Native connectee a la meme base Supabase que le web.

## Demarrage

1. Copier `.env.example` vers `.env`
2. Renseigner `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Installer les dependances:

```bash
npm install
```

4. Lancer l'app:

```bash
npm start
```

## Ce qui est deja branche

- connexion / inscription Supabase
- session persistante mobile
- lecture du profil utilisateur (`profiles`)
- ecran collection avec progression par set
- detail de set avec edition des quantites
- suivi de valeur mobile
- wishlist mobile

## Suite logique

- echanges
- partage wishlist / set
- top cards / prix detailles
- push notifications
