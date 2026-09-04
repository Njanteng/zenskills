const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { setSessionCookie, clearSessionCookie, requireAuth, COOKIE_NAME, verifySession } = require('../lib/auth');
const { loginRateLimit } = require('../lib/rateLimit');

const router = express.Router();

router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    setSessionCookie(res, user.id);
    res.json({ email: user.email });
  } catch (err) { next(err); }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get('/me', async (req, res) => {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = verifySession(token);
    const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [payload.userId]);
    if (!rows[0]) return res.status(401).json({ error: 'Non authentifié' });
    res.json({ email: rows[0].email });
  } catch (err) {
    res.status(401).json({ error: 'Session invalide ou expirée' });
  }
});

// POST /api/auth/change-password — changement de mot de passe en libre-service,
// exige d'être connecté ET de fournir le mot de passe actuel.
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Non authentifié' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.userId]);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
