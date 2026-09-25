/* Controller for index.html: profile picker + practice session setup. */

const ACTIVE_PROFILE_KEY = 'vocab.activeProfile';

/* Same threshold and rationale as MASTERY_STABILITY_DAYS in js/stats.js —
   duplicated rather than shared (this file and stats.js are never loaded
   together, same precedent as situations/js/srs.js's verbatim copy of
   vocab/js/srs.js). Keep both in sync if the threshold ever changes. */
const MASTERY_STABILITY_DAYS = 21;

/* Fixed 20-word "modules" per level, sliced in the dataset's own stable
   order (not stored anywhere — recomputed from VocabData.byLevel[lvl] each
   time), so a level card can point at a concrete, repeatable chunk to
   start next rather than only offering the due/fresh mixed queue below.
   Purely a navigation aid over the existing SRS data — a module has no
   state of its own beyond "which of its 20 entries already have a card". */
const MODULE_SIZE = 20;

const LEVEL_META = {
  a1: { title: 'A1 – Grundwortschatz', desc: 'Alltägliche Begriffe für einfache Sätze und Informationen.' },
  a2: { title: 'A2 – Erweiterter Wortschatz', desc: 'Einkaufen, Reisen, Arbeit und kleine Gespräche im Alltag.' },
  b1: { title: 'B1 – Mittelstufe Wortschatz', desc: 'Meinungen, Medien und zusammenhängende Themen.' },
  b2: { title: 'B2 – Fortgeschrittener Wortschatz', desc: 'Abstrakte Themen, Nuancen und berufliche Sprache.' },
};

function moduleChunks(lvl) {
  const words = VocabData.byLevel[lvl] || [];
  const chunks = [];
  for (let i = 0; i < words.length; i += MODULE_SIZE) chunks.push(words.slice(i, i + MODULE_SIZE));
  return chunks;
}

let state = {
  profile: localStorage.getItem(ACTIVE_PROFILE_KEY) || null,
  levels: ['a1', 'a2', 'b1', 'b2'],
  mode: 'mixed',
  count: 20,
};

function setActiveProfile(name) {
  state.profile = name;
  localStorage.setItem(ACTIVE_PROFILE_KEY, name);
}

async function renderProfileScreen() {
  const grid = document.getElementById('profile-grid');
  const profiles = await VocabDB.listProfiles();
  grid.innerHTML = '';
  if (profiles.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">Noch kein Profil &ndash; leg unten eins an.</div>';
  }
  for (const p of profiles) {
    const tile = document.createElement('button');
    tile.className = 'profile-tile';
    tile.textContent = p.name;
    tile.onclick = () => {
      setActiveProfile(p.name);
      showSetupScreen();
    };
    grid.appendChild(tile);
  }
}

async function createProfile() {
  const input = document.getElementById('new-profile-name');
  const name = input.value.trim();
  if (!name) return;
  await VocabDB.createProfile(name);
  setActiveProfile(name);
  input.value = '';
  showSetupScreen();
}

function showProfileScreen() {
  document.getElementById('profile-screen').hidden = false;
  document.getElementById('setup-screen').hidden = true;
  document.getElementById('profile-indicator').textContent = '';
  renderProfileScreen();
}

async function showSetupScreen() {
  document.getElementById('profile-screen').hidden = true;
  document.getElementById('setup-screen').hidden = false;
  document.getElementById('profile-indicator').innerHTML =
    `Profil: <span class="profile-name">${escapeHtml(state.profile)}</span>`;
  document.getElementById('stats-link').href = `stats.html?profile=${encodeURIComponent(state.profile)}`;
  await Promise.all([updateDueSummary(), renderProgressOverview()]);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/* Overall progress hero + per-level mastery bars at the top of the setup
   screen — always computed across all four levels (independent of the
   level chips below, which only scope the next practice session), so it
   reads as "how much of the whole deck have I learned" at a glance. */
async function renderProgressOverview() {
  const levels = ['a1', 'a2', 'b1', 'b2'];
  const today = todayStr();
  const cardsByLevel = {};
  for (const lvl of levels) {
    cardsByLevel[lvl] = await VocabDB.getCardsForProfile(state.profile, lvl);
  }

  let totalWords = 0, totalMastered = 0, totalDue = 0;
  const container = document.getElementById('level-cards');
  container.innerHTML = '';

  levels.forEach((lvl) => {
    const cards = cardsByLevel[lvl];
    const cardByEntry = new Map(cards.map((c) => [c.entryId, c]));
    const total = (VocabData.byLevel[lvl] || []).length;
    const mastered = cards.filter((c) => (c.stability || 0) >= MASTERY_STABILITY_DAYS).length;
    const due = cards.filter((c) => c.due <= today).length;
    const pct = total ? Math.round((mastered / total) * 100) : 0;

    totalWords += total;
    totalMastered += mastered;
    totalDue += due;

    // Next module to work on: the first one that isn't fully mastered yet,
    // or the last one if the whole level is already done.
    const chunks = moduleChunks(lvl);
    let moduleIdx = chunks.findIndex((chunk) =>
      chunk.some((e) => (cardByEntry.get(e.id)?.stability || 0) < MASTERY_STABILITY_DAYS));
    if (moduleIdx === -1) moduleIdx = Math.max(0, chunks.length - 1);
    const chunk = chunks[moduleIdx] || [];
    const chunkMastered = chunk.filter((e) => (cardByEntry.get(e.id)?.stability || 0) >= MASTERY_STABILITY_DAYS).length;
    const chunkPct = chunk.length ? Math.round((chunkMastered / chunk.length) * 100) : 0;
    const moduleIds = chunk.map((e) => e.id).join(',');
    const start = moduleIdx * MODULE_SIZE + 1;
    const end = moduleIdx * MODULE_SIZE + chunk.length;

    const meta = LEVEL_META[lvl];
    const card = document.createElement('div');
    card.className = `level-card level-card-${lvl}`;
    card.innerHTML =
      `<div class="level-card-head">` +
        `<div>` +
          `<span class="level-card-badge">NIVEAU ${lvl.toUpperCase()}</span>` +
          `<div class="level-card-title">${meta.title}</div>` +
          `<div class="level-card-desc">${meta.desc}</div>` +
        `</div>` +
        `<div class="level-card-stats">` +
          `<div class="level-card-stat"><span class="num">${mastered}/${total}</span><span class="lbl">Gemeistert</span></div>` +
          `<div class="level-card-stat"><span class="num">${due}</span><span class="lbl">Fällig</span></div>` +
        `</div>` +
      `</div>` +
      `<div class="level-card-progress-label"><span>Fortschritt Niveau ${lvl.toUpperCase()}</span><span>${pct}%</span></div>` +
      `<div class="level-card-progress-track"><div class="level-card-progress-fill" style="width:${pct}%"></div></div>` +
      `<div class="level-card-modules-label">20-Wörter-Module</div>` +
      `<div class="level-module-row">` +
        `<div>` +
          `<span class="lm-title">Modul ${moduleIdx + 1}: Wörter ${start}&ndash;${end}</span>` +
          `<span class="lm-badge">${chunkPct}% erfüllt</span>` +
          `<div class="lm-sub">${chunkMastered} von ${chunk.length} Wörtern gemeistert</div>` +
        `</div>` +
        `<a class="lm-start" href="practice.html?profile=${encodeURIComponent(state.profile)}&levels=${lvl}&mode=mixed&ids=${encodeURIComponent(moduleIds)}">Start Modul ${moduleIdx + 1}</a>` +
      `</div>`;
    container.appendChild(card);
  });

  const overallPct = totalWords ? Math.round((totalMastered / totalWords) * 100) : 0;
  document.getElementById('hero-pct').textContent = `${overallPct}%`;
  document.getElementById('hero-bar-fill').style.width = `${overallPct}%`;
  document.getElementById('hero-total').textContent = totalWords;
  document.getElementById('hero-mastered').textContent = totalMastered;
  document.getElementById('hero-due').textContent = totalDue;
}

async function updateDueSummary() {
  const el = document.getElementById('due-summary');
  el.textContent = 'Lade…';
  const today = todayStr();
  const entries = VocabData.entriesFor(state.levels);
  const cards = (
    await Promise.all(state.levels.map((lvl) => VocabDB.getCardsForProfile(state.profile, lvl)))
  ).flat();
  const cardById = new Map(cards.map((c) => [c.entryId, c]));
  const due = cards.filter((c) => c.due <= today).length;
  const newCount = entries.filter((e) => !cardById.has(e.id)).length;
  el.textContent = `${due} fällig zur Wiederholung · ${newCount} neue Wörter verfügbar`;
}

function wireChipRow(rowId, attr, onChange, multi) {
  const row = document.getElementById(rowId);
  row.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (multi) {
        chip.classList.toggle('active');
        const active = [...row.querySelectorAll('.chip.active')];
        if (active.length === 0) chip.classList.add('active'); // keep at least one
      } else {
        row.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      }
      onChange([...row.querySelectorAll('.chip.active')].map((c) => c.dataset[attr]));
    });
  });
}

function startSession() {
  const params = new URLSearchParams({
    profile: state.profile,
    levels: state.levels.join(','),
    mode: state.mode,
    count: String(state.count),
  });
  window.location.href = `practice.html?${params.toString()}`;
}

(async function init() {
  // Wire up all interactive elements FIRST, unconditionally — a failure below
  // (data load, IndexedDB) must never leave buttons dead with no handler.
  wireChipRow('level-chips', 'level', (vals) => { state.levels = vals; updateDueSummary(); }, true);
  wireChipRow('mode-chips', 'mode', (vals) => { state.mode = vals[0]; }, false);
  wireChipRow('count-chips', 'count', (vals) => { state.count = parseInt(vals[0], 10); }, false);

  document.getElementById('create-profile-btn').addEventListener('click', createProfile);
  document.getElementById('new-profile-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createProfile();
  });
  document.getElementById('start-btn').addEventListener('click', startSession);
  document.getElementById('switch-profile-link').addEventListener('click', (e) => {
    e.preventDefault();
    showProfileScreen();
  });

  try {
    await VocabData.load();
  } catch (err) {
    console.error('Vocab data failed to load', err);
  }

  try {
    if (state.profile) {
      const profiles = await VocabDB.listProfiles();
      if (profiles.some((p) => p.name === state.profile)) {
        showSetupScreen();
        return;
      }
    }
    showProfileScreen();
  } catch (err) {
    console.error('Profile lookup failed', err);
    showProfileScreen();
  }
})();
