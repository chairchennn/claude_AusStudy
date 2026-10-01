/* schedule.js — the weekly timetable and what it implies: today's classes, upcoming lectures,
   and the preview / prep / recording tasks for the rest of the semester. Pure functions (no DOM). */

const CLASS_TYPES = {
  lecture: '講課',
  applied: 'Applied class',
  practical: '實作課',
  tutorial: 'Tutorial',
  workshop: 'Workshop',
  other: '其他',
};
const DAY_NAMES = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

/** Monday = 1 … Sunday = 7 */
const isoDay = (date) => {
  const w = U.weekday(date);
  return w === 0 ? 7 : w;
};
const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const classMinutes = (c) => Math.max(0, minutesOf(c.end) - minutesOf(c.start));

/** Classes run only in teaching weeks, never on public holidays. */
function isClassDay(date, sem) {
  const p = semesterPhase(date, sem);
  return p.phase === 'teaching' && !p.holiday;
}

function classesOn(date, timetable, sem) {
  if (!timetable || !isClassDay(date, sem)) return [];
  const d = isoDay(date);
  return (timetable.classes || []).filter((c) => Number(c.day) === d).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
}

/** [{date, cls, week}] for the next `days` days starting at `from` (inclusive). */
function upcomingClasses(from, days, timetable, sem) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = U.addDays(from, i);
    for (const cls of classesOn(date, timetable, sem)) out.push({ date, cls, week: semesterPhase(date, sem).week });
  }
  return out;
}

/** The first lecture of each teaching week for one course: [{date, cls, week}]. */
function lectureWeeks(code, from, days, timetable, sem) {
  const seen = new Set();
  return upcomingClasses(from, days, timetable, sem).filter((x) => {
    if (x.cls.courseCode !== code || x.cls.type !== 'lecture' || seen.has(x.week)) return false;
    seen.add(x.week);
    return true;
  });
}

const topicFor = (course, week) => {
  const hit = (course.schedule || []).find((x) => Number(x.week) === Number(week));
  return hit ? hit.topic : '';
};

/**
 * Tasks implied by the timetable between `from` and `to`:
 *  - 預習 the day before the first lecture of each week, for courses marked `preview`;
 *  - prep the day before applied classes / practicals of those courses;
 *  - watching recordings of classes marked `mode: 'recording'` (clashes).
 * Every task carries a stable `key`, so running it again never duplicates what exists.
 */
function buildClassTasks({ timetable, courses, sem, from, to, existingKeys = [] }) {
  const byCode = Object.fromEntries(courses.map((c) => [c.code, c]));
  const seen = new Set(existingKeys);
  const out = [];
  const add = (key, task) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...task, key });
  };
  const dayBefore = (date) => (U.addDays(date, -1) < from ? date : U.addDays(date, -1));
  const firstLecture = new Map();

  for (let date = from; date <= to; date = U.addDays(date, 1)) {
    for (const cls of classesOn(date, timetable, sem)) {
      const c = byCode[cls.courseCode];
      if (!c) continue;
      const week = semesterPhase(date, sem).week;
      const topic = topicFor(c, week);
      const typeLabel = CLASS_TYPES[cls.type] || CLASS_TYPES.other;
      const typeGap = /[A-Za-z]$/.test(typeLabel) ? ' ' : '';
      if (cls.mode === 'recording') {
        add(`rec-${c.code}-${date}-${cls.start}`, {
          date: minutesOf(cls.end) >= 17 * 60 ? U.addDays(date, 1) : date,
          courseCode: c.code,
          title: `${c.code}：看 W${week} ${typeLabel}錄影${topic ? `「${topic}」` : ''}`,
          minutes: classMinutes(cls) || 60,
          kind: 'study',
          priority: 2,
          week,
          why: '這堂和其他課衝堂，用錄影補上；兩天內看完，邊看邊記下不懂的地方問書僮。',
        });
      }
      if (!c.preview) continue;
      if (cls.type === 'lecture') {
        const k = `${c.code}-W${week}`;
        if (!firstLecture.has(k)) firstLecture.set(k, { date, cls, week, topic, c });
      } else if (['applied', 'practical', 'tutorial', 'workshop'].includes(cls.type)) {
        add(`prep-${c.code}-${date}`, {
          date: dayBefore(date),
          courseCode: c.code,
          title: `${c.code}：${typeLabel}${typeGap}前，複習這週講課、先看題目`,
          minutes: 30,
          kind: 'practice',
          priority: 2,
          week,
          why:
            c.kind === 'math'
              ? 'Applied class 的練習要當場寫完、占總分 30%（12 次取最好 8 次），先複習才寫得完。'
              : '課堂上要動手寫程式，先複習講課內容、看過題目，當場比較不會卡住。',
        });
      }
    }
  }
  for (const [k, x] of firstLecture) {
    add(`prev-${k}`, {
      date: dayBefore(x.date),
      courseCode: x.c.code,
      title: `${x.c.code}：預習 W${x.week}${x.topic ? `「${x.topic}」` : ''}（預習導讀＋暖身題）`,
      minutes: 30,
      kind: 'study',
      priority: 2,
      week: x.week,
      why: `${DAY_NAMES[isoDay(x.date)]} ${x.cls.start} 上這週第一堂講課。先知道要學什麼、哪些舊觀念要先複習，上課比較跟得上。`,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Short one-line description of a class for prompts and lists. */
const classLine = (c) =>
  `${DAY_NAMES[c.day] || ''} ${c.start}-${c.end} ${c.courseCode} ${CLASS_TYPES[c.type] || c.type}${c.location ? ` @${c.location}` : ''}${c.mode === 'recording' ? ' (watch recording: clash)' : ''}`;
