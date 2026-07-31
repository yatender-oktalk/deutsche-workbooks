/* Vocab data sets. Loaded via plain <script> tags (data/a1.js etc., each
   setting window.VOCAB_RAW.<level>) rather than fetch() — fetch() of local
   JSON is blocked by CORS when this site is opened directly as a file://
   page, which is how these pages are meant to work with no server. */

const VocabData = {
  levels: ['a1', 'a2', 'b1', 'b2'],
  byLevel: {},
  byId: {},

  async load() {
    const raw = window.VOCAB_RAW || {};
    this.levels.forEach((lvl) => {
      const entries = raw[lvl] || [];
      this.byLevel[lvl] = entries;
      for (const entry of entries) this.byId[entry.id] = entry;
    });
    return this;
  },

  entriesFor(levels) {
    return levels.flatMap((lvl) => this.byLevel[lvl] || []);
  },

  get(id) {
    return this.byId[id];
  },

  randomDistractors(entry, count, pool) {
    const candidates = pool.filter(
      (e) => e.id !== entry.id && e.translation_en && e.translation_en !== entry.translation_en
    );
    const picked = [];
    const used = new Set();
    while (picked.length < count && picked.length < candidates.length) {
      const idx = Math.floor(Math.random() * candidates.length);
      const c = candidates[idx];
      if (!used.has(c.id)) {
        used.add(c.id);
        picked.push(c);
      }
    }
    return picked;
  },

  headword(entry) {
    return entry.article ? `${entry.article} ${entry.word}` : entry.word;
  },
};
