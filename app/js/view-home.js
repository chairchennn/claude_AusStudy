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
        ${tasksToday.length ? `${tasksToday.length} 件任務（完成 ${doneCount}）` : '今天還沒排任務'} ·
        ${due.length ? `${due.length} 張閃卡到期` : '沒有到期的閃卡'} ·
        ${streak ? `連續讀書 ${streak} 天` : '今天開始累積連續天數'}
      </p>
    </header>

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
        <${Section} title="今日複習">
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
