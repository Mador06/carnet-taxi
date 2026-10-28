/* ============================================================
   patients.js – fiches patients construites à partir des courses médicales
   Une fiche est créée ou mise à jour à chaque course médicale enregistrée.
   Chaque course médicale garde l'identifiant de sa fiche (champ "patientId").
   Les valeurs « habituelles » sont les plus fréquentes sur ses courses
   (à égalité : la plus récente).
   ============================================================ */

// "Dupont  Jean" et "jean DUPONT" donnent la même clé : "dupont jean"
function clePatient(nom) {
  return normaliser(nom).split(' ').filter(Boolean).sort().join(' ');
}

// Téléphone comparable : chiffres seuls, +33 -> 0
function telPatient(tel) {
  return String(tel || '').replace(/[^\d+]/g, '').replace(/^\+33/, '0').replace(/^0033/, '0');
}

const memeNomPatient = (a, b) => clePatient(a) !== '' && clePatient(a) === clePatient(b);
const memeTelPatient = (a, b) => telPatient(a).length >= 9 && telPatient(a) === telPatient(b);

// Pour trier : la course la plus récente d'abord
const ordreCourse = c => `${c.date || ''} ${c.heure || ''} ${c.creeLe || ''}`;
const plusRecentesDabord = courses => [...courses].sort((a, b) => ordreCourse(b).localeCompare(ordreCourse(a)));

// Valeur la plus fréquente (courses triées de la plus récente à la plus ancienne)
function plusFrequent(courses, valeur) {
  const comptes = new Map();
  courses.forEach((c, rang) => {
    const v = valeur(c);
    if (!v) return;
    const compte = comptes.get(v) || { v, n: 0, rang };
    compte.n += 1;
    comptes.set(v, compte);
  });
  let meilleur = null;
  for (const compte of comptes.values()) {
    if (!meilleur || compte.n > meilleur.n || (compte.n === meilleur.n && compte.rang < meilleur.rang)) meilleur = compte;
  }
  return meilleur ? meilleur.v : '';
}

// Met à jour une fiche avec ses courses : habitudes, nombre de courses, dernière course…
function resumerPatient(patient, courses) {
  const fiche = { ...patient };
  const triees = plusRecentesDabord(courses);
  fiche.nbCourses = triees.length;
  if (triees.length === 0) return fiche;   // fiche gardée telle quelle

  const derniere = triees[0];
  fiche.derniereCourse = derniere.date;
  if (!fiche.nom) fiche.nom = derniere.nom;

  // Coordonnées : celles de la course la plus récente qui en a
  const avecTel = triees.find(c => c.telephone);
  if (avecTel) fiche.telephone = avecTel.telephone;
  const avecAdresse = triees.find(c => c.adresseDepart);
  if (avecAdresse) {
    fiche.adresse = avecAdresse.adresseDepart;
    fiche.coord = avecAdresse.coordDepart || null;
  }

  // Destinations déjà utilisées (la plus fréquente en premier)
  const destinations = new Map();
  triees.forEach((c, rang) => {
    const cle = normaliser(c.adresseArrivee);
    if (!cle) return;
    const d = destinations.get(cle) || { adresse: c.adresseArrivee, coord: c.coordArrivee || null, nb: 0, derniere: c.date, rang };
    d.nb += 1;
    if (!d.coord && c.coordArrivee) d.coord = c.coordArrivee;
    destinations.set(cle, d);
  });
  fiche.destinations = [...destinations.values()]
    .sort((a, b) => b.nb - a.nb || a.rang - b.rang)
    .map(({ adresse, coord, nb, derniere }) => ({ adresse, coord, nb, derniere }));
  if (fiche.destinations.length) {
    fiche.destination = fiche.destinations[0].adresse;
    fiche.destinationCoord = fiche.destinations[0].coord;
  }

  fiche.trajet = plusFrequent(triees, c => c.trajet) || fiche.trajet || '';
  fiche.priseEnCharge = plusFrequent(triees, c => c.priseEnCharge) || fiche.priseEnCharge || '';
  return fiche;
}

// Construit toutes les fiches d'un coup à partir des courses médicales
// (première installation, ou restauration d'une ancienne sauvegarde).
// Même nom (dans n'importe quel ordre) ou même téléphone = même patient.
// Renvoie { patients, liens } où liens associe l'id de chaque course à l'id de sa fiche.
function construirePatients(courses) {
  const groupes = [];
  for (const c of plusRecentesDabord(courses)) {
    if (!clePatient(c.nom)) continue;
    let groupe = groupes.find(g => g.courses.some(x => memeNomPatient(x.nom, c.nom) || memeTelPatient(x.telephone, c.telephone)));
    if (!groupe) {
      groupe = { courses: [] };
      groupes.push(groupe);
    }
    groupe.courses.push(c);
  }
  const maintenant = new Date().toISOString();
  const patients = [];
  const liens = new Map();
  for (const g of groupes) {
    // Nom de la fiche : l'écriture la plus fréquente
    const nom = plusFrequent(g.courses, c => c.nom.trim());
    const fiche = resumerPatient({ id: nouvelId(), nom, creeLe: maintenant, modifieLe: maintenant }, g.courses);
    patients.push(fiche);
    for (const c of g.courses) liens.set(c.id, fiche.id);
  }
  return { patients, liens };
}
