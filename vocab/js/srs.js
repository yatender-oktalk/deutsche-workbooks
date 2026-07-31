/* Simplified SM-2 spaced-repetition scheduler (day-granularity, Anki-style
   four-button grading). Each card tracks interval (days), ease factor,
   repetition count, lapses, and the next due date. */

const SRS_GRADE = { AGAIN: 'again', HARD: 'hard', GOOD: 'good', EASY: 'easy' };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}

function newCard(profile, entry) {
  return {
    key: `${profile}::${entry.id}`,
    profile,
    entryId: entry.id,
    level: entry.level,
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    due: todayStr(),
  };
}

/* Mutates and returns the card with updated scheduling fields. */
function gradeCard(card, grade) {
  const today = todayStr();
  if (grade === SRS_GRADE.AGAIN) {
    card.interval = 1;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.lapses += 1;
    card.reps = 0;
  } else if (grade === SRS_GRADE.HARD) {
    card.interval = card.interval <= 0 ? 1 : Math.max(1, card.interval * 1.2);
    card.ease = Math.max(1.3, card.ease - 0.15);
    card.reps += 1;
  } else if (grade === SRS_GRADE.GOOD) {
    if (card.reps === 0) card.interval = 1;
    else if (card.reps === 1) card.interval = 3;
    else card.interval = card.interval * card.ease;
    card.reps += 1;
  } else if (grade === SRS_GRADE.EASY) {
    card.interval = card.reps === 0 ? 4 : card.interval * card.ease * 1.3;
    card.ease = card.ease + 0.15;
    card.reps += 1;
  }
  card.due = addDays(today, card.interval);
  card.lastReviewed = today;
  return card;
}
