/* Practice session controller: builds the queue of situation cards, renders
   each one (situation → your own attempt → reveal model answer + phrase
   bank → self-grade), and logs the review through the FSRS scheduler.
   Single interaction mode by design — there is no automatic grading of
   free-form German without a backend, so this mirrors the vocab trainer's
   flashcard mode (self-graded) rather than its quiz modes. */

let session = {
  profile: null,
  queue: [], // [entry, entry, ...]
  index: 0,
};

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function buildQueue(profile, levels, categories, count) {
  const today = todayStr();
  const entries = SituationsData.entriesFor(levels, categories);
  const entryIds = new Set(entries.map((e) => e.id));
  const allCards = (await Promise.all(levels.map((lvl) => SitDB.getCardsForProfile(profile, lvl)))).flat()
    .filter((c) => entryIds.has(c.entryId));
  const cardByEntry = new Map(allCards.map((c) => [c.entryId, c]));

  const due = allCards
    .filter((c) => c.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : 1))
    .map((c) => SituationsData.get(c.entryId))
    .filter(Boolean);

  const fresh = shuffle(entries.filter((e) => !cardByEntry.has(e.id)));

  const chosen = [...due.slice(0, count)];
  if (chosen.length < count) chosen.push(...fresh.slice(0, count - chosen.length));
  return chosen;
}

/* Explicit-id queue, for future targeted-practice entry points (mirrors the
   vocab trainer's buildQueueFromIds / weak-words pattern). */
function buildQueueFromIds(ids) {
  return ids.map((id) => SituationsData.get(id)).filter(Boolean);
}

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}

function renderProgress() {
  document.getElementById('progress-label').textContent =
    `Situation ${Math.min(session.index + 1, session.queue.length)} von ${session.queue.length}`;
  document.getElementById('progress-fill').style.width =
    `${(session.index / session.queue.length) * 100}%`;
}

function speak(text) {
  const src = document.getElementById('tts-source');
  src.textContent = text;
  speakText('tts-source');
}

async function finishCard(entry, grade) {
  let card = await SitDB.getCard(session.profile, entry.id);
  if (!card) card = newCard(session.profile, entry);
  gradeCard(card, grade);
  await SitDB.putCard(card);

  await SitDB.logReview({
    profile: session.profile,
    entryId: entry.id,
    level: entry.level,
    category: entry.category,
    grade,
    day: todayStr(),
    ts: Date.now(),
  });

  session.index++;
  renderProgress();
  renderCurrentCard();
}

function renderGradeRow(container, onGrade) {
  const row = el('div', 'grade-row');
  const buttons = [
    ['again', 'Nochmal', '1'],
    ['hard', 'Schwer', '2'],
    ['good', 'Gut', '3'],
    ['easy', 'Leicht', '4'],
  ];
  buttons.forEach(([grade, label, key]) => {
    const btn = el('button', `grade-btn ${grade}`, `${label}<span class="key-hint">${key}</span>`);
    btn.onclick = () => onGrade(grade);
    row.appendChild(btn);
  });
  container.appendChild(row);
}

let gradeKeyHandler = null;
function wireGradeKeys() {
  if (gradeKeyHandler) document.removeEventListener('keydown', gradeKeyHandler);
  gradeKeyHandler = (e) => {
    const map = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
    if (map[e.key] && document.activeElement.tagName !== 'TEXTAREA') {
      const idx = ['again', 'hard', 'good', 'easy'].indexOf(map[e.key]);
      const btn = document.querySelectorAll('.grade-btn')[idx];
      if (btn) btn.click();
    }
  };
  document.addEventListener('keydown', gradeKeyHandler);
}

function renderSituation(container, entry) {
  container.innerHTML = '';
  const card = el('div', 'card situation-card');

  card.appendChild(el('div', 'mode-tag', `${entry.category_label} · ${entry.level.toUpperCase()}`));

  const contextBlock = el('div', 'situation-context');
  contextBlock.appendChild(el('div', 'situation-de', escapeHtml(entry.situation_de)));
  if (entry.situation_en) contextBlock.appendChild(el('div', 'situation-en', escapeHtml(entry.situation_en)));
  card.appendChild(contextBlock);

  const audioRow = el('div', 'audio-row');
  const playBtn = el('button', 'play-btn', '&#9658;');
  playBtn.title = 'Situation vorlesen lassen';
  playBtn.onclick = () => speak(entry.situation_de);
  audioRow.appendChild(playBtn);
  card.appendChild(audioRow);

  container.appendChild(card);

  const yourTurn = el('div', 'your-turn');
  yourTurn.appendChild(el('div', 'field-label', 'Deine Antwort — sprich sie laut, oder tippe hier eine Notiz (wird nicht gespeichert)'));
  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.placeholder = 'Deine Antwort …';
  yourTurn.appendChild(textarea);
  container.appendChild(yourTurn);

  const revealBtn = el('button', 'btn btn-block', 'Antwort zeigen');
  container.appendChild(revealBtn);

  revealBtn.onclick = () => {
    revealBtn.remove();
    const reveal = el('div', 'reveal-block');

    const modelBlock = el('div', 'model-response-block');
    modelBlock.appendChild(el('div', 'label', 'Modellantwort'));
    modelBlock.appendChild(el('div', 'model-response-text', escapeHtml(entry.model_response)));
    reveal.appendChild(modelBlock);

    const bankBlock = el('div', 'phrase-bank-block');
    bankBlock.appendChild(el('div', 'label', 'Redemittel'));
    const list = el('ul', 'phrase-bank-list');
    entry.phrase_bank.forEach((p) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="phrase-de">${escapeHtml(p.de)}</span><span class="phrase-en">${escapeHtml(p.en)}</span>`;
      list.appendChild(li);
    });
    bankBlock.appendChild(list);
    reveal.appendChild(bankBlock);

    container.appendChild(reveal);
    renderGradeRow(container, (grade) => finishCard(entry, grade));
    wireGradeKeys();
  };
}

function renderCurrentCard() {
  if (gradeKeyHandler) { document.removeEventListener('keydown', gradeKeyHandler); gradeKeyHandler = null; }

  if (session.index >= session.queue.length) {
    showSummary();
    return;
  }
  const entry = session.queue[session.index];
  document.body.className = `level-${entry.level}`;
  const container = document.getElementById('card-container');
  container.hidden = false;
  renderSituation(container, entry);
}

function showSummary() {
  document.getElementById('card-container').hidden = true;
  document.body.className = 'level-mixed';
  const summary = document.getElementById('summary-screen');
  summary.hidden = false;
  document.getElementById('sum-total').textContent = session.queue.length;
  document.getElementById('again-btn').onclick = () => window.location.reload();
}

(async function init() {
  const profile = qs('profile');
  const levels = (qs('levels') || 'b1,b2').split(',');
  const categories = (qs('categories') || '').split(',').filter(Boolean);
  const count = parseInt(qs('count') || '8', 10);
  const ids = qs('ids');

  if (!profile) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('profile-indicator').textContent = profile;
  session.profile = profile;

  await SituationsData.load();
  session.queue = ids
    ? buildQueueFromIds(ids.split(',').filter(Boolean))
    : await buildQueue(profile, levels, categories, count);

  document.getElementById('loading').hidden = true;
  if (session.queue.length === 0) {
    document.getElementById('session-empty').hidden = false;
    return;
  }
  renderProgress();
  renderCurrentCard();
})();
