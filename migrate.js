// Script à lancer UNE SEULE FOIS en local pour créer les tables dans Neon :
//   node migrate.js
//
// Utilise DATABASE_URL_UNPOOLED si disponible (recommandé pour ce type d'opération,
// c'est la chaîne "directe" fournie par Neon), sinon retombe sur DATABASE_URL.
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
`;

(async () => {
  try {
    await client.connect();
    console.log('Connecté à Neon. Création des tables…');
    await client.query(SCHEMA);
    console.log('✅ Schéma créé (ou déjà existant). Base prête.');
  } catch (err) {
    console.error('❌ Erreur pendant la migration :', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
