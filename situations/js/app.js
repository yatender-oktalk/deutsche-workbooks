/* Controller for index.html: profile picker + practice session setup. */

const ACTIVE_PROFILE_KEY = 'situations.activeProfile';
const VOCAB_PROFILE_KEY = 'vocab.activeProfile'; // read-only convenience: suggest the same name as the vocab trainer

let state = {
  profile: localStorage.getItem(ACTIVE_PROFILE_KEY) || null,
  levels: ['b1', 'b2'],
  categories: [], // empty = all categories
  count: 5,
};

function setActiveProfile(name) {
  state.profile = name;
  localStorage.setItem(ACTIVE_PROFILE_KEY, name);
}

async function renderProfileScreen() {
  const grid = document.getElementById('profile-grid');
  const profiles = await SitDB.listProfiles();
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
  const suggested = localStorage.getItem(VOCAB_PROFILE_KEY);
  const input = document.getElementById('new-profile-name');
  if (suggested && !input.value) input.placeholder = `Neues Profil, z. B. ${suggested}`;
}

async function createProfile() {
  const input = document.getElementById('new-profile-name');
  const name = input.value.trim();
  if (!name) return;
  await SitDB.createProfile(name);
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

function renderCategoryChips() {
  const row = document.getElementById('category-chips');
  row.innerHTML = '';
  SituationsData.categories.forEach((cat) => {
    const chip = document.createElement('button');
    chip.className = 'chip active';
    chip.dataset.category = cat.key;
    chip.textContent = cat.label;
    row.appendChild(chip);
  });
  wireChipRow('category-chips', 'category', (vals) => { state.categories = vals; updateDueSummary(); }, true);
}

async function showSetupScreen() {
  document.getElementById('profile-screen').hidden = true;
  document.getElementById('setup-screen').hidden = false;
  document.getElementById('profile-indicator').innerHTML =
    `Profil: <span class="profile-name">${escapeHtml(state.profile)}</span>`;
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
  const entries = SituationsData.entriesFor(state.levels, state.categories);
  const cards = (
    await Promise.all(state.levels.map((lvl) => SitDB.getCardsForProfile(state.profile, lvl)))
  ).flat();
  const cardById = new Map(cards.map((c) => [c.entryId, c]));
  const entryIds = new Set(entries.map((e) => e.id));
  const due = cards.filter((c) => c.due <= today && entryIds.has(c.entryId)).length;
  const newCount = entries.filter((e) => !cardById.has(e.id)).length;
  el.textContent = `${due} fällig zur Wiederholung · ${newCount} neue Situationen verfügbar`;
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
    count: String(state.count),
  });
  if (state.categories.length > 0) params.set('categories', state.categories.join(','));
  window.location.href = `practice.html?${params.toString()}`;
}

(async function init() {
  // Wire up all interactive elements FIRST, unconditionally — a failure below
  // (data load, IndexedDB) must never leave buttons dead with no handler.
  wireChipRow('level-chips', 'level', (vals) => { state.levels = vals; updateDueSummary(); }, true);

  const countSlider = document.getElementById('count-slider');
  const countValue = document.getElementById('count-value');
  state.count = parseInt(countSlider.value, 10);
  countSlider.addEventListener('input', () => {
    state.count = parseInt(countSlider.value, 10);
    countValue.textContent = countSlider.value;
  });

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
    await SituationsData.load();
    renderCategoryChips();
  } catch (err) {
    console.error('Situations data failed to load', err);
  }

  try {
    if (state.profile) {
      const profiles = await SitDB.listProfiles();
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
