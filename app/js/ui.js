/* ui.js — shared components: router, toasts, icons, buttons, chips, AI request hook, Markdown, code blocks. */

/* ---------- router (in-memory; the bare #tab token deep-links a tab) ---------- */
const ROUTES = ['home', 'review', 'courses', 'tutor', 'practice', 'plan', 'methods', 'settings'];
const Router = (() => {
  const fromHash = () => {
    try {
      const t = (location.hash || '').replace('#', '');
      return ROUTES.includes(t) ? t : null;
    } catch {
      return null;
    }
  };
  const state = { route: fromHash() || U.store.get('route', 'home'), params: {}, seq: 0 };
  if (!ROUTES.includes(state.route)) state.route = 'home';
  const listeners = new Set();
  const go = (route, params = {}) => {
    state.route = ROUTES.includes(route) ? route : 'home';
    state.params = params;
    state.seq++;
    U.store.set('route', state.route);
    listeners.forEach((fn) => fn({ ...state }));
    try {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch {
      window.scrollTo(0, 0);
    }
  };
  const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  return { state, go, onChange };
})();
const go = Router.go;
function useRoute() {
  const [s, setS] = useState(() => ({ ...Router.state }));
  useLayoutEffect(() => {
    const off = Router.onChange(setS);
    setS((prev) => (prev.seq === Router.state.seq ? prev : { ...Router.state }));
    return off;
  }, []);
  return s;
}

/* ---------- toasts ---------- */
const Toasts = (() => {
  let items = [];
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(items.slice()));
  const push = (text, tone = 'info', ms = 3800) => {
    const id = U.uid();
    items = [...items, { id, text, tone }];
    emit();
    setTimeout(() => {
      items = items.filter((t) => t.id !== id);
      emit();
    }, ms);
  };
  return { push, current: () => items, onChange: (fn) => (listeners.add(fn), () => listeners.delete(fn)) };
})();
const toast = (text, tone, ms) => Toasts.push(text, tone, ms);

function ToastRegion() {
  const [items, setItems] = useState(Toasts.current);
  useLayoutEffect(() => {
    const off = Toasts.onChange(setItems);
    setItems((prev) => (prev === Toasts.current() ? prev : Toasts.current().slice()));
    return off;
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${items.map((t) => html`<div key=${t.id} class=${'toast toast--' + t.tone}>${t.text}</div>`)}
  </div>`;
}

/* ---------- icons (24px stroke) ---------- */
const ICONS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  courses: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13zM6.5 8h2M15.5 8h2',
  tutor: 'M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5',
  practice: 'M5 4h11l3 3v13H5zM8.5 10h7M8.5 13.5h7M8.5 17h4',
  plan: 'M4 6h16v14H4zM4 10h16M8 3.5v5M16 3.5v5M8 14h3',
  methods: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2.1 1.2L14.7 21h-4l-.3-2.4a7 7 0 0 1-2.1-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-2.4L4.4 9.9l2-3.4 1.9.7a7 7 0 0 1 2.1-1.2L10.7 3h4l.3 2.4a7 7 0 0 1 2.1 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 2.4z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  check: 'M5 12.5 10 17l9-10',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  right: 'M9 5l7 7-7 7',
  left: 'M15 5l-7 7 7 7',
  stop: 'M7 7h10v10H7z',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  image: 'M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15.5 9.5h.01',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  flip: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  card: 'M3 6h18v12H3zM3 10h18',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
};
function Icon({ name, size = 20, title }) {
  const d = ICONS[name] || ICONS.spark;
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden=${title ? undefined : 'true'} role=${title ? 'img' : undefined}>
    ${title ? html`<title>${title}</title>` : null}<path d=${d} />
  </svg>`;
}

/* ---------- small pieces ---------- */
function Btn({ kind = 'plain', size, icon, children, class: extra, ...rest }) {
  return html`<button type="button" class=${U.cls('btn', 'btn--' + kind, size && 'btn--' + size, extra)} ...${rest}>
    ${icon ? html`<${Icon} name=${icon} size=${size === 'sm' ? 16 : 18} />` : null}${children ? html`<span>${children}</span>` : null}
  </button>`;
}

function courseColor(code) {
  const c = Store.course(code);
  return (c && c.color) || 'pen';
}

function CourseChip({ code, short }) {
  if (!code) return html`<span class="chip chip--muted">通用</span>`;
  const c = Store.course(code);
  return html`<span class=${'chip chip--course c-' + courseColor(code)} title=${c ? c.name : code}>
    <span class="chip__code">${code}</span>${!short && c && c.nameZh ? html`<span class="chip__name">${c.nameZh}</span>` : null}
  </span>`;
}

function LevelPill({ level, short }) {
  const L = LEVELS[level];
  if (!L) return null;
  return html`<span class=${'pill pill--' + L.tone}>${short ? L.short : L.label}</span>`;
}

function Pill({ tone = 'muted', children }) {
  return html`<span class=${'pill pill--' + tone}>${children}</span>`;
}

function Md({ text, class: extra }) {
  return html`<div class=${U.cls('md', extra)} dangerouslySetInnerHTML=${{ __html: U.md(text) }}></div>`;
}

const PY_RE =
  /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(def|return|if|elif|else|for|while|in|not|and|or|is|None|True|False|class|import|from|as|try|except|finally|raise|with|lambda|pass|break|continue|global|yield|assert|del)\b|\b(print|len|range|int|str|float|list|dict|set|tuple|input|sum|min|max|sorted|enumerate|zip|abs|round|open|type|isinstance|super|self|append|split|join|strip|keys|values|items)\b|\b(\d+(?:\.\d+)?)\b/g;
function highlightPy(code) {
  let out = '';
  let last = 0;
  String(code).replace(PY_RE, (m, com, s, kw, bi, num, idx) => {
    out += U.escapeHtml(code.slice(last, idx));
    const cls = com ? 'tk-com' : s ? 'tk-str' : kw ? 'tk-kw' : bi ? 'tk-bi' : 'tk-num';
    out += `<span class="${cls}">${U.escapeHtml(m)}</span>`;
    last = idx + m.length;
    return m;
  });
  return out + U.escapeHtml(String(code).slice(last));
}
function CodeBlock({ code, plain }) {
  if (!code) return null;
  return html`<pre class="code"><code dangerouslySetInnerHTML=${{ __html: plain ? U.escapeHtml(code) : highlightPy(code) }}></code></pre>`;
}

function Empty({ icon = 'spark', title, children, action }) {
  return html`<div class="empty">
    <div class="empty__icon"><${Icon} name=${icon} size=${26} /></div>
    <div class="empty__title">${title}</div>
    ${children ? html`<div class="empty__body">${children}</div>` : null}
    ${action || null}
  </div>`;
}

function Section({ title, sub, aside, children, class: extra, id }) {
  return html`<section class=${U.cls('section', extra)} id=${id}>
    ${title || aside
      ? html`<header class="section__head">
          <div><h2 class="section__title">${title}</h2>${sub ? html`<p class="section__sub">${sub}</p>` : null}</div>
          ${aside ? html`<div class="section__aside">${aside}</div>` : null}
        </header>`
      : null}
    ${children}
  </section>`;
}

function Tabs({ tabs, value, onChange, label }) {
  return html`<div class="tabs" role="tablist" aria-label=${label || ''}>
    ${tabs.map(
      (t) => html`<button type="button" role="tab" aria-selected=${value === t.id} class=${U.cls('tab', value === t.id && 'is-on')}
        onClick=${() => onChange(t.id)}>${t.label}${t.count != null ? html`<span class="tab__count">${t.count}</span>` : null}</button>`
    )}
  </div>`;
}

function Field({ label, hint, children, id }) {
  return html`<label class="field" for=${id}>
    <span class="field__label">${label}</span>
    ${children}
    ${hint ? html`<span class="field__hint">${hint}</span>` : null}
  </label>`;
}

function Progress({ value, tone = 'pen', label }) {
  const v = U.clamp(Math.round((value || 0) * 100), 0, 100);
  return html`<div class="bar" role="progressbar" aria-valuenow=${v} aria-valuemin="0" aria-valuemax="100" aria-label=${label || ''}>
    <div class=${'bar__fill bar__fill--' + tone} style=${{ width: v + '%' }}></div>
  </div>`;
}

/** Two-step inline confirm (the viewer frame has no confirm() dialog). */
function ConfirmBtn({ label, confirm = '確定刪除？', onConfirm, icon = 'trash', kind = 'ghost', size = 'sm' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed
    ? html`<span class="confirm"><${Btn} kind="danger" size=${size} onClick=${() => (setArmed(false), onConfirm())}>${confirm}</${Btn}>
        <${Btn} kind="ghost" size=${size} onClick=${() => setArmed(false)}>取消</${Btn}></span>`
    : html`<${Btn} kind=${kind} size=${size} icon=${icon} onClick=${() => setArmed(true)} aria-label=${label || confirm}>${label}</${Btn}>`;
}

/* ---------- AI request hook ---------- */
function useAI() {
  const [busy, setBusy] = useState(false);
  const [chars, setChars] = useState(0);
  const [error, setError] = useState(null);
  const ctl = useRef(null);
  const run = useCallback(async (fn) => {
    if (ctl.current) ctl.current.abort();
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setChars(0);
    setError(null);
    try {
      return await fn({ signal: c.signal, onProgress: (n) => setChars(n) });
    } catch (e) {
      if (e && e.code === 'cancelled') return null;
      console.warn('AI request failed', e);
      setError(e instanceof Error ? e.message : RT.aiErrorText(e));
      return null;
    } finally {
      if (ctl.current === c) {
        ctl.current = null;
        setBusy(false);
      }
    }
  }, []);
  const stop = useCallback(() => ctl.current && ctl.current.abort(), []);
  return { busy, chars, error, run, stop, setError };
}

function Thinking({ ai, label = '書僮思考中', detail }) {
  if (!ai.busy) return null;
  return html`<div class="thinking" role="status">
    <span class="thinking__dots" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="thinking__label">${label}${ai.chars ? ` · 已寫 ${ai.chars.toLocaleString()} 字` : ''}</span>
    ${detail ? html`<span class="thinking__detail">${detail}</span>` : null}
    <${Btn} kind="ghost" size="sm" icon="stop" onClick=${ai.stop}>停止</${Btn}>
  </div>`;
}

function AIError({ ai, onRetry }) {
  if (!ai.error) return null;
  return html`<div class="notice notice--bad" role="alert">
    <span>${ai.error}</span>
    ${onRetry ? html`<${Btn} kind="ghost" size="sm" onClick=${onRetry}>再試一次</${Btn}>` : null}
  </div>`;
}

/** Notice shown where AI features live but Claude can't be reached from this view. */
function AIGate() {
  const rt = useRuntime();
  if (rt.ai === 'ready' || rt.ai === 'pending') return null;
  return html`<div class="notice notice--warn">
    ${rt.ai === 'denied'
      ? '你拒絕了這個頁面使用 Claude，AI 功能先關閉。要開啟的話，從頁面上方的權限選單允許，再重新整理。'
      : 'AI 功能（導讀、問答、出題、批改、排計畫）需要在 claude.ai 上開啟這個頁面。其他功能照常可用。'}
  </div>`;
}

/** English text with a Chinese hint the learner can reveal. */
function Bilingual({ en, zh, open: initial }) {
  const showDefault = initial ?? Store.state.settings.showZh;
  const [open, setOpen] = useState(!!showDefault);
  return html`<div class="bi">
    <div class="bi__en">${en}</div>
    ${zh
      ? open
        ? html`<div class="bi__zh">${zh}<button type="button" class="link" onClick=${() => setOpen(false)}>隱藏中文</button></div>`
        : html`<button type="button" class="link bi__toggle" onClick=${() => setOpen(true)}>顯示中文提示</button>`
      : null}
  </div>`;
}

/** "用中文解釋" — a quick Claude explanation of any English passage. */
function ExplainBtn({ text, label = '用中文解釋' }) {
  const [out, setOut] = useState('');
  const ai = useAI();
  const rt = useRuntime();
  if (rt.ai !== 'ready') return null;
  const go = () =>
    ai.run(async ({ signal }) => {
      setOut('');
      const r = await AI.explain({ text, signal, onText: (t) => setOut(t) });
      setOut(r.text);
    });
  return html`<div class="explain">
    ${!out && !ai.busy ? html`<button type="button" class="link" onClick=${go}>${label}</button>` : null}
    ${ai.busy && !out ? html`<span class="muted small">解釋中…</span>` : null}
    ${out ? html`<div class="explain__box"><${Md} text=${out} /><button type="button" class="link" onClick=${() => setOut('')}>收起</button></div>` : null}
    <${AIError} ai=${ai} />
  </div>`;
}

function CorrectionTable({ changes }) {
  if (!changes || !changes.length) return null;
  return html`<div class="table-wrap">
    <table class="corr">
      <thead><tr><th>原句</th><th>修正</th><th>原因</th></tr></thead>
      <tbody>
        ${changes.map(
          (c, i) => html`<tr key=${i}>
            <td class="corr__orig">${c.original}</td>
            <td class="corr__fix">${c.corrected}</td>
            <td class="corr__why">${c.reason_zh}</td>
          </tr>`
        )}
      </tbody>
    </table>
  </div>`;
}

function CopyBtn({ text, label = '複製' }) {
  const [ok, setOk] = useState(false);
  return html`<button type="button" class="link" onClick=${async () => {
    const done = await U.copyText(text);
    setOk(done);
    if (!done) toast('這個檢視模式不能複製，請手動選取文字。', 'warn');
    setTimeout(() => setOk(false), 1500);
  }}>${ok ? '已複製' : label}</button>`;
}

/** Image picker for handwritten working (only when this view can send images to Claude). */
function ImagePicker({ files, onChange, id }) {
  const rt = useRuntime();
  if (!rt.images) return null;
  const max = rt.images.maxCount || 4;
  return html`<div class="imgpick">
    <label class="btn btn--ghost btn--sm" for=${id}>
      <${Icon} name="image" size=${16} /><span>附上手寫照片</span>
    </label>
    <input id=${id} type="file" accept=${(rt.images.mediaTypes || ['image/jpeg', 'image/png']).join(',')} multiple hidden
      onChange=${(e) => {
        const picked = Array.from(e.target.files || []).slice(0, max);
        onChange(picked);
        e.target.value = '';
      }} />
    ${files && files.length
      ? html`<span class="muted small">已附 ${files.length} 張</span><button type="button" class="link" onClick=${() => onChange([])}>移除</button>`
      : html`<span class="muted small">最多 ${max} 張</span>`}
  </div>`;
}

/** Days-left badge: D-12 */
function DaysLeft({ date }) {
  if (!U.isYmd(date)) return null;
  const d = U.daysBetween(U.today(), date);
  const tone = d < 0 ? 'muted' : d <= 3 ? 'bad' : d <= 10 ? 'warn' : 'ok';
  return html`<span class=${'dleft dleft--' + tone}>${d < 0 ? '已過' : d === 0 ? 'D-day' : 'D-' + d}</span>`;
}
