/* view-review.js — 複習: review each class the day it happens, keep up with the week, and get ready for weekly quizzes.
   Upload the slides for a class, then work through four steps: 導讀 → 問答 → 閃卡 → 小測驗.
   Progress is derived from what already exists (summary, tutor answers, cards, graded quizzes). */

const REVIEW_STEPS = [
  { id: 'guide', label: '導讀', hint: '先看這份投影片在講什麼、要學會什麼' },
  { id: 'qa', label: '問答', hint: '回答書僮 3 題以上' },
  { id: 'cards', label: '閃卡', hint: '把關鍵名詞加入閃卡' },
  { id: 'quiz', label: '小測驗', hint: '用這份投影片出 5 題並交卷' },
];
const QA_TARGET = 3;

function materialProgress(m, s = Store.state) {
  const turns = s.sessions
    .filter((x) => (x.materialIds || []).includes(m.id))
    .reduce((n, x) => n + (x.turns || []).filter((t) => t.fb).length, 0);
  const steps = {
    guide: !!m.summary,
    qa: turns >= QA_TARGET,
    cards: s.cards.some((c) => c.source && c.source.materialId === m.id),
    quiz: s.quizzes.some((q) => q.status === 'graded' && (q.materialIds || []).includes(m.id)),
  };
  const done = REVIEW_STEPS.filter((x) => steps[x.id]).length;
  return { steps, turns, done, total: REVIEW_STEPS.length, next: REVIEW_STEPS.find((x) => !steps[x.id]) || null };
}

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
const classEnded = (date, cls) => date < U.today() || (date === U.today() && nowMinutes() >= minutesOf(cls.end));
const classStarted = (date, cls) => date < U.today() || (date === U.today() && nowMinutes() >= minutesOf(cls.start));

const materialsForClass = (s, date, cls) =>
  s.materials.filter((m) => m.classDate === date && m.courseCode === cls.courseCode && (!m.classId || m.classId === cls.id));

async function runReviewStep(step, m, openMaterial) {
  if (step === 'guide') return openMaterial(m.id);
  if (step === 'qa') return go('tutor', { course: m.courseCode, materials: [m.id], resume: true });
  if (step === 'quiz') return go('practice', { tab: 'quiz', course: m.courseCode, materials: [m.id], count: 5, auto: true });
  if (step === 'cards') {
    if (!m.summary) return toast('先完成導讀，才有關鍵名詞可以加。', 'warn');
    const n = await addTermCards(m, m.summary.key_terms);
    toast(n ? `加入 ${n} 張名詞卡，今天就會出現在閃卡複習裡` : '這些名詞都已經在卡片裡了', n ? 'ok' : 'info');
  }
}

function MaterialSteps({ m, onOpen }) {
  const s = useStore();
  const p = materialProgress(m, s);
  return html`<div class=${U.cls('ms', !p.next && 'is-done')}>
    <div class="ms__title">
      <button type="button" class="link-plain" onClick=${() => onOpen(m.id)}>${m.title}</button>
      <span class="muted small">${MATERIAL_KINDS[m.kind] || ''} · ${p.done}/${p.total}</span>
    </div>
    <ol class="steps">
      ${REVIEW_STEPS.map((st, i) => {
        const done = p.steps[st.id];
        const locked = st.id === 'cards' && !m.summary;
        return html`<li key=${st.id} class=${U.cls('step', done && 'is-done', p.next && p.next.id === st.id && 'is-next')}>
          <button type="button" class="step__btn" title=${st.hint} disabled=${locked} onClick=${() => runReviewStep(st.id, m, onOpen)}>
            <span class="step__n">${done ? '✓' : i + 1}</span>
            <span class="step__label">${st.label}${st.id === 'qa' && !done && p.turns ? ` ${p.turns}/${QA_TARGET}` : ''}</span>
          </button>
        </li>`;
      })}
    </ol>
    ${p.next
      ? html`<${Btn} kind="primary" size="sm" icon="right" onClick=${() => runReviewStep(p.next.id, m, onOpen)}>下一步：${p.next.label}</${Btn}>`
      : html`<${Pill} tone="ok">這份複習完成</${Pill}>`}
  </div>`;
}

function ClassReviewCard({ date, cls, uploading, setUploading, onOpen }) {
  const s = useStore();
  const c = Store.course(cls.courseCode);
  if (!c) return null;
  const week = semesterPhase(date, s.settings.semester).week;
  const ended = classEnded(date, cls);
  const started = classStarted(date, cls);
  const linked = materialsForClass(s, date, cls);
  const loose = s.materials.filter((m) => m.courseCode === cls.courseCode && Number(m.week) === week && !m.classDate);
  const progress = linked.map((m) => materialProgress(m, s));
  const done = progress.length && progress.every((p) => !p.next);
  const status = !started
    ? html`<${Pill} tone="muted">還沒上課</${Pill}>`
    : !linked.length
      ? html`<${Pill} tone="warn">還沒上傳投影片</${Pill}>`
      : done
        ? html`<${Pill} tone="ok">複習完成</${Pill}>`
        : html`<${Pill} tone="pen">複習中 ${U.sum(progress.map((p) => p.done))}/${U.sum(progress.map((p) => p.total))}</${Pill}>`;
  const isToday = date === U.today();
  return html`<li class=${'rc c-' + (c.color || 'pen')}>
    <header class="rc__head">
      <span class="cls__time">${cls.start}–${cls.end}</span>
      <${CourseChip} code=${cls.courseCode} />
      <span class="cls__type">${CLASS_TYPES[cls.type] || cls.type}</span>
      ${cls.mode === 'recording' ? html`<${Pill} tone="warn">看錄影</${Pill}>` : null}
      <span class="spacer"></span>
      ${status}
    </header>
    ${linked.map((m) => html`<${MaterialSteps} key=${m.id} m=${m} onOpen=${onOpen} />`)}
    ${!linked.length && loose.length
      ? html`<div class="rc__suggest">
          <span class="muted small">W${week} 已經上傳過：</span>
          ${loose.map(
            (m) => html`<button type="button" key=${m.id} class="chip-btn" onClick=${() => Store.patch('materials', m.id, { classDate: date, classId: cls.id, updatedAt: U.nowIso() })}>
              用「${U.truncate(m.title, 30)}」複習這堂</button>`
          )}
        </div>`
      : null}
    ${uploading === cls.id
      ? html`<${UploadPanel} course=${c} defaults=${{ week, kind: cls.type === 'lecture' ? 'lecture' : 'tutorial', classDate: date, classId: cls.id }}
          onDone=${() => setUploading(null)} />`
      : html`<div class="row wrap">
          <${Btn} kind=${linked.length || !started ? 'ghost' : 'primary'} size="sm" icon="upload" onClick=${() => setUploading(cls.id)}>
            ${linked.length ? '再上傳一份' : isToday ? '上傳今天的投影片' : '上傳這堂的投影片'}</${Btn}>
          ${!ended && c.preview && cls.type === 'lecture'
            ? html`<${Btn} kind="ghost" size="sm" icon="spark" onClick=${() => go('courses', { course: c.code, tab: 'preview', week })}>先預習 W${week}</${Btn}>`
            : null}
        </div>`}
  </li>`;
}

function DayReview({ params }) {
  const s = useStore();
  const sem = s.settings.semester;
  const tt = s.timetable;
  const today = U.today();
  const findClassDay = (from, dir, limit = 28) => {
    for (let i = 1; i <= limit; i++) {
      const d = U.addDays(from, dir * i);
      if (classesOn(d, tt, sem).length) return d;
    }
    return null;
  };
  // Today when it has classes, otherwise the most recent class day (what still needs reviewing).
  const nearest = () => (classesOn(today, tt, sem).length ? today : findClassDay(today, -1) || today);
  const [date, setDate] = useState(() => params.date || nearest());
  const [uploading, setUploading] = useState(null);
  const [openMat, setOpenMat] = useState(null);
  useEffect(() => {
    // The timetable arrives from the cloud after the first render.
    if (!params.date && date === today && !classesOn(today, tt, sem).length) setDate(nearest());
  }, [tt.classes.length]);

  if (openMat) {
    const m = Store.get('materials', openMat);
    const c = m && Store.course(m.courseCode);
    if (m && c) return html`<${MaterialView} material=${m} course=${c} backLabel="← 回到這天的複習" onClose=${() => setOpenMat(null)} />`;
  }

  const classes = classesOn(date, tt, sem);
  const home = nearest();
  const phase = semesterPhase(date, sem);
  const prev = findClassDay(date, -1);
  const next = findClassDay(date, 1);
  const linked = classes.map((cls) => materialsForClass(s, date, cls));
  const uploaded = linked.filter((xs) => xs.length).length;
  const finished = linked.filter((xs) => xs.length && xs.every((m) => !materialProgress(m, s).next)).length;
  const started = classes.filter((cls) => classStarted(date, cls)).length;

  return html`<div class="stack">
    <div class="day-nav">
      <button type="button" class="iconbtn" aria-label="上一個上課日" disabled=${!prev} onClick=${() => (setDate(prev), setUploading(null))}><${Icon} name="left" /></button>
      <div class="day-nav__text">
        <div class="day-nav__date">${U.fmtLongDate(date)}</div>
        <div class="muted small">${[phase.label, date === today ? '今天' : U.relDay(date), date === home && date !== today ? '今天沒課，複習最近一次上課' : ''].filter(Boolean).join(' · ')}</div>
      </div>
      <button type="button" class="iconbtn" aria-label="下一個上課日" disabled=${!next} onClick=${() => (setDate(next), setUploading(null))}><${Icon} name="right" /></button>
      ${date !== home ? html`<button type="button" class="link" onClick=${() => (setDate(home), setUploading(null))}>${home === today ? '回到今天' : '回到最近一次上課'}</button>` : null}
    </div>

    ${!tt.classes.length
      ? html`<${Empty} icon="plan" title="還沒有課表" action=${html`<${Btn} kind="primary" size="sm" onClick=${() => go('plan')}>到計畫頁輸入課表</${Btn}>`}>
          有了課表，這裡會列出每天上的課，讓你一堂一堂上傳投影片、複習。
        </${Empty}>`
      : classes.length
        ? html`
          <div class="review-sum">
            <div><span class="big-num">${finished}</span> <span class="muted">/ ${classes.length} 堂複習完成</span></div>
            <${Progress} value=${classes.length ? finished / classes.length : 0} tone="ok" label="這天的複習進度" />
            <span class="muted small">已上課 ${started} 堂 · 已上傳投影片 ${uploaded} 堂</span>
          </div>
          <ul class="review-classes">
            ${classes.map((cls) => html`<${ClassReviewCard} key=${cls.id} date=${date} cls=${cls} uploading=${uploading} setUploading=${setUploading} onOpen=${setOpenMat} />`)}
          </ul>`
        : html`<${Empty} icon="plan" title="這天沒有課">用左右箭頭切換到上課日。</${Empty}>`}
    <aside class="tip">
      <span class="tip__label">為什麼當天複習</span>
      <p>上完課 24 小時內回想一次，忘掉的比隔一週才看少很多。每堂只要 20-30 分鐘：導讀看重點、回答 3 題、名詞進閃卡、5 題小測驗。</p>
    </aside>
  </div>`;
}

function WeekReview({ params }) {
  const s = useStore();
  const sem = s.settings.semester;
  const today = U.today();
  const teaching = semesterWeeks(sem).filter((w) => w.phase === 'teaching' && w.week);
  const current = (() => {
    const p = semesterPhase(today, sem);
    if (p.phase === 'teaching') return p.week;
    const past = teaching.filter((w) => w.start <= today);
    return past.length ? past[past.length - 1].week : teaching.length ? teaching[0].week : 1;
  })();
  const [week, setWeek] = useState(Number(params.week) || current);
  const [uploading, setUploading] = useState(null);
  const [openMat, setOpenMat] = useState(null);

  if (openMat) {
    const m = Store.get('materials', openMat);
    const c = m && Store.course(m.courseCode);
    if (m && c) return html`<${MaterialView} material=${m} course=${c} backLabel="← 回到這週的複習" onClose=${() => setOpenMat(null)} />`;
  }

  const wk = teaching.find((w) => w.week === week);
  const days = wk ? Array.from({ length: 7 }, (_, i) => U.addDays(wk.start, i)) : [];
  const weekClasses = days.flatMap((d) => classesOn(d, s.timetable, sem).map((cls) => ({ date: d, cls })));
  const weekTasks = wk ? s.tasks.filter((t) => U.isYmd(t.date) && t.date >= wk.start && t.date <= wk.end) : [];
  const allMats = s.materials.filter((m) => Number(m.week) === week);
  const allProgress = allMats.map((m) => materialProgress(m, s));
  const stepsDone = U.sum(allProgress.map((p) => p.done));
  const stepsTotal = U.sum(allProgress.map((p) => p.total));
  const courses = Store.courses().filter((c) => weekClasses.some((x) => x.cls.courseCode === c.code) || allMats.some((m) => m.courseCode === c.code));

  return html`<div class="stack">
    <div class="week-pick" role="tablist" aria-label="選擇週次">
      ${teaching.map(
        (w) => html`<button type="button" key=${w.week} role="tab" aria-selected=${w.week === week}
          class=${U.cls('week-pick__w', w.week === week && 'is-on', w.week === current && 'is-now', w.start > today && 'is-future')}
          onClick=${() => (setWeek(w.week), setUploading(null))}>W${w.week}</button>`
      )}
    </div>

    <div class="review-sum">
      <div><span class="big-num">W${week}</span> <span class="muted">${wk ? `${U.fmtDate(wk.start, { noWeekday: true })}–${U.fmtDate(wk.end, { noWeekday: true })}` : ''}${week === current ? ' · 這週' : ''}</span></div>
      <${Progress} value=${stepsTotal ? stepsDone / stepsTotal : 0} tone="ok" label="這週的複習進度" />
      <span class="muted small">
        ${[
          allMats.length ? `${allMats.length} 份投影片，複習步驟完成 ${stepsDone}/${stepsTotal}` : '這週還沒上傳投影片',
          weekTasks.length ? `這週任務完成 ${weekTasks.filter((t) => t.done).length}/${weekTasks.length}` : '這週沒有排任務',
        ].join(' · ')}
      </span>
    </div>

    ${courses.length
      ? html`<div class="week-courses">
          ${courses.map((c) => {
            const mats = allMats.filter((m) => m.courseCode === c.code).sort((a, b) => String(a.classDate || '').localeCompare(String(b.classDate || '')));
            const cls = weekClasses.filter((x) => x.cls.courseCode === c.code);
            const counts = U.groupBy(cls, (x) => x.cls.type);
            const prog = mats.map((m) => materialProgress(m, s));
            return html`<section key=${c.code} class=${'wc c-' + (c.color || 'pen')}>
              <header class="wc__head">
                <${CourseChip} code=${c.code} />
                ${lectureLabel(c, week, s.timetable, sem) ? html`<span class="wc__lect">${lectureLabel(c, week, s.timetable, sem)}</span>` : null}
                <span class="muted small">${[...counts].map(([type, xs]) => { const label = CLASS_TYPES[type] || type; return `${xs.length} 堂${/^[A-Za-z]/.test(label) ? ' ' : ''}${label}`; }).join('、') || '這週沒有課'}</span>
                ${mats.length ? html`<span class="wc__prog small">複習 ${U.sum(prog.map((p) => p.done))}/${U.sum(prog.map((p) => p.total))}</span>` : null}
              </header>
              ${mats.length ? mats.map((m) => html`<${MaterialSteps} key=${m.id} m=${m} onOpen=${setOpenMat} />`) : html`<p class="muted small">還沒有 W${week} 的投影片。</p>`}
              ${uploading === c.code
                ? html`<${UploadPanel} course=${c} defaults=${{ week, kind: 'lecture' }} onDone=${() => setUploading(null)} />`
                : html`<div class="row wrap">
                    <${Btn} kind="ghost" size="sm" icon="upload" onClick=${() => setUploading(c.code)}>上傳 W${week} 投影片</${Btn}>
                    ${mats.length
                      ? html`<${Btn} kind="ghost" size="sm" icon="practice"
                          onClick=${() => go('practice', { tab: 'quiz', course: c.code, materials: mats.map((m) => m.id), count: 8, auto: true })}>
                          出這週的複習題（${mats.length} 份）</${Btn}>`
                      : null}
                  </div>`}
            </section>`;
          })}
        </div>`
      : html`<${Empty} icon="courses" title=${`W${week} 沒有課，也沒有投影片`}>選其他週，或到課程頁上傳講義。</${Empty}>`}
  </div>`;
}

/* ---------- 小考: a weekly in-class quiz on last week's content (MATH7861's applied class) ---------- */
const QUIZ_STEPS = [
  { id: 'slides', label: '投影片導讀' },
  { id: 'sheet', label: '考前重點' },
  { id: 'mock', label: '模擬小考' },
  { id: 'cards', label: '閃卡＋錯題' },
];
const quizPrepId = (code, week) => `${code}-W${week}`;

/** What exists for one sitting: the slides it covers, the 考前重點 sheet, mock quizzes, cards, and the four steps. */
function quizPrepState(course, sit, s = Store.state) {
  const mats = s.materials.filter((m) => m.courseCode === course.code && Number(m.week) === sit.covers);
  const study = mats.filter((m) => m.kind !== 'exam');
  const id = quizPrepId(course.code, sit.week);
  const prep = s.quizprep.find((p) => p.id === id) || null;
  const tag = 'quizprep:' + id;
  const mocks = s.quizzes.filter((x) => x.tag === tag).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const graded = mocks.filter((x) => x.status === 'graded');
  const matIds = new Set(mats.map((m) => m.id));
  const mockIds = new Set(mocks.map((x) => x.id));
  const cards = s.cards.filter(
    (k) => k.courseCode === course.code && !k.suspended && k.source && (matIds.has(k.source.materialId) || mockIds.has(k.source.quizId))
  );
  // Reviewed in the three days before the quiz counts as revised for it.
  const since = U.addDays(sit.date, -3);
  const fresh = cards.filter((k) => !(k.srs && k.srs.last && k.srs.last >= since));
  const steps = {
    slides: study.length > 0 && study.every((m) => !!m.summary),
    sheet: !!(prep && prep.sheet),
    mock: graded.length > 0,
    cards: cards.length > 0 && !fresh.length,
  };
  const done = QUIZ_STEPS.filter((x) => steps[x.id]).length;
  return { id, tag, prep, mats, study, mocks, graded, cards, fresh, steps, done, total: QUIZ_STEPS.length };
}

/** "明天 12:00", "今天 12:00", "3 天後", "考完了" … */
function quizWhen(sit) {
  const d = U.daysBetween(U.today(), sit.date);
  if (d < 0 || (d === 0 && classEnded(sit.date, sit.cls))) return '考完了';
  if (d === 0) return `今天 ${sit.cls.start}`;
  if (d === 1) return `明天 ${sit.cls.start}`;
  return U.relDay(sit.date);
}

function QuizReview({ params }) {
  const s = useStore();
  const rt = useRuntime();
  const ai = useAI();
  const sem = s.settings.semester;
  const tt = s.timetable;
  const today = U.today();
  const quizCourses = Store.courses().filter((c) => weeklyQuizOf(c));
  const [code, setCode] = useState(params.course || null);
  const [week, setWeek] = useState(Number(params.week) || null);
  const [uploading, setUploading] = useState(false);
  const [openMat, setOpenMat] = useState(null);
  const [openSheet, setOpenSheet] = useState(false);
  const c = quizCourses.find((x) => x.code === code) || quizCourses[0] || null;

  if (!c)
    return html`<${Empty} icon="practice" title="還沒有設定每週小考"
      action=${html`<${Btn} kind="primary" size="sm" onClick=${() => go('courses')}>到課程頁設定</${Btn}>`}>
      有每週小考的課（例如 MATH7861 每週 applied class 考上週的內容），到「課程 → 評量與考試」打開「每週小考」，這裡就會出現考前複習。
    </${Empty}>`;

  const q = weeklyQuizOf(c);
  const sittings = quizSittings(c, tt, sem);
  const next = nextQuizSitting(c, tt, sem);
  const sit = sittings.find((x) => x.week === week) || next || sittings.filter((x) => x.held && x.date <= today).slice(-1)[0] || sittings[0] || null;
  const pickCourse = (x) => (setCode(x), setWeek(null), setUploading(false));
  const picker =
    quizCourses.length > 1
      ? html`<div class="chips">${quizCourses.map(
          (x) => html`<button type="button" key=${x.code} class=${U.cls('chip-btn', 'c-' + (x.color || 'pen'), x.code === c.code && 'is-on')} onClick=${() => pickCourse(x.code)}>${x.code}</button>`
        )}</div>`
      : null;

  if (!sit)
    return html`<div class="stack">${picker}<${Empty} icon="plan" title=${`課表裡找不到 ${c.code} 的 ${CLASS_TYPES[q.classType] || q.classType}`}
      action=${html`<${Btn} kind="primary" size="sm" onClick=${() => go('plan')}>到計畫頁看課表</${Btn}>`}>
      小考排在這門課每週的 ${CLASS_TYPES[q.classType] || q.classType}。在課表加上這堂課，或到課程頁改小考在哪一堂。
    </${Empty}></div>`;

  if (openMat) {
    const m = Store.get('materials', openMat);
    if (m) return html`<${MaterialView} material=${m} course=${c} backLabel="← 回到小考準備" onClose=${() => setOpenMat(null)} />`;
  }

  const st = quizPrepState(c, sit, s);
  const topic = topicFor(c, sit.covers);
  const lect = lectureLabel(c, sit.covers, tt, sem);
  const scope = `W${sit.covers}${lect ? `（${lect}）` : ''}`;
  // Before the next quiz: recent uploads that probably belong to the tested week but were filed with no week or a
  // later one (slides for last week uploaded this week), unless their lecture number says the filing is right.
  const misfiled =
    next && sit.week === next.week
      ? s.materials
          .filter(
            (m) =>
              m.courseCode === c.code &&
              !m.classDate &&
              (!m.week || Number(m.week) > sit.covers) &&
              String(m.createdAt || '') >= U.addDays(today, -10) &&
              guessWeek(m.title || '', c) !== Number(m.week)
          )
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0, 4)
      : [];
  const classLabel = CLASS_TYPES[sit.cls.type] || sit.cls.type;
  const when = quizWhen(sit);
  const past = when === '考完了';

  const genSheet = () =>
    ai.run(async ({ signal, onProgress }) => {
      const mats = [...st.study, ...st.mats.filter((m) => m.kind === 'exam')].slice(0, 4);
      const sheet = await AI.quizSheet({ course: c, week: sit.week, covers: sit.covers, lectures: lect, topic, date: sit.date, time: sit.cls.start, classLabel, materials: mats, signal, onProgress });
      await Store.patch('quizprep', st.id, { courseCode: c.code, week: sit.week, covers: sit.covers, date: sit.date, sheet, materialIds: mats.map((m) => m.id), sheetAt: U.nowIso() });
      setOpenSheet(true);
      toast(`W${sit.covers} 考前重點準備好了`, 'ok');
    });
  const mock = () =>
    go('practice', {
      tab: 'quiz',
      course: c.code,
      materials: st.mats.map((m) => m.id),
      count: 6,
      auto: true,
      focus: `${scope} 小考模擬：像 ${classLabel} 當場寫的小考（定義、計算、證明步驟），不用太長`,
      tag: st.tag,
    });
  const cram = () =>
    go('practice', {
      tab: 'review',
      course: c.code,
      cards: [...st.fresh, ...st.cards.filter((k) => !st.fresh.includes(k))].map((k) => k.id),
      label: `W${sit.covers} 考前閃卡`,
      back: { route: 'review', params: { tab: 'quiz', course: c.code, week: sit.week }, label: '回到小考準備' },
    });
  const termless = st.study.filter((m) => m.summary && m.summary.key_terms && m.summary.key_terms.length && !s.cards.some((k) => k.source && k.source.materialId === m.id));
  const addTerms = async () => {
    let n = 0;
    for (const m of termless) n += await addTermCards(m, m.summary.key_terms);
    toast(n ? `加入 ${n} 張名詞卡` : '這些名詞都已經在卡片裡了', n ? 'ok' : 'info');
  };
  const openMock = st.mocks.find((x) => x.status !== 'graded');

  if (openSheet && st.prep && st.prep.sheet)
    return html`<${QuizSheetView} prep=${st.prep} course=${c} sit=${sit} onClose=${() => setOpenSheet(false)} onMock=${mock} />`;

  return html`<div class="stack">
    ${picker}
    <section class=${'qz-hero c-' + (c.color || 'pen')}>
      <div class="qz-hero__top"><${CourseChip} code=${c.code} /><span class="eyebrow">${next && sit.week === next.week ? '下次小考' : past ? '考過的小考' : '之後的小考'} · ${q.label}</span></div>
      <h2 class="qz-hero__title">考 W${sit.covers} 的內容${lect ? html`<span class="qz-hero__lect">${lect}</span>` : null}</h2>
      ${topic ? html`<p class="qz-hero__topic">${topic}</p>` : null}
      <div class="qz-hero__when">
        <span class="qz-hero__date">${U.fmtDate(sit.date)} ${sit.cls.start}</span>
        <${Pill} tone=${past ? 'muted' : U.daysBetween(today, sit.date) <= 1 ? 'warn' : 'pen'}>${when}</${Pill}>
      </div>
      <p class="muted small">${[classLabel, sit.cls.location, q.best && q.of ? `${q.of} 次取最好 ${q.best} 次` : '', q.weight ? `共占 ${q.weight}%` : ''].filter(Boolean).join(' · ')}</p>
      <${Progress} value=${st.done / st.total} tone="ok" label="考前準備進度" />
      <span class="muted small">${past ? '複習進度' : '考前準備'} ${st.done}/${st.total}${st.done === st.total && !past ? ' · 都準備好了，考前再看一次考前重點就好' : ''}</span>
    </section>

    <ol class="qz-steps">
      <li class=${U.cls('qz-step', st.steps.slides && 'is-done')}>
        <div class="qz-step__head"><span class="step__n">${st.steps.slides ? '✓' : '1'}</span><h3>投影片導讀 <span class="muted small">${scope}</span></h3></div>
        ${st.mats.length
          ? html`<ul class="qz-mats">${st.mats.map(
              (m) => html`<li key=${m.id}>
                <button type="button" class="link-plain" onClick=${() => setOpenMat(m.id)}>${m.title}</button>
                <span class="muted small">${MATERIAL_KINDS[m.kind] || ''}</span>
                ${m.kind === 'exam'
                  ? html`<${Pill} tone="muted">模擬小考會照它的格式</${Pill}>`
                  : m.summary
                    ? html`<${Pill} tone="ok">已導讀</${Pill}>`
                    : html`<${Btn} kind="ghost" size="sm" onClick=${() => setOpenMat(m.id)}>看導讀</${Btn}>`}
              </li>`
            )}</ul>`
          : html`<p class="muted small">還沒有 ${scope} 的投影片。上傳後，考前重點和模擬小考都會照投影片的內容出。</p>`}
        ${misfiled.length
          ? html`<div class="rc__suggest">
              <span class="muted small">最近上傳、但不在 W${sit.covers} 的：</span>
              ${misfiled.map(
                (m) => html`<button type="button" key=${m.id} class="chip-btn" onClick=${() => Store.patch('materials', m.id, { week: sit.covers, updatedAt: U.nowIso() })}>
                  「${U.truncate(m.title, 28)}」${m.week ? `（W${m.week}）` : '（沒有週次）'}改成 W${sit.covers}</button>`
              )}
            </div>`
          : null}
        ${uploading
          ? html`<${UploadPanel} course=${c} defaults=${{ week: sit.covers, kind: 'lecture' }} onDone=${() => setUploading(false)} />`
          : html`<div class="row wrap">
              <${Btn} kind=${st.mats.length ? 'ghost' : 'primary'} size="sm" icon="upload" onClick=${() => setUploading(true)}>上傳 W${sit.covers} 投影片</${Btn}>
            </div>
            <p class="muted small">有 ${classLabel} 的題目或解答？上傳時類型選「${MATERIAL_KINDS.exam}」，模擬小考會模仿它的格式。</p>`}
      </li>

      <li class=${U.cls('qz-step', st.steps.sheet && 'is-done')}>
        <div class="qz-step__head"><span class="step__n">${st.steps.sheet ? '✓' : '2'}</span><h3>考前重點</h3></div>
        <p class="muted small">一頁看完：要會寫的定義、要會用的規則、每種題型的解題步驟、常見錯誤、英文作答句型，最後幾題快問快答。</p>
        ${!st.mats.length && !st.steps.sheet ? html`<p class="muted small">還沒有投影片時，書僮只能用${topic ? `「${topic}」` : '這個主題'}的一般內容整理。</p>` : null}
        <div class="row wrap">
          ${st.steps.sheet
            ? html`<${Btn} kind="primary" size="sm" icon="methods" onClick=${() => setOpenSheet(true)}>打開考前重點</${Btn}>
                <${Btn} kind="ghost" size="sm" disabled=${ai.busy || rt.ai !== 'ready'} onClick=${genSheet}>重新產生</${Btn}>`
            : html`<${Btn} kind="primary" size="sm" icon="spark" disabled=${ai.busy || rt.ai !== 'ready'} onClick=${genSheet}>產生考前重點</${Btn}>`}
        </div>
        <${Thinking} ai=${ai} label="書僮整理考前重點中" />
        <${AIError} ai=${ai} onRetry=${genSheet} />
      </li>

      <li class=${U.cls('qz-step', st.steps.mock && 'is-done')}>
        <div class="qz-step__head"><span class="step__n">${st.steps.mock ? '✓' : '3'}</span><h3>模擬小考</h3></div>
        <p class="muted small">6 題，照 ${classLabel} 小考的方式出題；交卷後答錯的題目會自動進錯題本和閃卡。</p>
        ${st.graded.length ? html`<p class="small">已做 ${st.graded.length} 份 · 最近一次 ${Math.round((st.graded[0].score || 0) * 100)} 分</p>` : null}
        <div class="row wrap">
          ${openMock
            ? html`<${Btn} kind="primary" size="sm" icon="practice" onClick=${() => go('practice', { tab: 'quiz', quiz: openMock.id })}>繼續沒交卷的那份</${Btn}>`
            : null}
          <${Btn} kind=${st.steps.mock || openMock ? 'ghost' : 'primary'} size="sm" icon="practice" onClick=${mock}>${st.mocks.length ? '再做一份模擬小考' : '做一份模擬小考'}</${Btn}>
        </div>
      </li>

      <li class=${U.cls('qz-step', st.steps.cards && 'is-done')}>
        <div class="qz-step__head"><span class="step__n">${st.steps.cards ? '✓' : '4'}</span><h3>閃卡＋錯題</h3></div>
        <p class="muted small">${st.cards.length
          ? `W${sit.covers} 的卡片 ${st.cards.length} 張${st.fresh.length ? `，${st.fresh.length} 張考前還沒複習` : '，考前都複習過了'}。`
          : `還沒有 W${sit.covers} 的卡片：導讀裡的關鍵名詞可以加進來，模擬小考答錯的題目也會自動進來。`}</p>
        <div class="row wrap">
          ${st.cards.length ? html`<${Btn} kind=${st.steps.cards ? 'ghost' : 'primary'} size="sm" icon="card" onClick=${cram}>考前閃卡（${st.cards.length}）</${Btn}>` : null}
          ${termless.length ? html`<${Btn} kind="ghost" size="sm" icon="plus" onClick=${addTerms}>把導讀的名詞加入閃卡</${Btn}>` : null}
          <${Btn} kind="ghost" size="sm" icon="flag" onClick=${() => go('practice', { tab: 'mistakes', course: c.code })}>${c.code} 錯題本</${Btn}>
        </div>
      </li>
    </ol>

    <${QuizScores} course=${c} q=${q} sittings=${sittings} current=${sit} onPick=${(w) => (setWeek(w), setUploading(false))} />

    <aside class="tip">
      <span class="tip__label">考前怎麼用</span>
      <p>前一天：導讀 → 考前重點 → 模擬小考，大約 40 分鐘。當天出門前：只看考前重點的「必背」和「常見錯誤」，再刷一輪閃卡。考完回來記下分數，錯的地方會留在錯題本，期末考前再複習。</p>
    </aside>
  </div>`;
}

/** Scores of every sitting, with the best-N-of-M standing. */
function QuizScores({ course, q, sittings, current, onPick }) {
  const s = useStore();
  const today = U.today();
  const recOf = (x) => {
    const p = s.quizprep.find((d) => d.id === quizPrepId(course.code, x.week));
    return (p && p.score) || null;
  };
  const records = sittings.map(recOf);
  const lastMax = (records.filter((r) => r && Number(r.max) > 0).slice(-1)[0] || {}).max || '';
  const standing = quizStanding(q, records);
  const save = (x, field, raw) => {
    const prev = recOf(x) || { got: '', max: lastMax };
    const v = raw === '' ? '' : Number(raw);
    if (raw !== '' && !Number.isFinite(v)) return;
    Store.patch('quizprep', quizPrepId(course.code, x.week), { courseCode: course.code, week: x.week, covers: x.covers, date: x.date, score: { ...prev, [field]: v }, scoredAt: U.nowIso() });
  };
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const noMax = records.filter((r) => r && r.got !== '' && r.got != null && !(Number(r.max) > 0)).length;
  const summary = standing.recorded
    ? [
        `已記錄 ${standing.recorded} 次`,
        `${q.best ? `最好 ${standing.counted} 次` : ''}平均 ${Math.round(standing.avg * 100)}%`,
        standing.banked != null ? `已拿到約 ${fmt(standing.banked)} / ${q.weight} 分` : '',
        standing.projected != null && q.best && standing.counted < q.best ? `照這個平均，最後約 ${fmt(standing.projected)} / ${q.weight} 分` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : noMax
      ? '填上滿分，才能算平均。'
      : '考完把分數記在這裡，書僮會算最好幾次的平均。';
  return html`<${Section} title="小考成績" sub=${q.best && q.of ? `${q.of} 次取最好 ${q.best} 次：可以有 ${q.of - q.best} 次失常或缺席，不用每次都拚滿分。` : '每次小考的分數'}>
    <p class="small qz-standing">${summary}</p>
    <div class="table-wrap"><table class="qz-scores">
      <thead><tr><th>考試日期</th><th>考的範圍</th><th>得分</th></tr></thead>
      <tbody>${sittings.map((x) => {
        const r = recOf(x) || {};
        const t = topicFor(course, x.covers);
        const l = lectureLabel(course, x.covers, s.timetable, s.settings.semester);
        const d = U.fmtDate(x.date, { noWeekday: true });
        return html`<tr key=${x.week} class=${U.cls(x.week === current.week && 'is-on', !x.held && 'is-off', x.date > today && 'is-future')}>
          <td><button type="button" class="link-plain" aria-label=${`看 ${d} 的小考準備`} onClick=${() => onPick(x.week)}>${U.fmtDate(x.date)}</button></td>
          <td><b>W${x.covers}</b>${l ? html` <span class="small">${l}</span>` : null}${t ? html` <span class="muted small">${U.truncate(t, 36)}</span>` : null}</td>
          <td>${!x.held
            ? html`<span class="muted small">放假</span>`
            : x.date > today
              ? html`<span class="muted small">—</span>`
              : html`<span class="score-in">
                  <${NumInput} min="0" step="0.5" aria-label=${`${d} 得分`} placeholder="得分" value=${r.got} onCommit=${(v) => save(x, 'got', v)} />
                  <span>/</span>
                  <${NumInput} min="1" step="0.5" aria-label=${`${d} 滿分`} placeholder="滿分" value=${r.max ?? lastMax} onCommit=${(v) => save(x, 'max', v)} />
                </span>`}</td>
        </tr>`;
      })}</tbody>
    </table></div>
  </${Section}>`;
}

/** The 考前重點 sheet. */
function QuizSheetView({ prep, course, sit, onClose, onMock }) {
  const g = prep.sheet;
  const [shown, setShown] = useState({});
  const firstMat = (prep.materialIds || []).map((id) => Store.get('materials', id)).find(Boolean) || null;
  const addDefs = async () => {
    const terms = g.definitions.map((d) => ({ term: d.term, zh: d.zh, def_en: d.def_en + (d.notation ? ` (${d.notation})` : ''), example_en: '' }));
    const n = await addTermCards({ courseCode: course.code, id: firstMat ? firstMat.id : null }, terms);
    toast(n ? `加入 ${n} 張名詞卡` : '這些名詞都已經在卡片裡了', n ? 'ok' : 'info');
  };
  const bilist = (items, cls = '') =>
    html`<ul class=${U.cls('bilist', cls)}>${items.map((x, i) => html`<li key=${i}><span class="en">${x.en}</span>${x.zh ? html`<span class="zh">${x.zh}</span>` : null}</li>`)}</ul>`;
  return html`<article class="material qz-sheet">
    <div class="row between wrap">
      <button type="button" class="link" onClick=${onClose}>← 回到小考準備</button>
      <span class="muted small">${g.scope_zh}</span>
    </div>
    <header class="material__head">
      <p class="eyebrow">考前重點 · 考 W${sit.covers}${lectureLabel(course, sit.covers, Store.state.timetable, Store.state.settings.semester) ? `（${lectureLabel(course, sit.covers, Store.state.timetable, Store.state.settings.semester)}）` : ''} · ${U.fmtDate(sit.date)} ${sit.cls.start} 小考</p>
      <h2 class="material__title">${g.title_en}</h2>
      ${g.title_zh ? html`<p class="material__zh">${g.title_zh}</p>` : null}
    </header>
    ${g.must_know.length
      ? html`<section class="guide__block"><h3 class="guide__h">Must know <span>必背</span></h3>${bilist(g.must_know, 'bilist--check')}</section>`
      : null}
    ${g.definitions.length
      ? html`<section class="guide__block">
          <div class="row between wrap"><h3 class="guide__h">Definitions <span>定義（照這樣寫）</span></h3>
            <${Btn} kind="ghost" size="sm" icon="card" onClick=${addDefs}>全部加入閃卡</${Btn}></div>
          <div class="table-wrap"><table class="terms">
            <thead><tr><th>Term</th><th>中文</th><th>Definition</th></tr></thead>
            <tbody>${g.definitions.map(
              (d, i) => html`<tr key=${i}><td class="terms__term"><mark>${d.term}</mark></td><td>${d.zh}</td>
                <td><div>${d.def_en}</div>${d.notation ? html`<div class="qz-notation">${d.notation}</div>` : null}</td></tr>`
            )}</tbody>
          </table></div>
        </section>`
      : null}
    ${g.rules.length
      ? html`<section class="guide__block"><h3 class="guide__h">Rules & theorems <span>規則與定理</span></h3>
          <ul class="qz-rules">${g.rules.map(
            (r, i) => html`<li key=${i}><div><b>${r.name_en}</b>${r.zh ? html` <span class="zh">${r.zh}</span>` : null}</div>
              ${r.statement ? html`<div class="qz-rule">${r.statement}</div>` : null}
              ${r.use_when_zh ? html`<div class="muted small">什麼時候用：${r.use_when_zh}</div>` : null}</li>`
          )}</ul></section>`
      : null}
    ${g.patterns.length
      ? html`<section class="guide__block"><h3 class="guide__h">Question types <span>題型與解題步驟</span></h3>
          <div class="qz-patterns">${g.patterns.map(
            (p, i) => html`<div key=${i} class="qz-pattern">
              <div class="qz-pattern__type"><b>${p.type_en}</b>${p.type_zh ? html` <span class="zh">${p.type_zh}</span>` : null}</div>
              <ol class="qz-pattern__steps">${p.steps_en.map((x, j) => html`<li key=${j}>${x}</li>`)}</ol>
              ${p.example_q
                ? html`<details class="qz-example"><summary>看例題</summary>
                    <p class="en">${p.example_q}</p>
                    <div class="qz-example__a">${p.example_a}</div>
                  </details>`
                : null}
            </div>`
          )}</div></section>`
      : null}
    <div class="grid-2">
      ${g.traps.length ? html`<section class="guide__block"><h3 class="guide__h">Traps <span>常見錯誤</span></h3>${bilist(g.traps, 'bilist--warn')}</section>` : null}
      ${g.phrases.length
        ? html`<section class="guide__block"><h3 class="guide__h">Write it in English <span>作答句型</span></h3>
            <ul class="bilist">${g.phrases.map((x, i) => html`<li key=${i}><span class="en">${x.en}</span>${x.zh ? html`<span class="zh">${x.zh}</span>` : null}<${CopyBtn} text=${x.en} /></li>`)}</ul></section>`
        : null}
    </div>
    ${g.selfcheck.length
      ? html`<section class="guide__block">
          <h3 class="guide__h">Self-check <span>快問快答：先自己答，再看答案</span></h3>
          <ol class="warmups">${g.selfcheck.map(
            (w, i) => html`<li key=${i} class="warmup">
              <${Bilingual} en=${w.q_en} zh=${w.q_zh} />
              ${shown[i]
                ? html`<div class="warmup__ans"><p class="en">${w.a_en}</p>${w.a_zh ? html`<p class="zh">${w.a_zh}</p>` : null}</div>`
                : html`<button type="button" class="link" onClick=${() => setShown({ ...shown, [i]: true })}>看答案</button>`}
            </li>`
          )}</ol>
        </section>`
      : null}
    <div class="row wrap">
      <${Btn} kind="primary" icon="practice" onClick=${onMock}>做一份模擬小考</${Btn}>
      <${Btn} kind="ghost" icon="tutor"
        onClick=${() => go('tutor', firstMat ? { course: course.code, materials: [firstMat.id], resume: true } : { course: course.code, focus: g.title_en })}>不懂的地方問書僮</${Btn}>
    </div>
  </article>`;
}

function ReviewView({ params }) {
  const s = useStore();
  const hasQuiz = s.courses.some((c) => weeklyQuizOf(c));
  const [tab, setTab] = useState(params.tab || 'day');
  useEffect(() => {
    if (params.tab) setTab(params.tab);
  }, [Router.state.seq]);
  return html`<div class="view">
    <header class="page-head"><div><p class="eyebrow">上完課當天複習，記得最牢</p><h1 class="page-title">複習</h1></div></header>
    <${AIGate} />
    <${Tabs} value=${tab} onChange=${setTab} label="複習範圍" tabs=${[
      { id: 'day', label: '每天' },
      { id: 'week', label: '每週' },
      ...(hasQuiz ? [{ id: 'quiz', label: '小考' }] : []),
    ]} />
    ${tab === 'quiz' && hasQuiz
      ? html`<${QuizReview} key=${'q' + Router.state.seq} params=${params} />`
      : tab === 'week'
        ? html`<${WeekReview} key=${'w' + Router.state.seq} params=${params} />`
        : html`<${DayReview} key=${'d' + Router.state.seq} params=${params} />`}
  </div>`;
}
