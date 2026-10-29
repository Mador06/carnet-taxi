/* ============================================================
   db.js – stockage local sur le téléphone (IndexedDB)
   "Tiroirs" (stores) :
   - "prive", "medical", "donne" : les courses (rangées par date)
   - "collegues" : les taxis à qui l'on donne des courses (nom + téléphone)
   - "patients" : les fiches patients (voir patients.js)
   - "reglages" : les réglages, ex. { id: 'frais', liste: [...] } pour les frais fixes
   Rien n'est envoyé sur Internet.
   ============================================================ */

const DB_NOM = 'carnet-taxi';
// 2 : favoris "lieux" ; 3 : favoris retirés ; 4 : médical donné + collègues ; 5 : fiches patients ; 6 : réglages (frais fixes)
const DB_VERSION = 6;
const STORES = ['prive', 'medical', 'donne'];   // les courses
const STORES_TOUS = [...STORES, 'collegues', 'patients', 'reglages'];

let promesseDB = null;

function ouvrirDB() {
  if (!promesseDB) {
    promesseDB = new Promise((resoudre, rejeter) => {
      const req = indexedDB.open(DB_NOM, DB_VERSION);
      // Appelé la toute première fois (ou si on change DB_VERSION).
      // Les tiroirs déjà existants (et leurs courses) ne sont pas touchés.
      req.onupgradeneeded = evenement => {
        const db = req.result;
        const nouveauTiroirPatients = !db.objectStoreNames.contains('patients');
        for (const nom of STORES_TOUS) {
          if (!db.objectStoreNames.contains(nom)) {
            const store = db.createObjectStore(nom, { keyPath: 'id' });
            if (STORES.includes(nom)) store.createIndex('date', 'date');
          }
        }
        // Ancien tiroir des favoris (version 2), qui n'existe plus
        if (db.objectStoreNames.contains('lieux')) db.deleteObjectStore('lieux');

        // Version 5 : fiches patients créées à partir des courses médicales déjà là.
        // Tout se fait dans la même opération que la mise à jour : si ça échoue, rien ne change.
        if (nouveauTiroirPatients && evenement.oldVersion > 0) {
          const tx = req.transaction;
          const medical = tx.objectStore('medical');
          medical.getAll().onsuccess = e => {
            const { patients, liens } = construirePatients(e.target.result);
            for (const fiche of patients) tx.objectStore('patients').put(fiche);
            for (const course of e.target.result) {
              if (liens.has(course.id)) medical.put({ ...course, patientId: liens.get(course.id) });
            }
          };
        }
      };
      req.onsuccess = () => resoudre(req.result);
      req.onerror = () => rejeter(req.error);
    });
  }
  return promesseDB;
}

// Petite fonction utilitaire : lance une opération et attend la fin
async function operation(store, mode, action) {
  const db = await ouvrirDB();
  return new Promise((resoudre, rejeter) => {
    const tx = db.transaction(store, mode);
    const req = action(tx.objectStore(store));
    tx.oncomplete = () => resoudre(req ? req.result : undefined);
    tx.onerror = () => rejeter(tx.error);
    tx.onabort = () => rejeter(tx.error);
  });
}

const DB = {
  enregistrer(store, objet) {
    return operation(store, 'readwrite', s => s.put(objet));
  },
  supprimer(store, id) {
    return operation(store, 'readwrite', s => s.delete(id));
  },
  lire(store, id) {
    return operation(store, 'readonly', s => s.get(id));
  },
  tout(store) {
    return operation(store, 'readonly', s => s.getAll());
  },
  parDate(store, date) {
    return operation(store, 'readonly', s => s.index('date').getAll(date));
  },

  // Restauration : remplace TOUT en une seule fois.
  // Si une erreur survient, rien n'est modifié (transaction annulée).
  // Une ancienne sauvegarde (sans "donne", "collegues", "patients" ou "reglages") ne touche pas à ces tiroirs.
  async remplacerTout(donnees) {
    const db = await ouvrirDB();
    const stores = STORES_TOUS.filter(nom => nom === 'prive' || nom === 'medical' || Array.isArray(donnees[nom]));
    return new Promise((resoudre, rejeter) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const nom of stores) {
        const store = tx.objectStore(nom);
        store.clear();
        for (const objet of donnees[nom] || []) store.put(objet);
      }
      tx.oncomplete = () => resoudre();
      tx.onerror = () => rejeter(tx.error);
      tx.onabort = () => rejeter(tx.error);
    });
  }
};
