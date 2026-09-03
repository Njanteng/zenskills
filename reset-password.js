// Réinitialise le mot de passe d'un compte existant (perte de mot de passe).
// À la différence de recréer le compte avec create-user.js, ceci conserve
// toutes les données de la personne (même user_id) :
//   node reset-password.js alice@example.com
// (le nouveau mot de passe est demandé ensuite, saisie masquée)
require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const { promptPassword } = require('./lib/promptPassword');

const [, , email] = process.argv;

if (!email) {
  console.error('Usage : node reset-password.js <email>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Aucune chaîne de connexion trouvée. Définissez DATABASE_URL (ou DATABASE_URL_UNPOOLED) dans votre .env.');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  const password = await promptPassword('Nouveau mot de passe (au moins 8 caractères) : ');
  if (password.length < 8) {
    console.error('❌ Le mot de passe doit faire au moins 8 caractères.');
    process.exit(1);
  }
  const confirm = await promptPassword('Confirmez le nouveau mot de passe : ');
  if (confirm !== password) {
    console.error('❌ Les deux saisies ne correspondent pas.');
    process.exit(1);
  }

  try {
    await client.connect();
    const hash = await bcrypt.hash(password, 12);
    const result = await client.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [hash, email.trim().toLowerCase()]
    );
    if (result.rowCount === 0) {
      console.error(`❌ Aucun compte trouvé pour ${email}.`);
      process.exitCode = 1;
    } else {
      console.log(`✅ Mot de passe réinitialisé pour ${email}. Ses données sont conservées.`);
    }
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
