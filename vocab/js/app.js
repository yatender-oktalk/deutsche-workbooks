/* Controller for index.html: profile picker + practice session setup. */

const ACTIVE_PROFILE_KEY = 'vocab.activeProfile';

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
  await updateDueSummary();
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
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
