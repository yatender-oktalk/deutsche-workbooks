/* IndexedDB storage: profiles, per-card SRS state, and a review log.
   No backend — everything lives in the browser, scoped per profile so
   multiple people/levels can track progress independently on one device.
   Deliberately a separate database from vocab/js/db.js (own name, own
   stores) rather than sharing vocab-trainer's — keeps the two trainers
   fully independent even though they run on the same origin. */

const SIT_DB_NAME = 'situations-trainer';
const SIT_DB_VERSION = 1;

function openSitDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SIT_DB_NAME, SIT_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('cards')) {
        const store = db.createObjectStore('cards', { keyPath: 'key' });
        store.createIndex('by_profile', 'profile');
        store.createIndex('by_profile_level', ['profile', 'level']);
      }
      if (!db.objectStoreNames.contains('reviews')) {
        const store = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_profile', 'profile');
        store.createIndex('by_profile_day', ['profile', 'day']);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, stores, mode) {
  return db.transaction(stores, mode);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const SitDB = {
  async listProfiles() {
    const db = await openSitDB();
    const store = tx(db, ['profiles'], 'readonly').objectStore('profiles');
    const all = await reqToPromise(store.getAll());
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },

  async createProfile(name) {
    const db = await openSitDB();
    const store = tx(db, ['profiles'], 'readwrite').objectStore('profiles');
    await reqToPromise(store.put({ name, createdAt: Date.now() }));
  },

  async getCard(profile, entryId) {
    const db = await openSitDB();
    const store = tx(db, ['cards'], 'readonly').objectStore('cards');
    return reqToPromise(store.get(`${profile}::${entryId}`));
  },

  async getCardsForProfile(profile, level) {
    const db = await openSitDB();
    const store = tx(db, ['cards'], 'readonly').objectStore('cards');
    if (level) {
      const idx = store.index('by_profile_level');
      return reqToPromise(idx.getAll(IDBKeyRange.only([profile, level])));
    }
    const idx = store.index('by_profile');
    return reqToPromise(idx.getAll(IDBKeyRange.only(profile)));
  },

  async putCard(card) {
    const db = await openSitDB();
    const store = tx(db, ['cards'], 'readwrite').objectStore('cards');
    await reqToPromise(store.put(card));
  },

  async logReview(entry) {
    const db = await openSitDB();
    const store = tx(db, ['reviews'], 'readwrite').objectStore('reviews');
    await reqToPromise(store.add(entry));
  },
};
