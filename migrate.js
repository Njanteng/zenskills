// Script à lancer en local pour créer/mettre à jour les tables dans Neon :
//   node migrate.js
// Idempotent : peut être relancé sans danger (CREATE TABLE IF NOT EXISTS).
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
CREATE TABLE IF NOT EXISTS cours (
  id SERIAL PRIMARY KEY,
  titre TEXT NOT NULL,
  description TEXT DEFAULT '',
  statut INTEGER NOT NULL DEFAULT 0,
  categorie TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'VIDEO',
  niveau_maitrise INTEGER
);

CREATE TABLE IF NOT EXISTS competences (
  id SERIAL PRIMARY KEY,
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
  titre TEXT NOT NULL,
  description TEXT DEFAULT '',
  statut INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS taches (
  id SERIAL PRIMARY KEY,
  titre TEXT NOT NULL,
  statut INTEGER NOT NULL DEFAULT 0,
  cours_id INTEGER REFERENCES cours(id) ON DELETE SET NULL,
  parcours_id INTEGER REFERENCES parcours(id) ON DELETE SET NULL,
  projet_id INTEGER REFERENCES projets(id) ON DELETE SET NULL,
  CONSTRAINT taches_un_seul_lien CHECK (num_nonnulls(cours_id, parcours_id, projet_id) <= 1)
);
`;

(async () => {
  try {
    await client.connect();
    console.log('Connecté à Neon. Création/mise à jour des tables…');
    await client.query(SCHEMA);
    console.log('✅ Schéma prêt.');
  } catch (err) {
    console.error('❌ Erreur pendant la migration :', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
