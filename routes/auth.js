const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { setSessionCookie, clearSessionCookie, requireAuth, COOKIE_NAME, verifySession } = require('../lib/auth');

const router = express.Router();

router.post('/login', async (req, res, next) => {
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

module.exports = router;
