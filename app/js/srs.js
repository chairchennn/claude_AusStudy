/* srs.js — spaced repetition (SM-2 style, four buttons), aware of the course's exam date. */

const SRS = (() => {
  const RATINGS = [
    { value: 1, label: '忘了', key: '1', tone: 'bad' },
    { value: 2, label: '有點難', key: '2', tone: 'warn' },
    { value: 3, label: '記得', key: '3', tone: 'ok' },
    { value: 4, label: '很簡單', key: '4', tone: 'pen' },
  ];

  const fresh = (due = U.today()) => ({ due, interval: 0, ease: 2.5, reps: 0, lapses: 0, last: null });

  /** Next scheduling state after a rating (1 again · 2 hard · 3 good · 4 easy). */
  function next(srs, rating, today = U.today(), examDate = null) {
    const s = { ...fresh(today), ...(srs || {}) };
    let interval = Number(s.interval) || 0;
    let ease = Number(s.ease) || 2.5;
    if (rating === 1) {
      s.lapses = (s.lapses || 0) + 1;
      interval = 0;
      ease = Math.max(1.3, ease - 0.2);
    } else if (rating === 2) {
      interval = Math.max(1, Math.round(interval * 1.2));
      ease = Math.max(1.3, ease - 0.15);
    } else if (rating === 3) {
      interval = interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease);
    } else {
      interval = interval === 0 ? 3 : Math.round(Math.max(interval, 1) * ease * 1.3);
      ease = Math.min(3.0, ease + 0.15);
    }
    // Before an exam, make sure every card comes back at least once more before exam day.
    if (U.isYmd(examDate) && interval > 1) {
      const left = U.daysBetween(today, examDate);
      if (left > 2) interval = Math.min(interval, Math.max(1, Math.floor(left / 2)));
    }
    s.interval = interval;
    s.ease = Math.round(ease * 100) / 100;
    s.reps = (s.reps || 0) + 1;
    s.last = today;
    s.due = U.addDays(today, interval);
    return s;
  }

  const intervalLabel = (days) => (days <= 0 ? '今天再來' : days === 1 ? '明天' : days < 30 ? `${days} 天` : `${Math.round(days / 30)} 個月`);

  const preview = (srs, today, examDate) =>
    Object.fromEntries(RATINGS.map((r) => [r.value, intervalLabel(next(srs, r.value, today, examDate).interval)]));

  const isDue = (card, today = U.today()) => !card.suspended && (!card.srs || !card.srs.due || card.srs.due <= today);

  /** A card is "learned" once it has survived a few reviews with a real interval. */
  const isMature = (card) => card.srs && card.srs.interval >= 7;

  return { RATINGS, fresh, next, preview, isDue, isMature, intervalLabel };
})();
