// Schéma SQL partagé — idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
// Utilisé par migrate.js (exécution manuelle) ET par db.js (exécuté automatiquement
// une fois au démarrage du serveur), pour qu'un déploiement ne casse plus jamais
// silencieusement faute d'avoir pensé à lancer `npm run migrate` à la main.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cours (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  description TEXT DEFAULT '',
  statut INTEGER NOT NULL DEFAULT 0,
  categorie TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'VIDEO',
  niveau_maitrise INTEGER,
  derniere_revision DATE
);

CREATE TABLE IF NOT EXISTS competences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT DEFAULT '',
  statut INTEGER NOT NULL DEFAULT 0,
  niveau_maitrise INTEGER,
  derniere_revision DATE
);

CREATE TABLE IF NOT EXISTS cours_competences (
  cours_id INTEGER NOT NULL REFERENCES cours(id) ON DELETE CASCADE,
  competence_id INTEGER NOT NULL REFERENCES competences(id) ON DELETE CASCADE,
  PRIMARY KEY (cours_id, competence_id)
);

CREATE TABLE IF NOT EXISTS parcours (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS parcours_cours (
  parcours_id INTEGER NOT NULL REFERENCES parcours(id) ON DELETE CASCADE,
  cours_id INTEGER NOT NULL REFERENCES cours(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'Obligatoire',
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (parcours_id, cours_id)
);

CREATE TABLE IF NOT EXISTS projets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  description TEXT DEFAULT '',
  statut INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  description TEXT DEFAULT '',
  statut INTEGER NOT NULL DEFAULT 0,
  cours_id INTEGER REFERENCES cours(id) ON DELETE SET NULL,
  parcours_id INTEGER REFERENCES parcours(id) ON DELETE SET NULL,
  projet_id INTEGER REFERENCES projets(id) ON DELETE SET NULL,
  CONSTRAINT taches_un_seul_lien CHECK (num_nonnulls(cours_id, parcours_id, projet_id) <= 1)
);

ALTER TABLE cours ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE competences ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE parcours ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE projets ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE cours ADD COLUMN IF NOT EXISTS derniere_revision DATE;
ALTER TABLE competences ADD COLUMN IF NOT EXISTS derniere_revision DATE;
`;

module.exports = { SCHEMA_SQL };
