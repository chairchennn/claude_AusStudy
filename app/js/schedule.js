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

/* ---------- weekly quizzes (e.g. MATH7861: an in-class quiz each week on the previous week's content) ---------- */
const QUIZ_DEFAULTS = { on: false, label: '每週小考', classType: 'applied', covers: 'prev', fromWeek: 2, toWeek: 13, best: 0, of: 0, weight: 0 };

/** The course's weekly-quiz settings with defaults filled in, or null when it has none. */
const weeklyQuizOf = (course) => (course && course.weeklyQuiz && course.weeklyQuiz.on ? { ...QUIZ_DEFAULTS, ...course.weeklyQuiz } : null);

/** The timetable class the quiz is sat in (the first class of that type in the week). */
function quizClassOf(course, timetable) {
  const q = weeklyQuizOf(course);
  if (!q || !timetable) return null;
  return (
    (timetable.classes || [])
      .filter((c) => c.courseCode === course.code && c.type === q.classType)
      .sort((a, b) => Number(a.day) - Number(b.day) || minutesOf(a.start) - minutesOf(b.start))[0] || null
  );
}

/**
 * Every sitting of a course's weekly quiz this semester: [{week, date, cls, covers, held}].
 * `covers` is the teaching week whose content is tested; `held` is false on public holidays.
 */
function quizSittings(course, timetable, sem) {
  const q = weeklyQuizOf(course);
  const cls = quizClassOf(course, timetable);
  if (!q || !cls) return [];
  return semesterWeeks(sem)
    .filter((w) => w.phase === 'teaching' && w.week >= q.fromWeek && w.week <= q.toWeek)
    .map((w) => {
      const date = U.addDays(w.start, Number(cls.day) - 1);
      return { week: w.week, date, cls, covers: q.covers === 'this' ? w.week : Math.max(1, w.week - 1), held: isClassDay(date, sem) };
    });
}

/** The next sitting that has not finished yet (today's counts until the class ends). */
function nextQuizSitting(course, timetable, sem, today = U.today(), nowMin = null) {
  const now = nowMin == null ? new Date().getHours() * 60 + new Date().getMinutes() : nowMin;
  return quizSittings(course, timetable, sem).find((x) => x.held && (x.date > today || (x.date === today && now < minutesOf(x.cls.end)))) || null;
}

/** Best `best` of the recorded scores, as a fraction (0-1), with how many count. */
function quizStanding(q, records) {
  const pct = records.filter((r) => r && Number(r.max) > 0 && r.got !== '' && r.got != null).map((r) => U.clamp(Number(r.got) / Number(r.max), 0, 1));
  const keep = q.best ? pct.sort((a, b) => b - a).slice(0, q.best) : pct;
  const avg = keep.length ? keep.reduce((a, b) => a + b, 0) / keep.length : null;
  return {
    recorded: pct.length,
    counted: keep.length,
    avg,
    // marks already secured (missing sittings count as 0) and the final mark if the average holds
    banked: avg != null && q.weight ? (keep.reduce((a, b) => a + b, 0) / (q.best || keep.length)) * q.weight : null,
    projected: avg != null && q.weight ? avg * q.weight : null,
  };
}

/* ---------- grades ---------- */
const quizPrepId = (code, week) => `${code}-W${week}`;

/** Each sitting's recorded score ({got, max} or null), in the order of quizSittings(). */
function quizRecords(course, quizprep, timetable, sem) {
  return quizSittings(course, timetable, sem).map((x) => {
    const d = (quizprep || []).find((p) => p.id === quizPrepId(course.code, x.week));
    return (d && d.score) || null;
  });
}

/** The assessment the weekly quizzes count toward: weeklyQuiz.assessmentId, or the course's only 'quiz' assessment. */
function quizAssessmentOf(course) {
  const q = weeklyQuizOf(course);
  if (!q) return null;
  const list = course.assessments || [];
  const quizzes = list.filter((a) => a.kind === 'quiz');
  return list.find((a) => a.id === q.assessmentId) || (quizzes.length === 1 ? quizzes[0] : null);
}

/** got / max as 0-1, or null while either is missing. */
const scorePct = (sc) =>
  sc && Number(sc.max) > 0 && sc.got !== '' && sc.got != null && Number.isFinite(Number(sc.got)) ? U.clamp(Number(sc.got) / Number(sc.max), 0, 1) : null;

/**
 * Where a course grade stands, out of the total weight (normally 100): every assessment and the final exam with its
 * score so far. banked = marks already secured; projected = marks if the current quiz average holds.
 */
function courseGrade(course, state) {
  const q = weeklyQuizOf(course);
  const quizA = quizAssessmentOf(course);
  const row = (id, name, weight, pct, extra = {}) => ({ id, name, weight, pct, banked: pct == null ? null : pct * weight, projected: pct == null ? null : pct * weight, ...extra });
  const rows = (course.assessments || []).map((a) => {
    const weight = Number(a.weight) || 0;
    if (quizA && a.id === quizA.id) {
      const st = quizStanding({ ...q, weight }, quizRecords(course, state.quizprep, state.timetable, state.settings.semester));
      return { ...row(a.id, a.name, weight, st.avg), banked: st.banked, projected: st.projected, quiz: st };
    }
    return row(a.id, a.name, weight, scorePct(a.score), { score: a.score });
  });
  const exam = course.exam || {};
  if (Number(exam.weight)) rows.push(row('exam', exam.name || '期末考', Number(exam.weight), scorePct(exam.score), { score: exam.score, exam: true }));
  const scored = rows.filter((r) => r.pct != null);
  return {
    rows,
    banked: U.sum(scored.map((r) => r.banked || 0)),
    projected: U.sum(scored.map((r) => r.projected || 0)),
    scoredWeight: U.sum(scored.map((r) => r.weight)),
    totalWeight: U.sum(rows.map((r) => r.weight)),
  };
}

/* ---------- lecture numbers (L1, L2, …) per teaching week ---------- */
/** Lectures of one course held in a teaching week (public holidays skipped). */
function lectureCount(course, w, timetable, sem) {
  let n = 0;
  for (let i = 0; i < 7; i++) n += classesOn(U.addDays(w.start, i), timetable, sem).filter((c) => c.courseCode === course.code && c.type === 'lecture').length;
  return n;
}

/**
 * {week: [first, last]} lecture numbers for every teaching week, counted out from one anchor the learner gave
 * (course.lectureAnchor = {week: 9, from: 24}: the first lecture of W9 is L24). Null without an anchor.
 */
function lectureNumbers(course, timetable, sem) {
  const a = course && course.lectureAnchor;
  if (!a || !(Number(a.week) > 0) || !(Number(a.from) > 0) || !timetable) return null;
  const weeks = semesterWeeks(sem).filter((w) => w.phase === 'teaching' && w.week);
  const out = {};
  let n = Number(a.from);
  for (const w of weeks.filter((x) => x.week >= Number(a.week))) {
    const k = lectureCount(course, w, timetable, sem);
    out[w.week] = k ? [n, n + k - 1] : null;
    n += k;
  }
  n = Number(a.from);
  for (const w of weeks.filter((x) => x.week < Number(a.week)).reverse()) {
    const k = lectureCount(course, w, timetable, sem);
    const last = n - 1;
    out[w.week] = k && last >= 1 ? [Math.max(1, last - k + 1), last] : null;
    n = Math.max(1, last - k + 1);
  }
  return out;
}

/** "L24–26" for a course's teaching week, or '' when unknown. */
function lectureLabel(course, week, timetable, sem) {
  const map = lectureNumbers(course, timetable, sem);
  const r = map && map[week];
  return r ? (r[0] === r[1] ? `L${r[0]}` : `L${r[0]}–${r[1]}`) : '';
}

/** The teaching week of lecture n: from the anchor when there is one; one lecture a week means lecture n ≈ week n. */
function weekOfLecture(course, n, timetable, sem) {
  const map = lectureNumbers(course, timetable, sem);
  if (map) {
    const hit = Object.entries(map).find(([, r]) => r && n >= r[0] && n <= r[1]);
    return hit ? Number(hit[0]) : null;
  }
  const perWeek = (timetable && timetable.classes || []).filter((c) => c.courseCode === (course && course.code) && c.type === 'lecture').length;
  return perWeek <= 1 && n >= 1 && n <= 13 ? n : null;
}

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
      const q = weeklyQuizOf(c);
      if (q && cls.type === q.classType && week >= q.fromWeek && week <= q.toWeek) {
        const covers = q.covers === 'this' ? week : Math.max(1, week - 1);
        const coversTopic = topicFor(c, covers);
        const lect = lectureLabel(c, covers, timetable, sem);
        add(`prep-${c.code}-${date}`, {
          date: dayBefore(date),
          courseCode: c.code,
          title: `${c.code}：小考前複習 W${covers}${lect ? ` · ${lect}` : ''}${coversTopic ? `「${coversTopic}」` : ''}（考前重點＋模擬小考）`,
          minutes: 40,
          kind: 'practice',
          priority: 1,
          week,
          why: `${DAY_NAMES[isoDay(date)]} ${cls.start} 的 ${typeLabel}${typeGap}當場小考 W${covers}${lect ? `（${lect}）` : ' '}的內容${q.best && q.of ? `（${q.of} 次取最好 ${q.best} 次${q.weight ? `，共占 ${q.weight}%` : ''}）` : ''}。到「複習 → 小考」看考前重點、做一份模擬小考，錯的題目進閃卡。`,
          link: { route: 'review', params: { tab: 'quiz', course: c.code } },
        });
        continue;
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
