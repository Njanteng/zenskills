const { Pool } = require('pg');
const { SCHEMA_SQL } = require('./schema');

if (!process.env.DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL manquant. Ajoutez-le dans un fichier .env (local) ou dans les variables d\'environnement Vercel.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Neon exige TLS
});

// Sur Vercel (Fluid compute), on réutilise les connexions entre requêtes plutôt que
// d'en ouvrir une nouvelle à chaque fois.
if (process.env.VERCEL) {
  try {
    const { attachDatabasePool } = require('@vercel/functions');
    attachDatabasePool(pool);
  } catch (err) {
    console.warn('@vercel/functions indisponible, connexion non attachée au cycle de vie de la fonction.', err.message);
  }
}

// Applique le schéma (idempotent) une seule fois par process, au démarrage — un
// déploiement ne casse plus silencieusement faute d'avoir lancé `npm run migrate`
// à la main. Non bloquant : si ça échoue (ex. base injoignable), on log une erreur
// claire plutôt que de faire planter le serveur au démarrage.
let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured) return;
  schemaEnsured = true;
  try {
    await pool.query(SCHEMA_SQL);
  } catch (err) {
    console.error('⚠️  Impossible d\'appliquer automatiquement le schéma au démarrage :', err.message);
  }
}
ensureSchema();

module.exports = { pool };
