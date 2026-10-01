/* store.js — all study data. Cloud mode uses the artifact's `db` (synced across devices, readable by Claude);
   local mode keeps the same shape in localStorage when the page runs outside claude.ai. */

const DEFAULT_SETTINGS = {
  semester: {
    name: 'UQ 2026 Semester 2',
    start: '2026-07-27',
    breakStart: '2026-09-28',
    breakEnd: '2026-10-02',
    classesEnd: '2026-10-30',
    revisionStart: '2026-11-02',
    examStart: '2026-11-07',
    examEnd: '2026-11-21',
    holidays: [],
  },
  minutes: { weekday: 120, weekend: 180 },
  english: 'B1',
  showZh: true,
};

const COLLECTIONS = {
  courses: {},
  materials: {},
  cards: {},
  sessions: { order: 'updatedAt', limit: 80 },
  quizzes: { order: 'createdAt', limit: 80 },
  tasks: {},
  days: { order: 'date', limit: 120 },
  previews: {},
};
const META_DOCS = ['settings', 'plan', 'timetable'];

const Store = (() => {
  const state = {
    mode: 'pending', // pending | cloud | local
    loaded: false,
    courses: [],
    materials: [],
    cards: [],
    sessions: [],
    quizzes: [],
    tasks: [],
    days: [],
    previews: [],
    settings: DEFAULT_SETTINGS,
    plan: null,
    timetable: { classes: [] },
    error: null,
  };
  const loadedParts = new Set();
  const listeners = new Set();
  let version = 0;
  let db = null;
  const queues = new Map();
  let onError = () => {};

  const emit = () => {
    version++;
    listeners.forEach((fn) => fn(version));
  };
  const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const setErrorHandler = (fn) => (onError = fn);

  const markLoaded = (part) => {
    loadedParts.add(part);
    if (!state.loaded && loadedParts.size >= Object.keys(COLLECTIONS).length + META_DOCS.length) state.loaded = true;
  };

  const normTimetable = (t) => ({ classes: Array.isArray(t && t.classes) ? t.classes : [] });
  const mergeSettings = (s) => ({
    ...DEFAULT_SETTINGS,
    ...(s || {}),
    semester: { ...DEFAULT_SETTINGS.semester, ...((s && s.semester) || {}) },
    minutes: { ...DEFAULT_SETTINGS.minutes, ...((s && s.minutes) || {}) },
  });

  /* ---------- local backend ---------- */
  const LOCAL_KEY = 'shutong:db:v1';
  let localData = null;
  const localLoad = () => {
    try {
      localData = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    } catch {
      localData = null;
    }
    if (!localData || typeof localData !== 'object') localData = {};
    for (const name of [...Object.keys(COLLECTIONS), 'meta', 'materialText']) localData[name] = localData[name] || {};
  };
  // Writes in the same tick are coalesced into one save, which still lands before the page can unload.
  let savePending = false;
  const flushLocal = () => {
    savePending = false;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(localData));
    } catch (e) {
      onError('這台裝置的瀏覽器儲存空間滿了，部分資料沒存到。請在 claude.ai 上開啟以使用雲端儲存。');
    }
  };
  const localSave = () => {
    if (savePending) return;
    savePending = true;
    Promise.resolve().then(flushLocal);
  };
  const localRefresh = (name) => {
    if (name === 'meta') {
      state.settings = mergeSettings(localData.meta.settings);
      state.plan = localData.meta.plan || null;
      state.timetable = normTimetable(localData.meta.timetable);
      return;
    }
    if (!COLLECTIONS[name]) return;
    state[name] = Object.entries(localData[name]).map(([id, d]) => ({ ...d, id }));
  };

  /* ---------- init ---------- */
  async function init() {
    db = await RT.db();
    if (!db) {
      state.mode = 'local';
      RT.set({ db: 'local' });
      localLoad();
      Object.keys(COLLECTIONS).forEach(localRefresh);
      localRefresh('meta');
      state.loaded = true;
      emit();
      return;
    }
    state.mode = 'cloud';
    RT.set({ db: 'cloud' });
    for (const [name, opt] of Object.entries(COLLECTIONS)) {
      let q = db.collection(name);
      if (opt.order) q = q.orderBy(opt.order, 'desc');
      if (opt.limit) q = q.limit(opt.limit);
      q.onSnapshot(
        (snap) => {
          state[name] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          markLoaded(name);
          emit();
        },
        (err) => {
          markLoaded(name);
          state.error = RT.dbErrorText(err);
          emit();
        }
      );
    }
    db.doc('meta/settings').onSnapshot(
      (snap) => {
        state.settings = mergeSettings(snap.exists ? snap.data() : null);
        markLoaded('settings');
        emit();
      },
      () => {
        markLoaded('settings');
        emit();
      }
    );
    db.doc('meta/plan').onSnapshot(
      (snap) => {
        state.plan = snap.exists ? snap.data() : null;
        markLoaded('plan');
        emit();
      },
      () => {
        markLoaded('plan');
        emit();
      }
    );
    db.doc('meta/timetable').onSnapshot(
      (snap) => {
        state.timetable = normTimetable(snap.exists ? snap.data() : null);
        markLoaded('timetable');
        emit();
      },
      () => {
        markLoaded('timetable');
        emit();
      }
    );
    // Never leave the UI waiting forever on a slow first snapshot.
    setTimeout(() => {
      if (!state.loaded) {
        state.loaded = true;
        emit();
      }
    }, 8000);
  }

  /* ---------- writes ---------- */
  // One write at a time per document, in call order.
  const enqueue = (path, op) => {
    const prev = queues.get(path) || Promise.resolve();
    const next = prev.catch(() => {}).then(op);
    queues.set(path, next);
    next.finally(() => {
      if (queues.get(path) === next) queues.delete(path);
    });
    return next;
  };

  const applyLocalState = (col, id, data) => {
    if (col === 'meta') {
      if (id === 'settings') state.settings = mergeSettings(data);
      if (id === 'plan') state.plan = data;
      if (id === 'timetable') state.timetable = normTimetable(data);
      return;
    }
    if (!COLLECTIONS[col]) return;
    const list = state[col].filter((x) => x.id !== id);
    if (data) list.push({ ...data, id });
    state[col] = list;
  };

  const clean = (obj) => JSON.parse(JSON.stringify(obj ?? {}));

  async function set(col, id, data) {
    const body = clean({ ...data, id: undefined });
    applyLocalState(col, id, body);
    emit();
    if (state.mode === 'local') {
      localData[col] = localData[col] || {};
      localData[col][id] = body;
      localSave();
      return;
    }
    try {
      await enqueue(`${col}/${id}`, () => db.doc(`${col}/${id}`).set(body));
    } catch (e) {
      onError(RT.dbErrorText(e));
      throw e;
    }
  }

  /** Shallow-merge a patch into an existing document (whole-field replace, like db.update for arrays). */
  async function patch(col, id, partial) {
    const current = col === 'meta' ? { settings: state.settings, plan: state.plan, timetable: state.timetable }[id] : get(col, id);
    const merged = { ...(current || {}), ...clean(partial) };
    delete merged.id;
    return set(col, id, merged);
  }

  async function remove(col, id) {
    applyLocalState(col, id, null);
    emit();
    if (state.mode === 'local') {
      if (localData[col]) delete localData[col][id];
      localSave();
      return;
    }
    try {
      await enqueue(`${col}/${id}`, () => db.doc(`${col}/${id}`).delete());
    } catch (e) {
      onError(RT.dbErrorText(e));
      throw e;
    }
  }

  const get = (col, id) => (state[col] || []).find((x) => x.id === id) || null;

  /* ---------- material text (kept apart so lists stay light) ---------- */
  const textCache = new Map();
  async function getText(id) {
    if (textCache.has(id)) return textCache.get(id);
    let text = '';
    if (state.mode === 'local') {
      text = (localData.materialText[id] && localData.materialText[id].text) || '';
    } else if (db) {
      try {
        const snap = await db.doc(`materialText/${id}`).get();
        text = snap.exists ? String(snap.data().text || '') : '';
      } catch (e) {
        onError(RT.dbErrorText(e));
      }
    }
    textCache.set(id, text);
    return text;
  }
  async function setText(id, text) {
    textCache.set(id, text);
    if (state.mode === 'local') {
      localData.materialText[id] = { text };
      localSave();
      return;
    }
    await enqueue(`materialText/${id}`, () => db.doc(`materialText/${id}`).set({ text }));
  }
  async function removeText(id) {
    textCache.delete(id);
    if (state.mode === 'local') {
      delete localData.materialText[id];
      localSave();
      return;
    }
    await enqueue(`materialText/${id}`, () => db.doc(`materialText/${id}`).delete());
  }

  /* ---------- convenience ---------- */
  const courses = () =>
    state.courses.slice().sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.code || a.id).localeCompare(b.code || b.id));
  const course = (code) => get('courses', code);

  async function bumpDay(field, n = 1, date = U.today()) {
    const cur = get('days', date) || { date };
    await set('days', date, { ...cur, date, [field]: (Number(cur[field]) || 0) + n });
  }

  async function exportAll() {
    const out = { app: 'shutong', version: 1, exportedAt: U.nowIso(), meta: { settings: state.settings, plan: state.plan, timetable: state.timetable } };
    for (const name of Object.keys(COLLECTIONS)) out[name] = state[name];
    out.materialText = {};
    for (const m of state.materials) out.materialText[m.id] = await getText(m.id);
    return out;
  }

  async function importAll(data, onStep = () => {}) {
    if (!data || data.app !== 'shutong') throw new Error('這不是書僮的備份檔。');
    let done = 0;
    const jobs = [];
    for (const name of Object.keys(COLLECTIONS))
      for (const doc of data[name] || []) if (doc && doc.id) jobs.push(() => set(name, doc.id, doc));
    for (const [id, text] of Object.entries(data.materialText || {})) jobs.push(() => setText(id, String(text || '')));
    if (data.meta && data.meta.settings) jobs.push(() => set('meta', 'settings', data.meta.settings));
    if (data.meta && data.meta.plan) jobs.push(() => set('meta', 'plan', data.meta.plan));
    if (data.meta && data.meta.timetable) jobs.push(() => set('meta', 'timetable', data.meta.timetable));
    for (const job of jobs) {
      await job();
      onStep(++done, jobs.length);
    }
    return done;
  }

  return {
    state,
    init,
    onChange,
    setErrorHandler,
    set,
    patch,
    remove,
    get,
    getText,
    setText,
    removeText,
    courses,
    course,
    bumpDay,
    exportAll,
    importAll,
    version: () => version,
  };
})();

/** Re-render a component whenever the store changes. */
function useStore() {
  const [, setV] = useState(0);
  useEffect(() => Store.onChange((v) => setV(v)), []);
  return Store.state;
}

/** Re-render on runtime capability changes (AI ready/denied, db mode). */
function useRuntime() {
  const [s, setS] = useState({ ...RT.state });
  useEffect(() => RT.onChange(setS), []);
  return s;
}
