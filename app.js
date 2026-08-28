const express = require('express');
const path = require('path');

const coursRoutes = require('./routes/cours');
const parcoursRoutes = require('./routes/parcours');
const competencesRoutes = require('./routes/competences');
const projetsRoutes = require('./routes/projets');
const tachesRoutes = require('./routes/taches');
const dashboardRoutes = require('./routes/dashboard');
const backupRoutes = require('./routes/backup');

const app = express();

app.use(express.json());

// En local (node server.js / npm start), on sert aussi les fichiers statiques
// directement depuis Express. Sur Vercel, le dossier public/ est servi par la
// plateforme elle-même.
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/cours', coursRoutes);
app.use('/api/parcours', parcoursRoutes);
app.use('/api/competences', competencesRoutes);
app.use('/api/projets', projetsRoutes);
app.use('/api/taches', tachesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', backupRoutes); // expose /api/export et /api/import

// Fallback pour le développement local uniquement (SPA à une seule page).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erreur serveur' });
});

module.exports = app;
