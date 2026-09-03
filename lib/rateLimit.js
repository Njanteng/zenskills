// Limiteur de tentatives simple, en mémoire — sans dépendance externe.
// Limite : ce compteur vit dans la mémoire du process. Sur Vercel, une fonction
// serverless peut redémarrer (nouvelle instance) et repartir de zéro ; ce n'est
// donc pas une garantie absolue en environnement multi-instances, mais ça relève
// déjà nettement la barrière pour un brute-force basique (l'instance reste
// chaude entre requêtes rapprochées dans la plupart des cas réels).
const attempts = new Map(); // clé -> [timestamps]

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

function cleanup(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter(t => now - t < WINDOW_MS);
  attempts.set(key, list);
  return list;
}

// Middleware Express : à poser sur la route de login uniquement.
function loginRateLimit(req, res, next) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const key = `${req.ip}:${email}`;
  const recent = cleanup(key);

  if (recent.length >= MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (Date.now() - recent[0])) / 1000);
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  }

  recent.push(Date.now());
  attempts.set(key, recent);
  next();
}

module.exports = { loginRateLimit };
