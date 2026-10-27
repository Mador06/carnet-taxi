/* ============================================================
   adresses.js – suggestions d'adresses et distance par la route
   Services publics gratuits de la Géoplateforme IGN (sans clé) :
   - Géocodage (ex-Base Adresse Nationale) : data.geopf.fr/geocodage
   - Itinéraire : data.geopf.fr/navigation/itineraire
   Les lieux par leur nom (établissements, Photon) sont
   dans recherche-lieux.js.
   Si pas de réseau : l'app continue (adresse libre, km à la main).
   ============================================================ */

const URL_GEOCODAGE = 'https://data.geopf.fr/geocodage/search';
const URL_ITINERAIRE = 'https://data.geopf.fr/navigation/itineraire';
const CANNES = { lat: 43.5528, lon: 7.0174 };

// 📍 Cherche des adresses qui commencent par "texte", en favorisant Cannes et le 06
async function chercherAdresses(texte, signal, nombre = 4) {
  const params = new URLSearchParams({
    q: texte,
    autocomplete: '1',
    lat: CANNES.lat,
    lon: CANNES.lon,
    limit: '8'
  });
  const rep = await fetch(`${URL_GEOCODAGE}?${params}`, { signal });
  if (!rep.ok) throw new Error('Géocodage indisponible (' + rep.status + ')');
  const json = await rep.json();
  const resultats = (json.features || []).map(f => {
    const p = f.properties;
    return {
      type: 'adresse',
      nom: p.name,
      detail: [p.postcode, p.city].filter(Boolean).join(' '),
      adresse: p.label,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      departement: p.depcode || String(p.postcode || '').slice(0, 2)
    };
  });
  // Les adresses des Alpes-Maritimes passent en premier
  const du06 = resultats.filter(r => r.departement === '06');
  const autres = resultats.filter(r => r.departement !== '06');
  return du06.concat(autres).slice(0, nombre);
}

// Distance en km par la route (voiture) entre deux points {lat, lon}
async function calculerDistanceRoute(depart, arrivee) {
  const params = new URLSearchParams({
    resource: 'bdtopo-valhalla',
    start: `${depart.lon},${depart.lat}`,
    end: `${arrivee.lon},${arrivee.lat}`,
    profile: 'car',
    optimization: 'fastest',
    distanceUnit: 'kilometer',
    getSteps: 'false',
    getBbox: 'false'
  });
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), 10000); // 10 s max
  try {
    const rep = await fetch(`${URL_ITINERAIRE}?${params}`, { signal: controle.signal });
    if (!rep.ok) throw new Error('Itinéraire indisponible (' + rep.status + ')');
    const json = await rep.json();
    if (typeof json.distance !== 'number') throw new Error('Réponse inattendue');
    return json.distance;
  } finally {
    clearTimeout(minuteur);
  }
}

const ICONES = { etablissement: '🏥', adresse: '📍', lieu: '🌐' };

// Texte écrit dans le champ quand on choisit une suggestion
function texteDuChamp(suggestion) {
  if (suggestion.type === 'adresse') return suggestion.adresse;
  return suggestion.adresse ? `${suggestion.nom} — ${suggestion.adresse}` : suggestion.nom;
}

// Ajoute la liste de suggestions sous un champ texte.
// quandChoisi(coordonnees) est appelé avec {lat, lon}, ou null si l'adresse
// a été retapée à la main (on n'a alors plus de coordonnées fiables).
function brancherSuggestions(champ, quandChoisi) {
  const liste = document.createElement('ul');
  liste.className = 'suggestions';
  liste.hidden = true;
  champ.closest('.champ-adresse').appendChild(liste);

  let minuteur = null;
  let controle = null;
  let numero = 0;   // pour ignorer une réponse arrivée après une nouvelle frappe

  function fermer() {
    liste.hidden = true;
    liste.replaceChildren();
  }

  async function choisir(suggestion) {
    numero++;
    if (controle) controle.abort();
    fermer();
    definirAdresse(champ, { label: texteDuChamp(suggestion), lat: suggestion.lat, lon: suggestion.lon });
    let coordonnees = lireCoordonnees(champ);
    // Lieu sans coordonnées : on retrouve sa position grâce à son adresse
    if (!coordonnees && suggestion.adresse) {
      try {
        const [trouve] = await chercherAdresses(suggestion.adresse, undefined, 1);
        if (trouve) {
          champ.dataset.lat = trouve.lat;
          champ.dataset.lon = trouve.lon;
          coordonnees = lireCoordonnees(champ);
        }
      } catch (e) { /* hors ligne : km à la main */ }
    }
    quandChoisi(coordonnees);
  }

  function afficher(suggestions, avecPhoton) {
    liste.replaceChildren();
    if (document.activeElement !== champ) { liste.hidden = true; return; }   // on a quitté le champ entre-temps
    for (const s of suggestions) {
      const bouton = el('button', { type: 'button', className: 'suggestion' },
        el('span', { className: 'sugg-icone', textContent: ICONES[s.type] }),
        el('span', { className: 'sugg-texte' },
          el('strong', { textContent: s.nom }),
          s.detail ? el('small', { textContent: s.detail }) : null
        )
      );
      // pointerdown plutôt que click : le choix est pris avant que le champ perde le focus
      bouton.addEventListener('pointerdown', e => {
        e.preventDefault();
        choisir(s);
      });
      liste.append(el('li', {}, bouton));
    }
    if (avecPhoton) {
      liste.append(el('li', { className: 'sugg-source', textContent: '🌐 Lieux : © OpenStreetMap, via Photon' }));
    }
    liste.hidden = suggestions.length === 0;
    // Une seule liste ouverte à la fois
    if (!liste.hidden) {
      document.querySelectorAll('.suggestions').forEach(autre => { if (autre !== liste) autre.hidden = true; });
    }
  }

  champ.addEventListener('input', () => {
    definirAdresse(champ, null, true);
    quandChoisi(null);
    clearTimeout(minuteur);
    const texte = champ.value.trim();
    if (texte.length < 3) { numero++; fermer(); return; }

    // On attend que la frappe se calme avant de chercher
    minuteur = setTimeout(async () => {
      const n = ++numero;
      if (controle) controle.abort();
      controle = new AbortController();
      const signal = controle.signal;

      // 1. Tout de suite : 🏥 établissements (marche hors ligne)
      const locaux = await chercherLieuxLocaux(texte);
      if (n !== numero) return;
      afficher(locaux, false);

      // 2. Puis, si réseau : 📍 adresses, et 🌐 lieux en ligne seulement si rien en local
      const [adresses, enLigne] = await Promise.all([
        chercherAdresses(texte, signal).catch(() => []),
        locaux.length ? [] : chercherLieuxEnLigne(texte, signal).catch(() => [])
      ]);
      if (n !== numero) return;
      // Adresses hors du 06 : seulement s'il n'y a rien de mieux
      const rienDautre = locaux.length === 0 && enLigne.length === 0;
      const adressesUtiles = rienDautre ? adresses : adresses.filter(a => a.departement === '06');
      afficher([...locaux, ...adressesUtiles, ...enLigne], enLigne.length > 0);
    }, 250);
  });

  champ.addEventListener('blur', () => setTimeout(fermer, 150));
}

// Remplit un champ adresse et garde ses coordonnées à côté.
// garderTexte = true : ne touche pas au texte (on efface seulement les coordonnées).
function definirAdresse(champ, lieu, garderTexte = false) {
  if (!garderTexte) champ.value = lieu ? lieu.label : '';
  delete champ.dataset.lat;
  delete champ.dataset.lon;
  if (lieu && lieu.lat != null && lieu.lon != null) {
    champ.dataset.lat = lieu.lat;
    champ.dataset.lon = lieu.lon;
  }
}

// Coordonnées d'un champ adresse, ou null si l'adresse a été saisie librement
function lireCoordonnees(champ) {
  if (!champ.dataset.lat || !champ.dataset.lon) return null;
  return { lat: Number(champ.dataset.lat), lon: Number(champ.dataset.lon) };
}
