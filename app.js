const express = require('express');
const path = require('path');

const coursRoutes = require('./routes/cours');
const parcoursRoutes = require('./routes/parcours');
const competencesRoutes = require('./routes/competences');
const projetsRoutes = require('./routes/projets');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

app.use(express.json());

// En local (node server.js / npm start), on sert aussi les fichiers statiques
// directement depuis Express. Sur Vercel, le dossier public/ est servi par la
// plateforme elle-même — ce middleware ne fait alors rien pour les requêtes /api.
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/cours', coursRoutes);
app.use('/api/parcours', parcoursRoutes);
app.use('/api/competences', competencesRoutes);
app.use('/api/projets', projetsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Fallback pour le développement local uniquement (SPA à une seule page).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestionnaire d'erreurs global : toute route qui appelle next(err) atterrit ici.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erreur serveur' });
});

module.exports = app;
