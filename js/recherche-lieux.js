/* ============================================================
   recherche-lieux.js – recherche de lieux par leur nom
   1. ⭐ Mes lieux (favoris, sur le téléphone)
   2. 🏥 Établissements de santé du 06 (fichier FINESS inclus dans l'app)
   3. 🌐 Lieux en ligne (Photon / OpenStreetMap), seulement si 1 et 2 ne trouvent rien
   Recherche tolérante : sans majuscules ni accents, mots dans le désordre,
   mots partiels ("hop past"), abréviations (CH, CHU, St, Ste…).
   ============================================================ */

const URL_ETABLISSEMENTS = 'data/etablissements-06.json';
const URL_PHOTON = 'https://photon.komoot.io/api/';
const ZONE_ALPES_MARITIMES = '6.63,43.47,7.72,44.37';   // ouest, sud, est, nord

/* ---------- Normalisation du texte ---------- */

// "Hôpital  St-Jean d'Angély" -> "hopital st jean d angely"
function normaliser(texte) {
  return String(texte || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // enlève les accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Abréviations des noms officiels : chaque mot ajoute aussi ses équivalents
const EQUIVALENTS = {
  ch: ['centre', 'hospitalier', 'hopital'],
  chu: ['centre', 'hospitalier', 'universitaire', 'hopital'],
  chr: ['centre', 'hospitalier', 'regional', 'hopital'],
  chs: ['centre', 'hospitalier', 'specialise', 'hopital', 'psychiatrique'],
  hp: ['hopital', 'prive'],
  hj: ['hopital', 'jour'],
  hop: ['hopital'],
  hopitaux: ['hopital'],
  ctre: ['centre'],
  inst: ['institut'],
  clin: ['clinique'],
  polyclinique: ['clinique'],
  st: ['saint'],
  ste: ['sainte'],
  dr: ['docteur'],
  av: ['avenue'],
  bd: ['boulevard'],
  udm: ['dialyse'],
  autodialyse: ['dialyse'],
  hemodialyse: ['dialyse'],
  autodial: ['dialyse'],
  nephro: ['nephrologie', 'dialyse'],
  nephrologie: ['dialyse'],
  ehpad: ['maison', 'retraite'],
  lbm: ['laboratoire'],
  labo: ['laboratoire'],
  cmp: ['centre', 'medico', 'psychologique']
};

// Ce que l'on tape -> ce que l'on cherche
const SYNONYMES_SAISIE = {
  st: 'saint', ste: 'sainte', dr: 'docteur', bd: 'boulevard', av: 'avenue',
  hosto: 'hopital', labo: 'laboratoire', radio: 'radiologie'
};
const MOTS_VIDES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'en']);

function motsDe(texte) {
  const mots = new Set();
  for (const mot of normaliser(texte).split(' ')) {
    if (!mot) continue;
    mots.add(mot);
    for (const equivalent of EQUIVALENTS[mot] || []) mots.add(equivalent);
  }
  return [...mots];
}

// Chaque mot tapé donne une liste de variantes acceptées : "st" -> ["st", "saint"]
function motsRecherches(texte) {
  const mots = normaliser(texte).split(' ').filter(Boolean);
  const utiles = mots.filter(m => !MOTS_VIDES.has(m));
  return (utiles.length ? utiles : mots).map(m => (SYNONYMES_SAISIE[m] ? [m, SYNONYMES_SAISIE[m]] : [m]));
}

// Note d'un mot tapé (une de ses variantes) pour un lieu : 0 = absent
function noterMot(lieu, mot) {
  let meilleur = 0;
  for (const m of lieu.motsNom) {
    if (m === mot) return 5;
    if (m.startsWith(mot)) meilleur = 4;
  }
  for (const m of lieu.motsAutres) {
    if (m === mot) meilleur = Math.max(meilleur, 3);
    else if (m.startsWith(mot)) meilleur = Math.max(meilleur, 2);
  }
  return meilleur;
}

// Note d'un lieu pour une recherche : 0 = ne correspond pas.
// Chaque mot tapé doit être le début d'un mot du lieu (nom, adresse, ville ou catégorie).
function noter(lieu, mots) {
  let note = 0;
  for (const variantes of mots) {
    const meilleur = Math.max(...variantes.map(v => noterMot(lieu, v)));
    if (meilleur === 0) return 0;
    note += meilleur;
  }
  return note;
}

// Distance à vol d'oiseau en km (pour favoriser ce qui est proche de Cannes)
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

/* ---------- 🏥 Établissements de santé ---------- */

const PRIORITE_CATEGORIE = {
  'Hôpital': 3, 'Clinique': 2.5, 'Dialyse': 2.5, 'Cancérologie': 2.5, 'Soins de suite (SSR)': 2,
  'Hôpital psychiatrique': 2, 'Clinique psychiatrique': 2, 'Centre de santé': 1.5, 'Laboratoire': 1
};

let promesseEtablissements = null;

function chargerEtablissements() {
  if (!promesseEtablissements) {
    promesseEtablissements = fetch(URL_ETABLISSEMENTS)
      .then(rep => {
        if (!rep.ok) throw new Error('HTTP ' + rep.status);
        return rep.json();
      })
      .then(donnees => donnees.etablissements.map(e => {
        const adresse = [e.adr, e.v].filter(Boolean).join(', ');
        return {
          type: 'etablissement',
          nom: e.n,
          detail: `${e.c} · ${adresse}`,
          adresse,
          lat: e.lat,
          lon: e.lon,
          bonus: (PRIORITE_CATEGORIE[e.c] || 0)
            - (e.lat ? distanceKm(CANNES.lat, CANNES.lon, e.lat, e.lon) / 25 : 0),
          motsNom: motsDe([e.n, e.a, e.cpl].filter(Boolean).join(' ')),
          motsAutres: motsDe(`${e.c} ${adresse}`)
        };
      }))
      .catch(erreur => {
        console.warn('Établissements non chargés :', erreur);
        promesseEtablissements = null;   // on réessaiera à la prochaine recherche
        return [];
      });
  }
  return promesseEtablissements;
}

function meilleurs(lieux, mots, nombre) {
  return lieux
    .map(lieu => ({ lieu, note: noter(lieu, mots) }))
    .filter(r => r.note > 0)
    .sort((a, b) => (b.note + (b.lieu.bonus || 0)) - (a.note + (a.lieu.bonus || 0)))
    .slice(0, nombre)
    .map(r => r.lieu);
}

/* ---------- ⭐ Mes lieux (favoris) ---------- */

let favoris = [];

// Relit les favoris depuis le stockage (au démarrage et après chaque changement)
async function rafraichirFavoris() {
  const tous = await DB.tout('lieux');
  favoris = tous.map(f => ({
    type: 'favori',
    id: f.id,
    nom: f.nom,
    detail: f.adresse,
    adresse: f.adresse,
    lat: f.lat,
    lon: f.lon,
    motsNom: motsDe(f.nom),
    motsAutres: motsDe(f.adresse)
  }));
  return tous;
}

/* ---------- Recherche locale (favoris + établissements), sans réseau ---------- */

async function chercherLieuxLocaux(texte) {
  const mots = motsRecherches(texte);
  if (!mots.length) return [];
  const etablissements = await chargerEtablissements();
  return [...meilleurs(favoris, mots, 3), ...meilleurs(etablissements, mots, 5)];
}

/* ---------- 🌐 Lieux en ligne : Photon (OpenStreetMap), sans clé ---------- */
// Utilisé seulement en secours, avec modération (règle « fair use » de Photon).

const TYPES_IGNORES = new Set(['highway', 'public_transport', 'railway', 'place', 'boundary', 'landuse']);

async function chercherLieuxEnLigne(texte, signal) {
  const params = new URLSearchParams({
    q: texte,
    lat: CANNES.lat,
    lon: CANNES.lon,
    lang: 'fr',
    limit: '10',
    bbox: ZONE_ALPES_MARITIMES
  });
  const rep = await fetch(`${URL_PHOTON}?${params}`, { signal });
  if (!rep.ok) throw new Error('Photon indisponible (' + rep.status + ')');
  const json = await rep.json();
  return (json.features || [])
    .filter(f => f.properties.name && !TYPES_IGNORES.has(f.properties.osm_key))
    .slice(0, 4)
    .map(f => {
      const p = f.properties;
      const rue = [p.housenumber, p.street].filter(Boolean).join(' ');
      const ville = [p.postcode, p.city].filter(Boolean).join(' ');
      const adresse = [rue, ville].filter(Boolean).join(', ');
      return {
        type: 'lieu',
        nom: p.name,
        detail: adresse,
        adresse,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1]
      };
    });
}
