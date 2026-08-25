/* FSRS-6 spaced-repetition scheduler, adapted to day granularity (this app
   shows each due card at most once per day — no same-day relearning steps),
   using the published FSRS-6 default parameters (not personally optimized;
   see https://github.com/open-spaced-repetition/ts-fsrs). Each card tracks
   difficulty (D, 1-10) and stability (S, days until recall probability
   drops to the requested retention) instead of SM-2's interval/ease. */

const SRS_GRADE = { AGAIN: 'again', HARD: 'hard', GOOD: 'good', EASY: 'easy' };
const GRADE_NUM = { again: 1, hard: 2, good: 3, easy: 4 };

const FSRS_W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
  0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
  0.0912, 0.0658, 0.1542,
];
const FSRS_S_MIN = 0.001;
const FSRS_S_MAX = 36500;
const FSRS_REQUEST_RETENTION = 0.9;
const FSRS_MAX_INTERVAL_DAYS = 1095; // 3 years — plenty for exam-prep horizon

const FSRS_DECAY = -FSRS_W[20];
const FSRS_FACTOR = Math.exp(Math.log(0.9) / FSRS_DECAY) - 1;
const FSRS_INTERVAL_MODIFIER =
  (Math.pow(FSRS_REQUEST_RETENTION, 1 / FSRS_DECAY) - 1) / FSRS_FACTOR;

function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00Z');
  const to = new Date(toStr + 'T00:00:00Z');
  return Math.max(0, Math.round((to - from) / 86400000));
}

function forgettingCurve(elapsedDays, stability) {
  return Math.pow(1 + (FSRS_FACTOR * elapsedDays) / stability, FSRS_DECAY);
}

function initStability(g) {
  return Math.max(FSRS_W[g - 1], 0.1);
}

function initDifficulty(g) {
  return clamp(FSRS_W[4] - Math.exp((g - 1) * FSRS_W[5]) + 1, 1, 10);
}

function nextDifficulty(d, g) {
  const deltaD = -FSRS_W[6] * (g - 3);
  const damped = deltaD * (10 - d) / 9; // linear damping toward the D=10 ceiling
  const nextD = d + damped;
  const reverted = FSRS_W[7] * initDifficulty(4) + (1 - FSRS_W[7]) * nextD;
  return clamp(reverted, 1, 10);
}

function nextRecallStability(d, s, r, g) {
  const hardPenalty = g === 2 ? FSRS_W[15] : 1;
  const easyBonus = g === 4 ? FSRS_W[16] : 1;
  const grown =
    s *
    (1 +
      Math.exp(FSRS_W[8]) *
        (11 - d) *
        Math.pow(s, -FSRS_W[9]) *
        (Math.exp((1 - r) * FSRS_W[10]) - 1) *
        hardPenalty *
        easyBonus);
  return clamp(grown, FSRS_S_MIN, FSRS_S_MAX);
}

function nextForgetStability(d, s, r) {
  const fallen =
    FSRS_W[11] *
    Math.pow(d, -FSRS_W[12]) *
    (Math.pow(s + 1, FSRS_W[13]) - 1) *
    Math.exp((1 - r) * FSRS_W[14]);
  return clamp(fallen, FSRS_S_MIN, FSRS_S_MAX);
}

function nextIntervalDays(stability) {
  return clamp(Math.round(stability * FSRS_INTERVAL_MODIFIER), 1, FSRS_MAX_INTERVAL_DAYS);
}

function newCard(profile, entry) {
  return {
    key: `${profile}::${entry.id}`,
    profile,
    entryId: entry.id,
    level: entry.level,
    difficulty: 0,
    stability: 0,
    reps: 0,
    lapses: 0,
    due: todayStr(),
  };
}

/* Mutates and returns the card with updated FSRS state. */
function gradeCard(card, grade) {
  const today = todayStr();
  const g = GRADE_NUM[grade];
  const isNew = !card.stability;

  let nextD;
  let nextS;
  if (isNew) {
    nextD = initDifficulty(g);
    nextS = initStability(g);
  } else {
    const elapsed = daysBetween(card.lastReviewed, today);
    const r = forgettingCurve(elapsed, card.stability);
    nextD = nextDifficulty(card.difficulty, g);
    nextS = g === 1
      ? Math.min(card.stability, nextForgetStability(card.difficulty, card.stability, r))
      : nextRecallStability(card.difficulty, card.stability, r, g);
  }

  card.difficulty = nextD;
  card.stability = nextS;
  card.reps += 1;
  if (grade === SRS_GRADE.AGAIN) card.lapses += 1;

  // "Again" always resurfaces tomorrow rather than following the computed
  // interval — this app has no same-day relearning queue, so a full FSRS
  // interval off a lapse (which can still be several days) would mean a
  // missed word doesn't come back soon, unlike every other SRS grading here.
  const intervalDays = grade === SRS_GRADE.AGAIN ? 1 : nextIntervalDays(nextS);
  card.due = addDays(today, intervalDays);
  card.lastReviewed = today;
  return card;
}
