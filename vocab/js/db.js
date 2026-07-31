/* IndexedDB storage: profiles, per-card SRS state, and a review log.
   No backend — everything lives in the browser, scoped per profile so
   multiple people/levels can track progress independently on one device. */

const VOCAB_DB_NAME = 'vocab-trainer';
const VOCAB_DB_VERSION = 1;

function openVocabDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VOCAB_DB_NAME, VOCAB_DB_VERSION);
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

const VocabDB = {
  async listProfiles() {
    const db = await openVocabDB();
    const store = tx(db, ['profiles'], 'readonly').objectStore('profiles');
    const all = await reqToPromise(store.getAll());
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },

  async createProfile(name) {
    const db = await openVocabDB();
    const store = tx(db, ['profiles'], 'readwrite').objectStore('profiles');
    await reqToPromise(store.put({ name, createdAt: Date.now() }));
  },

  async deleteProfile(name) {
    const db = await openVocabDB();
    const t = tx(db, ['profiles', 'cards', 'reviews'], 'readwrite');
    t.objectStore('profiles').delete(name);
    const cardIdx = t.objectStore('cards').index('by_profile');
    const cardReq = cardIdx.openCursor(IDBKeyRange.only(name));
    cardReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    const revIdx = t.objectStore('reviews').index('by_profile');
    const revReq = revIdx.openCursor(IDBKeyRange.only(name));
    revReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  async getCard(profile, entryId) {
    const db = await openVocabDB();
    const store = tx(db, ['cards'], 'readonly').objectStore('cards');
    return reqToPromise(store.get(`${profile}::${entryId}`));
  },

  async getCardsForProfile(profile, level) {
    const db = await openVocabDB();
    const store = tx(db, ['cards'], 'readonly').objectStore('cards');
    if (level) {
      const idx = store.index('by_profile_level');
      return reqToPromise(idx.getAll(IDBKeyRange.only([profile, level])));
    }
    const idx = store.index('by_profile');
    return reqToPromise(idx.getAll(IDBKeyRange.only(profile)));
  },

  async putCard(card) {
    const db = await openVocabDB();
    const store = tx(db, ['cards'], 'readwrite').objectStore('cards');
    await reqToPromise(store.put(card));
  },

  async logReview(entry) {
    const db = await openVocabDB();
    const store = tx(db, ['reviews'], 'readwrite').objectStore('reviews');
    await reqToPromise(store.add(entry));
  },

  async getReviews(profile) {
    const db = await openVocabDB();
    const store = tx(db, ['reviews'], 'readonly').objectStore('reviews');
    const idx = store.index('by_profile');
    return reqToPromise(idx.getAll(IDBKeyRange.only(profile)));
  },
};
