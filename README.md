# ZenSkills

Suivi de Cours, Parcours, Compétences, Projets et Tâches — multi-comptes, chaque compte a ses propres données, privées. "If you don't use it, you will lose it."

## Déploiement sur Vercel + Neon

### 1. Créer la base Neon
1. Créez un compte sur [neon.com](https://neon.com) et un nouveau projet (ex. "zenskills").
2. Dans **Connection Details**, récupérez deux chaînes de connexion :
   - la version **pooled** (hôte contenant `-pooler`)
   - la version **directe** (sans `-pooler`)

### 2. Configurer l'environnement
```bash
npm install
cp .env.example .env
# éditez .env : DATABASE_URL_UNPOOLED = chaîne directe, DATABASE_URL = chaîne pooled
# générez un SESSION_SECRET :
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Pas besoin de lancer une migration manuellement : le schéma s'applique automatiquement au démarrage du serveur (voir "Schéma de base de données" plus bas). `npm run migrate` reste disponible si vous préférez l'appliquer explicitement avant le premier démarrage.

### 3. Créer un premier compte
Pas d'inscription publique dans l'app — vous créez les comptes vous-même :
```bash
node create-user.js alice@example.com
```
Le mot de passe est demandé ensuite dans le terminal, saisie masquée (jamais en argument de commande, donc jamais dans l'historique du shell).

### 4. Développement local
```bash
npm start
```
Ouvrez http://localhost:3000 → redirigé vers `/login.html` si aucune session valide.

### 5. Déployer sur Vercel
1. Poussez le projet sur GitHub, importez le dépôt dans Vercel.
2. **Settings → Environment Variables** : ajoutez `DATABASE_URL` (pooled) et `SESSION_SECRET` (Production, Preview, Development).
3. Déployez.

⚠️ **Les previews Vercel partagent la même base Neon que la production** — un test malheureux sur une URL de preview (import Excel, suppression en masse…) touche vos vraies données. Pour l'éviter, Neon propose une fonctionnalité de **branches de base de données** : une copie isolée de la base, créée/détruite automatiquement pour chaque pull request, via l'intégration Neon↔Vercel ou Neon↔GitHub. C'est une configuration à faire depuis les tableaux de bord Neon et Vercel (pas du code) — voir la documentation Neon "Database branching with Vercel" si vous voulez la mettre en place.

## Architecture

- `app.js` — l'application Express (routes + statique), sans `listen()`.
- `server.js` — point d'entrée pour le développement local (`npm start`).
- `api/index.js` — point d'entrée pour Vercel.
- `lib/auth.js` — signature/vérification des sessions (JWT dans un cookie httpOnly) et middleware `requireAuth`.
- `lib/rateLimit.js` — limiteur de tentatives (en mémoire) pour la route de connexion.
- `lib/promptPassword.js` — saisie de mot de passe masquée dans le terminal, pour les scripts CLI.
- `db.js` — pool de connexions Postgres (`pg`) vers Neon ; applique aussi le schéma au démarrage (voir plus bas).
- `schema.js` — le schéma SQL (idempotent), partagé entre `db.js` et `migrate.js`.
- `migrate.js` — applique le schéma manuellement (optionnel, voir plus bas).
- `create-user.js` — crée un compte utilisateur (email en argument, mot de passe demandé ensuite).
- `reset-password.js` — réinitialise le mot de passe d'un compte existant sans perdre ses données.
- `routes/auth.js` — `POST /login`, `POST /logout`, `GET /me`, `POST /change-password`.
- `routes/{cours,parcours,competences,projets,taches,dashboard,backup}.js` — API REST, chaque route filtrée par `req.userId`.
- `public/login.html` — page de connexion.
- `public/` — reste du frontend statique (HTML/CSS/JS vanilla).
- `test/` — tests unitaires (`node:test`, aucune dépendance supplémentaire).

## Schéma de base de données

Le schéma (`schema.js`) est appliqué automatiquement **une fois par démarrage du serveur** (`db.js`), de façon idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) — un déploiement ne casse plus silencieusement faute d'avoir pensé à lancer une migration à la main. Si l'application du schéma échoue au démarrage (ex. base injoignable), ça n'empêche pas le serveur de démarrer : l'erreur est simplement loguée, et les requêtes qui en dépendent échoueront normalement le temps que ce soit corrigé.

`npm run migrate` reste disponible pour appliquer le schéma manuellement (utile pour une première installation ou pour diagnostiquer un souci de connexion à la base indépendamment du serveur).

## Authentification (comptes multiples, données privées)

Chaque personne a son propre compte et ses propres données — aucune n'est visible par les autres.

**Comment ça marche** :
- `POST /api/auth/login` vérifie l'email/mot de passe (hashé avec bcrypt), pose un cookie `httpOnly` signé (JWT, 30 jours) contenant l'identifiant du compte. Limité à 5 tentatives par 15 minutes (par IP + email) pour freiner le brute-force.
- Toutes les routes de données passent par le middleware `requireAuth`, qui exige ce cookie et l'attache à `req.userId` — chaque requête SQL filtre systématiquement par cette colonne.
- `index.html` (le squelette de l'app) reste accessible sans connexion — c'est une simple coquille HTML/JS sans données. Toute tentative d'appel API sans session valide renvoie 401, et le frontend redirige automatiquement vers `/login.html`.

**Gestion des comptes (ligne de commande, pas d'inscription publique)** :
- Créer un compte : `node create-user.js email@exemple.com` (mot de passe demandé ensuite, saisie masquée).
- Mot de passe perdu : `node reset-password.js email@exemple.com` — réinitialise sans recréer le compte, donc sans perdre les données associées.
- Changer son propre mot de passe en étant connecté : bouton "Changer le mot de passe" dans la barre latérale.

**Migration depuis une version mono-utilisateur (sans comptes)** : si vous aviez des données créées avant l'introduction des comptes, elles n'ont pas de propriétaire (`user_id` NULL) et resteront invisibles. Avant de migrer : exportez vos données (`.xlsx`) avec l'ancienne version. Après avoir créé votre compte et vous être connecté : réimportez ce fichier — l'import attribue tout à votre compte actuellement connecté.

## Export / Import Excel (sauvegarde et restauration)

Deux boutons en bas de la barre latérale, **scopés au compte connecté** :
- **Exporter (.xlsx)** : télécharge uniquement vos données (`Cours`, `Competences`, `Cours_Competences`, `Parcours`, `Parcours_Cours`, `Projets`, `Taches`). Les onglets de liaison représentent les relations par **titre/nom**.
- **Importer (.xlsx)** : après confirmation, remplace **vos** données par celles du fichier — les autres comptes ne sont jamais affectés. Rapprochement par titre ; en cas de doublon dans le fichier, seule la dernière ligne portant ce titre est utilisée pour les relations.

⚠️ Irréversible sans sauvegarde préalable.

## Tâches

Titre + description + coché/non coché, avec un lien optionnel vers **un** cours, un parcours ou un projet de votre compte (jamais plusieurs à la fois). Les descriptions (comme partout ailleurs dans l'app) conservent les sauts de ligne à l'affichage.

## Date de dernière révision

Sur les Cours terminés et les Compétences acquises : un bouton icône **↻** enregistre la date du jour, indépendamment du statut. N'apparaît que sur les éléments terminés/acquis.

Sur le tableau de bord, deux panneaux côte à côte sur grand écran (empilés sur mobile) — **"Cours à revoir"** et **"Compétences à revoir"** — listent chacun vos 20 éléments les plus anciennement révisés (ou jamais révisés, qui passent en premier), sans condition de délai : toujours les 20 plus prioritaires, quoi qu'il arrive.

## Vues dédiées depuis le tableau de bord

Les cartes **Parcours**, **Compétences** et **Projets** du tableau de bord sont cliquables (Cours ne l'est pas) :
- **Parcours** → liste de tous les parcours (ratio + barre de progression en haut de chaque carte, nom en bas) → cliquer un parcours ouvre une vue "chemin" façon Duolingo, où chaque cours se coche directement. Une petite animation salue le passage à 100% d'un parcours.
- **Compétences** → tableau de badges : médaille 🏅 pour chaque compétence acquise, cadenas 🔒 grisé pour celles pas encore acquises (façon Pokédex — l'objectif à atteindre reste visible).
- **Projets** → même principe : trophée 🏆 pour chaque projet terminé, cadenas grisé pour les autres.

## Workflow de développement (CI/CD)

- **CI** (`.github/workflows/ci.yml`) : à chaque push ou pull request vers `main`, installe les dépendances, vérifie la syntaxe de tous les fichiers `.js`, lance les tests (`npm test`), audit de sécurité non bloquant.
- **CD** : intégration native Vercel↔GitHub — preview par branche/PR, production sur `main`.

Flux type :
```bash
git checkout -b ma-fonctionnalite
# développer, commiter
git push -u origin ma-fonctionnalite
```
Ouvrir la PR sur GitHub → CI + preview Vercel → merge dans `main` → déploiement en production.

## Tests

`npm test` lance la suite de tests unitaires (`node:test`, natif, aucune dépendance ajoutée). Couverture actuelle : la fonction de pagination (`utils.js`). C'est un point de départ, pas une couverture exhaustive — les routes elles-mêmes (dépendantes d'une vraie connexion à la base) n'ont pas de tests d'intégration pour l'instant.
