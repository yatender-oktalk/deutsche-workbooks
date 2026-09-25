/* Controller for index.html: profile picker + practice session setup. */

const ACTIVE_PROFILE_KEY = 'vocab.activeProfile';

/* Same threshold and rationale as MASTERY_STABILITY_DAYS in js/stats.js —
   duplicated rather than shared (this file and stats.js are never loaded
   together, same precedent as situations/js/srs.js's verbatim copy of
   vocab/js/srs.js). Keep both in sync if the threshold ever changes. */
const MASTERY_STABILITY_DAYS = 21;

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
  const breakdown = document.getElementById('index-level-breakdown');
  breakdown.innerHTML = '';

  levels.forEach((lvl) => {
    const cards = cardsByLevel[lvl];
    const total = (VocabData.byLevel[lvl] || []).length;
    const mastered = cards.filter((c) => (c.stability || 0) >= MASTERY_STABILITY_DAYS).length;
    const inProgress = cards.length - mastered;
    const notStarted = Math.max(0, total - cards.length);
    const due = cards.filter((c) => c.due <= today).length;
    const masteredPct = total ? (mastered / total) * 100 : 0;
    const inProgressPct = total ? (inProgress / total) * 100 : 0;

    totalWords += total;
    totalMastered += mastered;
    totalDue += due;

    const block = document.createElement('div');
    block.className = 'level-mastery-block';
    block.innerHTML =
      `<div class="level-mastery-head"><strong>${lvl.toUpperCase()}</strong><span>${total} Wörter gesamt</span></div>` +
      `<div class="level-mastery-bar">` +
        `<div class="seg seg-mastered" style="width:${masteredPct}%"></div>` +
        `<div class="seg seg-progress" style="width:${inProgressPct}%"></div>` +
      `</div>` +
      `<div class="level-mastery-legend">` +
        `<span class="lbl-mastered">${mastered} gemeistert</span>` +
        `<span class="lbl-progress">${inProgress} in Arbeit</span>` +
        `<span class="lbl-new">${notStarted} noch nicht begonnen</span>` +
      `</div>`;
    breakdown.appendChild(block);
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
