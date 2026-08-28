# ZenSkills

Application mono-utilisateur de suivi de Cours, Parcours, Compétences, Projets et Tâches.

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
Ce script est idempotent (peut être relancé sans danger, y compris après une mise à jour du schéma).

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
- `server.js` — point d'entrée pour le développement local (`npm start`).
- `api/index.js` — point d'entrée pour Vercel, exporte la même app Express.
- `middleware.js` — Vercel Routing Middleware : authentification HTTP Basic sur toute l'app.
- `db.js` — pool de connexions Postgres (`pg`), pointant vers Neon via `DATABASE_URL`.
- `migrate.js` — script à lancer pour créer/mettre à jour les tables (utilise `DATABASE_URL_UNPOOLED`).
- `routes/` — API REST (`cours`, `parcours`, `competences`, `projets`, `taches`, `dashboard`, `backup`), toutes asynchrones.
- `public/` — frontend statique (HTML/CSS/JS vanilla).

## Protéger l'application (authentification)

Une authentification HTTP Basic (identifiant + mot de passe uniques) protège **toute l'application**, y compris les fichiers statiques, via `middleware.js` (Vercel Routing Middleware).

**Configuration** :
1. Sur Vercel : **Settings → Environment Variables**, ajoutez `BASIC_AUTH_USER` et `BASIC_AUTH_PASSWORD` (Production, Preview, Development).
2. Redéployez.

Si ces variables ne sont pas définies, le middleware laisse passer tout le monde plutôt que de bloquer — vérifiez qu'elles sont bien configurées après déploiement. Ce mécanisme ne protège pas `npm start` en local (utilisez `vercel dev` pour tester).

## Export / Import Excel (sauvegarde et restauration)

Deux boutons en bas de la barre latérale :
- **Exporter (.xlsx)** : télécharge un classeur avec un onglet par table (`Cours`, `Competences`, `Cours_Competences`, `Parcours`, `Parcours_Cours`, `Projets`, `Taches`). Les onglets de liaison représentent les relations par **titre/nom**, pas par id.
- **Importer (.xlsx)** : après confirmation, **remplace entièrement** le contenu de la base par celui du fichier. Les identifiants sont régénérés ; le rapprochement se fait par titre — en cas de doublon de titre dans le fichier, seule la dernière ligne portant ce titre est utilisée pour les relations.

⚠️ L'import est irréversible sans sauvegarde préalable — pensez à exporter avant d'importer si vous n'êtes pas sûr du contenu du fichier.

## Tâches

Un onglet dédié pour une liste de tâches simple : titre + coché/non coché, avec un lien optionnel vers **un** cours, un parcours ou un projet existant (jamais plusieurs à la fois). Indépendant des règles de propagation des autres entités.

## Workflow de développement (CI/CD)

- **CI** (`.github/workflows/ci.yml`) : à chaque push ou pull request vers `main`, GitHub Actions installe les dépendances, vérifie la syntaxe de tous les fichiers `.js` (y compris `middleware.js`, en ESM) et lance un audit de sécurité non bloquant.
- **CD** : gérée nativement par l'intégration Vercel↔GitHub. Chaque push sur une branche ou une pull request génère une preview deployment (URL commentée automatiquement sur la PR) ; chaque push sur `main` déploie en production.

Flux type depuis VS Code :
1. `git checkout -b ma-fonctionnalite`
2. Développer, commiter.
3. `git push -u origin ma-fonctionnalite`
4. Ouvrir une pull request sur GitHub.
5. La CI tourne, Vercel poste un lien de preview.
6. Merge dans `main` → déploiement en production automatique.
