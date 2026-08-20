// Vercel traite ce fichier comme une fonction serverless : toute requête vers
// /api/* est acheminée ici (voir vercel.json), et l'app Express gère le routage
// interne exactement comme en local.
module.exports = require('../app');
