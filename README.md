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
