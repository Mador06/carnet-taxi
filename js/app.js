/* ============================================================
   app.js – fonctionnement de l'application
   (onglets, formulaires, listes, sauvegarde, export CSV)
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
function heureActuelle() {
  const d = new Date();
  return `${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
}
function decalerJour(iso, nbJours) {
  const [a, m, j] = iso.split('-').map(Number);
  return dateISO(new Date(a, m - 1, j + nbJours));
}
function dateFr(iso) {
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
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

/* ---------- État de l'application ---------- */

const etat = {
  onglet: 'prive',
  jour: { prive: aujourdhui(), medical: aujourdhui() },   // jour affiché dans la liste
  edition: { prive: null, medical: null }                  // id de la course en cours de modification
};

const formPrive = $('#form-prive');
const formMedical = $('#form-medical');
const champDepart = $('#adresse-depart');
const champArrivee = $('#adresse-arrivee');
const infoKm = $('#info-km');

/* ---------- Onglets ---------- */

function changerOnglet(nom) {
  etat.onglet = nom;
  document.querySelectorAll('.onglet').forEach(s => { s.hidden = s.dataset.onglet !== nom; });
  document.querySelectorAll('.onglet-btn').forEach(b => b.classList.toggle('actif', b.dataset.cible === nom));
  document.body.classList.toggle('mode-medical', nom === 'medical');
  window.scrollTo(0, 0);
  try { localStorage.setItem('onglet', nom); } catch (e) { /* pas grave */ }
}

/* ---------- Navigation jour par jour ---------- */

function allerAuJour(store, date) {
  etat.jour[store] = date;
  $(`#onglet-${store} .choix-jour`).value = date;
}

function brancherNavJour(store) {
  const section = $(`#onglet-${store}`);
  const choix = $('.choix-jour', section);
  choix.value = etat.jour[store];
  choix.addEventListener('change', () => {
    if (!choix.value) return;
    etat.jour[store] = choix.value;
    afficherListe(store);
  });
  section.querySelectorAll('[data-jour]').forEach(bouton => {
    bouton.addEventListener('click', () => {
      allerAuJour(store, decalerJour(etat.jour[store], Number(bouton.dataset.jour)));
      afficherListe(store);
    });
  });
}

/* ---------- Listes et totaux ---------- */

async function afficherListe(store) {
  const courses = await DB.parDate(store, etat.jour[store]);
  if (store === 'prive') courses.sort((a, b) => a.heure.localeCompare(b.heure));
  else courses.sort((a, b) => a.creeLe.localeCompare(b.creeLe));

  const ul = $(`#liste-${store}`);
  ul.replaceChildren();
  if (courses.length === 0) {
    ul.append(el('li', { className: 'liste-vide', textContent: 'Aucune course ce jour-là.' }));
  }
  for (const c of courses) {
    const li = store === 'prive' ? lignePrive(c) : ligneMedical(c);
    if (etat.edition[store] === c.id) li.classList.add('en-edition');
    ul.append(li);
  }
  afficherTotaux(store, courses);
}

function afficherTotaux(store, courses) {
  const zone = $(`#totaux-${store}`);
  const total = courses.reduce((somme, c) => somme + (c.prix || 0), 0);
  const details = el('div', { className: 'sous-totaux' });
  details.append(el('span', { textContent: `${courses.length} course${courses.length > 1 ? 's' : ''}` }));

  if (store === 'prive') {
    for (const mode of ['Espèces', 'Carte', 'Carte+']) {
      const sousTotal = courses.filter(c => c.paiement === mode).reduce((s, c) => s + c.prix, 0);
      if (sousTotal > 0) details.append(el('span', { textContent: `${mode} : ${euros(sousTotal)}` }));
    }
  } else {
    const km = courses.reduce((s, c) => s + (c.kmTotal || 0), 0);
    if (km > 0) details.append(el('span', { textContent: `${formatKm(km)} km` }));
  }

  zone.replaceChildren(
    el('div', { className: 'total-jour', textContent: `Total : ${euros(total)}` }),
    details
  );
}

function boutonsActions(store, course) {
  const modifier = el('button', { type: 'button', textContent: 'Modifier' });
  modifier.addEventListener('click', () => commencerEdition(store, course));
  const supprimer = el('button', { type: 'button', className: 'supprimer', textContent: 'Supprimer' });
  supprimer.addEventListener('click', async () => {
    if (!confirm('Supprimer cette course ?')) return;
    await DB.supprimer(store, course.id);
    if (etat.edition[store] === course.id) reinitialiserForm(store);
    message('Course supprimée');
    afficherListe(store);
  });
  return el('div', { className: 'course-actions' }, modifier, supprimer);
}

function lignePrive(c) {
  return el('li', {},
    el('div', { className: 'course-haut' },
      el('span', { className: 'course-titre', textContent: `${c.heure} · ${c.station}` }),
      el('span', { className: 'course-prix', textContent: euros(c.prix) })
    ),
    el('div', { className: 'course-detail', textContent: c.paiement }),
    boutonsActions('prive', c)
  );
}

function ligneMedical(c) {
  let km = '';
  if (c.km != null) {
    km = `${formatKm(c.km)} km`;
    if (c.trajet === 'Aller/Retour') km += ` (A/R : ${formatKm(c.kmTotal)} km)`;
  }
  const infos = [c.trajet, c.priseEnCharge, km].filter(Boolean).join(' · ');
  const trajet = [c.adresseDepart, c.adresseArrivee].filter(Boolean).join(' → ');

  const detailTel = el('div', { className: 'course-detail' });
  if (c.telephone) {
    detailTel.append(el('a', { href: 'tel:' + c.telephone.replace(/[^\d+]/g, ''), textContent: c.telephone }));
  }

  return el('li', {},
    el('div', { className: 'course-haut' },
      el('span', { className: 'course-titre', textContent: c.nom }),
      el('span', { className: 'course-prix', textContent: c.prix == null ? '— €' : euros(c.prix) })
    ),
    el('div', { className: 'course-detail', textContent: infos }),
    trajet ? el('div', { className: 'course-detail', textContent: trajet }) : null,
    c.telephone ? detailTel : null,
    boutonsActions('medical', c)
  );
}

/* ---------- Mode modification (commun aux deux onglets) ---------- */

function modeEdition(store, actif) {
  $(`#titre-form-${store}`).textContent = actif
    ? 'Modifier la course'
    : (store === 'prive' ? 'Nouvelle course' : 'Nouvelle course médicale');
  $(`#btn-valider-${store}`).textContent = actif ? 'Enregistrer la modification' : 'Ajouter la course';
  $(`#btn-annuler-${store}`).hidden = !actif;
}

function commencerEdition(store, course) {
  etat.edition[store] = course.id;
  if (store === 'prive') remplirFormPrive(course);
  else remplirFormMedical(course);
  modeEdition(store, true);
  afficherListe(store);
  $(`#form-${store}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function reinitialiserForm(store) {
  if (store === 'prive') reinitFormPrive();
  else reinitFormMedical();
}

/* ---------- Onglet Privé ---------- */

function reinitFormPrive() {
  const c = formPrive.elements;
  const station = c.station.value;   // on garde la dernière station : souvent la même
  formPrive.reset();
  c.station.value = station;
  c.date.value = aujourdhui();
  c.heure.value = heureActuelle();
  etat.edition.prive = null;
  modeEdition('prive', false);
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
    message(ancienne ? 'Course modifiée ✓' : 'Course ajoutée ✓');
    allerAuJour('prive', course.date);
    reinitFormPrive();
    afficherListe('prive');
  } catch (erreur) {
    console.error(erreur);
    message("Erreur d'enregistrement : " + erreur.message, true);
  }
});

$('#btn-annuler-prive').addEventListener('click', () => {
  reinitFormPrive();
  afficherListe('prive');
});

/* ---------- Onglet Médical ---------- */

let prixSaisiALaMain = false;   // si oui, le calcul auto ne touche plus au prix
let numeroCalculKm = 0;         // pour ignorer une réponse arrivée trop tard

function donneesMedical() {
  const c = formMedical.elements;
  const km = lireNombre(c.km.value);
  const kmValide = km == null || Number.isNaN(km) ? null : arrondi(km, 1);
  return {
    date: c.date.value,
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
  formMedical.elements.date.value = aujourdhui();
  definirAdresse(champDepart, null);
  definirAdresse(champArrivee, null);
  numeroCalculKm++;
  prixSaisiALaMain = false;
  majInfoKm();
  etat.edition.medical = null;
  modeEdition('medical', false);
}

function remplirFormMedical(course) {
  const c = formMedical.elements;
  c.date.value = course.date;
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
    message(ancienne ? 'Course modifiée ✓' : 'Course ajoutée ✓');
    allerAuJour('medical', course.date);
    reinitFormMedical();
    afficherListe('medical');
  } catch (erreur) {
    console.error(erreur);
    message("Erreur d'enregistrement : " + erreur.message, true);
  }
});

$('#btn-annuler-medical').addEventListener('click', () => {
  reinitFormMedical();
  afficherListe('medical');
});

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
    reinitFormPrive();
    reinitFormMedical();
    await Promise.all([afficherListe('prive'), afficherListe('medical')]);
    $('#dlg-sauvegarde').close();
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
    courses.sort((a, b) => (a.date + a.creeLe).localeCompare(b.date + b.creeLe));
    entetes = ['Date', 'Nom / Prénom', 'Téléphone', 'Adresse client', "Adresse d'arrivée",
      'Trajet', 'Km (un trajet)', 'Km total', 'Prise en charge', 'Prix (€)'];
    lignes = courses.map(c => [
      dateFr(c.date), celluleCSV(c.nom), celluleCSV(c.telephone), celluleCSV(c.adresseDepart),
      celluleCSV(c.adresseArrivee), celluleCSV(c.trajet), nombreCSV(c.km), nombreCSV(c.kmTotal),
      celluleCSV(c.priseEnCharge), prixCSV(c.prix)
    ]);
  }
  // ﻿ au début : indique à Excel que le fichier est en UTF-8 (accents corrects)
  const csv = '﻿' + [entetes.map(celluleCSV), ...lignes].map(l => l.join(';')).join('\r\n');
  await partagerFichier(`carnet-taxi-${store}-${aujourdhui()}.csv`, csv, 'text/csv');
}

/* ---------- Branchements des boutons ---------- */

document.querySelectorAll('.onglet-btn').forEach(b =>
  b.addEventListener('click', () => changerOnglet(b.dataset.cible)));

document.querySelectorAll('[data-csv]').forEach(b =>
  b.addEventListener('click', () => exporterCSV(b.dataset.csv).catch(e => message(e.message, true))));

const fenetreSauvegarde = $('#dlg-sauvegarde');
$('#btn-sauvegarde').addEventListener('click', () => fenetreSauvegarde.showModal());
$('#btn-fermer-dlg').addEventListener('click', () => fenetreSauvegarde.close());
$('#btn-export-json').addEventListener('click', () => exporterJSON().catch(e => message(e.message, true)));
$('#btn-import-json').addEventListener('click', () => $('#fichier-import').click());
$('#fichier-import').addEventListener('change', async e => {
  const fichier = e.target.files[0];
  e.target.value = '';   // permet de re-choisir le même fichier plus tard
  if (fichier) await importerJSON(fichier);
});

// Quand on revient sur l'app : mise à jour de l'heure et du jour
let jourConnu = aujourdhui();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const jour = aujourdhui();
  if (jour !== jourConnu) {
    for (const store of STORES) {
      if (etat.jour[store] === jourConnu) allerAuJour(store, jour);
      const form = store === 'prive' ? formPrive : formMedical;
      if (!etat.edition[store] && form.elements.date.value === jourConnu) form.elements.date.value = jour;
      afficherListe(store);
    }
    jourConnu = jour;
  }
  if (!etat.edition.prive && formPrive.elements.prix.value.trim() === '') {
    formPrive.elements.heure.value = heureActuelle();
  }
});

/* ---------- Démarrage ---------- */

async function demarrer() {
  brancherNavJour('prive');
  brancherNavJour('medical');
  let onglet = 'prive';
  try { onglet = localStorage.getItem('onglet') || 'prive'; } catch (e) { /* pas grave */ }
  changerOnglet(onglet === 'medical' ? 'medical' : 'prive');
  reinitFormPrive();
  reinitFormMedical();
  await Promise.all([afficherListe('prive'), afficherListe('medical')]);
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
  // sauf si une saisie est en cours (elle s'affichera au prochain lancement)
  const avaitUneVersion = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitUneVersion) return;   // tout premier lancement : rien à recharger
    const saisieEnCours = etat.edition.prive || etat.edition.medical
      || formPrive.elements.prix.value.trim() || formMedical.elements.nom.value.trim();
    if (saisieEnCours) message("Nouvelle version prête : elle s'affichera au prochain lancement");
    else location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker :', e));
  });
}
