/* Practice session controller: builds the queue, renders each mode,
   grades answers through the SM-2 scheduler, and logs the review. */

const MODE_LABEL = {
  flashcard: 'Karteikarte',
  mcq: 'Multiple Choice',
  cloze: 'Lückentext',
  type: 'Wort tippen',
  listening: 'Hören',
  dictation: 'Diktat',
};
const ALL_MODES = ['flashcard', 'mcq', 'cloze', 'type', 'listening', 'dictation'];

let session = {
  profile: null,
  queue: [], // [{entry, mode}]
  index: 0,      // how many cards have actually been graded/recorded so far
  viewIndex: 0,  // which position is on screen right now (can lag behind index while browsing back)
  history: [],   // index-aligned: frozen post-answer HTML snapshot for each graded card
  correct: 0,
  wrong: 0,
};

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function normalize(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:„“"]+$/g, '')
    .replace(/\s+/g, ' ');
}

/* Looser than normalize(): strips punctuation anywhere in the string, not
   just trailing, so dictation grading isn't tripped up by comma placement. */
function normalizeSentence(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[„“"'’.,;:!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickModeForEntry(requestedMode, entry, pool) {
  const candidates = requestedMode === 'mixed'
    ? shuffle([...ALL_MODES])
    : [requestedMode];
  for (const m of candidates) {
    if (m === 'mcq' || m === 'type') {
      if (entry.translation_en && VocabData.randomDistractors(entry, 3, pool).length >= 3) return m;
    } else if (m === 'cloze') {
      if (findClozeExample(entry)) return m;
    } else if (m === 'dictation') {
      if (entry.examples && entry.examples.length > 0) return m;
    } else {
      return m; // flashcard / listening always work
    }
  }
  return 'flashcard';
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function findClozeExample(entry) {
  if (!entry.examples || entry.examples.length === 0) return null;
  const word = entry.word;
  for (const ex of entry.examples) {
    const idx = ex.de.toLowerCase().indexOf(word.toLowerCase());
    if (idx !== -1) return ex;
  }
  return null;
}

async function buildQueue(profile, levels, mode, count) {
  const today = todayStr();
  const entries = VocabData.entriesFor(levels);
  const allCards = (await Promise.all(levels.map((lvl) => VocabDB.getCardsForProfile(profile, lvl)))).flat();
  const cardByEntry = new Map(allCards.map((c) => [c.entryId, c]));

  const due = allCards
    .filter((c) => c.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : 1))
    .map((c) => VocabData.get(c.entryId))
    .filter(Boolean);

  const fresh = shuffle(entries.filter((e) => !cardByEntry.has(e.id)));

  const chosen = [...due.slice(0, count)];
  if (chosen.length < count) chosen.push(...fresh.slice(0, count - chosen.length));

  return chosen.map((entry) => ({ entry, mode: pickModeForEntry(mode, entry, entries) }));
}

/* Explicit-id queue for "practice just these words" (e.g. from the weak-words
   list on the stats page) — bypasses the due/fresh selection entirely. */
function buildQueueFromIds(ids, mode, pool) {
  const chosen = ids.map((id) => VocabData.get(id)).filter(Boolean);
  return chosen.map((entry) => ({ entry, mode: pickModeForEntry(mode, entry, pool) }));
}

function el(tag, className, html) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function renderProgress() {
  document.getElementById('progress-label').textContent =
    `Karte ${Math.min(session.index + 1, session.queue.length)} von ${session.queue.length}`;
  document.getElementById('score-label').innerHTML =
    `&#10003; ${session.correct} &nbsp; &#10007; ${session.wrong}`;
  document.getElementById('progress-fill').style.width =
    `${(session.index / session.queue.length) * 100}%`;
}

function speak(text) {
  const src = document.getElementById('tts-source');
  src.textContent = text;
  speakText('tts-source');
}

async function finishCard(entry, mode, grade, correct) {
  if (correct) session.correct++; else session.wrong++;

  let card = await VocabDB.getCard(session.profile, entry.id);
  const isNew = !card;
  if (!card) card = newCard(session.profile, entry);
  gradeCard(card, grade);
  await VocabDB.putCard(card);

  await VocabDB.logReview({
    profile: session.profile,
    entryId: entry.id,
    level: entry.level,
    mode,
    grade,
    correct,
    day: todayStr(),
    ts: Date.now(),
  });

  if (window.DW && DW.logActivity) {
    DW.logActivity('vocab', 'review', { level: entry.level, correct: !!correct, isNew });
  }

  // Freeze the just-answered card's feedback (colours, diff, model answer)
  // as a plain HTML snapshot *before* advancing — re-inserting this via
  // innerHTML later drops all live event listeners, which is exactly what
  // makes it safe to redisplay read-only when swiping back through history.
  const container = document.getElementById('card-container');
  session.history[session.index] = container.innerHTML;
  session.index++;
  session.viewIndex = session.index - 1;
  renderProgress();
  showNextButton(container);
}

/* Advancing used to be a fixed setTimeout (250ms correct / up to 2400ms
   wrong) — barely enough time to register what happened, let alone study a
   mistake, and gave no way to slow down or go back, unlike reels/. This
   replaces the timer with reel-style navigation: a "Weiter" button /
   swipe-up / Enter moves forward, swipe-down / ArrowDown steps back
   through already-answered cards (frozen read-only replays from
   session.history — going back never re-grades or re-records anything).
   Swiping forward only ever re-enters the live, editable card once you're
   back at the frontier (session.index - 1); before that it just walks
   forward through history one step at a time, same as reels/. */
let nextKeyHandler = null;

function showNextButton(container) {
  if (container.querySelector('.next-btn')) return;
  const btn = el('button', 'btn next-btn', 'Weiter &rarr;');
  container.appendChild(btn);
  btn.onclick = goForward;
  btn.focus();
  wireNavKeys();
}

function wireNavKeys() {
  if (nextKeyHandler) document.removeEventListener('keydown', nextKeyHandler);
  nextKeyHandler = (e) => {
    if (e.key === 'Enter' || e.key === 'ArrowUp') goForward();
    else if (e.key === 'ArrowDown') goBack();
  };
  document.addEventListener('keydown', nextKeyHandler);
}

function renderHistorySnapshot(idx) {
  const container = document.getElementById('card-container');
  if (nextKeyHandler) { document.removeEventListener('keydown', nextKeyHandler); nextKeyHandler = null; }
  container.innerHTML = session.history[idx];
  wireNavKeys(); // still swipeable/keyboard-navigable in both directions while browsing history
}

function goForward() {
  if (session.viewIndex < session.index - 1) {
    session.viewIndex++;
    renderHistorySnapshot(session.viewIndex);
  } else if (session.viewIndex === session.index - 1) {
    // caught up to the frontier — this is the real "next new card" step
    if (nextKeyHandler) { document.removeEventListener('keydown', nextKeyHandler); nextKeyHandler = null; }
    session.viewIndex = session.index;
    renderCurrentCard();
  }
  // else: viewIndex === session.index — an unanswered live card — no-op,
  // you have to actually answer it first (tap/type/choose), same as before.
}

function goBack() {
  if (session.viewIndex > 0) {
    session.viewIndex--;
    renderHistorySnapshot(session.viewIndex);
  }
}

/* ------------------------------------------------------------- swipe ---
   Unlike reels/ (a fixed-height "screen" that never scrolls, so it can
   freely preventDefault() on any vertical touchmove), this page is normal
   scrolling document flow — some modes (dictation's diff block, MCQ) run
   taller than the viewport. So touchmove is never intercepted here, and a
   swipe is recognised only on touchend, as a *fast flick*: distance alone
   would also fire on an ordinary slow scroll drag, so this also requires
   the gesture to finish quickly. A real scroll and a real swipe-to-advance
   therefore don't fight each other. */
(function wireSwipe() {
  const stage = document.getElementById('card-container');
  let startX = null, startY = null, startT = 0;

  stage.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; startT = Date.now();
  }, { passive: true });

  stage.addEventListener('touchend', (e) => {
    if (startY === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    const dt = Date.now() - startT;
    startY = null;
    if (dt < 400 && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      if (dy < 0) goForward(); else goBack();
    }
  }, { passive: true });
})();

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

function renderFlashcard(container, entry) {
  container.innerHTML = '';
  const card = el('div', 'card');
  card.appendChild(el('div', 'mode-tag', MODE_LABEL.flashcard));
  card.appendChild(el('div', 'headword',
    (entry.article ? `<span class="article-tag">${entry.article}</span>` : '') + escapeHtml(entry.word)));
  if (entry.plural) card.appendChild(el('div', 'subtext', `Plural: ${escapeHtml(entry.plural)}`));
  if (entry.forms) card.appendChild(el('div', 'subtext', escapeHtml(entry.forms)));

  const revealBtn = el('button', 'btn', 'Antwort zeigen');
  card.appendChild(revealBtn);
  container.appendChild(card);

  revealBtn.onclick = () => {
    revealBtn.remove();
    const block = el('div', 'reveal-block');
    if (entry.translation_en) block.appendChild(el('div', 'subtext', `<strong>${escapeHtml(entry.translation_en)}</strong>`));
    (entry.examples || []).slice(0, 2).forEach((ex) => {
      block.appendChild(el('div', 'example-de', escapeHtml(ex.de)));
      if (ex.en) block.appendChild(el('div', 'example-en', escapeHtml(ex.en)));
    });
    card.appendChild(block);
    renderGradeRow(container, (grade) => finishCard(entry, 'flashcard', grade, grade !== 'again'));
    wireGradeKeys();
  };
}

function renderListening(container, entry) {
  container.innerHTML = '';
  const card = el('div', 'card');
  card.appendChild(el('div', 'mode-tag', MODE_LABEL.listening));
  card.appendChild(el('div', 'subtext', 'Hör dir das Wort an und versuch, die Bedeutung zu erraten.'));

  const example = findClozeExample(entry);
  const speakTarget = example ? example.de : VocabData.headword(entry);

  const audioRow = el('div', 'audio-row');
  const playBtn = el('button', 'play-btn', '&#9658;');
  playBtn.onclick = () => speak(speakTarget);
  audioRow.appendChild(playBtn);
  card.appendChild(audioRow);

  const revealBtn = el('button', 'btn', 'Antwort zeigen');
  card.appendChild(revealBtn);
  container.appendChild(card);

  revealBtn.onclick = () => {
    revealBtn.remove();
    const block = el('div', 'reveal-block');
    block.appendChild(el('div', 'headword',
      (entry.article ? `<span class="article-tag">${entry.article}</span>` : '') + escapeHtml(entry.word)));
    if (entry.translation_en) block.appendChild(el('div', 'subtext', escapeHtml(entry.translation_en)));
    if (example) block.appendChild(el('div', 'example-de', escapeHtml(example.de)));
    card.appendChild(block);
    renderGradeRow(container, (grade) => finishCard(entry, 'listening', grade, grade !== 'again'));
    wireGradeKeys();
  };

  setTimeout(() => speak(speakTarget), 300);
}

function renderDictation(container, entry) {
  container.innerHTML = '';
  const example = entry.examples[0];
  const target = example.de;

  const card = el('div', 'card');
  card.appendChild(el('div', 'mode-tag', MODE_LABEL.dictation));
  card.appendChild(el('div', 'subtext', 'Hör dir den Satz an und tippe genau, was du hörst.'));
  const audioRow = el('div', 'audio-row');
  const playBtn = el('button', 'play-btn', '&#9658;');
  playBtn.onclick = () => speak(target);
  audioRow.appendChild(playBtn);
  card.appendChild(audioRow);
  container.appendChild(card);

  const row = el('div', 'text-answer-row');
  const input = el('input');
  input.type = 'text';
  input.placeholder = 'Satz eingeben';
  input.autocomplete = 'off';
  const checkBtn = el('button', 'btn', 'Prüfen');
  row.appendChild(input);
  row.appendChild(checkBtn);
  container.appendChild(row);
  const feedback = el('div', 'answer-feedback');
  container.appendChild(feedback);
  const diffBlock = el('div', 'dictation-diff');
  container.appendChild(diffBlock);
  input.focus();

  function check() {
    const expectedWords = normalizeSentence(target).split(' ').filter(Boolean);
    const typedWords = normalizeSentence(input.value).split(' ').filter(Boolean);
    const correct = expectedWords.join(' ') === typedWords.join(' ');

    input.classList.add(correct ? 'correct' : 'incorrect');
    input.disabled = true;
    checkBtn.disabled = true;
    feedback.classList.add(correct ? 'correct' : 'incorrect');
    feedback.textContent = correct ? 'Richtig!' : 'Nicht ganz – so war der Satz:';

    if (!correct) {
      const maxLen = Math.max(expectedWords.length, typedWords.length);
      for (let i = 0; i < maxLen; i++) {
        const exp = expectedWords[i];
        const got = typedWords[i];
        const ok = exp !== undefined && exp === got;
        const span = el('span', `diff-word ${ok ? 'diff-ok' : 'diff-bad'}`,
          escapeHtml(exp !== undefined ? exp : `(${got})`));
        diffBlock.appendChild(span);
        diffBlock.appendChild(document.createTextNode(' '));
      }
      if (example.en) diffBlock.appendChild(el('div', 'example-en', escapeHtml(example.en)));
    }

    finishCard(entry, 'dictation', correct ? 'good' : 'again', correct);
  }
  checkBtn.onclick = check;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });

  setTimeout(() => speak(target), 300);
}

function renderMCQ(container, entry) {
  container.innerHTML = '';
  const pool = VocabData.entriesFor(session.levels);
  const distractors = VocabData.randomDistractors(entry, 3, pool);
  const options = shuffle([entry, ...distractors]);

  const card = el('div', 'card');
  card.appendChild(el('div', 'mode-tag', MODE_LABEL.mcq));
  card.appendChild(el('div', 'headword',
    (entry.article ? `<span class="article-tag">${entry.article}</span>` : '') + escapeHtml(entry.word)));
  card.appendChild(el('div', 'subtext', 'Was bedeutet das auf Englisch?'));
  container.appendChild(card);

  const grid = el('div', 'mcq-grid');
  let answered = false;
  options.forEach((opt) => {
    const btn = el('button', 'mcq-option', escapeHtml(opt.translation_en));
    btn.onclick = () => {
      if (answered) return;
      answered = true;
      const correct = opt.id === entry.id;
      btn.classList.add(correct ? 'correct' : 'incorrect');
      if (!correct) {
        [...grid.children].find((c) => c.textContent === entry.translation_en)?.classList.add('correct');
      }
      finishCard(entry, 'mcq', correct ? 'good' : 'again', correct);
    };
    grid.appendChild(btn);
  });
  container.appendChild(grid);
}

function renderCloze(container, entry) {
  container.innerHTML = '';
  const example = findClozeExample(entry);
  const re = new RegExp(entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const blanked = example.de.replace(re, '_____');

  const card = el('div', 'card');
  card.appendChild(el('div', 'mode-tag', MODE_LABEL.cloze));
  card.appendChild(el('div', 'example-de', escapeHtml(blanked)));
  if (entry.translation_en) card.appendChild(el('div', 'subtext', `Hinweis: ${escapeHtml(entry.translation_en)}`));
  container.appendChild(card);

  const row = el('div', 'text-answer-row');
  const input = el('input');
  input.type = 'text';
  input.placeholder = 'Antwort eingeben';
  input.autocomplete = 'off';
  const checkBtn = el('button', 'btn', 'Prüfen');
  row.appendChild(input);
  row.appendChild(checkBtn);
  container.appendChild(row);
  const feedback = el('div', 'answer-feedback');
  container.appendChild(feedback);
  input.focus();

  function check() {
    const correct = normalize(input.value) === normalize(entry.word);
    input.classList.add(correct ? 'correct' : 'incorrect');
    input.disabled = true;
    checkBtn.disabled = true;
    feedback.classList.add(correct ? 'correct' : 'incorrect');
    feedback.textContent = correct ? 'Richtig!' : `Richtig wäre: ${entry.word}`;
    finishCard(entry, 'cloze', correct ? 'good' : 'again', correct);
  }
  checkBtn.onclick = check;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
}

function renderType(container, entry) {
  container.innerHTML = '';
  const card = el('div', 'card');
  card.appendChild(el('div', 'mode-tag', MODE_LABEL.type));
  card.appendChild(el('div', 'headword', escapeHtml(entry.translation_en)));
  card.appendChild(el('div', 'subtext', 'Wie heißt das auf Deutsch? (mit Artikel, falls Nomen)'));
  container.appendChild(card);

  const row = el('div', 'text-answer-row');
  const input = el('input');
  input.type = 'text';
  input.placeholder = 'Antwort eingeben';
  input.autocomplete = 'off';
  const checkBtn = el('button', 'btn', 'Prüfen');
  row.appendChild(input);
  row.appendChild(checkBtn);
  container.appendChild(row);
  const feedback = el('div', 'answer-feedback');
  container.appendChild(feedback);
  input.focus();

  const correctAnswers = [entry.word, entry.article ? `${entry.article} ${entry.word}` : entry.word].map(normalize);

  function check() {
    const correct = correctAnswers.includes(normalize(input.value));
    input.classList.add(correct ? 'correct' : 'incorrect');
    input.disabled = true;
    checkBtn.disabled = true;
    feedback.classList.add(correct ? 'correct' : 'incorrect');
    feedback.textContent = correct ? 'Richtig!' : `Richtig wäre: ${VocabData.headword(entry)}`;
    finishCard(entry, 'type', correct ? 'good' : 'again', correct);
  }
  checkBtn.onclick = check;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}

let gradeKeyHandler = null;
function wireGradeKeys() {
  if (gradeKeyHandler) document.removeEventListener('keydown', gradeKeyHandler);
  gradeKeyHandler = (e) => {
    const map = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
    if (map[e.key]) {
      const idx = ['again', 'hard', 'good', 'easy'].indexOf(map[e.key]);
      const btn = document.querySelectorAll('.grade-btn')[idx];
      if (btn) btn.click();
    }
  };
  document.addEventListener('keydown', gradeKeyHandler);
}

function renderCurrentCard() {
  if (gradeKeyHandler) { document.removeEventListener('keydown', gradeKeyHandler); gradeKeyHandler = null; }

  if (session.index >= session.queue.length) {
    showSummary();
    return;
  }
  const { entry, mode } = session.queue[session.index];
  document.body.className = `level-${entry.level}`;
  const container = document.getElementById('card-container');
  container.hidden = false;

  if (mode === 'flashcard') renderFlashcard(container, entry);
  else if (mode === 'mcq') renderMCQ(container, entry);
  else if (mode === 'cloze') renderCloze(container, entry);
  else if (mode === 'type') renderType(container, entry);
  else if (mode === 'listening') renderListening(container, entry);
  else if (mode === 'dictation') renderDictation(container, entry);

  // Even before this card is answered, ArrowDown/swipe-down must still be
  // able to step back into history — only forward navigation is gated on
  // having answered (goForward() itself no-ops until then).
  wireNavKeys();
}

function showSummary() {
  document.getElementById('card-container').hidden = true;
  document.body.className = 'level-mixed';
  const summary = document.getElementById('summary-screen');
  summary.hidden = false;
  document.getElementById('sum-total').textContent = session.queue.length;
  document.getElementById('sum-correct').textContent = session.correct;
  document.getElementById('sum-wrong').textContent = session.wrong;
  document.getElementById('summary-stats-link').href = `stats.html?profile=${encodeURIComponent(session.profile)}`;
  document.getElementById('again-btn').onclick = () => window.location.reload();
}

(async function init() {
  const profile = qs('profile');
  const levels = (qs('levels') || 'a1,a2,b1,b2').split(',');
  const mode = qs('mode') || 'mixed';
  const count = parseInt(qs('count') || '20', 10);
  const ids = qs('ids');

  if (!profile) {
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('profile-indicator').textContent = profile;
  session.profile = profile;
  session.levels = levels;

  await VocabData.load();
  session.queue = ids
    ? buildQueueFromIds(ids.split(',').filter(Boolean), mode, VocabData.entriesFor(levels))
    : await buildQueue(profile, levels, mode, count);

  document.getElementById('loading').hidden = true;
  if (session.queue.length === 0) {
    document.getElementById('session-empty').hidden = false;
    return;
  }
  renderProgress();
  renderCurrentCard();
})();
