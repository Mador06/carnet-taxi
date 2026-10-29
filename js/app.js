/* ============================================================
   app.js – fonctionnement de l'application
   (feuille du jour, formulaires, sauvegarde, export CSV)
   ============================================================ */
'use strict';

/* ---------- Petits outils ---------- */

const $ = (selecteur, racine = document) => racine.querySelector(selecteur);
const deuxChiffres = n => String(n).padStart(2, '0');

// Date locale au format "2026-10-27"
function dateISO(d) {
  return `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
}
function aujourdhui() { return dateISO(new Date()); }
function heureDe(d) { return `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`; }
function heureActuelle() { return heureDe(new Date()); }
function dateLocale(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(a, m - 1, j);
}
function decalerJour(iso, nbJours) {
  const d = dateLocale(iso);
  d.setDate(d.getDate() + nbJours);
  return dateISO(d);
}
function dateFr(iso) {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

// "2026-10-27" -> { semaine: "Mardi", date: "27 octobre" } (avec l'année si ce n'est pas l'année en cours)
function titreDuJour(iso) {
  const d = dateLocale(iso);
  const options = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  const semaine = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(d);
  return {
    semaine: semaine.charAt(0).toUpperCase() + semaine.slice(1),
    date: new Intl.DateTimeFormat('fr-FR', options).format(d)
  };
}

// "12,50" ou "12.50" -> 12.5 ; vide -> null ; texte invalide -> NaN
function lireNombre(texte) {
  const t = String(texte ?? '').replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
const arrondi = (n, decimales) => Math.round(n * 10 ** decimales) / 10 ** decimales;
const formatEuro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const euros = n => formatEuro.format(n || 0);
const formatKm = n => (n == null ? '' : String(arrondi(n, 1)).replace('.', ','));
const versChamp = n => (n == null ? '' : String(n).replace('.', ','));

function nouvelId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Crée un élément HTML : el('li', { className: 'x' }, enfant1, enfant2…)
function el(balise, proprietes = {}, ...enfants) {
  const e = document.createElement(balise);
  Object.assign(e, proprietes);
  for (const enfant of enfants) if (enfant != null) e.append(enfant);
  return e;
}

let minuteurMessage = null;
function message(texte, estErreur = false) {
  const toast = $('#toast');
  toast.textContent = texte;
  toast.classList.toggle('erreur', estErreur);
  toast.classList.add('visible');
  clearTimeout(minuteurMessage);
  minuteurMessage = setTimeout(() => toast.classList.remove('visible'), 2600);
}

// Heure d'une course médicale. Les anciennes n'avaient pas de champ "heure" :
// on prend alors l'heure à laquelle elles ont été saisies.
function heureMedical(course) {
  if (course.heure) return course.heure;
  const d = new Date(course.creeLe);
  return Number.isNaN(d.getTime()) ? '' : heureDe(d);
}

/* ---------- État de l'application ---------- */

const etat = {
  jour: aujourdhui(),                       // jour affiché sur la feuille
  filtre: 'jour',                           // 'jour' (la journée) ou 'sansbon' (bons manquants, tous les jours)
  typesSansBon: { medical: true, donne: true },          // types affichés dans « Bons manquants »
  ecran: null,                              // écran ouvert : 'prive', 'medical', 'donne', 'stats', 'patients', 'fiche' ou null
  edition: { prive: null, medical: null, donne: null },  // id de la course en cours de modification
  patientChoisi: null,                      // fiche choisie dans les suggestions du formulaire Médical
  patientOuvert: null                       // fiche affichée dans « Mes patients »
};

const formPrive = $('#form-prive');
const formMedical = $('#form-medical');
const formDonne = $('#form-donne');
const champDepart = $('#adresse-depart');
const champArrivee = $('#adresse-arrivee');
const infoKm = $('#info-km');

/* ---------- Feuille du jour ---------- */

// Petite icône de taxi pour les listes vides
function iconeTaxi() {
  const icone = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icone.setAttribute('viewBox', '0 0 24 24');
  icone.setAttribute('width', '44');
  icone.setAttribute('height', '44');
  icone.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M5 17h14v-4.5l-1.8-4.3A2 2 0 0 0 15.4 7H8.6a2 2 0 0 0-1.8 1.2L5 12.5z"/>'
    + '<path d="M5 12.5h14M9.5 4.5h5v2.5h-5z"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/></g>';
  return icone;
}

// Courses médicales et données sans bon de transport (tous les jours)
async function coursesSansBon() {
  const [medicales, donnees] = await Promise.all([DB.tout('medical'), DB.tout('donne')]);
  return {
    medical: medicales.filter(c => !c.bon),
    donne: donnees.filter(c => !c.bon)
  };
}

// Affiche la feuille selon le filtre choisi, et met à jour le compteur des bons manquants
async function afficherFeuille() {
  const sansBon = await coursesSansBon();
  const nombreSansBon = sansBon.medical.length + sansBon.donne.length;
  $('#compteur-bons').textContent = nombreSansBon > 0 ? String(nombreSansBon) : '';
  document.querySelectorAll('[data-filtre]').forEach(b => b.classList.toggle('actif', b.dataset.filtre === etat.filtre));
  $('#accueil').classList.toggle('mode-bons', etat.filtre === 'sansbon');
  if (etat.filtre === 'sansbon') return afficherBonsManquants(sansBon);
  return afficherJournee();
}

async function afficherJournee() {
  const [prives, medicales, donnees] = await Promise.all([
    DB.parDate('prive', etat.jour),
    DB.parDate('medical', etat.jour),
    DB.parDate('donne', etat.jour)
  ]);
  const courses = [
    ...prives.map(c => ({ store: 'prive', heure: c.heure || '', course: c })),
    ...medicales.map(c => ({ store: 'medical', heure: heureMedical(c), course: c })),
    ...donnees.map(c => ({ store: 'donne', heure: c.heure || '', course: c }))
  ].sort((a, b) => a.heure.localeCompare(b.heure)
    || String(a.course.creeLe).localeCompare(String(b.course.creeLe)));

  // Date : « AUJOURD'HUI · MARDI » en petit (ou « SAMEDI · ↩ AUJOURD'HUI » un autre jour), « 27 octobre » en grand
  const estAujourdhui = etat.jour === aujourdhui();
  const titre = titreDuJour(etat.jour);
  const semaine = $('#jour-semaine');
  semaine.textContent = estAujourdhui ? `Aujourd'hui · ${titre.semaine}` : `${titre.semaine} ·`;
  semaine.classList.toggle('autre-jour', !estAujourdhui);
  $('#btn-aujourdhui').hidden = estAujourdhui;
  $('#jour-date').textContent = titre.date;
  $('#choix-date').value = etat.jour;
  $('#choix-date').disabled = false;

  // Totaux (les courses données à un collègue ne comptent pas)
  const somme = liste => liste.reduce((s, c) => s + (c.prix || 0), 0);
  const totalPrive = somme(prives);
  const totalMedical = somme(medicales);
  $('#total-jour').textContent = euros(totalPrive + totalMedical);
  const nombre = prives.length + medicales.length;
  $('#resume-libelle').textContent = nombre > 0
    ? `Total du jour · ${nombre} course${nombre > 1 ? 's' : ''}`
    : 'Total du jour';

  // Petites pastilles de détail sous le total
  const puce = (classePoint, libelle, valeur) => el('span', { className: 'puce' },
    el('span', { className: 'point ' + classePoint }), libelle + ' ', el('strong', { textContent: valeur }));
  const puces = [];
  if (prives.length) puces.push(puce('', 'Privé', euros(totalPrive)));
  if (medicales.length) puces.push(puce('point-m', 'Médical', euros(totalMedical)));
  if (donnees.length) puces.push(puce('point-d', donnees.length > 1 ? 'Données' : 'Donnée', String(donnees.length)));
  $('#detail-total').replaceChildren(...puces);

  // Liste
  const ul = $('#liste-jour');
  ul.replaceChildren();
  ul.classList.toggle('vide', courses.length === 0);
  if (courses.length === 0) {
    ul.append(el('li', { className: 'liste-vide' },
      iconeTaxi(),
      estAujourdhui ? "Aucune course aujourd'hui" : 'Aucune course ce jour-là',
      el('small', { textContent: 'Touchez + pour en ajouter une' })
    ));
  }
  for (const { store, heure, course } of courses) ul.append(ligneCourse(store, heure, course));
}

// « Bons manquants » : toutes les courses Médical / Médical donné sans bon, groupées par date
function afficherBonsManquants(sansBon) {
  $('#jour-semaine').textContent = 'Tous les jours';
  $('#jour-semaine').classList.add('autre-jour');
  $('#btn-aujourdhui').hidden = true;
  $('#jour-date').textContent = 'Bons manquants';
  $('#choix-date').disabled = true;   // pas de calendrier dans ce mode

  const total = sansBon.medical.length + sansBon.donne.length;
  $('#resume-libelle').textContent = 'Bons de transport à récupérer';
  $('#total-jour').textContent = String(total);

  // Pastilles = filtres par type (toucher pour afficher / masquer)
  const filtreType = (type, classePoint, libelle) => {
    const bouton = el('button', { type: 'button', className: 'puce' },
      el('span', { className: 'point ' + classePoint }), libelle + ' ',
      el('strong', { textContent: String(sansBon[type].length) }));
    bouton.setAttribute('aria-pressed', String(etat.typesSansBon[type]));
    bouton.addEventListener('click', () => {
      etat.typesSansBon[type] = !etat.typesSansBon[type];
      afficherFeuille();
    });
    return bouton;
  };
  $('#detail-total').replaceChildren(
    filtreType('medical', 'point-m', 'Médical'),
    filtreType('donne', 'point-d', 'Donné')
  );

  // Du plus récent au plus ancien, groupé par date
  const courses = [
    ...(etat.typesSansBon.medical ? sansBon.medical.map(c => ({ store: 'medical', heure: heureMedical(c), course: c })) : []),
    ...(etat.typesSansBon.donne ? sansBon.donne.map(c => ({ store: 'donne', heure: c.heure || '', course: c })) : [])
  ].sort((a, b) => b.course.date.localeCompare(a.course.date) || a.heure.localeCompare(b.heure));

  const ul = $('#liste-jour');
  ul.replaceChildren();
  ul.classList.toggle('vide', courses.length === 0);
  if (courses.length === 0) {
    ul.append(el('li', { className: 'liste-vide' },
      iconeTaxi(),
      'Aucun bon manquant',
      el('small', { textContent: total === 0 ? 'Tous les bons de transport sont là 👍' : 'Touchez une pastille pour afficher ce type' })
    ));
  }
  let dateCourante = null;
  for (const { store, heure, course } of courses) {
    if (course.date !== dateCourante) {
      dateCourante = course.date;
      const t = titreDuJour(course.date);
      ul.append(el('li', { className: 'groupe-date', textContent: `${t.semaine} ${t.date}` }));
    }
    ul.append(ligneCourse(store, heure, course));
  }
}

document.querySelectorAll('[data-filtre]').forEach(b => b.addEventListener('click', () => {
  etat.filtre = b.dataset.filtre;
  window.scrollTo(0, 0);
  afficherFeuille();
}));

const TRAJETS_COURTS = { 'Aller': 'Aller', 'Aller/Retour': 'A/R', 'Retour': 'Retour' };

const PASTILLES = {
  prive: { lettre: 'P', classe: '', nom: 'Privé' },
  medical: { lettre: 'M', classe: ' c-type-m', nom: 'Médical' },
  donne: { lettre: 'D', classe: ' c-type-d', nom: 'Médical donné' }
};

// titreRemplace : texte affiché à la place du nom (ex. la destination, dans l'historique d'un patient)
function ligneCourse(store, heure, c, titreRemplace) {
  let titre, sous, droite;
  if (store === 'prive') {
    titre = c.station;
    sous = c.paiement;
  } else if (store === 'medical') {
    titre = c.nom;
    sous = TRAJETS_COURTS[c.trajet] || c.trajet;
    // Pas de bon : petit ⚠ (avec le nom du taxi qui l'a, s'il est indiqué)
    if (!c.bon) {
      sous = [sous + ' · ', el('span', { className: 'c-alerte',
        textContent: c.taxiBon ? `⚠ Bon : ${c.taxiBon}` : '⚠ Sans bon' })];
    }
  } else {
    // Course donnée : pas de prix, on indique si on a le bon de transport
    titre = c.nom;
    sous = '→ ' + c.taxi;
    droite = el('span', { className: 'c-bon' + (c.bon ? '' : ' manque'),
      textContent: c.bon ? '✓ Bon' : '⚠ Sans bon' });
  }
  if (!droite) {
    droite = el('span', { className: 'c-prix' + (c.prix == null ? ' vide' : ''),
      textContent: c.prix == null ? '— €' : euros(c.prix) });
  }
  const pastille = PASTILLES[store];
  const bouton = el('button', { type: 'button', className: 'course' },
    el('span', { className: 'c-heure', textContent: heure }),
    el('span', { className: 'c-type' + pastille.classe, textContent: pastille.lettre, title: pastille.nom }),
    el('span', { className: 'c-texte' },
      el('span', { className: 'c-titre', textContent: titreRemplace || titre }),
      el('span', { className: 'c-sous' }, ...[].concat(sous))
    ),
    droite
  );
  bouton.addEventListener('click', () => ouvrirFormulaire(store, c));
  return el('li', {}, bouton);
}

function changerJour(iso) {
  etat.jour = iso;
  afficherFeuille();
}

$('#jour-precedent').addEventListener('click', () => changerJour(decalerJour(etat.jour, -1)));
$('#jour-suivant').addEventListener('click', () => changerJour(decalerJour(etat.jour, 1)));
$('#btn-aujourdhui').addEventListener('click', () => changerJour(aujourdhui()));

// Calendrier : sur iPhone, toucher le champ invisible ouvre le calendrier du téléphone.
// Sur ordinateur, on l'ouvre nous-mêmes (sinon il faudrait viser la petite icône).
const choixDate = $('#choix-date');
choixDate.addEventListener('click', () => {
  try { choixDate.showPicker(); } catch { /* ancien navigateur : rien à faire */ }
});
choixDate.addEventListener('change', () => {
  // « Effacer » dans le calendrier donne une valeur vide : on garde le jour affiché
  if (choixDate.value) changerJour(choixDate.value);
  else choixDate.value = etat.jour;
});

/* ---------- Statistiques ---------- */

// Période affichée : 'jour', 'mois' ou 'annee', qui contient le jour "ref"
etat.stats = { periode: 'mois', ref: aujourdhui() };

// Toutes les dates d'une période commencent pareil : "2026-10-28", "2026-10" ou "2026"
const LONGUEUR_PERIODE = { jour: 10, mois: 7, annee: 4 };
const prefixePeriode = (periode, ref) => ref.slice(0, LONGUEUR_PERIODE[periode]);
const PERIODE_PRECEDENTE = { jour: 'la veille', mois: 'le mois précédent', annee: "l'année précédente" };
const majuscule = t => t.charAt(0).toUpperCase() + t.slice(1);

function decalerPeriode(periode, ref, n) {
  if (periode === 'jour') return decalerJour(ref, n);
  const d = dateLocale(ref);
  if (periode === 'mois') return dateISO(new Date(d.getFullYear(), d.getMonth() + n, 1));
  return dateISO(new Date(d.getFullYear() + n, 0, 1));
}

function titrePeriode(periode, ref) {
  if (periode === 'jour') {
    const t = titreDuJour(ref);
    return `${t.semaine} ${t.date}`;
  }
  if (periode === 'mois') {
    return majuscule(new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(dateLocale(ref)));
  }
  return ref.slice(0, 4);
}

// Km parcourus sur une course médicale (un aller/retour compte deux fois)
function kmCourse(c) {
  if (c.kmTotal != null) return c.kmTotal;
  if (c.km == null) return 0;
  return c.trajet === 'Aller/Retour' ? c.km * 2 : c.km;
}

const somme = (liste, valeur) => liste.reduce((s, c) => s + (valeur(c) || 0), 0);
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

// Les chiffres d'une période (les courses données ne comptent pas dans l'argent)
function chiffresPeriode(toutes, prefixe) {
  const dans = liste => liste.filter(c => c.date && c.date.startsWith(prefixe));
  const prive = dans(toutes.prive);
  const medical = dans(toutes.medical);
  const donne = dans(toutes.donne);
  const caPrive = somme(prive, c => c.prix);
  const caMedical = somme(medical, c => c.prix);
  return {
    prive, medical, donne, caPrive, caMedical,
    ca: caPrive + caMedical,
    nombre: prive.length + medical.length,
    km: somme(medical, kmCourse),
    jours: new Set([...prive, ...medical].map(c => c.date)).size,
    sansBon: medical.filter(c => !c.bon).length + donne.filter(c => !c.bon).length
  };
}

async function afficherStats() {
  const { periode, ref } = etat.stats;
  const [prive, medical, donne] = await Promise.all(STORES.map(s => DB.tout(s)));
  const toutes = { prive, medical, donne };
  const ch = chiffresPeriode(toutes, prefixePeriode(periode, ref));
  const avant = chiffresPeriode(toutes, prefixePeriode(periode, decalerPeriode(periode, ref, -1)));

  document.querySelectorAll('[data-periode]').forEach(b => b.classList.toggle('actif', b.dataset.periode === periode));
  $('#titre-periode').textContent = titrePeriode(periode, ref);

  // Chiffre d'affaires, et comparaison avec la période d'avant
  $('#stats-ca').textContent = euros(ch.ca);
  const evolution = $('#stats-evolution');
  evolution.className = 'evolution';
  if (avant.ca > 0) {
    const pourcent = Math.round((ch.ca - avant.ca) / avant.ca * 100);
    evolution.textContent = `${pourcent >= 0 ? '▲ +' : '▼ '}${pourcent} % par rapport à ${PERIODE_PRECEDENTE[periode]}`;
    evolution.classList.add(pourcent >= 0 ? 'hausse' : 'baisse');
  } else {
    evolution.textContent = '';
  }
  const puce = (classePoint, libelle, valeur) => el('span', { className: 'puce' },
    el('span', { className: 'point ' + classePoint }), libelle + ' ', el('strong', { textContent: valeur }));
  $('#stats-detail-ca').replaceChildren(
    puce('', 'Privé', euros(ch.caPrive)),
    puce('point-m', 'Médical', euros(ch.caMedical)));

  carteFrais(ch, periode, ref);
  graphiqueStats(toutes, periode, ref);

  // Petites cases de chiffres
  const tuile = (libelle, valeur, sous, classe = '') => el('div', { className: 'tuile ' + classe },
    el('div', { className: 'tuile-libelle', textContent: libelle }),
    el('div', { className: 'tuile-valeur', textContent: valeur }),
    el('div', { className: 'tuile-sous', textContent: sous }));
  const tuiles = [
    tuile('Courses', String(ch.nombre), `${pluriel(ch.prive.length, 'privée')} · ${pluriel(ch.medical.length, 'médicale')}`),
    tuile('Kilomètres', `${formatKm(ch.km)} km`, 'courses médicales'),
    tuile('Prix moyen', ch.nombre ? euros(ch.ca / ch.nombre) : '—', 'par course')
  ];
  if (periode !== 'jour') {
    tuiles.push(tuile('Jours travaillés', String(ch.jours), ch.jours ? `${euros(ch.ca / ch.jours)} par jour` : '—'));
  }
  tuiles.push(
    tuile('Courses données', String(ch.donne.length), 'à des collègues', 'tuile-donne'),
    tuile('Bons manquants', String(ch.sansBon), 'à récupérer', ch.sansBon ? 'tuile-alerte' : ''));
  $('#stats-tuiles').replaceChildren(...tuiles);

  // Paiements des courses privées
  const parPaiement = new Map();
  for (const c of ch.prive) {
    const p = parPaiement.get(c.paiement) || { nombre: 0, total: 0 };
    p.nombre += 1;
    p.total += c.prix || 0;
    parPaiement.set(c.paiement, p);
  }
  $('#titre-paiements').hidden = parPaiement.size === 0;
  $('#stats-paiements').replaceChildren(...[...parPaiement]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([nom, p]) => el('li', {},
      el('span', { textContent: nom }),
      el('span', { className: 'texte-doux', textContent: pluriel(p.nombre, 'course') }),
      el('strong', { textContent: euros(p.total) }))));
}

// Un bâton par jour (vue mois) ou par mois (vue année) : médical en jaune, privé en gris
function graphiqueStats(toutes, periode, ref) {
  const zone = $('#stats-graphique');
  zone.hidden = periode === 'jour';
  if (periode === 'jour') return;

  const longueur = periode === 'mois' ? 10 : 7;   // regroupe par "2026-10-28" ou par "2026-10"
  const parCle = new Map();
  for (const store of ['prive', 'medical']) {
    for (const c of toutes[store]) {
      if (!c.date) continue;
      const cle = c.date.slice(0, longueur);
      const v = parCle.get(cle) || { prive: 0, medical: 0 };
      v[store] += c.prix || 0;
      parCle.set(cle, v);
    }
  }

  const d = dateLocale(ref);
  const cases = [];
  if (periode === 'mois') {
    const nbJours = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (let j = 1; j <= nbJours; j++) {
      cases.push({ cle: `${ref.slice(0, 7)}-${deuxChiffres(j)}`, court: j === 1 || j % 5 === 0 ? String(j) : '' });
    }
  } else {
    const lettres = 'JFMAMJJASOND';
    for (let m = 1; m <= 12; m++) cases.push({ cle: `${ref.slice(0, 4)}-${deuxChiffres(m)}`, court: lettres[m - 1] });
  }
  const valeurs = cases.map(k => parCle.get(k.cle) || { prive: 0, medical: 0 });
  const max = Math.max(...valeurs.map(v => v.prive + v.medical));
  const hauteur = n => (max > 0 ? `${(n / max) * 100}%` : '0');
  const cleActuelle = aujourdhui().slice(0, longueur);

  const barres = el('div', { className: 'barres' });
  const etiquettes = el('div', { className: 'etiquettes' });
  cases.forEach((k, i) => {
    const v = valeurs[i];
    const prive = el('span', { className: 'b-prive' });
    const medical = el('span', { className: 'b-medical' });
    prive.style.height = hauteur(v.prive);
    medical.style.height = hauteur(v.medical);
    const barre = el('button', { type: 'button', className: 'barre' + (k.cle === cleActuelle ? ' actuelle' : '') }, prive, medical);
    barre.setAttribute('aria-label', `${periode === 'mois' ? dateFr(k.cle) : titrePeriode('mois', k.cle + '-01')} : ${euros(v.prive + v.medical)}`);
    // Toucher un jour ouvre sa feuille ; toucher un mois affiche ce mois
    barre.addEventListener('click', () => {
      if (periode === 'mois') {
        etat.jour = k.cle;
        etat.filtre = 'jour';
        fermerFormulaire();
      } else {
        etat.stats = { periode: 'mois', ref: k.cle + '-01' };
        afficherStats();
      }
    });
    barres.append(barre);
    etiquettes.append(el('span', { className: k.cle === cleActuelle ? 'actuelle' : '', textContent: k.court }));
  });

  zone.replaceChildren(
    el('div', { className: 'graphique-entete' },
      el('span', { textContent: periode === 'mois' ? 'Par jour' : 'Par mois' }),
      el('span', { className: 'texte-doux', textContent: max > 0 ? `max ${euros(max)}` : '' })),
    barres, etiquettes,
    el('div', { className: 'graphique-aide',
      textContent: periode === 'mois' ? 'Touchez un jour pour voir sa feuille' : 'Touchez un mois pour le détailler' }));
}

function ouvrirStats() {
  etat.ecran = 'stats';
  etat.stats.ref = etat.filtre === 'jour' ? etat.jour : aujourdhui();
  $('#accueil').hidden = true;
  $('#ecran-stats').hidden = false;
  window.scrollTo(0, 0);
  afficherStats().catch(e => message(e.message, true));
}

$('#btn-stats').addEventListener('click', ouvrirStats);
document.querySelectorAll('[data-periode]').forEach(b => b.addEventListener('click', () => {
  etat.stats.periode = b.dataset.periode;
  afficherStats();
}));
$('#periode-precedente').addEventListener('click', () => {
  etat.stats.ref = decalerPeriode(etat.stats.periode, etat.stats.ref, -1);
  afficherStats();
});
$('#periode-suivante').addEventListener('click', () => {
  etat.stats.ref = decalerPeriode(etat.stats.periode, etat.stats.ref, 1);
  afficherStats();
});
/* ---------- Frais fixes ---------- */

let fraisFixes = [];   // [{ id, nom, montant, frequence: 'mois' ou 'an' }]
let fraisEnModification = null;

async function chargerFrais() {
  const reglage = await DB.lire('reglages', 'frais');
  fraisFixes = reglage && Array.isArray(reglage.liste) ? reglage.liste : [];
}
const enregistrerFrais = () => DB.enregistrer('reglages', { id: 'frais', liste: fraisFixes });

// Un frais annuel compte pour 1/12 chaque mois
const fraisParMois = f => (f.frequence === 'an' ? f.montant / 12 : f.montant);
const totalFraisMois = () => somme(fraisFixes, fraisParMois);

// Statistiques (vue Mois ou Année) : barre de progression du chiffre d'affaires vers les frais fixes
function carteFrais(ch, periode, ref) {
  const zone = $('#stats-frais');
  zone.hidden = periode === 'jour';
  if (periode === 'jour') return;

  const frais = totalFraisMois() * (periode === 'mois' ? 1 : 12);
  const entete = el('div', { className: 'graphique-entete' },
    el('span', { textContent: periode === 'mois' ? 'Frais fixes du mois' : "Frais fixes de l'année" }),
    frais > 0 ? el('span', { className: 'texte-doux', textContent: `${euros(ch.ca)} / ${euros(frais)}` }) : null);

  if (frais <= 0) {
    const bouton = el('button', { type: 'button', className: 'btn btn-secondaire', textContent: 'Indiquer mes frais fixes' });
    bouton.addEventListener('click', () => ouvrirFrais('stats'));
    zone.replaceChildren(entete,
      el('p', { className: 'texte-doux', textContent: 'Indiquez vos frais fixes (assurance, licence, crédit…) pour savoir à partir de quand vous êtes en bénéfice.' }),
      bouton);
    return;
  }

  const couvert = ch.ca >= frais;
  const remplissage = el('div', { className: 'remplissage' });
  remplissage.style.width = `${Math.min(100, (ch.ca / frais) * 100)}%`;
  const barre = el('div', { className: 'barre-frais' + (couvert ? ' couvert' : '') }, remplissage);

  const lignes = [];
  if (couvert) {
    // Jour où le cumul du chiffre d'affaires a dépassé les frais
    const parJour = new Map();
    for (const c of [...ch.prive, ...ch.medical]) parJour.set(c.date, (parJour.get(c.date) || 0) + (c.prix || 0));
    let cumul = 0;
    let jourCouvert = null;
    for (const date of [...parJour.keys()].sort()) {
      cumul += parJour.get(date);
      if (cumul >= frais) { jourCouvert = date; break; }
    }
    lignes.push(el('div', { className: 'frais-benefice', textContent: `Bénéfice : +${euros(ch.ca - frais)}` }));
    lignes.push(el('div', { className: 'frais-info',
      textContent: `✓ Frais couverts${jourCouvert ? ' le ' + titreDuJour(jourCouvert).date : ''} — vous êtes en bénéfice depuis.` }));
  } else {
    const reste = frais - ch.ca;
    lignes.push(el('div', { className: 'frais-reste', textContent: `Encore ${euros(reste)} avant le bénéfice` }));
    let info = `Frais couverts à ${Math.floor((ch.ca / frais) * 100)} %`;
    // Mois en cours : ce qu'il faut faire par jour d'ici la fin du mois
    if (periode === 'mois' && prefixePeriode('mois', ref) === aujourdhui().slice(0, 7)) {
      const d = new Date();
      const joursRestants = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
      info += ` · soit ${euros(reste / joursRestants)} par jour sur les ${pluriel(joursRestants, 'jour')} restants`;
    }
    lignes.push(el('div', { className: 'frais-info', textContent: info }));
  }
  zone.replaceChildren(entete, barre, ...lignes);
}

// Écran des frais fixes ; d'où l'on vient ('stats' ou 'reglages') pour le bouton Retour
let retourFrais = 'reglages';

function ouvrirFrais(depuis) {
  retourFrais = depuis;
  montrerEcran('frais');
  reinitFormFrais();
  afficherFrais();
}

function afficherFrais() {
  const total = totalFraisMois();
  $('#frais-total').textContent = euros(total);
  $('#frais-detail').replaceChildren(
    el('span', { className: 'puce' }, 'Par an ', el('strong', { textContent: euros(total * 12) })),
    el('span', { className: 'puce' }, 'Par jour ', el('strong', { textContent: euros((total * 12) / 365) })));
  const ul = $('#liste-frais');
  ul.replaceChildren(...[...fraisFixes].sort((a, b) => fraisParMois(b) - fraisParMois(a)).map(f => {
    const bouton = el('button', { type: 'button', className: 'ligne-frais' + (f.id === fraisEnModification ? ' actif' : '') },
      el('span', { className: 'frais-nom' },
        el('span', { textContent: f.nom }),
        el('small', { textContent: f.frequence === 'an' ? `${euros(f.montant)} par an` : 'par mois' })),
      el('strong', { textContent: euros(fraisParMois(f)) }));
    bouton.addEventListener('click', () => modifierFrais(f));
    return el('li', {}, bouton);
  }));
}

const formFrais = $('#form-frais');

function reinitFormFrais() {
  fraisEnModification = null;
  formFrais.reset();
  $('#titre-form-frais').textContent = 'Ajouter un frais';
  $('#btn-valider-frais').textContent = 'Ajouter';
  $('#btn-supprimer-frais').hidden = true;
  $('#btn-annuler-frais').hidden = true;
}

function modifierFrais(f) {
  fraisEnModification = f.id;
  const c = formFrais.elements;
  c.nom.value = f.nom;
  c.montant.value = versChamp(f.montant);
  c.frequence.value = f.frequence;
  $('#titre-form-frais').textContent = 'Modifier « ' + f.nom + ' »';
  $('#btn-valider-frais').textContent = 'Enregistrer';
  $('#btn-supprimer-frais').hidden = false;
  $('#btn-annuler-frais').hidden = false;
  afficherFrais();
  $('#titre-form-frais').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

formFrais.addEventListener('submit', async e => {
  e.preventDefault();
  const c = formFrais.elements;
  const nom = c.nom.value.trim();
  const montant = lireNombre(c.montant.value);
  if (!nom) { message('Indiquez le nom du frais', true); c.nom.focus(); return; }
  if (montant == null || Number.isNaN(montant) || montant <= 0) { message('Montant invalide', true); c.montant.focus(); return; }
  const frais = { id: fraisEnModification || nouvelId(), nom, montant: arrondi(montant, 2), frequence: c.frequence.value };
  const modification = Boolean(fraisEnModification);
  fraisFixes = modification ? fraisFixes.map(f => (f.id === frais.id ? frais : f)) : [...fraisFixes, frais];
  try {
    await enregistrerFrais();
    reinitFormFrais();
    afficherFrais();
    message(modification ? 'Frais modifié ✓' : 'Frais ajouté ✓');
  } catch (erreur) {
    console.error(erreur);
    message("Erreur d'enregistrement : " + erreur.message, true);
    await chargerFrais();
  }
});

$('#btn-supprimer-frais').addEventListener('click', async () => {
  const f = fraisFixes.find(x => x.id === fraisEnModification);
  if (!f || !confirm(`Supprimer le frais « ${f.nom} » ?`)) return;
  fraisFixes = fraisFixes.filter(x => x.id !== f.id);
  await enregistrerFrais();
  reinitFormFrais();
  afficherFrais();
  message('Frais supprimé');
});
$('#btn-annuler-frais').addEventListener('click', () => { reinitFormFrais(); afficherFrais(); });

$('#retour-frais').addEventListener('click', () => {
  if (retourFrais === 'stats') {
    montrerEcran('stats');
    afficherStats().catch(e => message(e.message, true));
  } else {
    fermerFormulaire();
  }
});
$('#btn-mes-frais').addEventListener('click', () => {
  panneauReglages.close();
  ouvrirFrais('reglages');
});

/* ---------- Ouverture / fermeture des formulaires ---------- */

// Pour chaque type de course : titre, remise à zéro et remplissage du formulaire
const FORMULAIRES = {
  prive: { titre: 'Course privée', reinit: reinitFormPrive, remplir: remplirFormPrive },
  medical: { titre: 'Course médicale', reinit: reinitFormMedical, remplir: remplirFormMedical },
  donne: { titre: 'Médical donné', reinit: reinitFormDonne, remplir: remplirFormDonne }
};

function ouvrirFormulaire(store, course = null) {
  const formulaire = FORMULAIRES[store];
  formulaire.reinit();
  if (course) formulaire.remplir(course);
  etat.edition[store] = course ? course.id : null;
  etat.ecran = store;

  $(`#titre-form-${store}`).textContent = course ? 'Modifier' : formulaire.titre;
  $(`#btn-valider-${store}`).textContent = course ? 'Enregistrer' : 'Ajouter la course';
  $(`#btn-supprimer-${store}`).hidden = !course;

  $('#accueil').hidden = true;
  document.querySelectorAll('.ecran').forEach(s => { s.hidden = s.id !== `ecran-${store}`; });
  window.scrollTo(0, 0);
}

function fermerFormulaire() {
  etat.ecran = null;
  etat.edition = { prive: null, medical: null, donne: null };
  for (const s of STORES) $(`#ecran-${s}`).hidden = true;
  for (const s of ['stats', 'frais', 'patients', 'fiche']) $(`#ecran-${s}`).hidden = true;
  $('#accueil').hidden = false;
  window.scrollTo(0, 0);
  return afficherFeuille();
}

document.querySelectorAll('[data-fermer-ecran]').forEach(b => b.addEventListener('click', fermerFormulaire));

async function supprimerCourse(store) {
  const id = etat.edition[store];
  if (!id || !confirm('Supprimer cette course ?\n\nCette action est définitive.')) return;
  const course = await DB.lire(store, id);
  await DB.supprimer(store, id);
  if (store === 'medical' && course && course.patientId) await recalculerPatient(course.patientId);
  await fermerFormulaire();
  message('Course supprimée');
}
for (const s of STORES) {
  $(`#btn-supprimer-${s}`).addEventListener('click', () => supprimerCourse(s).catch(e => message(e.message, true)));
}

/* ---------- Formulaire Privé ---------- */

function reinitFormPrive() {
  const c = formPrive.elements;
  const station = c.station.value;   // on garde la dernière station : souvent la même
  formPrive.reset();
  c.station.value = station;
  c.date.value = etat.jour;
  c.heure.value = heureActuelle();
}

function remplirFormPrive(course) {
  const c = formPrive.elements;
  c.date.value = course.date;
  c.heure.value = course.heure;
  c.station.value = course.station;
  c.prix.value = versChamp(course.prix);
  c.paiement.value = course.paiement;
}

formPrive.addEventListener('submit', async e => {
  e.preventDefault();
  const c = formPrive.elements;
  const prix = lireNombre(c.prix.value);
  if (prix == null || Number.isNaN(prix) || prix < 0) {
    message('Prix invalide', true);
    c.prix.focus();
    return;
  }
  try {
    const ancienne = etat.edition.prive ? await DB.lire('prive', etat.edition.prive) : null;
    const maintenant = new Date().toISOString();
    const course = {
      id: ancienne ? ancienne.id : nouvelId(),
      date: c.date.value,
      heure: c.heure.value,
      station: c.station.value,
      prix: arrondi(prix, 2),
      paiement: c.paiement.value,
      creeLe: ancienne ? ancienne.creeLe : maintenant,
      modifieLe: maintenant
    };
    await DB.enregistrer('prive', course);
    // Retour sur la feuille du jour de la course (en mode « Bons manquants », on reste où on était)
    if (etat.filtre === 'jour') etat.jour = course.date;
    await fermerFormulaire();
    message(ancienne ? 'Course modifiée ✓' : 'Course ajoutée ✓');
  } catch (erreur) {
    console.error(erreur);
    message("Erreur d'enregistrement : " + erreur.message, true);
  }
});

/* ---------- Formulaire Médical ---------- */

let prixSaisiALaMain = false;   // si oui, le calcul auto ne touche plus au prix
let numeroCalculKm = 0;         // pour ignorer une réponse arrivée trop tard

function donneesMedical() {
  const c = formMedical.elements;
  const km = lireNombre(c.km.value);
  const kmValide = km == null || Number.isNaN(km) ? null : arrondi(km, 1);
  return {
    date: c.date.value,
    heure: c.heure.value,
    nom: c.nom.value.trim(),
    telephone: c.telephone.value.trim(),
    adresseDepart: champDepart.value.trim(),
    coordDepart: lireCoordonnees(champDepart),
    adresseArrivee: champArrivee.value.trim(),
    coordArrivee: lireCoordonnees(champArrivee),
    trajet: c.trajet.value,
    km: kmValide,
    kmTotal: kmValide == null ? null : arrondi(c.trajet.value === 'Aller/Retour' ? kmValide * 2 : kmValide, 1),
    priseEnCharge: c.priseEnCharge.value,
    bon: c.bon.checked,
    taxiBon: c.bon.checked ? '' : c.taxiBon.value.trim()   // le taxi qui a le bon, si je ne l'ai pas
  };
}

function majInfoKm(texteAvant = '') {
  const km = lireNombre(formMedical.elements.km.value);
  let texte = texteAvant;
  if (km != null && !Number.isNaN(km) && formMedical.elements.trajet.value === 'Aller/Retour') {
    texte += (texte ? ' ' : '') + `Aller/Retour : ${formatKm(km * 2)} km au total.`;
  }
  infoKm.className = 'info-km';
  infoKm.textContent = texte;
}

// Si la fonction de tarif renvoie un prix, on le propose dans le champ Prix
function majPrixAuto() {
  if (prixSaisiALaMain) return;
  let prix = null;
  try {
    prix = calculerPrixMedical(donneesMedical());
  } catch (erreur) {
    console.error('calculerPrixMedical :', erreur);
  }
  if (typeof prix === 'number' && Number.isFinite(prix)) {
    formMedical.elements.prix.value = versChamp(arrondi(prix, 2));
  }
}

async function quandAdresseChange() {
  const depart = lireCoordonnees(champDepart);
  const arrivee = lireCoordonnees(champArrivee);
  const numero = ++numeroCalculKm;
  if (!depart || !arrivee) { majInfoKm(); return; }

  infoKm.className = 'info-km';
  infoKm.textContent = 'Calcul de la distance par la route…';
  try {
    const km = await calculerDistanceRoute(depart, arrivee);
    if (numero !== numeroCalculKm) return;
    formMedical.elements.km.value = formatKm(km);
    majInfoKm('Distance calculée par la route.');
    majPrixAuto();
  } catch (erreur) {
    if (numero !== numeroCalculKm) return;
    infoKm.className = 'info-km erreur';
    infoKm.textContent = 'Distance non disponible (pas de réseau ?) : saisissez les km à la main.';
  }
}

brancherSuggestions(champDepart, quandAdresseChange);
brancherSuggestions(champArrivee, quandAdresseChange, destinationsDuPatient);

formMedical.elements.km.addEventListener('input', () => { majInfoKm(); majPrixAuto(); });
formMedical.elements.trajet.addEventListener('change', () => { majInfoKm(); majPrixAuto(); });
formMedical.elements.priseEnCharge.addEventListener('change', majPrixAuto);
formMedical.elements.date.addEventListener('change', majPrixAuto);
formMedical.elements.prix.addEventListener('input', () => {
  prixSaisiALaMain = formMedical.elements.prix.value.trim() !== '';
});

function reinitFormMedical() {
  formMedical.reset();
  formMedical.elements.date.value = etat.jour;
  formMedical.elements.heure.value = heureActuelle();
  definirAdresse(champDepart, null);
  definirAdresse(champArrivee, null);
  numeroCalculKm++;
  prixSaisiALaMain = false;
  etat.patientChoisi = null;
  majInfoKm();
  majBlocTaxiBon();
}

function remplirFormMedical(course) {
  const c = formMedical.elements;
  c.date.value = course.date;
  c.heure.value = heureMedical(course);
  c.nom.value = course.nom;
  c.telephone.value = course.telephone || '';
  definirAdresse(champDepart, { label: course.adresseDepart || '', ...(course.coordDepart || {}) });
  definirAdresse(champArrivee, { label: course.adresseArrivee || '', ...(course.coordArrivee || {}) });
  c.trajet.value = course.trajet;
  c.km.value = versChamp(course.km);
  c.priseEnCharge.value = course.priseEnCharge;
  c.prix.value = versChamp(course.prix);
  c.bon.checked = Boolean(course.bon);   // anciennes courses sans cette case : non cochée
  c.taxiBon.value = course.taxiBon || '';
  numeroCalculKm++;
  prixSaisiALaMain = course.prix != null;
  majInfoKm();
  majBlocTaxiBon();
}

formMedical.addEventListener('submit', async e => {
  e.preventDefault();
  const c = formMedical.elements;
  const donnees = donneesMedical();
  if (!donnees.nom) { message('Indiquez le nom du client', true); c.nom.focus(); return; }

  const km = lireNombre(c.km.value);
  if (Number.isNaN(km) || km < 0) { message('Km invalides', true); c.km.focus(); return; }
  const prix = lireNombre(c.prix.value);
  if (Number.isNaN(prix) || prix < 0) { message('Prix invalide', true); c.prix.focus(); return; }

  try {
    const ancienne = etat.edition.medical ? await DB.lire('medical', etat.edition.medical) : null;
    const maintenant = new Date().toISOString();
    const course = {
      id: ancienne ? ancienne.id : nouvelId(),
      ...donnees,
      prix: prix == null ? null : arrondi(prix, 2),
      creeLe: ancienne ? ancienne.creeLe : maintenant,
      modifieLe: maintenant
    };
    // Fiche patient (une erreur ici n'empêche jamais d'enregistrer la course)
    try {
      course.patientId = await fichePourCourse(course, ancienne);
    } catch (erreur) {
      console.error('Fiche patient :', erreur);
      if (ancienne && ancienne.patientId) course.patientId = ancienne.patientId;
    }
    await DB.enregistrer('medical', course);
    try {
      if (course.patientId) await recalculerPatient(course.patientId);
      if (ancienne && ancienne.patientId && ancienne.patientId !== course.patientId) await recalculerPatient(ancienne.patientId);
    } catch (erreur) {
      console.error('Fiche patient :', erreur);
    }
    if (course.taxiBon) await memoriserCollegue(course.taxiBon, '');
    // Retour sur la feuille du jour de la course (en mode « Bons manquants », on reste où on était)
    if (etat.filtre === 'jour') etat.jour = course.date;
    await fermerFormulaire();
    message(ancienne ? 'Course modifiée ✓' : 'Course ajoutée ✓');
  } catch (erreur) {
    console.error(erreur);
    message("Erreur d'enregistrement : " + erreur.message, true);
  }
});

/* ---------- Mes collègues taxi (nom + téléphone mémorisés) ---------- */

let collegues = [];

async function chargerCollegues() {
  collegues = (await DB.tout('collegues')).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  return collegues;
}

// Même nom sans tenir compte des majuscules, accents et espaces
const memeNom = (a, b) => normaliser(a) === normaliser(b);
const chiffresTel = tel => String(tel || '').replace(/[^\d+]/g, '');

// Après une course donnée : on retient le collègue (ou on met à jour son numéro)
async function memoriserCollegue(nom, telephone) {
  if (!nom) return;
  const connu = collegues.find(c => memeNom(c.nom, nom));
  if (!connu) {
    await DB.enregistrer('collegues', { id: nouvelId(), nom, telephone: telephone || '' });
  } else if (telephone && telephone !== connu.telephone) {
    await DB.enregistrer('collegues', { ...connu, telephone });
  }
  await chargerCollegues();
}

async function afficherCollegues() {
  await chargerCollegues();
  const ul = $('#liste-collegues');
  ul.replaceChildren();
  if (collegues.length === 0) {
    ul.append(el('li', { className: 'collegues-vide', textContent: 'Aucun collègue pour le moment.' }));
  }
  for (const c of collegues) {
    const modifier = el('button', { type: 'button', textContent: 'Modifier' });
    modifier.addEventListener('click', async () => {
      const nom = prompt('Nom du taxi :', c.nom);
      if (nom === null || !nom.trim()) return;
      const telephone = prompt('Téléphone :', c.telephone || '');
      if (telephone === null) return;
      await DB.enregistrer('collegues', { ...c, nom: nom.trim(), telephone: telephone.trim() });
      afficherCollegues();
    });
    const supprimer = el('button', { type: 'button', className: 'supprimer', textContent: 'Supprimer' });
    supprimer.addEventListener('click', async () => {
      if (!confirm(`Supprimer « ${c.nom} » de vos collègues ?\n\nLes courses déjà données ne changent pas.`)) return;
      await DB.supprimer('collegues', c.id);
      afficherCollegues();
    });
    ul.append(el('li', { className: 'collegue' },
      el('div', { className: 'collegue-texte' },
        el('strong', { textContent: c.nom }),
        el('small', { textContent: c.telephone || 'Pas de numéro' })
      ),
      modifier,
      supprimer
    ));
  }
}

/* ---------- Petite liste de suggestions sous un champ (taxis, patients) ---------- */
// options : chercher(texte) -> éléments, icone, titre(élément), detail(élément),
// quandChoisi(élément). Renvoie la fonction qui ferme la liste.
function brancherSuggestionsSimples(champ, options) {
  const liste = el('ul', { className: 'suggestions', hidden: true });
  champ.closest('.champ-adresse').append(liste);

  const fermer = () => {
    liste.hidden = true;
    liste.replaceChildren();
  };

  function suggerer() {
    const trouves = options.chercher(champ.value).slice(0, 6);
    liste.replaceChildren(...trouves.map(element => {
      const detail = options.detail(element);
      const bouton = el('button', { type: 'button', className: 'suggestion' },
        el('span', { className: 'sugg-icone', textContent: options.icone }),
        el('span', { className: 'sugg-texte' },
          el('strong', { textContent: options.titre(element) }),
          detail ? el('small', { textContent: detail }) : null
        )
      );
      // pointerdown plutôt que click : le choix est pris avant que le champ perde le focus
      bouton.addEventListener('pointerdown', e => {
        e.preventDefault();
        champ.value = options.titre(element);
        fermer();
        options.quandChoisi(element);
      });
      return el('li', {}, bouton);
    }));
    liste.hidden = trouves.length === 0;
    if (!liste.hidden) {
      document.querySelectorAll('.suggestions').forEach(autre => { if (autre !== liste) autre.hidden = true; });
    }
  }

  champ.addEventListener('input', suggerer);
  champ.addEventListener('focus', suggerer);
  champ.addEventListener('blur', () => setTimeout(fermer, 150));
  return fermer;
}

// Chaque mot tapé doit commencer un mot du texte (sans majuscules ni accents, dans n'importe quel ordre)
function motsCommencent(tape, texte) {
  const motsTexte = normaliser(texte).split(' ');
  return normaliser(tape).split(' ').filter(Boolean).every(m => motsTexte.some(n => n.startsWith(m)));
}

/* ---------- Suggestions des taxis déjà saisis (champ « taxi ») ---------- */
// quandChoisi(collegue) est appelé quand on touche une suggestion.
function brancherSuggestionsTaxi(champ, quandChoisi) {
  return brancherSuggestionsSimples(champ, {
    chercher: texte => collegues.filter(c => motsCommencent(texte, c.nom)),
    icone: '🚕',
    titre: c => c.nom,
    detail: c => c.telephone,
    quandChoisi
  });
}

/* ---------- Bon de transport du formulaire Médical ---------- */

const caseBonMedical = $('#bon-medical');
const champTaxiBon = $('#taxi-bon');
const fermerTaxisBon = brancherSuggestionsTaxi(champTaxiBon, () => {});

// Le champ « Nom du taxi » n'apparaît que si la case « J'ai » n'est pas cochée
function majBlocTaxiBon() {
  $('#bloc-taxi-bon').hidden = caseBonMedical.checked;
  if (caseBonMedical.checked) fermerTaxisBon();
}
caseBonMedical.addEventListener('change', majBlocTaxiBon);

/* ---------- Formulaire Médical donné (course confiée à un collègue) ---------- */

const champTaxi = $('#taxi-nom');
const champTelTaxi = $('#taxi-tel');
const lienAppel = $('#appel-taxi');

// Lien « Appeler » sous le numéro du taxi
function majLienAppel() {
  const tel = champTelTaxi.value.trim();
  const chiffres = chiffresTel(tel);
  lienAppel.hidden = chiffres.length < 4;
  lienAppel.href = 'tel:' + chiffres;
  lienAppel.textContent = '📞 Appeler ' + tel;
}

// Choisir un collègue connu remplit son numéro (modifiable)
const fermerTaxis = brancherSuggestionsTaxi(champTaxi, collegue => {
  if (collegue.telephone) champTelTaxi.value = collegue.telephone;
  majLienAppel();
});

champTaxi.addEventListener('blur', () => {
  // Nom d'un collègue connu tapé en entier : on remplit son numéro s'il est vide
  const connu = collegues.find(c => memeNom(c.nom, champTaxi.value));
  if (connu && connu.telephone && !champTelTaxi.value.trim()) {
    champTelTaxi.value = connu.telephone;
    majLienAppel();
  }
});
champTelTaxi.addEventListener('input', majLienAppel);

function reinitFormDonne() {
  formDonne.reset();
  formDonne.elements.date.value = etat.jour;
  formDonne.elements.heure.value = heureActuelle();
  fermerTaxis();
  majLienAppel();
}

function remplirFormDonne(course) {
  const c = formDonne.elements;
  c.nom.value = course.nom;
  c.date.value = course.date;
  c.heure.value = course.heure;
  c.taxi.value = course.taxi;
  c.telTaxi.value = course.telTaxi || '';
  c.bon.checked = Boolean(course.bon);
  majLienAppel();
}

formDonne.addEventListener('submit', async e => {
  e.preventDefault();
  const c = formDonne.elements;
  const nom = c.nom.value.trim();
  const taxi = c.taxi.value.trim();
  if (!nom) { message('Indiquez le nom du patient', true); c.nom.focus(); return; }
  if (!taxi) { message('Indiquez le taxi', true); c.taxi.focus(); return; }
  try {
    const ancienne = etat.edition.donne ? await DB.lire('donne', etat.edition.donne) : null;
    const maintenant = new Date().toISOString();
    const course = {
      id: ancienne ? ancienne.id : nouvelId(),
      date: c.date.value,
      heure: c.heure.value,
      nom,
      taxi,
      telTaxi: c.telTaxi.value.trim(),
      bon: c.bon.checked,
      creeLe: ancienne ? ancienne.creeLe : maintenant,
      modifieLe: maintenant
    };
    await DB.enregistrer('donne', course);
    await memoriserCollegue(course.taxi, course.telTaxi);
    // Retour sur la feuille du jour de la course (en mode « Bons manquants », on reste où on était)
    if (etat.filtre === 'jour') etat.jour = course.date;
    await fermerFormulaire();
    message(ancienne ? 'Course modifiée ✓' : 'Course donnée enregistrée ✓');
  } catch (erreur) {
    console.error(erreur);
    message("Erreur d'enregistrement : " + erreur.message, true);
  }
});

/* ---------- Fiches patients ---------- */

let patients = [];   // toutes les fiches, gardées en mémoire pour les suggestions

async function chargerPatients() {
  patients = await DB.tout('patients');
  return patients;
}

// Dernière course la plus récente d'abord, puis par nom
const triPatients = (a, b) => String(b.derniereCourse || '').localeCompare(String(a.derniereCourse || ''))
  || String(a.nom).localeCompare(String(b.nom), 'fr');

// Patients dont le nom (ou le téléphone) correspond à ce qui est tapé, dès 2 lettres
function chercherPatients(texte) {
  const tape = texte.trim();
  if (normaliser(tape).replace(/ /g, '').length < 2) return [];
  const chiffres = tape.replace(/\D/g, '');
  return patients
    .filter(p => motsCommencent(tape, p.nom)
      || (chiffres.length >= 4 && chiffres === tape.replace(/\s/g, '') && telPatient(p.telephone).includes(chiffres)))
    .sort(triPatients);
}

function detailPatient(p) {
  const morceaux = [];
  if (p.adresse) morceaux.push(p.adresse);
  if (p.derniereCourse) morceaux.push('dernière course le ' + dateFr(p.derniereCourse));
  return morceaux.join(' · ');
}

// Formulaire Médical : choisir un patient remplit ses habitudes (tout reste modifiable)
function remplirDepuisPatient(p) {
  const c = formMedical.elements;
  etat.patientChoisi = p.id;
  c.nom.value = p.nom;
  if (p.telephone) c.telephone.value = p.telephone;
  if (p.adresse) definirAdresse(champDepart, { label: p.adresse, ...(p.coord || {}) });
  if (p.destination) definirAdresse(champArrivee, { label: p.destination, ...(p.destinationCoord || {}) });
  if (p.trajet) c.trajet.value = p.trajet;
  if (p.priseEnCharge) c.priseEnCharge.value = p.priseEnCharge;
  quandAdresseChange();   // calcul des km comme d'habitude
  majPrixAuto();
}

brancherSuggestionsSimples(formMedical.elements.nom, {
  chercher: chercherPatients,
  icone: '👤',
  titre: p => p.nom,
  detail: detailPatient,
  quandChoisi: remplirDepuisPatient
});
// Le nom est retapé : ce n'est peut-être plus le patient choisi
formMedical.elements.nom.addEventListener('input', () => { etat.patientChoisi = null; });

// Formulaire Médical donné : on propose aussi les patients connus (nom seulement)
brancherSuggestionsSimples(formDonne.elements.nom, {
  chercher: chercherPatients,
  icone: '👤',
  titre: p => p.nom,
  detail: detailPatient,
  quandChoisi: () => {}
});

// La fiche correspondant au formulaire Médical : celle choisie, ou celle qui a exactement ce nom
function patientDuFormulaire() {
  if (etat.patientChoisi) return patients.find(p => p.id === etat.patientChoisi) || null;
  const nom = formMedical.elements.nom.value;
  return patients.filter(p => memeNomPatient(p.nom, nom)).sort(triPatients)[0] || null;
}

// Champ « Adresse d'arrivée » : 🕘 les destinations déjà utilisées par ce patient, en premier
function destinationsDuPatient(texte) {
  const p = patientDuFormulaire();
  if (!p || !p.destinations) return [];
  const actuelle = normaliser(champArrivee.value);
  return p.destinations
    .filter(d => normaliser(d.adresse) !== actuelle || texte)
    .filter(d => !texte || motsCommencent(texte, d.adresse))
    .slice(0, 4)
    .map(d => ({
      type: 'habitude',
      nom: d.adresse,
      detail: `Déjà utilisée · ${d.nb} fois`,
      adresse: d.adresse,
      lat: d.coord ? d.coord.lat : undefined,
      lon: d.coord ? d.coord.lon : undefined
    }));
}

// À l'enregistrement d'une course médicale : quelle fiche ? (créée si besoin)
// Même patient si le nom correspond (dans n'importe quel ordre) ou si le téléphone est identique.
// Même nom mais autre téléphone : on demande.
async function fichePourCourse(course, ancienne) {
  await chargerPatients();
  const parId = id => (id ? patients.find(p => p.id === id) : null);

  // 1. Patient choisi dans les suggestions
  let fiche = parId(etat.patientChoisi);
  if (fiche) return fiche.id;

  // 2. Course modifiée, toujours le même patient
  fiche = ancienne && parId(ancienne.patientId);
  if (fiche && (memeNomPatient(fiche.nom, course.nom) || memeTelPatient(fiche.telephone, course.telephone))) return fiche.id;

  // 3. Recherche par nom et par téléphone
  const parNom = patients.filter(p => memeNomPatient(p.nom, course.nom)).sort(triPatients);
  const parTel = patients.filter(p => memeTelPatient(p.telephone, course.telephone)).sort(triPatients);
  fiche = parNom.find(p => parTel.includes(p)) || parTel[0]
    || parNom.find(p => !telPatient(p.telephone) || !telPatient(course.telephone));
  if (fiche) return fiche.id;

  if (parNom.length) {
    const doute = parNom[0];
    const memePersonne = confirm(
      `Une fiche « ${doute.nom} » existe déjà avec un autre numéro (${doute.telephone}).\n\n` +
      `OK : c'est la même personne (la fiche est mise à jour avec le nouveau numéro)\n` +
      `Annuler : c'est un autre patient (nouvelle fiche)`);
    if (memePersonne) return doute.id;
  }

  // 4. Nouvelle fiche
  const maintenant = new Date().toISOString();
  const nouvelle = { id: nouvelId(), nom: course.nom, telephone: course.telephone, creeLe: maintenant, modifieLe: maintenant };
  await DB.enregistrer('patients', nouvelle);
  return nouvelle.id;
}

// Recalcule une fiche à partir de toutes ses courses médicales
async function recalculerPatient(id) {
  const fiche = await DB.lire('patients', id);
  if (!fiche) return;
  const courses = (await DB.tout('medical')).filter(c => c.patientId === id);
  await DB.enregistrer('patients', resumerPatient(fiche, courses));
  await chargerPatients();
}

/* ---------- Écrans « Mes patients » et fiche patient ---------- */

function montrerEcran(nom) {
  etat.ecran = nom;
  $('#accueil').hidden = true;
  document.querySelectorAll('.ecran').forEach(s => { s.hidden = s.id !== `ecran-${nom}`; });
  window.scrollTo(0, 0);
}

const initiales = nom => normaliser(nom).split(' ').filter(Boolean).slice(0, 2).map(m => m[0].toUpperCase()).join('');

async function ouvrirPatients() {
  await chargerPatients();
  montrerEcran('patients');
  afficherListePatients();
}

function afficherListePatients() {
  const tape = $('#recherche-patient').value.trim();
  const chiffres = tape.replace(/\D/g, '');
  const liste = patients
    .filter(p => !tape || motsCommencent(tape, `${p.nom} ${p.adresse || ''}`)
      || (chiffres.length >= 2 && telPatient(p.telephone).includes(chiffres)))
    .sort(triPatients);
  const ul = $('#liste-patients');
  ul.replaceChildren();
  ul.classList.toggle('vide', liste.length === 0);
  if (liste.length === 0) {
    ul.append(el('li', { className: 'liste-vide' },
      tape ? 'Aucun patient trouvé' : 'Aucun patient pour le moment',
      el('small', { textContent: tape ? 'Essayez une autre recherche' : 'Les fiches se créent à chaque course médicale' })));
    return;
  }
  for (const p of liste) {
    const resume = [pluriel(p.nbCourses || 0, 'course')];
    if (p.derniereCourse) resume.push('dernière le ' + dateFr(p.derniereCourse));
    const bouton = el('button', { type: 'button', className: 'ligne-patient' },
      el('span', { className: 'avatar', textContent: initiales(p.nom) }),
      el('span', { className: 'c-texte' },
        el('span', { className: 'c-titre', textContent: p.nom }),
        el('span', { className: 'c-sous', textContent: p.adresse || p.telephone || '' }),
        el('span', { className: 'c-sous', textContent: resume.join(' · ') })));
    bouton.addEventListener('click', () => ouvrirFiche(p.id));
    ul.append(el('li', {}, bouton));
  }
}

$('#recherche-patient').addEventListener('input', afficherListePatients);
$('#btn-mes-patients').addEventListener('click', () => {
  panneauReglages.close();
  ouvrirPatients().catch(e => message(e.message, true));
});
$('#retour-patients').addEventListener('click', () => ouvrirPatients().catch(e => message(e.message, true)));

const formFiche = $('#form-fiche');
const ficheAdresse = $('#fiche-adresse');
const ficheDestination = $('#fiche-destination');
brancherSuggestions(ficheAdresse, () => {});
brancherSuggestions(ficheDestination, () => {});

// Lien « Appeler » (formulaire de la fiche)
function majAppelFiche() {
  const tel = formFiche.elements.telephone.value.trim();
  const lien = $('#fiche-appel');
  lien.hidden = telPatient(tel).length < 4;
  lien.href = 'tel:' + chiffresTel(tel);
  lien.textContent = '📞 Appeler ' + tel;
}
formFiche.elements.telephone.addEventListener('input', majAppelFiche);

async function ouvrirFiche(id) {
  const p = await DB.lire('patients', id);
  if (!p) { message('Fiche introuvable', true); return ouvrirPatients(); }
  etat.patientOuvert = id;
  montrerEcran('fiche');

  $('#fiche-initiales').textContent = initiales(p.nom);
  $('#fiche-titre').textContent = p.nom;
  const resume = [pluriel(p.nbCourses || 0, 'course')];
  if (p.derniereCourse) resume.push('dernière le ' + dateFr(p.derniereCourse));
  $('#fiche-resume').textContent = resume.join(' · ');

  const c = formFiche.elements;
  c.nom.value = p.nom;
  c.telephone.value = p.telephone || '';
  definirAdresse(ficheAdresse, { label: p.adresse || '', ...(p.coord || {}) });
  definirAdresse(ficheDestination, { label: p.destination || '', ...(p.destinationCoord || {}) });
  c.trajet.value = p.trajet || '';
  c.priseEnCharge.value = p.priseEnCharge || '';
  majAppelFiche();

  // Destinations déjà utilisées
  const destinations = p.destinations || [];
  $('#titre-destinations').hidden = destinations.length === 0;
  $('#fiche-destinations').replaceChildren(...destinations.map(d => el('li', {},
    el('span', { textContent: d.adresse }),
    el('strong', { textContent: d.nb + '×' }))));

  // Historique : ses courses médicales, de la plus récente à la plus ancienne
  const courses = plusRecentesDabord((await DB.tout('medical')).filter(x => x.patientId === id));
  const ul = $('#fiche-historique');
  ul.replaceChildren();
  ul.classList.toggle('vide', courses.length === 0);
  if (courses.length === 0) {
    ul.append(el('li', { className: 'liste-vide' }, 'Aucune course', el('small', { textContent: 'Les courses supprimées ne sont plus listées' })));
  }
  let annee = null;
  for (const course of courses) {
    if (course.date.slice(0, 4) !== annee) {
      annee = course.date.slice(0, 4);
      ul.append(el('li', { className: 'groupe-date', textContent: annee }));
    }
    const [, mois, jour] = course.date.split('-');
    const destination = String(course.adresseArrivee || '').split(' — ')[0] || 'Destination non indiquée';
    ul.append(ligneCourse('medical', `${jour}/${mois}`, course, destination));
  }
}

formFiche.addEventListener('submit', async e => {
  e.preventDefault();
  const c = formFiche.elements;
  const nom = c.nom.value.trim();
  if (!nom) { message('Indiquez le nom', true); c.nom.focus(); return; }
  try {
    const p = await DB.lire('patients', etat.patientOuvert);
    if (!p) throw new Error('Fiche introuvable');
    await DB.enregistrer('patients', {
      ...p,
      nom,
      telephone: c.telephone.value.trim(),
      adresse: ficheAdresse.value.trim(),
      coord: lireCoordonnees(ficheAdresse),
      destination: ficheDestination.value.trim(),
      destinationCoord: lireCoordonnees(ficheDestination),
      trajet: c.trajet.value,
      priseEnCharge: c.priseEnCharge.value,
      modifieLe: new Date().toISOString()
    });
    await chargerPatients();
    await ouvrirFiche(p.id);
    message('Fiche enregistrée ✓');
  } catch (erreur) {
    console.error(erreur);
    message("Erreur d'enregistrement : " + erreur.message, true);
  }
});

$('#btn-supprimer-fiche').addEventListener('click', async () => {
  const p = patients.find(x => x.id === etat.patientOuvert);
  if (!p || !confirm(`Supprimer la fiche de « ${p.nom} » ?\n\nSes courses passées sont conservées.`)) return;
  await DB.supprimer('patients', p.id);
  await ouvrirPatients();
  message('Fiche supprimée');
});

/* ---------- Panneaux qui montent du bas (« + » et Réglages) ---------- */

const panneauAjout = $('#panneau-ajout');
const panneauReglages = $('#dlg-reglages');

$('#btn-ajouter').addEventListener('click', () => panneauAjout.showModal());
$('#btn-reglages').addEventListener('click', async () => {
  await afficherCollegues();
  panneauReglages.showModal();
});

document.querySelectorAll('[data-nouvelle]').forEach(b => b.addEventListener('click', () => {
  panneauAjout.close();
  ouvrirFormulaire(b.dataset.nouvelle);
}));

for (const panneau of [panneauAjout, panneauReglages]) {
  // Toucher le fond sombre ferme le panneau
  panneau.addEventListener('click', e => { if (e.target === panneau) panneau.close(); });
  panneau.querySelectorAll('[data-fermer-panneau]').forEach(b => b.addEventListener('click', () => panneau.close()));
}

/* ---------- Fichiers : partage (iPhone) ou téléchargement (PC) ---------- */

async function partagerFichier(nom, contenu, type) {
  const blob = new Blob([contenu], { type });
  const surTelephone = window.matchMedia('(pointer: coarse)').matches;
  // Sur iPhone : la feuille de partage permet « Enregistrer dans Fichiers », AirDrop, mail…
  if (surTelephone && navigator.canShare) {
    const fichier = new File([blob], nom, { type });
    if (navigator.canShare({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: nom });
        return;
      } catch (erreur) {
        if (erreur.name === 'AbortError') return;   // l'utilisateur a annulé
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const lien = el('a', { href: url, download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ---------- Sauvegarde JSON ---------- */

async function exporterJSON() {
  const donnees = {
    application: 'carnet-taxi',
    version: 3,
    exporteLe: new Date().toISOString(),
    prive: await DB.tout('prive'),
    medical: await DB.tout('medical'),
    donne: await DB.tout('donne'),
    collegues: await DB.tout('collegues'),
    patients: await DB.tout('patients'),
    reglages: await DB.tout('reglages')
  };
  await partagerFichier(`carnet-taxi-sauvegarde-${aujourdhui()}.json`,
    JSON.stringify(donnees, null, 2), 'application/json');
}

async function importerJSON(fichier) {
  let donnees;
  try {
    donnees = JSON.parse(await fichier.text());
  } catch (e) {
    message('Fichier illisible', true);
    return;
  }
  const estCourse = c => c && typeof c.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date);
  const estCollegue = c => c && typeof c.id === 'string' && typeof c.nom === 'string';
  // "donne", "collegues" et "patients" n'existent pas dans les anciennes sauvegardes
  const listeValide = (liste, test) => liste === undefined || (Array.isArray(liste) && liste.every(test));
  if (!donnees || !Array.isArray(donnees.prive) || !Array.isArray(donnees.medical)
      || ![...donnees.prive, ...donnees.medical].every(estCourse)
      || !listeValide(donnees.donne, estCourse) || !listeValide(donnees.collegues, estCollegue)
      || !listeValide(donnees.patients, estCollegue)
      || !listeValide(donnees.reglages, r => r && typeof r.id === 'string')) {
    message("Ce fichier n'est pas une sauvegarde Carnet Taxi", true);
    return;
  }
  // Sauvegarde d'avant les fiches patients : on les recrée à partir de ses courses médicales
  if (!Array.isArray(donnees.patients)) {
    const { patients: fiches, liens } = construirePatients(donnees.medical);
    donnees.patients = fiches;
    donnees.medical = donnees.medical.map(c => ({ ...c, patientId: liens.get(c.id) || null }));
  }
  const detailDonne = Array.isArray(donnees.donne)
    ? `${donnees.donne.length} course(s) donnée(s) et ${(donnees.collegues || []).length} collègue(s).`
    : '(Ancienne sauvegarde : vos courses données et vos collègues actuels sont conservés.)';
  const ok = confirm(
    `Restaurer cette sauvegarde ?\n\n` +
    `${donnees.prive.length} course(s) privée(s), ${donnees.medical.length} course(s) médicale(s).\n` +
    `${detailDonne}\n${donnees.patients.length} fiche(s) patient.\n\n` +
    `ATTENTION : les données actuellement sur ce téléphone seront remplacées.`
  );
  if (!ok) return;
  try {
    await DB.remplacerTout(donnees);
    await chargerCollegues();
    await chargerPatients();
    await chargerFrais();
    panneauReglages.close();
    await afficherFeuille();
    message('Sauvegarde restaurée ✓');
  } catch (erreur) {
    console.error(erreur);
    message('Restauration impossible : ' + erreur.message, true);
  }
}

/* ---------- Export CSV (Excel, séparateur ;) ---------- */

function celluleCSV(valeur) {
  if (valeur == null) return '';
  let texte = String(valeur);
  if (/^[=+\-@]/.test(texte)) texte = "'" + texte;   // évite qu'Excel l'interprète comme une formule
  if (/[;"\r\n]/.test(texte)) texte = '"' + texte.replace(/"/g, '""') + '"';
  return texte;
}
const nombreCSV = n => (n == null ? '' : String(n).replace('.', ','));
const prixCSV = n => (n == null ? '' : n.toFixed(2).replace('.', ','));

async function exporterCSV(store) {
  const courses = await DB.tout(store);
  let entetes, lignes;
  if (store === 'prive') {
    courses.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
    entetes = ['Date', 'Heure', 'Station', 'Prix (€)', 'Paiement'];
    lignes = courses.map(c => [
      dateFr(c.date), c.heure, celluleCSV(c.station), prixCSV(c.prix), celluleCSV(c.paiement)
    ]);
  } else if (store === 'donne') {
    courses.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
    entetes = ['Date', 'Heure', 'Patient', 'Donné au taxi', 'Tél. taxi', 'Bon de transport'];
    lignes = courses.map(c => [
      dateFr(c.date), c.heure, celluleCSV(c.nom), celluleCSV(c.taxi), celluleCSV(c.telTaxi), c.bon ? 'Oui' : 'Non'
    ]);
  } else {
    courses.sort((a, b) => (a.date + heureMedical(a)).localeCompare(b.date + heureMedical(b)));
    entetes = ['Date', 'Heure', 'Nom / Prénom', 'Téléphone', 'Adresse client', "Adresse d'arrivée",
      'Trajet', 'Km (un trajet)', 'Km total', 'Prise en charge', 'Prix (€)', 'Bon de transport', 'Taxi (bon)'];
    lignes = courses.map(c => [
      dateFr(c.date), heureMedical(c), celluleCSV(c.nom), celluleCSV(c.telephone), celluleCSV(c.adresseDepart),
      celluleCSV(c.adresseArrivee), celluleCSV(c.trajet), nombreCSV(c.km), nombreCSV(c.kmTotal),
      celluleCSV(c.priseEnCharge), prixCSV(c.prix), c.bon ? 'Oui' : 'Non', celluleCSV(c.taxiBon)
    ]);
  }
  // ﻿ au début : indique à Excel que le fichier est en UTF-8 (accents corrects)
  const csv = '﻿' + [entetes.map(celluleCSV), ...lignes].map(l => l.join(';')).join('\r\n');
  const nomFichier = { prive: 'prive', medical: 'medical', donne: 'medical-donne' }[store];
  await partagerFichier(`carnet-taxi-${nomFichier}-${aujourdhui()}.csv`, csv, 'text/csv');
}

/* ---------- Branchements des boutons des réglages ---------- */

document.querySelectorAll('[data-csv]').forEach(b =>
  b.addEventListener('click', () => exporterCSV(b.dataset.csv).catch(e => message(e.message, true))));

$('#btn-export-json').addEventListener('click', () => exporterJSON().catch(e => message(e.message, true)));
$('#btn-import-json').addEventListener('click', () => $('#fichier-import').click());
$('#fichier-import').addEventListener('change', async e => {
  const fichier = e.target.files[0];
  e.target.value = '';   // permet de re-choisir le même fichier plus tard
  if (fichier) await importerJSON(fichier);
});

// Quand on revient sur l'app : passage à minuit, heure à jour dans un formulaire neuf
let jourConnu = aujourdhui();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const jour = aujourdhui();
  if (jour !== jourConnu) {
    if (etat.jour === jourConnu) etat.jour = jour;
    jourConnu = jour;
    if (!etat.ecran) afficherFeuille();
  }
  if (etat.ecran === 'prive' && !etat.edition.prive && formPrive.elements.prix.value.trim() === '') {
    formPrive.elements.heure.value = heureActuelle();
  }
});

/* ---------- Démarrage ---------- */

async function demarrer() {
  await afficherFeuille();
  chargerEtablissements();   // prépare la liste des établissements à l'avance
  await chargerCollegues();
  await chargerPatients();
  await chargerFrais();

  // Demande au navigateur de ne pas effacer nos données s'il manque de place
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

demarrer().catch(erreur => {
  console.error(erreur);
  message('Erreur au démarrage : ' + erreur.message, true);
});

// Mode hors ligne : enregistre le "service worker" (voir sw.js)
if ('serviceWorker' in navigator) {
  // Une nouvelle version de l'app vient d'être installée : on recharge pour l'afficher,
  // sauf si un formulaire est ouvert (elle s'affichera au prochain lancement)
  const avaitUneVersion = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitUneVersion) return;   // tout premier lancement : rien à recharger
    if (etat.ecran) message("Nouvelle version prête : elle s'affichera au prochain lancement");
    else location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker :', e));
  });
}
