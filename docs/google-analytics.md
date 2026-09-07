# Google Analytics 4

## Activation

1. Le flux GA4 du site est `G-D4M5F8DFJ4`.
2. Cet identifiant public est configuré par défaut dans le layout serveur pour les déploiements Vercel **Production**. Publier les modifications pour activer l'intégration sur le site.
3. Pour remplacer l'identifiant, définir `NEXT_PUBLIC_GA_MEASUREMENT_ID` dans Vercel puis redéployer. Une valeur vide désactive la collecte. Aucun secret ni nouvelle dépendance n'est nécessaire.
4. Dans Administration → Flux de données → flux Web, **désactiver les mesures améliorées**. Le site envoie explicitement ses pages vues, y compris les changements de page Next.js. Les mesures automatiques pourraient compter les pages en double ou transmettre des URL non filtrées.
5. Visiter le site, accepter les statistiques, puis vérifier le rapport Temps réel dans Google Analytics. Un bloqueur de publicité peut empêcher la collecte.

Sans identifiant valide, aucun bandeau ni script Analytics n'est affiché. La variable `.env.local` est configurée pour permettre de prévisualiser le bandeau. Ne pas accepter les statistiques pendant les tests manuels avec le flux réel, ou utiliser un flux de test distinct. Les vérifications automatisées interceptent les requêtes Google. Laisser la variable absente des environnements Preview : ils sont désactivés par défaut.

## Fonctionnement

- Aucune requête vers Google Analytics avant acceptation ; le refus n'empêche aucune fonction du site.
- Accepter et refuser ont la même présentation. Le choix est conservé 180 jours dans le navigateur. Les préférences restent accessibles en bas de page.
- Le retrait supprime les cookies `_ga` accessibles et recharge la page pour décharger le script. Le changement est aussi pris en compte dans les autres onglets.
- Pages vues initiales et navigation Next.js, sans événements métier personnalisés.
- Les pages `/admin`, `/auth` et `/account` sont exclues des événements manuels.
- Les URL envoyées ne contiennent ni paramètres de recherche ni fragments. Les tokens des liens de partage et les identifiants d'amis sont remplacés par des libellés génériques ; le titre transmis est le chemin filtré.
- Aucun email, pseudonyme ou identifiant utilisateur n'est ajouté aux événements. Google Signals et les options publicitaires sont désactivés. Le domaine du site référent est conservé pour connaître l'origine des visites.

La réception réelle des données doit être validée dans le compte GA4 après activation et déploiement. Les tests locaux interceptent le script Google et vérifient les commandes envoyées sans produire de visites réelles.

Références : [pages vues](https://developers.google.com/analytics/devguides/collection/ga4/views), [consentement](https://developers.google.com/tag-platform/security/concepts/consent-mode).
