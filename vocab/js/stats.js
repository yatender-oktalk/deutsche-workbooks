/* Stats page: daily heatmap, 14-day correct/wrong bars, per-level breakdown. */

function qsParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function computeStreak(daySet) {
  let streak = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  // if nothing logged today yet, streak can still count from yesterday
  if (!daySet.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (daySet.has(dayKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function renderBars(byDay) {
  const container = document.getElementById('bars');
  container.innerHTML = '';
  const days = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - 13);
  for (let i = 0; i < 14; i++) {
    days.push(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const maxCount = Math.max(1, ...days.map((d) => (byDay[d]?.total || 0)));
  days.forEach((d) => {
    const stat = byDay[d] || { total: 0, correct: 0 };
    const col = el('div', 'bar');
    col.style.height = `${Math.max(2, (stat.total / maxCount) * 130)}px`;
    const wrongPct = stat.total ? ((stat.total - stat.correct) / stat.total) * 100 : 0;
    if (wrongPct > 0) {
      const wrongBar = el('div', 'bar-wrong');
      wrongBar.style.height = `${wrongPct}%`;
      wrongBar.style.width = '100%';
      wrongBar.style.position = 'absolute';
      wrongBar.style.bottom = '0';
      col.style.position = 'relative';
      col.appendChild(wrongBar);
    }
    col.title = `${d}: ${stat.correct}/${stat.total} richtig`;
    container.appendChild(col);
  });
}

function renderHeatmap(byDay) {
  const container = document.getElementById('heatmap');
  container.innerHTML = '';
  const totalDays = 15 * 7;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  cursor.setUTCDate(cursor.getUTCDate() - totalDays + 1);
  // align to start of week (Monday)
  const dow = (cursor.getUTCDay() + 6) % 7;
  cursor.setUTCDate(cursor.getUTCDate() - dow);

  const days = [];
  for (let i = 0; i < totalDays + 7; i++) {
    days.push(dayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  days.forEach((d) => {
    const stat = byDay[d];
    const cell = el('div', 'heatmap-cell');
    if (stat) {
      const n = stat.total;
      const bg = n >= 20 ? '#1d6f3f' : n >= 10 ? '#2f9d5c' : n >= 4 ? '#7cc79a' : '#c7e8d3';
      cell.style.background = bg;
    }
    cell.title = `${d}: ${stat ? stat.total : 0} Karten`;
    container.appendChild(cell);
  });
}

function renderLevelBreakdown(reviews, cardsByLevel) {
  const container = document.getElementById('level-breakdown');
  container.innerHTML = '';
  const levels = ['a1', 'a2', 'b1', 'b2'];
  levels.forEach((lvl) => {
    const revs = reviews.filter((r) => r.level === lvl);
    const correct = revs.filter((r) => r.correct).length;
    const accuracy = revs.length ? Math.round((correct / revs.length) * 100) : 0;
    const learned = (cardsByLevel[lvl] || []).length;
    const row = el('div', 'level-breakdown-row');
    row.innerHTML = `<span><strong>${lvl.toUpperCase()}</strong> &middot; ${learned} Karten gelernt</span>` +
      `<span>${revs.length} Wdh. &middot; ${accuracy}% richtig</span>`;
    container.appendChild(row);
  });
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

function computeWeakWords(reviews) {
  const byEntry = new Map();
  reviews.forEach((r) => {
    if (!byEntry.has(r.entryId)) byEntry.set(r.entryId, { entryId: r.entryId, total: 0, wrong: 0 });
    const rec = byEntry.get(r.entryId);
    rec.total++;
    if (!r.correct) rec.wrong++;
  });
  return [...byEntry.values()]
    .filter((r) => r.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || (b.wrong / b.total) - (a.wrong / a.total))
    .slice(0, 20);
}

function renderWeakWords(reviews, profile) {
  const section = document.getElementById('weak-words-section');
  const container = document.getElementById('weak-words');
  const weak = computeWeakWords(reviews)
    .map((w) => ({ ...w, entry: VocabData.get(w.entryId) }))
    .filter((w) => w.entry);

  if (weak.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  container.innerHTML = '';
  weak.forEach((w) => {
    const row = el('div', 'weak-word-row');
    const info = el('div', 'weak-word-info');
    const headword = (w.entry.article ? `${w.entry.article} ` : '') + w.entry.word;
    info.appendChild(el('div', 'weak-word-word', escapeHtml(headword)));
    if (w.entry.translation_en) info.appendChild(el('div', 'weak-word-en', escapeHtml(w.entry.translation_en)));
    row.appendChild(info);
    row.appendChild(el('div', 'weak-word-stat', `${w.wrong}&times; falsch von ${w.total}`));
    container.appendChild(row);
  });

  const ids = weak.map((w) => w.entryId).join(',');
  document.getElementById('weak-words-practice-link').href =
    `practice.html?profile=${encodeURIComponent(profile)}&mode=mixed&ids=${encodeURIComponent(ids)}`;
}

(async function init() {
  const profile = qsParam('profile') || localStorage.getItem('vocab.activeProfile');
  if (!profile) {
    window.location.href = 'index.html';
    return;
  }
  document.getElementById('profile-indicator').textContent = profile;
  await VocabData.load();

  const reviews = await VocabDB.getReviews(profile);
  document.getElementById('loading').hidden = true;

  if (reviews.length === 0) {
    document.getElementById('empty-state').hidden = false;
    return;
  }
  document.getElementById('stats-content').hidden = false;

  const byDay = {};
  const daySet = new Set();
  reviews.forEach((r) => {
    daySet.add(r.day);
    if (!byDay[r.day]) byDay[r.day] = { total: 0, correct: 0 };
    byDay[r.day].total++;
    if (r.correct) byDay[r.day].correct++;
  });

  const totalCorrect = reviews.filter((r) => r.correct).length;
  document.getElementById('stat-total').textContent = reviews.length;
  document.getElementById('stat-accuracy').textContent = `${Math.round((totalCorrect / reviews.length) * 100)}%`;
  document.getElementById('stat-streak').textContent = computeStreak(daySet);

  renderBars(byDay);
  renderHeatmap(byDay);

  const cardsByLevel = {};
  for (const lvl of ['a1', 'a2', 'b1', 'b2']) {
    cardsByLevel[lvl] = await VocabDB.getCardsForProfile(profile, lvl);
  }
  renderLevelBreakdown(reviews, cardsByLevel);
  renderWeakWords(reviews, profile);
})();
