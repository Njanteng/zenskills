const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const { requireAuth } = require('./lib/auth');

const authRoutes = require('./routes/auth');
const coursRoutes = require('./routes/cours');
const parcoursRoutes = require('./routes/parcours');
const competencesRoutes = require('./routes/competences');
const projetsRoutes = require('./routes/projets');
const tachesRoutes = require('./routes/taches');
const dashboardRoutes = require('./routes/dashboard');
const backupRoutes = require('./routes/backup');

const app = express();

app.use(express.json());
app.use(cookieParser());

// En local (node server.js / npm start), on sert aussi les fichiers statiques
// directement depuis Express. Sur Vercel, le dossier public/ est servi par la
// plateforme elle-même. index.html (le shell de l'app) reste accessible sans
// connexion — seules les routes /api/* de données exigent une session valide.
app.use(express.static(path.join(__dirname, 'public')));

// Routes d'authentification : jamais derrière requireAuth (sinon impossible de se connecter).
app.use('/api/auth', authRoutes);

// Tout le reste de l'API exige une session valide.
app.use('/api/cours', requireAuth, coursRoutes);
app.use('/api/parcours', requireAuth, parcoursRoutes);
app.use('/api/competences', requireAuth, competencesRoutes);
app.use('/api/projets', requireAuth, projetsRoutes);
app.use('/api/taches', requireAuth, tachesRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api', requireAuth, backupRoutes); // /api/export et /api/import

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
