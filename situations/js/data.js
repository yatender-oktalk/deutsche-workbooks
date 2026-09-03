/* Situation-card data sets. Loaded via plain <script> tags (data/b1.js etc.,
   each setting window.SITUATIONS_RAW.<level>) rather than fetch() — fetch()
   of local JSON is blocked by CORS when this site is opened directly as a
   file:// page, which is how these pages are meant to work with no server. */

const SituationsData = {
  levels: ['b1', 'b2'],
  byLevel: {},
  byId: {},
  categories: [],

  async load() {
    const raw = window.SITUATIONS_RAW || {};
    const catSeen = new Map();
    this.levels.forEach((lvl) => {
      const entries = raw[lvl] || [];
      this.byLevel[lvl] = entries;
      for (const entry of entries) {
        this.byId[entry.id] = entry;
        if (!catSeen.has(entry.category)) catSeen.set(entry.category, entry.category_label);
      }
    });
    this.categories = [...catSeen.entries()].map(([key, label]) => ({ key, label }));
    return this;
  },

  entriesFor(levels, categories) {
    let entries = levels.flatMap((lvl) => this.byLevel[lvl] || []);
    if (categories && categories.length > 0) {
      entries = entries.filter((e) => categories.includes(e.category));
    }
    return entries;
  },

  get(id) {
    return this.byId[id];
  },
};
