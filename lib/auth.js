const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'zenskills_session';
const SESSION_DURATION = '30d'; // reste connecté longtemps, reconnexion rare

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET manquant dans les variables d\'environnement.');
  }
  return secret;
}

function signSession(userId) {
  return jwt.sign({ userId }, getSecret(), { expiresIn: SESSION_DURATION });
}

function verifySession(token) {
  return jwt.verify(token, getSecret()); // lève une exception si invalide/expiré
}

function setSessionCookie(res, userId) {
  const token = signSession(userId);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 jours, en ms
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: 'lax' });
}

// Middleware Express : exige une session valide, attache req.userId.
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = verifySession(token);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}

module.exports = { COOKIE_NAME, setSessionCookie, clearSessionCookie, requireAuth, verifySession };
