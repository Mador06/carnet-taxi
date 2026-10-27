/* ============================================================
   db.js – stockage local sur le téléphone (IndexedDB)
   Trois "tiroirs" (stores) : "prive", "medical" (les courses)
   et "lieux" (les favoris ⭐).
   Rien n'est envoyé sur Internet.
   ============================================================ */

const DB_NOM = 'carnet-taxi';
const DB_VERSION = 2;                          // 2 : ajout du tiroir "lieux"
const STORES_COURSES = ['prive', 'medical'];
const STORES = [...STORES_COURSES, 'lieux'];

let promesseDB = null;

function ouvrirDB() {
  if (!promesseDB) {
    promesseDB = new Promise((resoudre, rejeter) => {
      const req = indexedDB.open(DB_NOM, DB_VERSION);
      // Appelé la toute première fois (ou si on change DB_VERSION).
      // Les tiroirs déjà existants (et leurs courses) ne sont pas touchés.
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const nom of STORES) {
          if (!db.objectStoreNames.contains(nom)) {
            const store = db.createObjectStore(nom, { keyPath: 'id' });
            if (STORES_COURSES.includes(nom)) store.createIndex('date', 'date');
          }
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
  enregistrer(store, course) {
    return operation(store, 'readwrite', s => s.put(course));
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
  // Une ancienne sauvegarde sans "lieux" ne touche pas aux favoris actuels.
  async remplacerTout(donnees) {
    const db = await ouvrirDB();
    const stores = Array.isArray(donnees.lieux) ? STORES : STORES_COURSES;
    return new Promise((resoudre, rejeter) => {
      const tx = db.transaction(stores, 'readwrite');
      for (const nom of stores) {
        const store = tx.objectStore(nom);
        store.clear();
        for (const course of donnees[nom] || []) store.put(course);
      }
      tx.oncomplete = () => resoudre();
      tx.onerror = () => rejeter(tx.error);
      tx.onabort = () => rejeter(tx.error);
    });
  }
};
