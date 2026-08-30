# ZenSkills

Suivi de Cours, Parcours, Compétences, Projets et Tâches — multi-comptes, chaque compte a ses propres données, privées.

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
# éditez .env : DATABASE_URL_UNPOOLED = chaîne directe, DATABASE_URL = chaîne pooled
# générez un SESSION_SECRET :
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm run migrate
```
Idempotent — peut être relancé sans danger, y compris après une mise à jour du schéma.

### 3. Créer un premier compte
Pas d'inscription publique dans l'app — vous créez les comptes vous-même :
```bash
node create-user.js alice@example.com "un mot de passe solide"
```

### 4. Développement local
```bash
npm start
```
Ouvrez http://localhost:3000 → redirigé vers `/login.html` si aucune session valide.

### 5. Déployer sur Vercel
1. Poussez le projet sur GitHub, importez le dépôt dans Vercel.
2. **Settings → Environment Variables** : ajoutez `DATABASE_URL` (pooled) et `SESSION_SECRET` (Production, Preview, Development).
3. Déployez.

## Architecture

- `app.js` — l'application Express (routes + statique), sans `listen()`.
- `server.js` — point d'entrée pour le développement local (`npm start`).
- `api/index.js` — point d'entrée pour Vercel.
- `lib/auth.js` — signature/vérification des sessions (JWT dans un cookie httpOnly) et middleware `requireAuth`.
- `db.js` — pool de connexions Postgres (`pg`) vers Neon.
- `migrate.js` — crée/met à jour les tables (utilise `DATABASE_URL_UNPOOLED`).
- `create-user.js` — crée un compte utilisateur en ligne de commande.
- `routes/auth.js` — `POST /login`, `POST /logout`, `GET /me`.
- `routes/{cours,parcours,competences,projets,taches,dashboard,backup}.js` — API REST, chaque route filtrée par `req.userId`.
- `public/login.html` — page de connexion.
- `public/` — reste du frontend statique (HTML/CSS/JS vanilla).

## Authentification (comptes multiples, données privées)

Chaque personne a son propre compte et ses propres données — aucune n'est visible par les autres.

**Comment ça marche** :
- `POST /api/auth/login` vérifie l'email/mot de passe (hashé avec bcrypt), pose un cookie `httpOnly` signé (JWT, 30 jours) contenant l'identifiant du compte.
- Toutes les routes de données (`/api/cours`, `/api/parcours`, etc.) passent par le middleware `requireAuth`, qui exige ce cookie et l'attache à `req.userId` — chaque requête SQL filtre systématiquement par cette colonne.
- `index.html` (le squelette de l'app) reste accessible sans connexion — c'est une simple coquille HTML/JS sans données. Toute tentative d'appel API sans session valide renvoie 401, et le frontend redirige automatiquement vers `/login.html`.

**Ajouter un compte** : `node create-user.js email motdepasse` (en local, connecté à la même base que la prod).

**Migration depuis une version mono-utilisateur (sans comptes)** : si vous aviez des données créées avant cette mise à jour, elles n'ont pas de propriétaire (`user_id` NULL) et resteront invisibles. Avant de migrer : exportez vos données (`.xlsx`) avec l'ancienne version. Après avoir créé votre compte et vous être connecté : réimportez ce fichier depuis l'onglet correspondant — l'import attribue tout à votre compte actuellement connecté.

## Export / Import Excel (sauvegarde et restauration)

Deux boutons en bas de la barre latérale, **scopés au compte connecté** :
- **Exporter (.xlsx)** : télécharge uniquement vos données (`Cours`, `Competences`, `Cours_Competences`, `Parcours`, `Parcours_Cours`, `Projets`, `Taches`). Les onglets de liaison représentent les relations par **titre/nom**.
- **Importer (.xlsx)** : après confirmation, remplace **vos** données par celles du fichier — les autres comptes ne sont jamais affectés. Rapprochement par titre ; en cas de doublon dans le fichier, seule la dernière ligne portant ce titre est utilisée pour les relations.

⚠️ Irréversible sans sauvegarde préalable.

## Tâches

Titre + description + coché/non coché, avec un lien optionnel vers **un** cours, un parcours ou un projet de votre compte (jamais plusieurs à la fois). Les descriptions (comme partout ailleurs dans l'app) conservent les sauts de ligne à l'affichage.

## Workflow de développement (CI/CD)

- **CI** (`.github/workflows/ci.yml`) : à chaque push ou pull request vers `main`, installe les dépendances, vérifie la syntaxe de tous les fichiers `.js`, audit non bloquant.
- **CD** : intégration native Vercel↔GitHub — preview par branche/PR, production sur `main`.

Flux type :
```bash
git checkout -b ma-fonctionnalite
# développer, commiter
git push -u origin ma-fonctionnalite
```
Ouvrir la PR sur GitHub → CI + preview Vercel → merge dans `main` → déploiement en production.

