// Routing Middleware Vercel : s'exécute AVANT le routage vers les fichiers
// statiques (public/) ou vers la fonction API (api/index.js). C'est donc le
// bon endroit pour protéger l'application entière avec une authentification
// HTTP Basic simple — pas seulement les routes /api/*.
//
// Ne protège rien en local (`npm start`) : ce fichier n'est interprété que
// par la plateforme Vercel. Pour tester en local, utilisez `vercel dev`.
import { next } from '@vercel/edge';

export const config = {
  matcher: '/(.*)',
};

export default function middleware(request) {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASSWORD;

  // Si les identifiants ne sont pas configurés sur Vercel, on ne bloque
  // personne plutôt que de casser silencieusement le site (mais pensez à
  // bien les définir avant de considérer l'app comme protégée).
  if (!expectedUser || !expectedPass) {
    return next();
  }

  const authHeader = request.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Basic ')) {
    const decoded = atob(authHeader.slice(6));
    const separatorIndex = decoded.indexOf(':');
    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);

    if (user === expectedUser && pass === expectedPass) {
      return next();
    }
  }

  return new Response('Authentification requise.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ZenSkills"' }
  });
}
