/* ============================================================
   sw.js – "service worker" : permet à l'app de s'ouvrir sans réseau
   Les fichiers de l'app sont gardés en mémoire sur le téléphone.
   Stratégie : on affiche tout de suite la version en mémoire, et on
   télécharge la nouvelle version en arrière-plan.
   Les services en ligne (IGN, Photon) ne sont jamais mis en mémoire.
   Quand on change un fichier de l'app : changer le numéro de CACHE
   (v8 -> v9…) pour que les téléphones reprennent tous les fichiers.
   ============================================================ */

const CACHE = 'carnet-taxi-v8';
const FICHIERS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/recherche-lieux.js',
  './js/adresses.js',
  './js/tarif-medical.js',
  './js/app.js',
  './data/etablissements-06.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  // cache: 'reload' = toujours prendre les fichiers frais sur le serveur,
  // jamais une vieille copie gardée par le navigateur (GitHub Pages : 10 min)
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(FICHIERS.map(f => new Request(f, { cache: 'reload' })))));
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
  if (new URL(requete.url).origin !== self.location.origin) return;   // services en ligne : réseau direct

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const enMemoire = await cache.match(requete, { ignoreSearch: true })
      || (requete.mode === 'navigate' ? await cache.match('./index.html') : undefined);

    // cache: 'no-cache' = demande au serveur s'il y a plus récent
    const depuisReseau = fetch(requete.url, { cache: 'no-cache' })
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
