/* view-courses.js — 課程: course list, course detail (materials, assessments, methods), upload + 導讀. */

const ASSESS_STATUS = { todo: '未開始', doing: '進行中', done: '已完成' };

function guessKind(name) {
  const n = name.toLowerCase();
  if (/(exam|past|sample|final|mid-?sem|quiz)/.test(n)) return 'exam';
  if (/(tut|prac|applied|lab|workshop|exercise)/.test(n)) return 'tutorial';
  if (/(assign|a\d\b|spec|project|report)/.test(n)) return 'assignment';
  if (/(note|summary|筆記)/.test(n)) return 'notes';
  return 'lecture';
}
function guessWeek(name) {
  const m = name.match(/(?:week|wk|lecture|lec|tutorial|tut|w|l)[\s_\-.]*0?(\d{1,2})(?!\d)/i);
  const n = m ? Number(m[1]) : null;
  return n && n <= 14 ? n : null;
}
const baseName = (name) => name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();

/** Split text into parts that fit one db document (256 KiB). */
function splitForStorage(text, maxBytes = 220000) {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= maxBytes) return [text];
  const parts = [];
  let buf = '';
  for (const c of Extract.chunks(text, 4000)) {
    if (enc.encode(buf + c).length > maxBytes && buf) {
      parts.push(buf);
      buf = c;
    } else buf = buf ? buf + '\n' + c : c;
  }
  if (buf) parts.push(buf);
  return parts;
}

async function saveMaterial({ courseCode, title, kind, week, text, source }) {
  const parts = splitForStorage(text);
  const ids = [];
  for (let i = 0; i < parts.length; i++) {
    const id = U.uid('m');
    await Store.setText(id, parts[i]);
    await Store.set('materials', id, {
      courseCode,
      title: parts.length > 1 ? `${title}（${i + 1}/${parts.length}）` : title,
      kind,
      week: week || null,
      source: { ...(source || {}), chars: parts[i].length },
      summary: null,
      createdAt: U.nowIso(),
      updatedAt: U.nowIso(),
    });
    ids.push(id);
  }
  return ids;
}

async function addTermCards(material, terms) {
  const existing = new Set(Store.state.cards.filter((c) => c.courseCode === material.courseCode).map((c) => c.front.trim().toLowerCase()));
  let added = 0;
  for (const t of terms) {
    if (existing.has(t.term.trim().toLowerCase())) continue;
    const id = U.uid('k');
    await Store.set('cards', id, {
      courseCode: material.courseCode,
      kind: 'term',
      front: t.term,
      back: `${t.zh}\n${t.def_en}`,
      extra: { zh: t.zh, def: t.def_en, example: t.example_en },
      source: { type: 'summary', materialId: material.id },
      srs: SRS.fresh(),
      createdAt: U.nowIso(),
    });
    existing.add(t.term.trim().toLowerCase());
    added++;
  }
  return added;
}

/* ---------- list ---------- */
function CoursesView({ params }) {
  const s = useStore();
  const [adding, setAdding] = useState(!!params.add);
  if (params.course && Store.course(params.course)) return html`<${CourseDetail} code=${params.course} params=${params} />`;
  const today = U.today();
  return html`<div class="view">
    <header class="page-head">
      <div><p class="eyebrow">${s.settings.semester.name}</p><h1 class="page-title">課程</h1></div>
      <${Btn} kind="ghost" icon="plus" onClick=${() => setAdding(!adding)}>新增課程</${Btn}>
    </header>
    ${adding ? html`<${CourseForm} onDone=${() => setAdding(false)} />` : null}
    ${!s.courses.length && s.loaded && !adding
      ? html`<${Empty} icon="courses" title="還沒有課程" action=${html`<${Btn} kind="primary" icon="plus" onClick=${() => setAdding(true)}>新增課程</${Btn}>`}>
          加入課程代碼、名稱和類型（程式 / 數學 / 理論），書僮會依類型決定出題方式。
        </${Empty}>`
      : null}
    <div class="course-grid">
      ${Store.courses().map((c) => {
        const mats = s.materials.filter((m) => m.courseCode === c.code);
        const cards = s.cards.filter((k) => k.courseCode === c.code);
        const due = cards.filter((k) => SRS.isDue(k, today)).length;
        const turns = s.sessions.filter((x) => x.courseCode === c.code).flatMap((x) => x.turns || []).filter((t) => t.fb);
        const clear = turns.length ? turns.filter((t) => t.fb.understanding === 'clear').length / turns.length : 0;
        const next = nextDeadlines(today).find((d) => d.course === c.code);
        return html`<button type="button" key=${c.code} class=${'course-card c-' + (c.color || 'pen')} onClick=${() => go('courses', { course: c.code })}>
          <span class="course-card__tab">${c.code}</span>
          <span class="course-card__name">${c.name}</span>
          <span class="course-card__zh">${c.nameZh || ''} <span class="kind">${(COURSE_KINDS[c.kind] || {}).label || ''}</span>${c.preview ? html`<span class="kind kind--pen">預習</span>` : null}</span>
          <span class="course-card__stats">
            <span><b>${mats.length}</b> 份講義</span><span><b>${cards.length}</b> 張卡片</span><span><b>${due}</b> 張到期</span>
          </span>
          <span class="course-card__mastery">
            <${Progress} value=${clear} tone="ok" label="問答清楚比例" />
            <span class="small muted">${turns.length ? `問答清楚 ${Math.round(clear * 100)}%（${turns.length} 題）` : '還沒有問答紀錄'}</span>
          </span>
          <span class="course-card__next">${next ? html`${next.name} · ${next.date ? U.fmtDate(next.date) : `${next.window}（日期未定）`} ${next.date ? html`<${DaysLeft} date=${next.date} />` : null}` : '沒有近期評量'}</span>
        </button>`;
      })}
    </div>
  </div>`;
}

function CourseForm({ course, onDone }) {
  const editing = !!course;
  const [f, setF] = useState(() => ({
    code: course ? course.code : '',
    name: course ? course.name : '',
    nameZh: course ? course.nameZh || '' : '',
    kind: course ? course.kind : 'theory',
    color: course ? course.color || 'pen' : COURSE_COLORS[Store.state.courses.length % COURSE_COLORS.length],
  }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    const code = f.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code) return toast('請輸入課程代碼，例如 CSSE7030。', 'warn');
    if (!editing && Store.course(code)) return toast(`${code} 已經存在。`, 'warn');
    const base = course || { assessments: [], topics: [], order: Store.state.courses.length + 1, createdAt: U.nowIso() };
    await Store.set('courses', code, { ...base, code, name: f.name.trim() || code, nameZh: f.nameZh.trim(), kind: f.kind, color: f.color, updatedAt: U.nowIso() });
    toast(editing ? '已更新課程' : `已新增 ${code}`, 'ok');
    onDone && onDone(code);
  };
  return html`<form class="panel form-grid" onSubmit=${save}>
    <${Field} label="課程代碼" id="cf-code"><input id="cf-code" value=${f.code} onInput=${set('code')} placeholder="CSSE7030" disabled=${editing} /></${Field}>
    <${Field} label="英文名稱" id="cf-name"><input id="cf-name" value=${f.name} onInput=${set('name')} placeholder="Introduction to Programming" /></${Field}>
    <${Field} label="中文名稱" id="cf-zh"><input id="cf-zh" value=${f.nameZh} onInput=${set('nameZh')} placeholder="程式設計入門" /></${Field}>
    <${Field} label="課程類型" id="cf-kind" hint="決定書僮的出題方式">
      <select id="cf-kind" value=${f.kind} onChange=${set('kind')}>
        ${Object.entries(COURSE_KINDS).map(([k, v]) => html`<option value=${k}>${v.label}（${v.en}）</option>`)}
      </select>
    </${Field}>
    <div class="field"><span class="field__label">顏色</span>
      <div class="swatches">${COURSE_COLORS.map(
        (c) => html`<button type="button" class=${U.cls('swatch', 'c-' + c, f.color === c && 'is-on')} aria-label=${c} onClick=${() => setF({ ...f, color: c })}></button>`
      )}</div>
    </div>
    <div class="form-actions"><${Btn} kind="primary" type="submit" icon="check">${editing ? '儲存' : '新增'}</${Btn}>
      ${onDone ? html`<${Btn} kind="ghost" onClick=${() => onDone()}>取消</${Btn}>` : null}</div>
  </form>`;
}

/* ---------- detail ---------- */
function CourseDetail({ code, params }) {
  const s = useStore();
  const c = Store.course(code);
  const [tab, setTab] = useState(params.tab || (params.material ? 'materials' : 'materials'));
  const [openMat, setOpenMat] = useState(params.material || null);
  const [uploading, setUploading] = useState(!!params.upload);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setOpenMat(params.material || null);
    if (params.tab) setTab(params.tab);
    if (params.upload) {
      setUploading(true);
      setTab('materials');
    }
  }, [Router.state.seq]);
  if (!c) return null;
  const mats = s.materials
    .filter((m) => m.courseCode === code)
    .sort((a, b) => (b.week || 0) - (a.week || 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const mat = openMat && mats.find((m) => m.id === openMat);
  return html`<div class="view">
    <nav class="crumbs"><button type="button" class="link" onClick=${() => go('courses')}>課程</button><span>/</span><span>${c.code}</span></nav>
    <header class=${'course-head c-' + (c.color || 'pen')}>
      <span class="course-head__tab">${c.code}</span>
      <div class="course-head__text">
        <h1 class="page-title">${c.name}</h1>
        <p class="muted">${c.nameZh || ''} · ${(COURSE_KINDS[c.kind] || {}).label || ''}課${c.note ? ' · ' + c.note : ''}</p>
      </div>
      <div class="course-head__actions">
        <${Btn} kind="primary" icon="tutor" onClick=${() => go('tutor', { course: c.code })}>書僮問答</${Btn}>
        <${Btn} kind="ghost" icon="practice" onClick=${() => go('practice', { course: c.code, tab: 'quiz' })}>出題</${Btn}>
        <${Btn} kind="ghost" icon="edit" onClick=${() => setEditing(!editing)}>編輯</${Btn}>
      </div>
    </header>
    ${editing ? html`<${CourseForm} course=${c} onDone=${() => setEditing(false)} />` : null}
    ${mat
      ? html`<${MaterialView} material=${mat} course=${c} onClose=${() => setOpenMat(null)} />`
      : html`
        <${Tabs} value=${tab} onChange=${setTab} label="課程分頁" tabs=${[
          { id: 'materials', label: '講義', count: mats.length },
          { id: 'preview', label: c.preview ? '預習 ●' : '預習' },
          { id: 'assess', label: '評量與考試', count: (c.assessments || []).length },
          { id: 'method', label: '讀書方法' },
        ]} />
        ${tab === 'materials'
          ? html`<div class="stack">
              ${uploading
                ? html`<${UploadPanel} course=${c} onDone=${(ids) => {
                    setUploading(false);
                    if (ids && ids.length === 1) setOpenMat(ids[0]);
                  }} />`
                : html`<div class="row"><${Btn} kind="primary" icon="upload" onClick=${() => setUploading(true)}>新增講義 / 考古題</${Btn}>
                    <span class="muted small">PDF、PPTX、DOCX、TXT，或直接貼上文字</span></div>`}
              ${mats.length
                ? html`<ul class="mat-list">${mats.map((m) => html`<${MaterialRow} key=${m.id} m=${m} onOpen=${() => setOpenMat(m.id)} />`)}</ul>`
                : !uploading
                  ? html`<${Empty} icon="upload" title="這門課還沒有講義">上傳投影片或貼上筆記，書僮會先幫你整理「老師為什麼要教這個」，再一題一題問你。</${Empty}>`
                  : null}
            </div>`
          : null}
        ${tab === 'preview' ? html`<${CoursePreview} key=${Router.state.seq} course=${c} params=${params} />` : null}
        ${tab === 'assess' ? html`<${AssessmentEditor} course=${c} />` : null}
        ${tab === 'method' ? html`<${CourseMethods} course=${c} />` : null}
      `}
  </div>`;
}

function MaterialRow({ m, onOpen }) {
  return html`<li class="mat">
    <button type="button" class="mat__main" onClick=${onOpen}>
      <span class="mat__week">${m.week ? 'W' + m.week : '—'}</span>
      <span class="mat__text">
        <span class="mat__title">${m.title}</span>
        <span class="mat__meta">${MATERIAL_KINDS[m.kind] || m.kind} · ${U.fmtChars((m.source && m.source.chars) || 0)}${m.source && m.source.units ? ` · ${m.source.units} ${m.source.unitLabel || '頁'}` : ''}</span>
      </span>
      ${m.summary ? html`<${Pill} tone="ok">已導讀</${Pill}>` : html`<${Pill} tone="muted">未導讀</${Pill}>`}
    </button>
  </li>`;
}

/* ---------- upload ---------- */
function UploadPanel({ course, onDone }) {
  const [mode, setMode] = useState('file');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState({ title: '', kind: 'notes', week: '', text: '' });
  const ocr = useAI();
  const rt = useRuntime();

  const update = (i, patch) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const addFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const start = items.length;
    setItems((xs) => [
      ...xs,
      ...list.map((f) => ({ file: f, title: baseName(f.name), kind: guessKind(f.name), week: guessWeek(f.name) || '', status: 'reading', progress: '' })),
    ]);
    for (let k = 0; k < list.length; k++) {
      const i = start + k;
      try {
        const r = await Extract.extractFile(list[k], (n, total) => update(i, { progress: `${n}/${total}` }));
        update(i, { status: 'ready', result: r, progress: '' });
      } catch (e) {
        update(i, { status: 'error', error: e.message || String(e) });
      }
    }
  };

  const runOcr = (i) => {
    const it = items[i];
    const max = (rt.images && rt.images.maxCount) || 4;
    ocr.run(async ({ signal, onProgress }) => {
      let text = '';
      if (it.result.kind === 'image') {
        text = await AI.transcribe({ images: [it.file], hint: it.title, signal, onProgress });
      } else {
        const total = it.result.units;
        const limit = Math.min(total, max * 4);
        for (let p = 1; p <= limit; p += max) {
          const pages = Array.from({ length: Math.min(max, limit - p + 1) }, (_, k) => p + k);
          update(i, { progress: `辨識第 ${pages[0]}-${pages[pages.length - 1]} 頁` });
          const { blobs } = await Extract.pdfPageImages(it.file, pages);
          const part = await AI.transcribe({ images: blobs, hint: `${it.title}, pages ${pages[0]}-${pages[pages.length - 1]}`, signal, onProgress });
          text += (text ? '\n\n' : '') + part.replace(/\[Page (\d+)\]/g, (_, n) => `[Page ${pages[0] + Number(n) - 1}]`);
        }
        if (limit < total) text += `\n\n（只辨識了前 ${limit} 頁，共 ${total} 頁）`;
      }
      update(i, { result: { ...it.result, text: Extract.tidy(text), scanned: false, ocr: true }, progress: '' });
    });
  };

  const saveAll = async () => {
    setBusy(true);
    const ids = [];
    try {
      for (const it of items) {
        if (it.status !== 'ready' || !it.result.text.trim()) continue;
        const got = await saveMaterial({
          courseCode: course.code,
          title: it.title.trim() || baseName(it.file.name),
          kind: it.kind,
          week: Number(it.week) || null,
          text: it.result.text,
          source: { name: it.file.name, type: it.result.kind, units: it.result.units, unitLabel: it.result.unitLabel, ocr: !!it.result.ocr },
        });
        ids.push(...got);
      }
      toast(ids.length ? `已存入 ${ids.length} 份資料` : '沒有可存的內容', ids.length ? 'ok' : 'warn');
      if (ids.length) onDone(ids);
    } catch (e) {
      toast('儲存失敗：' + (e.message || RT.dbErrorText(e)), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const savePaste = async () => {
    if (paste.text.trim().length < 40) return toast('內容太短了，至少貼一段完整的文字。', 'warn');
    setBusy(true);
    try {
      const ids = await saveMaterial({
        courseCode: course.code,
        title: paste.title.trim() || `${course.code} 筆記 ${U.fmtDate(U.today(), { noWeekday: true })}`,
        kind: paste.kind,
        week: Number(paste.week) || null,
        text: Extract.tidy(paste.text),
        source: { name: '貼上的文字', type: 'paste', units: 1, unitLabel: '段文字' },
      });
      toast('已存入', 'ok');
      onDone(ids);
    } finally {
      setBusy(false);
    }
  };

  const ready = items.filter((x) => x.status === 'ready' && x.result.text.trim()).length;

  return html`<div class="panel upload">
    <div class="row between">
      <${Tabs} value=${mode} onChange=${setMode} label="新增方式" tabs=${[{ id: 'file', label: '上傳檔案' }, { id: 'paste', label: '貼上文字' }]} />
      <${Btn} kind="ghost" size="sm" icon="x" onClick=${() => onDone(null)}>關閉</${Btn}>
    </div>
    ${mode === 'file'
      ? html`
        <label for="up-file" class=${U.cls('drop', drag && 'is-drag')}
          onDragOver=${(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave=${() => setDrag(false)}
          onDrop=${(e) => {
            e.preventDefault();
            setDrag(false);
            addFiles(e.dataTransfer.files);
          }}>
          <${Icon} name="upload" size=${28} />
          <span class="drop__title">把講義拖到這裡，或點一下選檔案</span>
          <span class="drop__hint">PDF · PPTX（含講者備註）· DOCX · TXT/MD · 圖片。檔案只在你的瀏覽器裡讀取，雲端只存文字。</span>
        </label>
        <input id="up-file" type="file" multiple hidden accept=".pdf,.pptx,.docx,.txt,.md,.py,image/*"
          onChange=${(e) => (addFiles(e.target.files), (e.target.value = ''))} />
        ${items.length
          ? html`<ul class="up-list">
              ${items.map(
                (it, i) => html`<li key=${i} class="up">
                  <div class="up__file"><b>${it.file.name}</b>
                    <span class="muted small">
                      ${it.status === 'reading' ? `讀取中 ${it.progress}` : null}
                      ${it.status === 'error' ? html`<span class="bad">${it.error}</span>` : null}
                      ${it.status === 'ready' ? `${it.result.units} ${it.result.unitLabel} · ${U.fmtChars(it.result.text.length)}` : null}
                      ${it.progress && it.status === 'ready' ? ` · ${it.progress}` : ''}
                    </span>
                  </div>
                  ${it.status === 'ready' && it.result.scanned
                    ? html`<div class="notice notice--warn">
                        ${it.result.kind === 'image' ? '圖片需要用 AI 轉成文字。' : '這份 PDF 幾乎沒有文字，可能是掃描檔。'}
                        ${rt.images
                          ? html`<${Btn} kind="ghost" size="sm" icon="spark" disabled=${ocr.busy} onClick=${() => runOcr(i)}>用 AI 辨識文字</${Btn}>`
                          : html`<span>請在 claude.ai 開啟，才能用 AI 辨識。</span>`}
                      </div>`
                    : null}
                  ${it.status === 'ready'
                    ? html`<div class="up__fields">
                        <input aria-label="標題" id=${'up-title-' + i} value=${it.title} onInput=${(e) => update(i, { title: e.target.value })} />
                        <select aria-label="類型" id=${'up-kind-' + i} value=${it.kind} onChange=${(e) => update(i, { kind: e.target.value })}>
                          ${Object.entries(MATERIAL_KINDS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}
                        </select>
                        <input aria-label="第幾週" id=${'up-week-' + i} class="w-week" type="number" min="1" max="14" placeholder="週" value=${it.week}
                          onInput=${(e) => update(i, { week: e.target.value })} />
                        <button type="button" class="link" onClick=${() => setItems(items.filter((_, j) => j !== i))}>移除</button>
                      </div>`
                    : null}
                </li>`
              )}
            </ul>
            <${Thinking} ai=${ocr} label="AI 辨識中" />
            <${AIError} ai=${ocr} />
            <div class="form-actions">
              <${Btn} kind="primary" icon="check" disabled=${!ready || busy} onClick=${saveAll}>${busy ? '儲存中…' : `儲存 ${ready} 份`}</${Btn}>
            </div>`
          : null}`
      : html`<div class="form-grid">
          <${Field} label="標題" id="pa-title"><input id="pa-title" value=${paste.title} onInput=${(e) => setPaste({ ...paste, title: e.target.value })} placeholder="例如：Week 9 — Graph theory 筆記" /></${Field}>
          <${Field} label="類型" id="pa-kind"><select id="pa-kind" value=${paste.kind} onChange=${(e) => setPaste({ ...paste, kind: e.target.value })}>
            ${Object.entries(MATERIAL_KINDS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></${Field}>
          <${Field} label="第幾週" id="pa-week"><input id="pa-week" type="number" min="1" max="14" value=${paste.week} onInput=${(e) => setPaste({ ...paste, week: e.target.value })} /></${Field}>
          <${Field} label="內容" id="pa-text" hint="可以貼 Echo360 逐字稿、Notion/OneNote 筆記、作業說明"><textarea id="pa-text" rows="10" value=${paste.text}
            onInput=${(e) => setPaste({ ...paste, text: e.target.value })}></textarea></${Field}>
          <div class="form-actions"><${Btn} kind="primary" icon="check" disabled=${busy} onClick=${savePaste}>儲存</${Btn}></div>
        </div>`}
  </div>`;
}

/* ---------- material + 導讀 ---------- */
function MaterialView({ material: m, course, onClose }) {
  const ai = useAI();
  const rt = useRuntime();
  const [showText, setShowText] = useState(false);
  const [text, setText] = useState(null);
  const [edit, setEdit] = useState(false);
  const [meta, setMeta] = useState({ title: m.title, kind: m.kind, week: m.week || '' });
  const sm = m.summary;

  const generate = () =>
    ai.run(async ({ signal, onProgress }) => {
      const t = await Store.getText(m.id);
      if (!t.trim()) throw new Error('這份資料沒有文字內容。');
      const summary = await AI.summarize({ course, material: m, text: t, signal, onProgress });
      await Store.patch('materials', m.id, { summary, summaryAt: U.nowIso(), updatedAt: U.nowIso() });
      toast('導讀完成', 'ok');
    });

  const loadText = async () => {
    setShowText(!showText);
    if (text == null) setText(await Store.getText(m.id));
  };

  const addAllTerms = async () => {
    const n = await addTermCards(m, sm.key_terms);
    toast(n ? `加入 ${n} 張名詞卡` : '這些名詞都已經在卡片裡了', n ? 'ok' : 'info');
  };

  const remove = async () => {
    await Store.remove('materials', m.id);
    await Store.removeText(m.id);
    toast('已刪除', 'ok');
    onClose();
  };

  const saveMeta = async () => {
    await Store.patch('materials', m.id, { title: meta.title.trim() || m.title, kind: meta.kind, week: Number(meta.week) || null, updatedAt: U.nowIso() });
    setEdit(false);
  };

  return html`<article class="material">
    <div class="row between wrap">
      <button type="button" class="link" onClick=${onClose}>← 回到講義列表</button>
      <div class="row wrap">
        <${Btn} kind="ghost" size="sm" icon="edit" onClick=${() => setEdit(!edit)}>編輯</${Btn}>
        <${ConfirmBtn} label="刪除" onConfirm=${remove} />
      </div>
    </div>
    ${edit
      ? html`<div class="panel form-grid">
          <${Field} label="標題" id="me-title"><input id="me-title" value=${meta.title} onInput=${(e) => setMeta({ ...meta, title: e.target.value })} /></${Field}>
          <${Field} label="類型" id="me-kind"><select id="me-kind" value=${meta.kind} onChange=${(e) => setMeta({ ...meta, kind: e.target.value })}>
            ${Object.entries(MATERIAL_KINDS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></${Field}>
          <${Field} label="第幾週" id="me-week"><input id="me-week" type="number" min="1" max="14" value=${meta.week} onInput=${(e) => setMeta({ ...meta, week: e.target.value })} /></${Field}>
          <div class="form-actions"><${Btn} kind="primary" icon="check" onClick=${saveMeta}>儲存</${Btn}></div>
        </div>`
      : null}
    <header class="material__head">
      <p class="eyebrow">${MATERIAL_KINDS[m.kind] || ''}${m.week ? ` · 第 ${m.week} 週` : ''} · ${U.fmtChars((m.source && m.source.chars) || 0)}</p>
      <h2 class="material__title">${sm && sm.title_en ? sm.title_en : m.title}</h2>
      ${sm && sm.title_zh ? html`<p class="material__zh">${sm.title_zh} · <span class="muted">${m.title}</span></p>` : null}
    </header>

    <div class="row wrap">
      <${Btn} kind="primary" icon="tutor" onClick=${() => go('tutor', { course: course.code, materials: [m.id] })}>開始書僮問答</${Btn}>
      <${Btn} kind="ghost" icon="practice" onClick=${() => go('practice', { course: course.code, materials: [m.id], tab: 'quiz' })}>用這份出題</${Btn}>
      <${Btn} kind="ghost" icon="courses" onClick=${loadText}>${showText ? '收起原文' : '看原文'}</${Btn}>
    </div>

    ${showText ? html`<pre class="rawtext">${text == null ? '載入中…' : text || '（沒有文字）'}</pre>` : null}

    <${AIGate} />
    ${!sm
      ? html`<div class="panel guide-cta">
          <h3>先讀導讀，再讀講義</h3>
          <p>書僮會用英文整理這份講義：在講什麼、老師為什麼要教、你要學會什麼、關鍵名詞和可能的考法，每段附中文。</p>
          <${Btn} kind="primary" icon="spark" disabled=${ai.busy || rt.ai !== 'ready'} onClick=${generate}>產生導讀</${Btn}>
          <${Thinking} ai=${ai} label="書僮正在讀講義" detail="長的講義可能要 1-2 分鐘" />
          <${AIError} ai=${ai} onRetry=${generate} />
        </div>`
      : html`<${GuideView} sm=${sm} material=${m} onRegenerate=${generate} ai=${ai} onAddTerms=${addAllTerms} />`}
  </article>`;
}

function GuideView({ sm, material, onRegenerate, ai, onAddTerms }) {
  const [added, setAdded] = useState({});
  const addOne = async (t) => {
    const n = await addTermCards(material, [t]);
    setAdded({ ...added, [t.term]: true });
    toast(n ? `「${t.term}」加入閃卡` : '已經在卡片裡了', n ? 'ok' : 'info');
  };
  return html`<div class="guide">
    <section class="guide__block">
      <h3 class="guide__h">Overview <span>在講什麼</span></h3>
      <p class="en-lg">${sm.overview_en}</p>
      <p class="zh">${sm.overview_zh}</p>
      <${ExplainBtn} text=${sm.overview_en} />
    </section>
    <div class="grid-2">
      <section class="guide__block">
        <h3 class="guide__h">Why learn this <span>老師為什麼教這個</span></h3>
        <ul class="bilist">${sm.why_learn.map((x, i) => html`<li key=${i}><span class="en">${x.en}</span><span class="zh">${x.zh}</span></li>`)}</ul>
      </section>
      <section class="guide__block">
        <h3 class="guide__h">You should be able to <span>學完要會</span></h3>
        <ul class="bilist bilist--check">${sm.goals.map((x, i) => html`<li key=${i}><span class="en">${x.en}</span><span class="zh">${x.zh}</span></li>`)}</ul>
      </section>
    </div>
    <section class="guide__block">
      <h3 class="guide__h">Key points <span>重點</span></h3>
      <ol class="bilist">${sm.key_points.map((x, i) => html`<li key=${i}><span class="en">${x.en}</span><span class="zh">${x.zh}</span></li>`)}</ol>
    </section>
    <section class="guide__block">
      <div class="row between wrap">
        <h3 class="guide__h">Key terms <span>關鍵名詞</span></h3>
        <${Btn} kind="ghost" size="sm" icon="card" onClick=${onAddTerms}>全部加入閃卡</${Btn}>
      </div>
      <div class="table-wrap">
        <table class="terms">
          <thead><tr><th>Term</th><th>中文</th><th>Definition · Example</th><th></th></tr></thead>
          <tbody>
            ${sm.key_terms.map(
              (t, i) => html`<tr key=${i}>
                <td class="terms__term"><mark>${t.term}</mark></td>
                <td>${t.zh}</td>
                <td><div>${t.def_en}</div><div class="muted small">e.g. ${t.example_en}</div></td>
                <td><button type="button" class="link" disabled=${added[t.term]} onClick=${() => addOne(t)}>${added[t.term] ? '已加入' : '加入'}</button></td>
              </tr>`
            )}
          </tbody>
        </table>
      </div>
    </section>
    ${sm.exam_angles.length
      ? html`<section class="guide__block">
          <h3 class="guide__h">How it may be assessed <span>可能的考法</span></h3>
          <ul class="bilist">${sm.exam_angles.map((x, i) => html`<li key=${i}><span class="en">${x.en}</span><span class="zh">${x.zh}</span></li>`)}</ul>
        </section>`
      : null}
    ${sm.first_question
      ? html`<section class="guide__block guide__q">
          <h3 class="guide__h">Start thinking <span>先想想看</span></h3>
          <${Bilingual} en=${sm.first_question.en} zh=${sm.first_question.zh} />
          <${CodeBlock} code=${sm.first_question.code} />
          <${Btn} kind="primary" icon="tutor" onClick=${() => go('tutor', { course: material.courseCode, materials: [material.id] })}>回答這題，開始問答</${Btn}>
        </section>`
      : null}
    <div class="row wrap muted small">
      <span>導讀產生於 ${U.fmtTime(material.summaryAt)}</span>
      <button type="button" class="link" disabled=${ai.busy} onClick=${onRegenerate}>重新產生</button>
    </div>
    <${Thinking} ai=${ai} label="重新整理導讀" />
    <${AIError} ai=${ai} onRetry=${onRegenerate} />
  </div>`;
}

/* ---------- assessments ---------- */
function AssessmentEditor({ course }) {
  const list = course.assessments || [];
  const exam = course.exam || {};
  const save = (assessments) => Store.patch('courses', course.code, { assessments, updatedAt: U.nowIso() });
  const upd = (i, patch) => save(list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const add = () => save([...list, { id: U.uid('a'), name: '新評量', due: null, weight: null, kind: 'assignment', status: 'todo' }]);
  const del = (i) => save(list.filter((_, j) => j !== i));
  const setExam = (patch) => Store.patch('courses', course.code, { exam: { ...exam, ...patch }, updatedAt: U.nowIso() });
  const sorted = list.map((a, i) => ({ a, i })).sort((x, y) => (x.a.due || '9999').localeCompare(y.a.due || '9999'));
  return html`<div class="stack">
    ${course.verified === false
      ? html`<div class="notice notice--warn">
          <span>這些評量是依 UQ 公開的過往課綱整理的，日期和比重可能和本學期不同。請對照 Learn.UQ 上本學期的 Electronic Course Profile。</span>
          <${Btn} kind="ghost" size="sm" icon="check" onClick=${() => Store.patch('courses', course.code, { verified: true })}>已核對</${Btn}>
          <${Btn} kind="ghost" size="sm" onClick=${() => go('plan', { parse: true })}>貼上 ECP 讓書僮整理</${Btn}>
        </div>`
      : null}
    <div class="panel exam-box">
      <div class="exam-box__label">期末考</div>
      <div class="form-grid">
        <${Field} label="日期" id=${'ex-date-' + course.code} hint=${`${examWindowLabel(Store.state.settings.semester)}，考試時間表公布後填入`}>
          <input id=${'ex-date-' + course.code} type="date" value=${exam.date || ''} onChange=${(e) => setExam({ date: e.target.value || null })} />
        </${Field}>
        <${Field} label="比重 %" id=${'ex-w-' + course.code}>
          <input id=${'ex-w-' + course.code} type="number" min="0" max="100" value=${exam.weight ?? ''} onChange=${(e) => setExam({ weight: Number(e.target.value) || null })} />
        </${Field}>
        <${Field} label="備註" id=${'ex-note-' + course.code}>
          <input id=${'ex-note-' + course.code} value=${exam.note || ''} placeholder="例如：hurdle、閉書、可帶一張 A4" onChange=${(e) => setExam({ note: e.target.value })} />
        </${Field}>
      </div>
    </div>
    <div class="table-wrap">
      <table class="assess">
        <thead><tr><th>評量</th><th>截止</th><th>比重</th><th>狀態</th><th></th></tr></thead>
        <tbody>
          ${sorted.map(
            ({ a, i }) => html`<tr key=${a.id || i} class=${a.status === 'done' ? 'is-done' : ''}>
              <td><input aria-label="名稱" id=${'as-n-' + (a.id || i)} value=${a.name} onChange=${(e) => upd(i, { name: e.target.value })} />
                ${a.note ? html`<div class="muted small">${a.note}</div>` : null}</td>
              <td class="nowrap" data-label="截止"><input aria-label="截止日" id=${'as-d-' + (a.id || i)} type="date" value=${a.due || ''} onChange=${(e) => upd(i, { due: e.target.value || null })} />
                ${a.due ? html` <${DaysLeft} date=${a.due} />` : null}</td>
              <td data-label="比重 %"><input aria-label="比重" id=${'as-w-' + (a.id || i)} class="w-num" type="number" min="0" max="100" value=${a.weight ?? ''} onChange=${(e) => upd(i, { weight: Number(e.target.value) || null })} /></td>
              <td data-label="狀態"><select aria-label="狀態" id=${'as-s-' + (a.id || i)} value=${a.status || 'todo'} onChange=${(e) => upd(i, { status: e.target.value })}>
                ${Object.entries(ASSESS_STATUS).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></td>
              <td><${ConfirmBtn} label="刪除" confirm="確定" onConfirm=${() => del(i)} /></td>
            </tr>`
          )}
        </tbody>
      </table>
    </div>
    <div class="row"><${Btn} kind="ghost" icon="plus" onClick=${add}>新增評量</${Btn}>
      <span class="muted small">合計 ${U.sum(list.map((a) => a.weight)) + (Number(exam.weight) || 0)}%</span></div>
  </div>`;
}

function CourseMethods({ course }) {
  const group = METHOD_GROUPS.find((g) => g.kinds.includes(course.kind)) || METHOD_GROUPS[1];
  return html`<div class="stack">
    <p class="lead">${group.intro}</p>
    <div class="method-grid">${group.methods.map((m) => html`<${MethodCard} key=${m.id} m=${m} course=${course} />`)}</div>
    <p class="muted small">英文的練法在「方法」頁。</p>
  </div>`;
}

/* ---------- 預習 ---------- */
function TopicInput({ course, week }) {
  const stored = topicFor(course, week);
  const [v, setV] = useState(stored);
  useEffect(() => setV(stored), [stored]);
  const save = () => {
    if (v.trim() === stored) return;
    const rest = (course.schedule || []).filter((x) => Number(x.week) !== week);
    if (v.trim()) rest.push({ week, topic: v.trim() });
    rest.sort((a, b) => a.week - b.week);
    Store.patch('courses', course.code, { schedule: rest, updatedAt: U.nowIso() });
  };
  return html`<label class="wk-topic" for=${`wt-${course.code}-${week}`}>
    <span class="wk-topic__n">W${week}</span>
    <input id=${`wt-${course.code}-${week}`} value=${v} placeholder="—" onInput=${(e) => setV(e.target.value)} onBlur=${save} />
  </label>`;
}

function CoursePreview({ course, params }) {
  const s = useStore();
  const rt = useRuntime();
  const ai = useAI();
  const today = U.today();
  const sem = s.settings.semester;
  const [openId, setOpenId] = useState(params.preview || null);
  const [busyWeek, setBusyWeek] = useState(null);
  const [topics, setTopics] = useState({});
  const [matPick, setMatPick] = useState({});
  const upcoming = lectureWeeks(course.code, today, 21, s.timetable, sem);
  const previews = s.previews.filter((p) => p.courseCode === course.code).sort((a, b) => b.week - a.week);
  const mats = s.materials
    .filter((m) => m.courseCode === course.code)
    .sort((a, b) => (b.week || 0) - (a.week || 0));
  const open = openId && previews.find((p) => p.id === openId);
  const topicOf = (week) => (topics[week] ?? topicFor(course, week)) || '';
  const matOf = (week) => {
    if (matPick[week] !== undefined) return matPick[week];
    const m = mats.find((x) => Number(x.week) === Number(week) && x.kind === 'lecture');
    return m ? m.id : '';
  };

  const generate = (week, date) => {
    setBusyWeek(week);
    ai.run(async ({ signal, onProgress }) => {
      const topic = topicOf(week).trim();
      const material = matOf(week) ? Store.get('materials', matOf(week)) : null;
      if (!topic && !material) throw new Error(`先填 W${week} 的主題，或上傳這週的投影片再選它。`);
      if (topic && topic !== topicFor(course, week)) {
        const rest = (course.schedule || []).filter((x) => Number(x.week) !== week);
        rest.push({ week, topic });
        rest.sort((a, b) => a.week - b.week);
        await Store.patch('courses', course.code, { schedule: rest, updatedAt: U.nowIso() });
      }
      const guide = await AI.preview({ course, week, topic, date, material, signal, onProgress });
      const id = `${course.code}-W${week}`;
      await Store.set('previews', id, { courseCode: course.code, week, topic, date, materialId: material ? material.id : null, guide, createdAt: U.nowIso() });
      setOpenId(id);
      toast(`W${week} 預習準備好了`, 'ok');
    }).finally(() => setBusyWeek(null));
  };

  if (open) return html`<${PreviewView} preview=${open} course=${course} onClose=${() => setOpenId(null)} />`;

  return html`<div class="stack">
    <label class="check"><input type="checkbox" id=${'pv-on-' + course.code} checked=${!!course.preview}
      onChange=${(e) => Store.patch('courses', course.code, { preview: e.target.checked, updatedAt: U.nowIso() })} />
      這門課要預習：講課前一天排預習任務（到「計畫 → 產生預習與課前任務」）</label>
    <${AIGate} />
    <${Section} title="接下來的講課" sub="有這週的投影片就選它；還沒發的話，填上主題也能先預習。">
      ${upcoming.length
        ? html`<ul class="prev-list">
            ${upcoming.map((x) => {
              const id = `${course.code}-W${x.week}`;
              const has = previews.find((p) => p.id === id);
              return html`<li key=${id} class=${U.cls('prev-row', Number(params.week) === x.week && 'is-target')}>
                <div class="prev-row__when"><b>W${x.week}</b><span>${U.fmtDate(x.date)} ${x.cls.start}</span>${has ? html`<${Pill} tone="ok">已預習</${Pill}>` : null}</div>
                <input id=${'pv-t-' + x.week} class="prev-row__topic" aria-label=${`W${x.week} 主題`} placeholder="這週主題（Blackboard 或 ECP 上看得到）"
                  value=${topicOf(x.week)} onInput=${(e) => setTopics({ ...topics, [x.week]: e.target.value })} />
                <select id=${'pv-m-' + x.week} aria-label="投影片" value=${matOf(x.week)} onChange=${(e) => setMatPick({ ...matPick, [x.week]: e.target.value })}>
                  <option value="">（沒有投影片）</option>
                  ${mats.map((m) => html`<option value=${m.id}>${m.week ? `W${m.week} ` : ''}${U.truncate(m.title, 40)}</option>`)}
                </select>
                <div class="row">
                  ${has ? html`<${Btn} kind="ghost" size="sm" onClick=${() => setOpenId(id)}>看預習</${Btn}>` : null}
                  <${Btn} kind=${has ? 'ghost' : 'primary'} size="sm" icon="spark" disabled=${ai.busy || rt.ai !== 'ready'} onClick=${() => generate(x.week, x.date)}>${has ? '重新產生' : '產生預習'}</${Btn}>
                </div>
              </li>`;
            })}
          </ul>`
        : html`<p class="muted">接下來三週沒有這門課的講課${s.timetable.classes.length ? '' : html`（還沒輸入課表，<button type="button" class="link" onClick=${() => go('plan')}>到計畫頁輸入</button>）`}。</p>`}
      <${Thinking} ai=${ai} label=${`書僮正在準備 W${busyWeek || ''} 的預習`} detail="大約 30-60 秒" />
      <${AIError} ai=${ai} />
    </${Section}>
    ${previews.length
      ? html`<${Section} title="預習紀錄">
          <ul class="mat-list">${previews.map(
            (p) => html`<li key=${p.id} class="mat"><button type="button" class="mat__main" onClick=${() => setOpenId(p.id)}>
              <span class="mat__week">W${p.week}</span>
              <span class="mat__text"><span class="mat__title">${p.guide.title_en}</span><span class="mat__meta">${p.guide.title_zh} · ${p.date ? U.fmtDate(p.date) : ''}</span></span>
            </button></li>`
          )}</ul>
        </${Section}>`
      : null}
    <${Section} title="每週主題" sub="從 ECP 的 Learning activities 或 Blackboard 抄過來，離開欄位就會儲存。"
      aside=${html`<${Btn} kind="ghost" size="sm" onClick=${() => go('plan', { parse: true })}>貼上 ECP 讓書僮整理</${Btn}>`}>
      <div class="weeks-grid">${Array.from({ length: 13 }, (_, i) => html`<${TopicInput} key=${i + 1} course=${course} week=${i + 1} />`)}</div>
    </${Section}>
  </div>`;
}

function PreviewView({ preview: p, course, onClose }) {
  const g = p.guide;
  const [shown, setShown] = useState({});
  const material = p.materialId && Store.get('materials', p.materialId);
  const addTerms = async (terms) => {
    const n = await addTermCards({ courseCode: course.code, id: p.materialId || null }, terms);
    toast(n ? `加入 ${n} 張名詞卡` : '這些名詞都已經在卡片裡了', n ? 'ok' : 'info');
  };
  return html`<article class="material">
    <div class="row between wrap">
      <button type="button" class="link" onClick=${onClose}>← 回到預習</button>
      <span class="muted small">${g.basis_zh}${g.minutes ? ` · 大約 ${g.minutes} 分鐘` : ''}</span>
    </div>
    <header class="material__head">
      <p class="eyebrow">預習 · 第 ${p.week} 週${p.date ? ` · ${U.fmtDate(p.date)} 上課` : ''}</p>
      <h2 class="material__title">${g.title_en}</h2>
      ${g.title_zh ? html`<p class="material__zh">${g.title_zh}</p>` : null}
    </header>
    <section class="guide__block">
      <h3 class="guide__h">This week <span>這週會學什麼</span></h3>
      <p class="en-lg">${g.what_en}</p><p class="zh">${g.what_zh}</p>
      ${g.why_en ? html`<p class="en">${g.why_en}</p><p class="zh">${g.why_zh}</p>` : null}
      <${ExplainBtn} text=${g.what_en + ' ' + g.why_en} />
    </section>
    <div class="grid-2">
      <section class="guide__block">
        <h3 class="guide__h">Refresh first <span>先複習這些</span></h3>
        <ul class="bilist">${g.prerequisites.map((x, i) => html`<li key=${i}><span class="en">${x.en}</span><span class="zh">${x.zh}</span></li>`)}</ul>
      </section>
      <section class="guide__block">
        <h3 class="guide__h">Listen for <span>上課注意聽</span></h3>
        <ul class="bilist bilist--check">${g.watch_for.map((x, i) => html`<li key=${i}><span class="en">${x.en}</span><span class="zh">${x.zh}</span></li>`)}</ul>
      </section>
    </div>
    ${g.key_terms.length
      ? html`<section class="guide__block">
          <div class="row between wrap"><h3 class="guide__h">Key terms <span>關鍵名詞</span></h3>
            <${Btn} kind="ghost" size="sm" icon="card" onClick=${() => addTerms(g.key_terms)}>全部加入閃卡</${Btn}></div>
          <div class="table-wrap"><table class="terms">
            <thead><tr><th>Term</th><th>中文</th><th>Definition · Example</th></tr></thead>
            <tbody>${g.key_terms.map(
              (t, i) => html`<tr key=${i}><td class="terms__term"><mark>${t.term}</mark></td><td>${t.zh}</td>
                <td><div>${t.def_en}</div>${t.example_en ? html`<div class="muted small">e.g. ${t.example_en}</div>` : null}</td></tr>`
            )}</tbody>
          </table></div>
        </section>`
      : null}
    ${g.warmup.length
      ? html`<section class="guide__block">
          <h3 class="guide__h">Warm-up <span>暖身題：先自己想，再看答案</span></h3>
          <ol class="warmups">${g.warmup.map(
            (w, i) => html`<li key=${i} class="warmup">
              <${Bilingual} en=${w.q_en} zh=${w.q_zh} />
              <${CodeBlock} code=${w.code} />
              ${shown[i]
                ? html`<div class="warmup__ans"><p class="en">${w.answer_en}</p>${w.answer_zh ? html`<p class="zh">${w.answer_zh}</p>` : null}</div>`
                : html`<button type="button" class="link" onClick=${() => setShown({ ...shown, [i]: true })}>看答案</button>`}
            </li>`
          )}</ol>
        </section>`
      : null}
    ${g.ask_in_class.length
      ? html`<section class="guide__block">
          <h3 class="guide__h">Ask in class <span>可以在課堂問</span></h3>
          <ul class="bilist">${g.ask_in_class.map((q, i) => html`<li key=${i}><span class="en">${q}</span><${CopyBtn} text=${q} /></li>`)}</ul>
        </section>`
      : null}
    <div class="row wrap">
      <${Btn} kind="primary" icon="tutor"
        onClick=${() => go('tutor', material ? { course: course.code, materials: [material.id] } : { course: course.code, focus: g.title_en })}>上完課：書僮問答</${Btn}>
      <${Btn} kind="ghost" icon="upload" onClick=${() => go('courses', { course: course.code, upload: true })}>上傳這週投影片</${Btn}>
    </div>
  </article>`;
}
