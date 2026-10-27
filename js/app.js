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

// "2026-10-27" -> "Mardi 27 octobre" (avec l'année si ce n'est pas l'année en cours)
function titreDuJour(iso) {
  const d = dateLocale(iso);
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  const texte = new Intl.DateTimeFormat('fr-FR', options).format(d);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
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
  ecran: null,                              // formulaire ouvert : 'prive', 'medical' ou null
  edition: { prive: null, medical: null }   // id de la course en cours de modification
};

const formPrive = $('#form-prive');
const formMedical = $('#form-medical');
const champDepart = $('#adresse-depart');
const champArrivee = $('#adresse-arrivee');
const infoKm = $('#info-km');

/* ---------- Feuille du jour ---------- */

async function afficherFeuille() {
  const [prives, medicales] = await Promise.all([
    DB.parDate('prive', etat.jour),
    DB.parDate('medical', etat.jour)
  ]);
  const courses = [
    ...prives.map(c => ({ store: 'prive', heure: c.heure || '', course: c })),
    ...medicales.map(c => ({ store: 'medical', heure: heureMedical(c), course: c }))
  ].sort((a, b) => a.heure.localeCompare(b.heure)
    || String(a.course.creeLe).localeCompare(String(b.course.creeLe)));

  // Date
  const estAujourdhui = etat.jour === aujourdhui();
  $('#titre-date').textContent = titreDuJour(etat.jour);
  const sousDate = $('#sous-date');
  sousDate.textContent = estAujourdhui ? "Aujourd'hui" : "Toucher la date pour revenir à aujourd'hui";
  sousDate.classList.toggle('autre-jour', !estAujourdhui);

  // Totaux
  const somme = liste => liste.reduce((s, c) => s + (c.prix || 0), 0);
  const totalPrive = somme(prives);
  const totalMedical = somme(medicales);
  $('#total-jour').textContent = euros(totalPrive + totalMedical);
  const nombre = courses.length;
  $('#detail-total').textContent = nombre === 0
    ? ''
    : `Privé ${euros(totalPrive)} · Médical ${euros(totalMedical)} · ${nombre} course${nombre > 1 ? 's' : ''}`;

  // Liste
  const ul = $('#liste-jour');
  ul.replaceChildren();
  if (nombre === 0) {
    ul.append(el('li', {
      className: 'liste-vide',
      textContent: estAujourdhui ? "Aucune course aujourd'hui" : 'Aucune course ce jour-là'
    }));
  }
  for (const { store, heure, course } of courses) ul.append(ligneCourse(store, heure, course));
}

const TRAJETS_COURTS = { 'Aller': 'Aller', 'Aller/Retour': 'A/R', 'Retour': 'Retour' };

function ligneCourse(store, heure, c) {
  const prive = store === 'prive';
  const titre = prive ? c.station : c.nom;
  const sous = prive ? c.paiement : (TRAJETS_COURTS[c.trajet] || c.trajet);
  const bouton = el('button', { type: 'button', className: 'course' },
    el('span', { className: 'c-heure', textContent: heure }),
    el('span', { className: 'c-type' + (prive ? '' : ' c-type-m'), textContent: prive ? 'P' : 'M',
      title: prive ? 'Privé' : 'Médical' }),
    el('span', { className: 'c-texte' },
      el('span', { className: 'c-titre', textContent: titre }),
      el('span', { className: 'c-sous', textContent: sous })
    ),
    el('span', { className: 'c-prix' + (c.prix == null ? ' vide' : ''),
      textContent: c.prix == null ? '— €' : euros(c.prix) })
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
$('#titre-date').addEventListener('click', () => changerJour(aujourdhui()));

/* ---------- Ouverture / fermeture des formulaires ---------- */

function ouvrirFormulaire(store, course = null) {
  if (store === 'prive') {
    reinitFormPrive();
    if (course) remplirFormPrive(course);
  } else {
    reinitFormMedical();
    if (course) remplirFormMedical(course);
  }
  etat.edition[store] = course ? course.id : null;
  etat.ecran = store;

  const titre = store === 'prive' ? 'Course privée' : 'Course médicale';
  $(`#titre-form-${store}`).textContent = course ? 'Modifier' : titre;
  $(`#btn-valider-${store}`).textContent = course ? 'Enregistrer' : 'Ajouter la course';
  $(`#btn-supprimer-${store}`).hidden = !course;

  $('#accueil').hidden = true;
  $('#ecran-prive').hidden = store !== 'prive';
  $('#ecran-medical').hidden = store !== 'medical';
  window.scrollTo(0, 0);
}

function fermerFormulaire() {
  etat.ecran = null;
  etat.edition = { prive: null, medical: null };
  $('#ecran-prive').hidden = true;
  $('#ecran-medical').hidden = true;
  $('#accueil').hidden = false;
  window.scrollTo(0, 0);
  return afficherFeuille();
}

document.querySelectorAll('[data-fermer-ecran]').forEach(b => b.addEventListener('click', fermerFormulaire));

async function supprimerCourse(store) {
  const id = etat.edition[store];
  if (!id || !confirm('Supprimer cette course ?\n\nCette action est définitive.')) return;
  await DB.supprimer(store, id);
  await fermerFormulaire();
  message('Course supprimée');
}
$('#btn-supprimer-prive').addEventListener('click', () => supprimerCourse('prive').catch(e => message(e.message, true)));
$('#btn-supprimer-medical').addEventListener('click', () => supprimerCourse('medical').catch(e => message(e.message, true)));

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
    etat.jour = course.date;   // retour sur la feuille du jour de la course
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
    priseEnCharge: c.priseEnCharge.value
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
brancherSuggestions(champArrivee, quandAdresseChange);

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
  majInfoKm();
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
  numeroCalculKm++;
  prixSaisiALaMain = course.prix != null;
  majInfoKm();
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
    await DB.enregistrer('medical', course);
    etat.jour = course.date;   // retour sur la feuille du jour de la course
    await fermerFormulaire();
    message(ancienne ? 'Course modifiée ✓' : 'Course ajoutée ✓');
  } catch (erreur) {
    console.error(erreur);
    message("Erreur d'enregistrement : " + erreur.message, true);
  }
});

/* ---------- Panneaux qui montent du bas (« + » et Réglages) ---------- */

const panneauAjout = $('#panneau-ajout');
const panneauReglages = $('#dlg-reglages');

$('#btn-ajouter').addEventListener('click', () => panneauAjout.showModal());
$('#btn-reglages').addEventListener('click', () => panneauReglages.showModal());

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
    version: 1,
    exporteLe: new Date().toISOString(),
    prive: await DB.tout('prive'),
    medical: await DB.tout('medical')
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
  if (!donnees || !Array.isArray(donnees.prive) || !Array.isArray(donnees.medical)
      || ![...donnees.prive, ...donnees.medical].every(estCourse)) {
    message("Ce fichier n'est pas une sauvegarde Carnet Taxi", true);
    return;
  }
  const ok = confirm(
    `Restaurer cette sauvegarde ?\n\n` +
    `${donnees.prive.length} course(s) privée(s) et ${donnees.medical.length} course(s) médicale(s).\n\n` +
    `ATTENTION : les données actuellement sur ce téléphone seront remplacées.`
  );
  if (!ok) return;
  try {
    await DB.remplacerTout(donnees);
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
  } else {
    courses.sort((a, b) => (a.date + heureMedical(a)).localeCompare(b.date + heureMedical(b)));
    entetes = ['Date', 'Heure', 'Nom / Prénom', 'Téléphone', 'Adresse client', "Adresse d'arrivée",
      'Trajet', 'Km (un trajet)', 'Km total', 'Prise en charge', 'Prix (€)'];
    lignes = courses.map(c => [
      dateFr(c.date), heureMedical(c), celluleCSV(c.nom), celluleCSV(c.telephone), celluleCSV(c.adresseDepart),
      celluleCSV(c.adresseArrivee), celluleCSV(c.trajet), nombreCSV(c.km), nombreCSV(c.kmTotal),
      celluleCSV(c.priseEnCharge), prixCSV(c.prix)
    ]);
  }
  // ﻿ au début : indique à Excel que le fichier est en UTF-8 (accents corrects)
  const csv = '﻿' + [entetes.map(celluleCSV), ...lignes].map(l => l.join(';')).join('\r\n');
  await partagerFichier(`carnet-taxi-${store}-${aujourdhui()}.csv`, csv, 'text/csv');
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
