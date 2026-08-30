// Script à lancer en local pour créer/mettre à jour les tables dans Neon :
//   node migrate.js
// Idempotent pour une base neuve. Sur une base existante (pré-multi-comptes),
// les colonnes user_id sont ajoutées NULLABLES (impossible d'imposer NOT NULL
// sur des lignes déjà existantes sans propriétaire) — voir le README pour la
// procédure de migration des données existantes (export puis ré-import une
// fois connecté sur un compte).
require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Aucune chaîne de connexion trouvée. Définissez DATABASE_URL (ou DATABASE_URL_UNPOOLED) dans votre .env.');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const SCHEMA = `
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
  niveau_maitrise INTEGER
);

CREATE TABLE IF NOT EXISTS competences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  description TEXT DEFAULT '',
  statut INTEGER NOT NULL DEFAULT 0,
  niveau_maitrise INTEGER
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

-- Mises à jour idempotentes pour une base déjà existante (pré-multi-comptes) :
ALTER TABLE cours ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE competences ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE parcours ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE projets ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE taches ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
`;

(async () => {
  try {
    await client.connect();
    console.log('Connecté à Neon. Création/mise à jour des tables…');
    await client.query(SCHEMA);
    console.log('✅ Schéma prêt.');
    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM cours WHERE user_id IS NULL');
    if (rows[0].n > 0) {
      console.log(`⚠️  ${rows[0].n} cours existant(s) sans propriétaire (user_id NULL) — invisibles tant qu'ils ne sont pas ré-importés sous un compte. Voir le README ("Migration depuis une version mono-utilisateur").`);
    }
  } catch (err) {
    console.error('❌ Erreur pendant la migration :', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
