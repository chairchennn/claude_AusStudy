/* view-plan.js — 計畫: semester timeline, to-do list, AI study plan, and "paste messy info → tasks". */

const TASK_KINDS = { review: '複習', practice: '練習', study: '讀講義', assignment: '作業', exam: '考試準備', english: '英文', other: '其他' };

function taskGroups(tasks, today) {
  const g = { overdue: [], today: [], tomorrow: [], week: [], later: [], nodate: [], done: [] };
  const tmr = U.addDays(today, 1);
  const weekEnd = U.addDays(today, 7);
  for (const t of tasks) {
    if (t.done) {
      if (!t.doneAt || U.daysBetween(t.doneAt.slice(0, 10), today) <= 7) g.done.push(t);
      continue;
    }
    if (!U.isYmd(t.date)) g.nodate.push(t);
    else if (t.date < today) g.overdue.push(t);
    else if (t.date === today) g.today.push(t);
    else if (t.date === tmr) g.tomorrow.push(t);
    else if (t.date <= weekEnd) g.week.push(t);
    else g.later.push(t);
  }
  const byOrder = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.priority || 2) - (b.priority || 2) || (a.order ?? 0) - (b.order ?? 0);
  Object.values(g).forEach((xs) => xs.sort(byOrder));
  return g;
}

function PlanView({ params }) {
  const s = useStore();
  const today = U.today();
  const [panel, setPanel] = useState(params.ai ? 'ai' : params.parse ? 'parse' : null);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (params.ai) setPanel('ai');
    if (params.parse) setPanel('parse');
  }, [Router.state.seq]);
  const g = taskGroups(s.tasks, today);
  const groups = [
    ['overdue', '逾期'],
    ['today', '今天'],
    ['tomorrow', '明天'],
    ['week', '這週'],
    ['later', '之後'],
    ['nodate', '未排日期'],
  ];
  const minutesToday = U.sum(g.today.map((t) => t.minutes));
  const budget = U.isWeekend(today) ? s.settings.minutes.weekend : s.settings.minutes.weekday;

  return html`<div class="view">
    <header class="page-head">
      <div><p class="eyebrow">${semesterPhase(today, s.settings.semester).label}</p><h1 class="page-title">計畫</h1></div>
      <div class="row wrap">
        <${Btn} kind=${panel === 'ai' ? 'primary' : 'ghost'} icon="spark" onClick=${() => setPanel(panel === 'ai' ? null : 'ai')}>請書僮排計畫</${Btn}>
        <${Btn} kind=${panel === 'parse' ? 'primary' : 'ghost'} icon="practice" onClick=${() => setPanel(panel === 'parse' ? null : 'parse')}>整理課程公告</${Btn}>
      </div>
    </header>

    <${Timeline} />

    ${panel === 'ai' ? html`<${AIPlanner} onClose=${() => setPanel(null)} />` : null}
    ${panel === 'parse' ? html`<${InfoParser} onClose=${() => setPanel(null)} />` : null}

    ${s.plan && s.plan.advice_zh
      ? html`<aside class="advice">
          <span class="tip__label">書僮的策略 · ${U.fmtTime(s.plan.generatedAt)}</span>
          <p>${s.plan.advice_zh}</p>
          ${s.plan.weeks && s.plan.weeks.length
            ? html`<ul class="weeks">${s.plan.weeks.map((w, i) => html`<li key=${i}><b>${w.label}</b> ${w.focus_zh}</li>`)}</ul>`
            : null}
        </aside>`
      : null}

    <div class="grid-2 grid-2--wide-left">
      <${Section} title="待辦" sub=${`今天排了 ${U.fmtMinutes(minutesToday)}，可用 ${U.fmtMinutes(budget)}`}
        aside=${html`<${Btn} kind="ghost" size="sm" icon="plus" onClick=${() => setAdding(!adding)}>新增</${Btn}>`}>
        ${adding ? html`<${TaskForm} onDone=${() => setAdding(false)} />` : null}
        ${groups.every(([k]) => !g[k].length) && !adding
          ? html`<${Empty} icon="plan" title="沒有待辦"
              action=${html`<${Btn} kind="primary" icon="spark" onClick=${() => setPanel('ai')}>請書僮排計畫</${Btn}>`}>
              書僮會依截止日、考試日期和你的弱點排出每天的任務，你也可以自己新增。
            </${Empty}>`
          : null}
        ${groups.map(([k, label]) =>
          g[k].length
            ? html`<div class="tgroup" key=${k}>
                <h3 class=${'tgroup__title' + (k === 'overdue' ? ' bad' : '')}>${label} <span class="muted">${g[k].length}</span>
                  ${k === 'overdue' ? html`<button type="button" class="link" onClick=${() => moveAll(g[k], today)}>全部移到今天</button>` : null}</h3>
                <ul class="tasklist">${g[k].map((t) => html`<${TaskRow} key=${t.id} task=${t} siblings=${g[k]} />`)}</ul>
              </div>`
            : null
        )}
        ${g.done.length
          ? html`<details class="tgroup"><summary class="tgroup__title">最近完成 <span class="muted">${g.done.length}</span></summary>
              <ul class="tasklist">${g.done.map((t) => html`<${TaskRow} key=${t.id} task=${t} />`)}</ul></details>`
          : null}
      </${Section}>

      <${Section} title="截止日">
        <${DeadlineList} />
      </${Section}>
    </div>
  </div>`;
}

async function moveAll(tasks, date) {
  for (const t of tasks) await Store.patch('tasks', t.id, { date });
  toast(`已把 ${tasks.length} 項移到今天`, 'ok');
}

function TaskRow({ task: t, siblings, compact }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const toggle = () => Store.patch('tasks', t.id, { done: !t.done, doneAt: !t.done ? U.nowIso() : null });
  const move = async (dir) => {
    const list = siblings || [];
    const i = list.findIndex((x) => x.id === t.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j];
    const a = t.order ?? i;
    const b = other.order ?? j;
    await Store.patch('tasks', t.id, { order: b === a ? b + dir : b, priority: other.priority || t.priority });
    await Store.patch('tasks', other.id, { order: a });
  };
  if (editing) return html`<li class="task"><${TaskForm} task=${t} onDone=${() => setEditing(false)} /></li>`;
  return html`<li class=${U.cls('task', t.done && 'is-done', t.priority === 1 && 'is-p1')}>
    <input type="checkbox" class="task__check" id=${'task-' + t.id} checked=${!!t.done} onChange=${toggle} aria-label=${'完成：' + t.title} />
    <div class="task__body">
      <label class="task__title" for=${'task-' + t.id}>${t.title}</label>
      <div class="task__meta">
        ${t.courseCode ? html`<${CourseChip} code=${t.courseCode} short />` : null}
        ${t.minutes ? html`<span><${Icon} name="clock" size=${13} /> ${U.fmtMinutes(t.minutes)}</span>` : null}
        ${t.kind && TASK_KINDS[t.kind] ? html`<span>${TASK_KINDS[t.kind]}</span>` : null}
        ${!compact && U.isYmd(t.date) ? html`<span>${U.fmtDate(t.date)}</span>` : null}
        ${U.isYmd(t.due) ? html`<span class="task__due">截止 ${U.fmtDate(t.due)}</span>` : null}
        ${t.why ? html`<button type="button" class="link" onClick=${() => setOpen(!open)}>${open ? '收起' : '為什麼'}</button>` : null}
      </div>
      ${open ? html`<p class="task__why">${t.why}</p>` : null}
    </div>
    ${!compact
      ? html`<div class="task__actions">
          ${siblings && siblings.length > 1
            ? html`<button type="button" class="iconbtn" aria-label="上移" onClick=${() => move(-1)}><${Icon} name="up" size=${16} /></button>
                <button type="button" class="iconbtn" aria-label="下移" onClick=${() => move(1)}><${Icon} name="down" size=${16} /></button>`
            : null}
          <button type="button" class="iconbtn" aria-label="編輯" onClick=${() => setEditing(true)}><${Icon} name="edit" size=${16} /></button>
          <${ConfirmBtn} label="" confirm="刪除" kind="ghost" onConfirm=${() => Store.remove('tasks', t.id)} />
        </div>`
      : null}
  </li>`;
}

function TaskForm({ task, onDone, defaults = {} }) {
  const [f, setF] = useState(() => ({
    title: task ? task.title : '',
    courseCode: task ? task.courseCode || '' : defaults.courseCode || '',
    date: task ? task.date || '' : defaults.date || U.today(),
    minutes: task ? task.minutes || 30 : 30,
    kind: task ? task.kind || 'study' : 'study',
    priority: task ? task.priority || 2 : 2,
  }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return toast('寫一下要做什麼。', 'warn');
    const body = { ...f, title: f.title.trim(), courseCode: f.courseCode || null, date: f.date || null, minutes: Number(f.minutes) || 30, priority: Number(f.priority) || 2 };
    if (task) await Store.patch('tasks', task.id, body);
    else await Store.set('tasks', U.uid('t'), { ...body, done: false, source: 'manual', order: Date.now() % 100000, createdAt: U.nowIso() });
    onDone();
  };
  const id = task ? task.id : 'new';
  return html`<form class="task-form" onSubmit=${save}>
    <input id=${'tf-title-' + id} class="grow" value=${f.title} onInput=${set('title')} placeholder="例如：MATH7861：重做 Week 8 tutorial 第 3 題" />
    <div class="row wrap">
      <select id=${'tf-course-' + id} aria-label="課程" value=${f.courseCode} onChange=${set('courseCode')}>
        <option value="">通用</option>${Store.courses().map((c) => html`<option value=${c.code}>${c.code}</option>`)}</select>
      <input id=${'tf-date-' + id} aria-label="日期" type="date" value=${f.date} onInput=${set('date')} />
      <select id=${'tf-min-' + id} aria-label="時間" value=${f.minutes} onChange=${set('minutes')}>
        ${[15, 20, 30, 45, 60, 90, 120, 180].map((m) => html`<option value=${m}>${U.fmtMinutes(m)}</option>`)}</select>
      <select id=${'tf-kind-' + id} aria-label="類型" value=${f.kind} onChange=${set('kind')}>
        ${Object.entries(TASK_KINDS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select>
      <select id=${'tf-pri-' + id} aria-label="優先" value=${f.priority} onChange=${set('priority')}>
        <option value="1">優先</option><option value="2">一般</option><option value="3">有空再做</option></select>
      <${Btn} kind="primary" size="sm" type="submit" icon="check">${task ? '儲存' : '新增'}</${Btn}>
      <${Btn} kind="ghost" size="sm" onClick=${onDone}>取消</${Btn}>
    </div>
  </form>`;
}

function Timeline() {
  const s = useStore();
  const sem = s.settings.semester;
  const weeks = semesterWeeks(sem);
  const today = U.today();
  if (!weeks.length) return null;
  const items = [];
  for (const c of Store.courses()) {
    for (const a of c.assessments || []) if (U.isYmd(a.due)) items.push({ course: c.code, name: a.name, date: a.due, done: a.status === 'done' });
    if (c.exam && U.isYmd(c.exam.date)) items.push({ course: c.code, name: c.exam.name || '期末考', date: c.exam.date, exam: true });
  }
  const label = (w) => (w.phase === 'teaching' ? `W${w.week}` : { break: '假', revision: '複習', exam: '考試', gap: '—', after: '—' }[w.phase] || '');
  return html`<section class="timeline" aria-label="學期時間軸">
    <div class="timeline__scroll">
      <ol class="timeline__weeks" style=${{ gridTemplateColumns: `repeat(${weeks.length}, minmax(44px, 1fr))` }}>
        ${weeks.map((w) => {
          const isNow = today >= w.start && today <= w.end;
          const here = items.filter((it) => it.date >= w.start && it.date <= w.end);
          return html`<li key=${w.start} class=${U.cls('wk', 'wk--' + w.phase, isNow && 'is-now', today > w.end && 'is-past')} title=${`${U.fmtDate(w.start, { noWeekday: true })}–${U.fmtDate(w.end, { noWeekday: true })}`}>
            <span class="wk__label">${label(w)}</span>
            <span class="wk__date">${U.fmtDate(w.start, { noWeekday: true })}</span>
            <span class="wk__marks">${here.map(
              (it, i) => html`<i key=${i} class=${U.cls('mark', 'c-' + courseColor(it.course), it.exam && 'mark--exam', it.done && 'mark--done')} title=${`${it.course} ${it.name} · ${U.fmtDate(it.date)}`}></i>`
            )}</span>
            ${isNow ? html`<span class="wk__now">今天</span>` : null}
          </li>`;
        })}
      </ol>
    </div>
    <div class="timeline__legend small muted">
      ${Store.courses().map((c) => html`<span key=${c.code}><i class=${'mark c-' + (c.color || 'pen')}></i>${c.code}</span>`)}
      <span><i class="mark mark--exam"></i>考試</span>
      <span>${sem.name}</span>
    </div>
  </section>`;
}

function DeadlineList() {
  const s = useStore();
  const today = U.today();
  const rows = [];
  for (const c of Store.courses()) {
    for (const a of c.assessments || []) if (a.status !== 'done') rows.push({ c, name: a.name, date: a.due, weight: a.weight });
    if (c.exam) rows.push({ c, name: c.exam.name || '期末考', date: c.exam.date, weight: c.exam.weight, window: examWindowLabel(s.settings.semester) });
  }
  rows.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const upcoming = rows.filter((r) => !r.date || r.date >= U.addDays(today, -1));
  if (!upcoming.length) return html`<p class="muted">沒有未完成的評量。到課程頁的「評量與考試」新增。</p>`;
  return html`<ul class="deadlines">
    ${upcoming.map(
      (r, i) => html`<li key=${i} class="deadline">
        <${CourseChip} code=${r.c.code} short />
        <button type="button" class="deadline__name link-plain" onClick=${() => go('courses', { course: r.c.code, tab: 'assess' })}>${r.name}${r.weight ? html` <span class="muted">${r.weight}%</span>` : null}</button>
        <span class="deadline__date">${r.date ? U.fmtDate(r.date) : r.window || '未定'}</span>
        ${r.date ? html`<${DaysLeft} date=${r.date} />` : null}
      </li>`
    )}
  </ul>
  ${s.courses.some((c) => c.verified === false) ? html`<p class="small muted">部分日期依過往課綱整理，標記「待核對」的請對照本學期 ECP。</p>` : null}`;
}

function AIPlanner({ onClose }) {
  const s = useStore();
  const rt = useRuntime();
  const ai = useAI();
  const today = U.today();
  const examEnd = s.settings.semester.examEnd;
  const [range, setRange] = useState('14');
  const [mins, setMins] = useState({ ...s.settings.minutes });
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [keep, setKeep] = useState({});
  const [replace, setReplace] = useState(true);
  const to = range === 'exam' && U.isYmd(examEnd) ? examEnd : U.addDays(today, Number(range) - 1);
  const from = today;

  const generate = () =>
    ai.run(async ({ signal, onProgress }) => {
      if (mins.weekday !== s.settings.minutes.weekday || mins.weekend !== s.settings.minutes.weekend)
        await Store.patch('meta', 'settings', { minutes: { weekday: Number(mins.weekday) || 60, weekend: Number(mins.weekend) || 60 } });
      const r = await AI.plan({ from, to, focusNote: note.trim(), signal, onProgress });
      setPreview(r);
      setKeep(Object.fromEntries(r.tasks.map((_, i) => [i, true])));
    });

  const apply = async () => {
    const chosen = preview.tasks.filter((_, i) => keep[i]);
    if (replace) {
      const old = s.tasks.filter((t) => t.source === 'ai-plan' && !t.done && U.isYmd(t.date) && t.date >= from && t.date <= to);
      for (const t of old) await Store.remove('tasks', t.id);
    }
    let k = 0;
    for (const t of chosen) await Store.set('tasks', U.uid('t'), { ...t, done: false, priority: 2, order: k++, source: 'ai-plan', createdAt: U.nowIso() });
    await Store.set('meta', 'plan', { advice_zh: preview.advice_zh, weeks: preview.weeks, from, to, generatedAt: U.nowIso() });
    toast(`已加入 ${chosen.length} 項任務`, 'ok');
    setPreview(null);
    onClose();
  };

  const byDate = preview ? U.groupBy(preview.tasks.map((t, i) => ({ ...t, i })), (t) => t.date) : null;
  return html`<section class="panel stack">
    <div class="row between"><h3 class="panel__title">請書僮排計畫</h3><${Btn} kind="ghost" size="sm" icon="x" onClick=${onClose}>關閉</${Btn}></div>
    <${AIGate} />
    ${!preview
      ? html`<div class="form-grid">
          <${Field} label="排到" id="ap-range"><select id="ap-range" value=${range} onChange=${(e) => setRange(e.target.value)}>
            <option value="7">未來 7 天</option><option value="14">未來 14 天</option>${U.isYmd(examEnd) ? html`<option value="exam">考試結束（${U.fmtDate(examEnd)}）</option>` : null}</select></${Field}>
          <${Field} label="平日可讀（分鐘）" id="ap-wd"><input id="ap-wd" type="number" min="15" step="15" value=${mins.weekday} onInput=${(e) => setMins({ ...mins, weekday: Number(e.target.value) })} /></${Field}>
          <${Field} label="週末可讀（分鐘）" id="ap-we"><input id="ap-we" type="number" min="15" step="15" value=${mins.weekend} onInput=${(e) => setMins({ ...mins, weekend: Number(e.target.value) })} /></${Field}>
          <${Field} label="想跟書僮說的（選填）" id="ap-note" hint="例如：CYBR7001 小組報告 10/16 要交、週三晚上要打工、MATH7861 Week 8 還不熟">
            <textarea id="ap-note" rows="3" value=${note} onInput=${(e) => setNote(e.target.value)}></textarea></${Field}>
          <div class="form-actions"><${Btn} kind="primary" icon="spark" disabled=${ai.busy || rt.ai !== 'ready'} onClick=${generate}>產生計畫</${Btn}></div>
        </div>`
      : html`<div class="stack">
          <p>${preview.advice_zh}</p>
          ${preview.weeks.length ? html`<ul class="weeks">${preview.weeks.map((w, i) => html`<li key=${i}><b>${w.label}</b> ${w.focus_zh}</li>`)}</ul>` : null}
          <div class="plan-preview">
            ${[...byDate].map(
              ([d, ts]) => html`<div key=${d} class="plan-day">
                <div class="plan-day__date">${U.fmtDate(d)} <span class="muted small">${U.fmtMinutes(U.sum(ts.map((t) => t.minutes)))}</span></div>
                <ul>${ts.map(
                  (t) => html`<li key=${t.i}><label class="check">
                    <input type="checkbox" id=${'pp-' + t.i} checked=${!!keep[t.i]} onChange=${(e) => setKeep({ ...keep, [t.i]: e.target.checked })} />
                    ${t.courseCode ? html`<${CourseChip} code=${t.courseCode} short />` : null}
                    <span>${t.title}</span><span class="muted small">${U.fmtMinutes(t.minutes)}</span>
                  </label>${t.why ? html`<div class="muted small plan-why">${t.why}</div>` : null}</li>`
                )}</ul>
              </div>`
            )}
          </div>
          <label class="check"><input type="checkbox" id="ap-replace" checked=${replace} onChange=${(e) => setReplace(e.target.checked)} /> 取代這段期間內，之前書僮排的未完成任務</label>
          <div class="row wrap">
            <${Btn} kind="primary" icon="check" onClick=${apply}>加入 ${Object.values(keep).filter(Boolean).length} 項任務</${Btn}>
            <${Btn} kind="ghost" onClick=${generate} disabled=${ai.busy}>重新產生</${Btn}>
            <${Btn} kind="ghost" onClick=${() => setPreview(null)}>修改條件</${Btn}>
          </div>
        </div>`}
    <${Thinking} ai=${ai} label="書僮排計畫中" detail="大約 30-90 秒" />
    <${AIError} ai=${ai} onRetry=${generate} />
  </section>`;
}

function InfoParser({ onClose }) {
  const rt = useRuntime();
  const ai = useAI();
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [pickA, setPickA] = useState({});
  const [pickT, setPickT] = useState({});

  const analyze = () =>
    ai.run(async ({ signal, onProgress }) => {
      if (text.trim().length < 20) throw new Error('貼上的內容太短了。');
      const r = await AI.parseInfo({ text, signal, onProgress });
      setRes(r);
      setPickA(Object.fromEntries(r.assessments.map((a, i) => [i, !!a.courseCode])));
      setPickT(Object.fromEntries(r.tasks.map((_, i) => [i, true])));
    });

  const apply = async () => {
    let na = 0;
    let nt = 0;
    const byCourse = U.groupBy(res.assessments.filter((a, i) => pickA[i] && a.courseCode), (a) => a.courseCode);
    for (const [code, list] of byCourse) {
      const c = Store.course(code);
      if (!c) continue;
      const cur = (c.assessments || []).slice();
      for (const a of list) {
        if (a.kind === 'exam' && /final|期末|end of semester/i.test(a.name)) {
          await Store.patch('courses', code, { exam: { ...(c.exam || {}), name: c.exam && c.exam.name ? c.exam.name : '期末考', date: a.due || (c.exam && c.exam.date) || null, weight: a.weight ?? (c.exam && c.exam.weight) ?? null, note: a.note || (c.exam && c.exam.note) || '' } });
          na++;
          continue;
        }
        const key = a.name.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
        const idx = cur.findIndex((x) => {
          const k = String(x.name || '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
          return k && key && (k.includes(key) || key.includes(k));
        });
        const merged = { kind: a.kind, note: a.note, ...(idx >= 0 ? cur[idx] : { id: U.uid('a'), status: 'todo' }), name: a.name };
        if (a.due) merged.due = a.due;
        if (a.weight != null) merged.weight = a.weight;
        if (a.time) merged.time = a.time;
        if (idx >= 0) cur[idx] = merged;
        else cur.push(merged);
        na++;
      }
      await Store.patch('courses', code, { assessments: cur, updatedAt: U.nowIso() });
    }
    let k = 0;
    for (const [i, t] of res.tasks.entries()) {
      if (!pickT[i]) continue;
      await Store.set('tasks', U.uid('t'), {
        title: t.title,
        courseCode: t.courseCode,
        date: t.due ? U.addDays(t.due, -2) < U.today() ? U.today() : U.addDays(t.due, -2) : null,
        due: t.due,
        minutes: t.minutes,
        priority: t.priority,
        why: t.why,
        kind: 'assignment',
        done: false,
        order: k++,
        source: 'ai-parse',
        createdAt: U.nowIso(),
      });
      nt++;
    }
    toast(`更新 ${na} 項評量、加入 ${nt} 項待辦`, 'ok');
    onClose();
  };

  return html`<section class="panel stack">
    <div class="row between"><h3 class="panel__title">整理課程公告</h3><${Btn} kind="ghost" size="sm" icon="x" onClick=${onClose}>關閉</${Btn}></div>
    <${AIGate} />
    ${!res
      ? html`<${Field} label="貼上雜亂的資訊" id="ip-text" hint="Learn.UQ 公告、作業說明、ECP 的 Assessment 表格、老師的 email 都可以，一次貼好幾段也行。">
          <textarea id="ip-text" rows="9" value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
        </${Field}>
        <div class="form-actions"><${Btn} kind="primary" icon="spark" disabled=${ai.busy || rt.ai !== 'ready'} onClick=${analyze}>幫我整理</${Btn}></div>`
      : html`<div class="stack">
          ${res.assessments.length
            ? html`<div><h4>評量 / 考試</h4><ul class="parse-list">${res.assessments.map(
                (a, i) => html`<li key=${i}><label class="check">
                  <input type="checkbox" id=${'ip-a-' + i} checked=${!!pickA[i]} disabled=${!a.courseCode} onChange=${(e) => setPickA({ ...pickA, [i]: e.target.checked })} />
                  ${a.courseCode ? html`<${CourseChip} code=${a.courseCode} short />` : html`<span class="chip chip--muted">課程不明</span>`}
                  <span><b>${a.name}</b> ${a.weight ? `${a.weight}% ` : ''}${a.due ? `· ${U.fmtDate(a.due)}${a.time ? ' ' + a.time : ''}` : '· 日期未知'}</span>
                </label>${a.note ? html`<div class="muted small">${a.note}</div>` : null}</li>`
              )}</ul></div>`
            : null}
          ${res.tasks.length
            ? html`<div><h4>待辦（依建議順序）</h4><ul class="parse-list">${res.tasks.map(
                (t, i) => html`<li key=${i}><label class="check">
                  <input type="checkbox" id=${'ip-t-' + i} checked=${!!pickT[i]} onChange=${(e) => setPickT({ ...pickT, [i]: e.target.checked })} />
                  <span class=${'prio prio--' + t.priority}>${['', '先做', '一般', '可晚點'][t.priority]}</span>
                  ${t.courseCode ? html`<${CourseChip} code=${t.courseCode} short />` : null}
                  <span>${t.title}</span>
                  <span class="muted small">${U.fmtMinutes(t.minutes)}${t.due ? ' · 截止 ' + U.fmtDate(t.due) : ''}</span>
                </label>${t.why ? html`<div class="muted small plan-why">${t.why}</div>` : null}</li>`
              )}</ul></div>`
            : null}
          ${res.notes_zh ? html`<div class="notice">${res.notes_zh}</div>` : null}
          <div class="row wrap">
            <${Btn} kind="primary" icon="check" onClick=${apply}>套用</${Btn}>
            <${Btn} kind="ghost" onClick=${() => setRes(null)}>重新貼上</${Btn}>
          </div>
        </div>`}
    <${Thinking} ai=${ai} label="書僮整理中" />
    <${AIError} ai=${ai} onRetry=${analyze} />
  </section>`;
}
