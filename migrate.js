// Script à lancer en local pour créer/mettre à jour les tables dans Neon :
//   node migrate.js
// Idempotent. Depuis cette version, le serveur applique aussi ce même schéma
// automatiquement à chaque démarrage (voir db.js) — ce script reste utile pour
// une première installation, ou pour vérifier/forcer la mise à jour manuellement.
require('dotenv').config();
const { Client } = require('pg');
const { SCHEMA_SQL } = require('./schema');

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Aucune chaîne de connexion trouvée. Définissez DATABASE_URL (ou DATABASE_URL_UNPOOLED) dans votre .env.');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    await client.connect();
    console.log('Connecté à Neon. Création/mise à jour des tables…');
    await client.query(SCHEMA_SQL);
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
