const { Pool } = require('pg');

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

module.exports = { pool };
