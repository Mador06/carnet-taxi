/* ============================================================
   sw.js – "service worker" : permet à l'app de s'ouvrir sans réseau
   Les fichiers de l'app sont gardés en mémoire sur le téléphone.
   Stratégie : on affiche tout de suite la version en mémoire, et on
   télécharge la nouvelle version en arrière-plan (visible au
   lancement suivant).
   Les services d'adresses / d'itinéraire (IGN) ne sont jamais mis en mémoire.
   ============================================================ */

const CACHE = 'carnet-taxi-v1';
const FICHIERS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/adresses.js',
  './js/tarif-medical.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FICHIERS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(noms => Promise.all(noms.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  if (new URL(requete.url).origin !== self.location.origin) return;   // IGN : réseau direct

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const enMemoire = await cache.match(requete, { ignoreSearch: true })
      || (requete.mode === 'navigate' ? await cache.match('./index.html') : undefined);

    const depuisReseau = fetch(requete)
      .then(reponse => {
        if (reponse.ok) cache.put(requete, reponse.clone());
        return reponse;
      })
      .catch(() => undefined);

    if (enMemoire) {
      event.waitUntil(depuisReseau);
      return enMemoire;
    }
    return (await depuisReseau) || new Response('Hors ligne', { status: 503 });
  })());
});
