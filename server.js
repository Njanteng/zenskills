// Point d'entrée pour le développement local : `npm start` ou `node server.js`.
// Sur Vercel, ce fichier n'est jamais exécuté — c'est api/index.js qui est utilisé,
// car Vercel exécute l'app à la demande plutôt que de garder un process ouvert.
require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ZenSkills est lancé : http://localhost:${PORT}`);
});
