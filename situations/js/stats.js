/* Stats page: daily heatmap, 14-day good/needs-practice bars, per-level and
   per-category breakdown, weak-cards list. Direct port of vocab/js/stats.js,
   adapted for the situations trainer's schema: reviews are self-graded
   (again/hard/good/easy, no automatic correct/incorrect) and carry a
   `category` instead of vocab's word-level metadata, so "correct" here means
   grade is good/easy, and the weak list is grouped by situation card. */

function qsParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function isPositive(grade) {
  return grade === 'good' || grade === 'easy';
}

function computeStreak(daySet) {
  let streak = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
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
    const stat = byDay[d] || { total: 0, positive: 0 };
    const col = el('div', 'bar');
    col.style.height = `${Math.max(2, (stat.total / maxCount) * 130)}px`;
    const needsPct = stat.total ? ((stat.total - stat.positive) / stat.total) * 100 : 0;
    if (needsPct > 0) {
      const needsBar = el('div', 'bar-wrong');
      needsBar.style.height = `${needsPct}%`;
      needsBar.style.width = '100%';
      needsBar.style.position = 'absolute';
      needsBar.style.bottom = '0';
      col.style.position = 'relative';
      col.appendChild(needsBar);
    }
    col.title = `${d}: ${stat.positive}/${stat.total} gut/leicht`;
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
      const bg = n >= 8 ? '#1d6f3f' : n >= 4 ? '#2f9d5c' : n >= 2 ? '#7cc79a' : '#c7e8d3';
      cell.style.background = bg;
    }
    cell.title = `${d}: ${stat ? stat.total : 0} Situationen`;
    container.appendChild(cell);
  });
}

function renderLevelBreakdown(reviews, cardsByLevel) {
  const container = document.getElementById('level-breakdown');
  container.innerHTML = '';
  const levels = ['b1', 'b2'];
  levels.forEach((lvl) => {
    const revs = reviews.filter((r) => r.level === lvl);
    const positive = revs.filter((r) => isPositive(r.grade)).length;
    const rate = revs.length ? Math.round((positive / revs.length) * 100) : 0;
    const learned = (cardsByLevel[lvl] || []).length;
    const row = el('div', 'breakdown-row');
    row.innerHTML = `<span><strong>${lvl.toUpperCase()}</strong> &middot; ${learned} Situationen geübt</span>` +
      `<span>${revs.length} Wdh. &middot; ${rate}% gut/leicht</span>`;
    container.appendChild(row);
  });
}

function renderCategoryBreakdown(reviews) {
  const container = document.getElementById('category-breakdown');
  container.innerHTML = '';
  const byCategory = new Map();
  reviews.forEach((r) => {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  });
  const categories = SituationsData.categories.filter((c) => byCategory.has(c.key));
  if (categories.length === 0) {
    container.innerHTML = '<div class="empty-state">Noch keine Kategorie geübt.</div>';
    return;
  }
  categories
    .map((c) => ({ ...c, revs: byCategory.get(c.key) }))
    .sort((a, b) => b.revs.length - a.revs.length)
    .forEach((c) => {
      const positive = c.revs.filter((r) => isPositive(r.grade)).length;
      const rate = Math.round((positive / c.revs.length) * 100);
      const distinct = new Set(c.revs.map((r) => r.entryId)).size;
      const row = el('div', 'breakdown-row');
      row.innerHTML = `<span><strong>${escapeHtml(c.label)}</strong> &middot; ${distinct} Situationen</span>` +
        `<span>${c.revs.length} Wdh. &middot; ${rate}% gut/leicht</span>`;
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

function computeWeakCards(reviews) {
  const byEntry = new Map();
  reviews.forEach((r) => {
    if (!byEntry.has(r.entryId)) byEntry.set(r.entryId, { entryId: r.entryId, total: 0, needsPractice: 0 });
    const rec = byEntry.get(r.entryId);
    rec.total++;
    if (!isPositive(r.grade)) rec.needsPractice++;
  });
  return [...byEntry.values()]
    .filter((r) => r.needsPractice > 0)
    .sort((a, b) => b.needsPractice - a.needsPractice || (b.needsPractice / b.total) - (a.needsPractice / a.total))
    .slice(0, 20);
}

function renderWeakCards(reviews, profile) {
  const section = document.getElementById('weak-cards-section');
  const container = document.getElementById('weak-cards');
  const weak = computeWeakCards(reviews)
    .map((w) => ({ ...w, entry: SituationsData.get(w.entryId) }))
    .filter((w) => w.entry);

  if (weak.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  container.innerHTML = '';
  weak.forEach((w) => {
    const row = el('div', 'weak-card-row');
    const info = el('div', 'weak-card-info');
    info.appendChild(el('div', 'weak-card-title', escapeHtml(w.entry.situation_de)));
    info.appendChild(el('div', 'weak-card-cat', `${escapeHtml(w.entry.category_label)} · ${w.entry.level.toUpperCase()}`));
    row.appendChild(info);
    row.appendChild(el('div', 'weak-card-stat', `${w.needsPractice}&times; Nochmal/Schwer von ${w.total}`));
    container.appendChild(row);
  });

  const ids = weak.map((w) => w.entryId).join(',');
  document.getElementById('weak-cards-practice-link').href =
    `practice.html?profile=${encodeURIComponent(profile)}&ids=${encodeURIComponent(ids)}`;
}

(async function init() {
  const profile = qsParam('profile') || localStorage.getItem('situations.activeProfile');
  if (!profile) {
    window.location.href = 'index.html';
    return;
  }
  document.getElementById('profile-indicator').textContent = profile;
  await SituationsData.load();

  const reviews = await SitDB.getReviews(profile);
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
    if (!byDay[r.day]) byDay[r.day] = { total: 0, positive: 0 };
    byDay[r.day].total++;
    if (isPositive(r.grade)) byDay[r.day].positive++;
  });

  const totalPositive = reviews.filter((r) => isPositive(r.grade)).length;
  document.getElementById('stat-total').textContent = reviews.length;
  document.getElementById('stat-rate').textContent = `${Math.round((totalPositive / reviews.length) * 100)}%`;
  document.getElementById('stat-streak').textContent = computeStreak(daySet);

  renderBars(byDay);
  renderHeatmap(byDay);

  const cardsByLevel = {};
  for (const lvl of ['b1', 'b2']) {
    cardsByLevel[lvl] = await SitDB.getCardsForProfile(profile, lvl);
  }
  renderLevelBreakdown(reviews, cardsByLevel);
  renderCategoryBreakdown(reviews);
  renderWeakCards(reviews, profile);
})();
