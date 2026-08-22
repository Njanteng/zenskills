# ZenSkills

Application mono-utilisateur de suivi de Cours, Parcours, Compétences et Projets.

## Déploiement sur Vercel + Neon

### 1. Créer la base Neon
1. Créez un compte sur [neon.com](https://neon.com) et un nouveau projet (ex. "zenskills").
2. Dans **Connection Details**, récupérez deux chaînes de connexion :
   - la version **pooled** (hôte contenant `-pooler`)
   - la version **directe** (sans `-pooler`)

### 2. Créer les tables
```bash
npm install
cp .env.example .env
# éditez .env : mettez la chaîne DIRECTE dans DATABASE_URL_UNPOOLED,
# et la chaîne POOLED dans DATABASE_URL
npm run migrate
```
Ce script ne s'exécute qu'une seule fois (il est idempotent : le relancer ne casse rien).

### 3. Développement local
```bash
npm start
```
Puis ouvrez http://localhost:3000 — l'app utilise `DATABASE_URL` de votre `.env`.

### 4. Déployer sur Vercel
1. Poussez le projet sur GitHub.
2. Importez le dépôt dans Vercel.
3. Dans **Settings → Environment Variables**, ajoutez `DATABASE_URL` (la chaîne **pooled**).
4. Déployez.

Vercel détecte automatiquement `api/index.js` comme fonction serverless (toutes les requêtes `/api/*` y sont routées via `vercel.json`) et sert `public/` en statique.

## Architecture

- `app.js` — l'application Express (routes + statique), sans `listen()`.
- `server.js` — point d'entrée pour le développement local (`npm start`), démarre un vrai serveur.
- `api/index.js` — point d'entrée pour Vercel, exporte la même app Express sans `listen()`.
- `db.js` — pool de connexions Postgres (`pg`), pointant vers Neon via `DATABASE_URL`.
- `migrate.js` — script à lancer une fois pour créer les tables (utilise `DATABASE_URL_UNPOOLED`).
- `routes/` — API REST (`/api/cours`, `/api/parcours`, `/api/competences`, `/api/projets`, `/api/dashboard`), toutes asynchrones.
- `public/` — frontend statique (HTML/CSS/JS vanilla), inchangé — il continue de parler à `/api/*` en JSON, aucune modification nécessaire.

## Protéger l'application (authentification)

L'app est mono-utilisateur et n'a pas de système de comptes — une fois déployée publiquement, une authentification HTTP Basic (identifiant + mot de passe uniques) protège **toute l'application**, y compris les fichiers statiques, via `middleware.js` à la racine (Vercel Routing Middleware, s'exécute avant le routage vers `public/` ou `api/`).

**Configuration** :
1. Sur Vercel, allez dans **Settings → Environment Variables**.
2. Ajoutez `BASIC_AUTH_USER` et `BASIC_AUTH_PASSWORD`, en cochant Production, Preview et Development.
3. Redéployez (les variables d'environnement ne sont prises en compte qu'au prochain déploiement).

À la prochaine visite, le navigateur affichera une popup native demandant l'identifiant et le mot de passe.

**Important** :
- Si `BASIC_AUTH_USER` ou `BASIC_AUTH_PASSWORD` ne sont pas définis, le middleware laisse passer tout le monde sans bloquer — pensez à vérifier qu'ils sont bien configurés après le déploiement.
- Ce mécanisme ne protège **pas** l'environnement local (`npm start`) : `middleware.js` n'est interprété que par la plateforme Vercel. Pour le tester en local, utilisez `vercel dev` avec `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` dans votre `.env`.
- C'est une protection simple (un seul couple identifiant/mot de passe partagé), adaptée à un usage personnel — pas un vrai système de comptes utilisateurs.

## Export / Import Excel (sauvegarde et restauration)

Deux boutons en bas de la barre latérale :
- **Exporter (.xlsx)** : télécharge un classeur avec un onglet par table (`Cours`, `Competences`, `Cours_Competences`, `Parcours`, `Parcours_Cours`, `Projets`). Les deux onglets `*_Competences`/`*_Cours` représentent les relations (compétences d'un cours, cours d'un parcours) par **titre/nom**, pas par id.
- **Importer (.xlsx)** : après confirmation, **remplace entièrement** le contenu de la base par celui du fichier (`TRUNCATE ... CASCADE` puis réinsertion). Les identifiants sont régénérés ; le rapprochement entre onglets se fait par titre de cours / nom de compétence / titre de parcours — s'il existe des doublons de titre dans le fichier, seule la dernière ligne portant ce titre sera utilisée pour les relations.

**Utilisation typique** : export régulier comme sauvegarde personnelle, ou pour éditer en masse dans Excel puis réimporter. Le fichier généré par Export est directement réimportable tel quel — c'est le format de référence à respecter si vous éditez le classeur à la main.

⚠️ L'import est irréversible sans une sauvegarde préalable — une confirmation est demandée avant l'envoi, mais pensez à exporter avant d'importer si vous n'êtes pas sûr du contenu du fichier.

## Nouveautés de cette version

- Migration complète de SQLite (`better-sqlite3`) vers Postgres (Neon via `pg`).
- Adaptation pour un hébergement serverless (Vercel) plutôt qu'un process long-running.
- Toutes les routes sont désormais asynchrones (`async/await`).

## Workflow de développement (CI/CD)

- **CI** (`.github/workflows/ci.yml`) : à chaque push ou pull request vers `main`, GitHub Actions installe les dépendances, vérifie la syntaxe de tous les fichiers `.js` et lance un audit de sécurité non bloquant.
- **CD** : gérée nativement par l'intégration Vercel↔GitHub (aucun YAML nécessaire). Chaque push sur une branche ou une pull request génère une **preview deployment** avec une URL unique (commentée automatiquement sur la PR par le bot Vercel) ; chaque push sur `main` déploie en production.

Flux type depuis VS Code :
1. `git checkout -b ma-fonctionnalite`
2. Développer, commiter.
3. `git push -u origin ma-fonctionnalite`
4. Ouvrir une pull request sur GitHub (ou via l'extension "GitHub Pull Requests" de VS Code).
5. La CI tourne, Vercel poste un lien de preview sur la PR.
6. Une fois vérifié et la CI verte, merger dans `main` → déploiement en production automatique.
