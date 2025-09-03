// IndexedDB helper for SNS Draft App
const DB_NAME = 'sns_draft_app';
const DB_VERSION = 1;
const STORE = 'drafts';

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('updated_at', 'updated_at');
        store.createIndex('pinned', 'pinned');
        store.createIndex('pinned_at', 'pinned_at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode = 'readonly') {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function addDraft(db, draft) {
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').add(draft);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putDraft(db, draft) {
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(draft);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getDraft(db, id) {
  return new Promise((resolve, reject) => {
    const req = tx(db).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDraft(db, id) {
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllDrafts(db) {
  return new Promise((resolve, reject) => {
    const req = tx(db).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function countDrafts(db) {
  return new Promise((resolve, reject) => {
    const req = tx(db).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

