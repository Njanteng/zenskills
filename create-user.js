// Crée un compte utilisateur. Aucune inscription publique dans l'app —
// c'est vous qui créez les comptes depuis votre machine :
//   node create-user.js alice@example.com "un mot de passe solide"
require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage : node create-user.js <email> <mot-de-passe>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('❌ Le mot de passe doit faire au moins 8 caractères.');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Aucune chaîne de connexion trouvée. Définissez DATABASE_URL (ou DATABASE_URL_UNPOOLED) dans votre .env.');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await client.connect();
    const hash = await bcrypt.hash(password, 12);
    await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      [email.trim().toLowerCase(), hash]
    );
    console.log(`✅ Compte créé pour ${email}. Cette personne peut maintenant se connecter sur /login.html.`);
  } catch (err) {
    if (err.code === '23505') {
      console.error('❌ Un compte existe déjà avec cet email.');
    } else {
      console.error('❌ Erreur :', err.message);
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
