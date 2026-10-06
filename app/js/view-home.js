/* view-home.js — 今日: what needs attention today. */

/** Next dated thing per course: the nearest unfinished assessment or the exam. */
function nextDeadlines(today = U.today()) {
  const out = [];
  const sem = Store.state.settings.semester;
  for (const c of Store.courses()) {
    const items = (c.assessments || [])
      .filter((a) => a.status !== 'done' && U.isYmd(a.due) && a.due >= today)
      .map((a) => ({ course: c.code, name: a.name, date: a.due, weight: a.weight, kind: a.kind, verified: c.verified }));
    if (c.exam && U.isYmd(c.exam.date) && c.exam.date >= today)
      items.push({ course: c.code, name: c.exam.name || '期末考', date: c.exam.date, weight: c.exam.weight, kind: 'exam', verified: c.verified });
    items.sort((a, b) => a.date.localeCompare(b.date));
    if (items.length) out.push(items[0]);
    else if (c.exam && U.isYmd(sem.examStart) && sem.examStart >= today)
      out.push({ course: c.code, name: c.exam.name || '期末考', date: null, approx: sem.examStart, window: examWindowLabel(sem), weight: c.exam.weight, kind: 'exam', verified: c.verified });
  }
  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}

function streakDays(days, today = U.today()) {
  const active = new Set(days.filter((d) => (d.reviews || 0) + (d.answered || 0) + (d.quizQs || 0) > 0).map((d) => d.date || d.id));
  let d = active.has(today) ? today : U.addDays(today, -1);
  let n = 0;
  while (active.has(d)) {
    n++;
    d = U.addDays(d, -1);
  }
  return n;
}

function weakSpots(sessions, limit = 6) {
  const out = [];
  const sorted = sessions.slice().sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  for (const s of sorted)
    for (const t of (s.turns || []).slice().reverse())
      if (t.fb && t.fb.understanding !== 'clear') {
        out.push({ session: s, turn: t });
        if (out.length >= limit) return out;
      }
  return out;
}

function suggestions(s, today) {
  const list = [];
  const courses = Store.courses();
  for (const c of courses) {
    const mats = s.materials.filter((m) => m.courseCode === c.code);
    if (!mats.length) {
      list.push({ key: 'up-' + c.code, course: c.code, text: `上傳 ${c.code} 最近一週的講義，先看導讀`, act: () => go('courses', { course: c.code, upload: true }) });
      continue;
    }
    const noGuide = mats.find((m) => !m.summary);
    if (noGuide) list.push({ key: 'sum-' + noGuide.id, course: c.code, text: `幫「${U.truncate(noGuide.title, 28)}」做導讀`, act: () => go('courses', { course: c.code, material: noGuide.id }) });
  }
  for (const c of courses.filter((x) => x.preview)) {
    const next = lectureWeeks(c.code, today, 3, s.timetable, s.settings.semester)[0];
    if (next && !s.previews.some((p) => p.id === `${c.code}-W${next.week}`))
      list.unshift({
        key: 'prev-' + c.code + next.week,
        course: c.code,
        text: `預習 W${next.week}：${U.fmtDate(next.date)} ${next.cls.start} 的講課`,
        act: () => go('courses', { course: c.code, tab: 'preview', week: next.week }),
      });
  }
  const sem = s.settings.semester;
  const toReview = classesOn(today, s.timetable, sem).filter(
    (cls) => classEnded(today, cls) && !(materialsForClass(s, today, cls).length && materialsForClass(s, today, cls).every((m) => !materialProgress(m, s).next))
  );
  for (const cls of toReview.slice(0, 2).reverse())
    list.unshift({
      key: 'rev-' + cls.id,
      course: cls.courseCode,
      text: `複習今天的 ${CLASS_TYPES[cls.type] || cls.type}（${cls.start}）：${materialsForClass(s, today, cls).length ? '繼續下一步' : '上傳投影片開始'}`,
      act: () => go('review', { tab: 'day', date: today }),
    });
  // A weekly quiz within two days goes to the top until its prep is done.
  for (const c of courses.filter((x) => weeklyQuizOf(x))) {
    const sit = nextQuizSitting(c, s.timetable, sem, today);
    if (!sit || U.daysBetween(today, sit.date) > 2) continue;
    const st = quizPrepState(c, sit, s);
    if (st.done === st.total) continue;
    list.unshift({
      key: 'quiz-' + c.code + sit.week,
      course: c.code,
      text: `${quizWhen(sit)} 小考（考 W${sit.covers}）：考前準備 ${st.done}/${st.total}`,
      act: () => go('review', { tab: 'quiz', course: c.code }),
    });
  }
  for (const w of weakSpots(s.sessions, 2))
    list.push({
      key: 'weak-' + w.session.id + w.turn.at,
      course: w.session.courseCode,
      text: `再練一次：${w.turn.q.focus || U.truncate(w.turn.q.en, 40)}`,
      act: () => go('tutor', { course: w.session.courseCode, materials: w.session.materialIds || [], focus: w.turn.q.focus }),
    });
  const soon = s.tasks.filter((t) => !t.done && U.isYmd(t.date) && t.date >= today && t.date <= U.addDays(today, 3));
  if (!soon.length) list.push({ key: 'plan', text: '讓書僮排接下來兩週的讀書計畫', act: () => go('plan', { ai: true }) });
  const unverified = courses.filter((c) => c.verified === false);
  if (unverified.length)
    list.push({
      key: 'verify',
      text: `核對 ${unverified.map((c) => c.code).join('、')} 的評量日期（貼上 ECP 評量表）`,
      act: () => go('plan', { parse: true }),
    });
  return list.slice(0, 6);
}

/** Today's classes, or the next class day, with 預習 status for courses that need it. */
function TodayClasses() {
  const s = useStore();
  const tt = s.timetable;
  if (!tt.classes.length) return null;
  const today = U.today();
  const sem = s.settings.semester;
  const todays = classesOn(today, tt, sem);
  const ahead = upcomingClasses(U.addDays(today, 1), 21, tt, sem);
  const nextDay = ahead.length ? ahead[0].date : null;
  const shown = todays.length ? todays.map((cls) => ({ date: today, cls })) : ahead.filter((x) => x.date === nextDay);
  const phase = semesterPhase(today, sem);
  const previewed = (code, week) => s.previews.some((p) => p.id === `${code}-W${week}`);
  return html`<section class="classes" aria-label="課表">
    <div class="classes__head">
      <h2 class="section__title">${todays.length ? '今天的課' : nextDay ? `下次上課 · ${U.fmtDate(nextDay)}（${U.relDay(nextDay)}）` : '課表'}</h2>
      ${!todays.length ? html`<span class="muted small">今天沒有課${phase.phase === 'break' ? '（期中假）' : phase.holiday ? '（公眾假期）' : ''}</span>` : null}
      <span class="spacer"></span>
      <button type="button" class="link" onClick=${() => go('review', { tab: todays.length ? 'day' : 'week' })}>${todays.length ? '到複習頁' : '看這週的複習進度'}</button>
    </div>
    ${shown.length
      ? html`<ul class="classes__list">
          ${shown.map(({ date, cls }) => {
            const c = Store.course(cls.courseCode);
            const week = semesterPhase(date, sem).week;
            const needsPrev = c && c.preview && cls.type === 'lecture' && !classStarted(date, cls);
            const mats = materialsForClass(s, date, cls);
            const prog = mats.map((m) => materialProgress(m, s));
            const reviewed = mats.length && prog.every((p) => !p.next);
            const q = c && weeklyQuizOf(c);
            const quizSit = q && cls.type === q.classType && !classEnded(date, cls) ? quizSittings(c, tt, sem).find((x) => x.date === date && x.held) : null;
            return html`<li key=${cls.id || cls.courseCode + cls.start} class=${'cls c-' + courseColor(cls.courseCode)}>
              <span class="cls__time">${cls.start}–${cls.end}</span>
              <${CourseChip} code=${cls.courseCode} short />
              <span class="cls__type">${CLASS_TYPES[cls.type] || cls.type}</span>
              ${cls.location ? html`<span class="cls__loc">${cls.location}</span>` : null}
              ${cls.mode === 'recording' ? html`<${Pill} tone="warn">看錄影</${Pill}>` : null}
              ${needsPrev
                ? previewed(cls.courseCode, week)
                  ? html`<button type="button" class="pill pill--ok pill-btn" onClick=${() => go('courses', { course: cls.courseCode, tab: 'preview', preview: `${cls.courseCode}-W${week}` })}>已預習 W${week}</button>`
                  : html`<button type="button" class="pill pill--pen pill-btn" onClick=${() => go('courses', { course: cls.courseCode, tab: 'preview', week })}>預習 W${week}</button>`
                : null}
              ${quizSit
                ? html`<button type="button" class="pill pill--warn pill-btn" onClick=${() => go('review', { tab: 'quiz', course: cls.courseCode })}>小考（考 W${quizSit.covers}）</button>`
                : null}
              ${classStarted(date, cls)
                ? html`<button type="button" class=${'pill pill-btn pill--' + (reviewed ? 'ok' : mats.length ? 'pen' : 'warn')} onClick=${() => go('review', { tab: 'day', date })}>
                    ${reviewed ? '已複習' : mats.length ? `複習 ${U.sum(prog.map((p) => p.done))}/${U.sum(prog.map((p) => p.total))}` : '上傳投影片複習'}</button>`
                : null}
            </li>`;
          })}
        </ul>`
      : html`<p class="muted small">這學期的課都上完了。</p>`}
  </section>`;
}

function HomeView() {
  const s = useStore();
  const today = U.today();
  const sem = s.settings.semester;
  const phase = semesterPhase(today, sem);
  const deadlines = nextDeadlines(today);
  const tasksToday = s.tasks
    .filter((t) => (t.date === today) || (!t.done && U.isYmd(t.date) && t.date < today))
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.date || '').localeCompare(b.date || '') || (a.order ?? 0) - (b.order ?? 0));
  const due = s.cards.filter((c) => SRS.isDue(c, today));
  const dueByCourse = U.groupBy(due, (c) => c.courseCode || '');
  const streak = streakDays(s.days, today);
  const todayLog = s.days.find((d) => (d.date || d.id) === today) || {};
  const sugg = suggestions(s, today);
  const weak = weakSpots(s.sessions, 6);
  const tip = TIPS[Math.abs(U.daysBetween('2026-01-01', today)) % TIPS.length];
  const doneCount = tasksToday.filter((t) => t.done).length;

  return html`<div class="view view--home">
    <header class="hero">
      <p class="eyebrow">${U.fmtLongDate(today)}${phase.label ? html` · <strong>${phase.label}</strong>` : null}</p>
      <h1 class="hero__title">今天的書桌</h1>
      <p class="hero__sub">
        ${[
          tasksToday.length ? `${tasksToday.length} 件任務（完成 ${doneCount}）` : '今天還沒排任務',
          due.length ? `${due.length} 張閃卡到期` : '沒有到期的閃卡',
          streak ? `連續讀書 ${streak} 天` : '今天開始累積連續天數',
        ].join(' · ')}
      </p>
    </header>

    <${TodayClasses} />

    ${!s.loaded
      ? html`<div class="notice">正在從雲端載入你的資料…</div>`
      : !s.courses.length
        ? html`<${Empty} icon="courses" title="還沒有課程"
            action=${html`<${Btn} kind="primary" icon="plus" onClick=${() => go('courses', { add: true })}>新增第一門課</${Btn}>`}>
            先加入這學期的課程（例如 CSSE7030），書僮會依課程類型推薦練習方式。
          </${Empty}>`
        : null}

    ${deadlines.length
      ? html`<section class="countdown" aria-label="倒數">
          ${deadlines.map((d) => {
            const left = U.daysBetween(today, d.date || d.approx);
            return html`<button type="button" class=${'count c-' + courseColor(d.course)} key=${d.course}
              onClick=${() => go('courses', { course: d.course, tab: 'assess' })}>
              <span class="count__code">${d.course}</span>
              <span class="count__name">${d.name}${d.weight ? ` · ${d.weight}%` : ''}</span>
              <span class="count__days">${left === 0 ? '今天' : (d.date ? '' : '≥') + left}</span>
              <span class="count__unit">${left === 0 ? '' : '天'}</span>
              <span class="count__date">${d.date ? U.fmtDate(d.date) : `${d.window} · 日期未定`}${d.verified === false ? ' · 待核對' : ''}</span>
            </button>`;
          })}
        </section>`
      : null}

    <div class="grid-2">
      <${Section} title="今日任務" aside=${html`<${Btn} kind="ghost" size="sm" icon="plan" onClick=${() => go('plan')}>計畫</${Btn}>`}>
        ${tasksToday.length
          ? html`<ul class="tasklist">${tasksToday.map((t) => html`<${TaskRow} key=${t.id} task=${t} compact />`)}</ul>`
          : html`<${Empty} icon="plan" title="今天沒有排定的任務"
              action=${html`<${Btn} kind="primary" size="sm" icon="spark" onClick=${() => go('plan', { ai: true })}>請書僮排計畫</${Btn}>`}>
              書僮會依照截止日、考試日期和你的弱點，排出每天該做的事。
            </${Empty}>`}
      </${Section}>

      <div class="stack">
        <${Section} title="今日閃卡">
          <div class="review-today">
            <div class="review-today__num"><span class="big-num">${due.length}</span><span class="muted">張到期</span></div>
            <div class="review-today__by">
              ${[...dueByCourse].map(([code, list]) => html`<span key=${code} class="by"><${CourseChip} code=${code || null} short /> ${list.length}</span>`)}
              ${todayLog.reviews ? html`<span class="muted small">今天已複習 ${todayLog.reviews} 張</span>` : null}
            </div>
            <${Btn} kind=${due.length ? 'primary' : 'ghost'} icon="card" onClick=${() => go('practice', { tab: 'review' })}>
              ${due.length ? '開始複習' : '看所有卡片'}
            </${Btn}>
          </div>
        </${Section}>

        <${Section} title="書僮建議">
          ${sugg.length
            ? html`<ul class="sugg">
                ${sugg.map(
                  (x) => html`<li key=${x.key}><button type="button" class="sugg__item" onClick=${x.act}>
                    ${x.course ? html`<${CourseChip} code=${x.course} short />` : html`<${Icon} name="spark" size=${16} />`}
                    <span>${x.text}</span><${Icon} name="right" size=${16} />
                  </button></li>`
                )}
              </ul>`
            : html`<p class="muted">目前沒有建議，照計畫走就好。</p>`}
        </${Section}>
      </div>
    </div>

    ${weak.length
      ? html`<${Section} title="最近卡住的地方" sub="問答中「部分理解」或「還不太懂」的題目。">
          <ul class="weak">
            ${weak.map(
              ({ session, turn }, i) => html`<li key=${i} class="weak__item">
                <${CourseChip} code=${session.courseCode} short />
                <div class="weak__body">
                  <div class="weak__focus">${turn.q.focus || '概念'}</div>
                  <div class="weak__q">${turn.q.en}</div>
                </div>
                <${LevelPill} level=${turn.fb.understanding} short />
                <${Btn} kind="ghost" size="sm" onClick=${() => go('tutor', { course: session.courseCode, materials: session.materialIds || [], focus: turn.q.focus })}>再練</${Btn}>
              </li>`
            )}
          </ul>
        </${Section}>`
      : null}

    <aside class="tip">
      <span class="tip__label">讀書方法</span>
      <p>${tip}</p>
      <button type="button" class="link" onClick=${() => go('methods')}>看完整建議</button>
    </aside>
  </div>`;
}
