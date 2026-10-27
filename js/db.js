/* ============================================================
   db.js – stockage local sur le téléphone (IndexedDB)
   Deux "tiroirs" (stores) : "prive" et "medical".
   Rien n'est envoyé sur Internet.
   ============================================================ */

const DB_NOM = 'carnet-taxi';
const DB_VERSION = 3;   // 2 : ajout des favoris "lieux" ; 3 : favoris retirés
const STORES = ['prive', 'medical'];

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
            store.createIndex('date', 'date');
          }
        }
        // Ancien tiroir des favoris (version 2), qui n'existe plus
        if (db.objectStoreNames.contains('lieux')) db.deleteObjectStore('lieux');
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
  async remplacerTout(donnees) {
    const db = await ouvrirDB();
    return new Promise((resoudre, rejeter) => {
      const tx = db.transaction(STORES, 'readwrite');
      for (const nom of STORES) {
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
