/* ============================================================
   adresses.js – suggestions d'adresses et distance par la route
   Services publics gratuits de la Géoplateforme IGN (sans clé) :
   - Géocodage (ex-Base Adresse Nationale) : data.geopf.fr/geocodage
   - Itinéraire : data.geopf.fr/navigation/itineraire
   Si pas de réseau : l'app continue (adresse libre, km à la main).
   ============================================================ */

const URL_GEOCODAGE = 'https://data.geopf.fr/geocodage/search';
const URL_ITINERAIRE = 'https://data.geopf.fr/navigation/itineraire';
const CANNES = { lat: 43.5528, lon: 7.0174 };

// Cherche des adresses qui commencent par "texte", en favorisant Cannes et le 06
async function chercherAdresses(texte, signal) {
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
  const resultats = (json.features || []).map(f => ({
    label: f.properties.label,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    departement: f.properties.depcode || String(f.properties.postcode || '').slice(0, 2)
  }));
  // Les adresses des Alpes-Maritimes passent en premier
  const du06 = resultats.filter(r => r.departement === '06');
  const autres = resultats.filter(r => r.departement !== '06');
  return du06.concat(autres).slice(0, 6);
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

// Ajoute la liste de suggestions sous un champ texte.
// quandChoisi(adresse) est appelé avec {label, lat, lon}, ou null si l'adresse
// a été retapée à la main (on n'a alors plus de coordonnées fiables).
function brancherSuggestions(champ, quandChoisi) {
  const liste = document.createElement('ul');
  liste.className = 'suggestions';
  liste.hidden = true;
  champ.insertAdjacentElement('afterend', liste);

  let minuteur = null;
  let controle = null;

  function fermer() {
    liste.hidden = true;
    liste.replaceChildren();
  }

  function afficher(resultats) {
    liste.replaceChildren();
    for (const r of resultats) {
      const li = document.createElement('li');
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.textContent = r.label;
      // pointerdown plutôt que click : le choix est pris avant que le champ perde le focus
      bouton.addEventListener('pointerdown', e => {
        e.preventDefault();
        definirAdresse(champ, r);
        fermer();
        quandChoisi(r);
      });
      li.appendChild(bouton);
      liste.appendChild(li);
    }
    liste.hidden = resultats.length === 0;
  }

  champ.addEventListener('input', () => {
    delete champ.dataset.lat;
    delete champ.dataset.lon;
    quandChoisi(null);
    clearTimeout(minuteur);
    const texte = champ.value.trim();
    if (texte.length < 3) { fermer(); return; }
    // On attend que la frappe se calme avant d'interroger le service
    minuteur = setTimeout(async () => {
      if (controle) controle.abort();
      controle = new AbortController();
      try {
        afficher(await chercherAdresses(texte, controle.signal));
      } catch (e) {
        // Hors ligne ou service en panne : on laisse simplement la saisie libre
        if (e.name !== 'AbortError') fermer();
      }
    }, 300);
  });

  champ.addEventListener('blur', () => setTimeout(fermer, 150));
}

// Remplit un champ adresse (texte + coordonnées gardées dans le champ)
function definirAdresse(champ, adresse) {
  champ.value = adresse ? adresse.label : '';
  if (adresse && adresse.lat != null && adresse.lon != null) {
    champ.dataset.lat = adresse.lat;
    champ.dataset.lon = adresse.lon;
  } else {
    delete champ.dataset.lat;
    delete champ.dataset.lon;
  }
}

// Coordonnées d'un champ adresse, ou null si l'adresse a été saisie librement
function lireCoordonnees(champ) {
  if (!champ.dataset.lat || !champ.dataset.lon) return null;
  return { lat: Number(champ.dataset.lat), lon: Number(champ.dataset.lon) };
}
