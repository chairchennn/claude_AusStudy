/* tests/mock-claude.js — a stand-in for the claude.ai viewer runtime (window.claude.use) used by the smoke test.
   db: in-memory document store with the real path grammar and size limit; sample: canned Claude answers chosen by
   prompt; downloads: records saves. Injected before the page's own scripts. */
(() => {
  const SEED = window.__SEED__ || {};
  const store = new Map(Object.entries(SEED).map(([p, d]) => [p, JSON.parse(JSON.stringify(d))]));
  const listeners = new Set();
  window.__db = store;
  window.__prompts = [];
  window.__downloads = [];
  window.__sampleCalls = [];

  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  const checkPath = (path, wantDoc) => {
    const segs = String(path).split('/');
    if (segs.some((s) => !SEG.test(s) || s === '.' || s === '..')) throw new TypeError('bad path segment in ' + path);
    if (wantDoc !== (segs.length % 2 === 0)) throw new TypeError(`path parity wrong for ${wantDoc ? 'doc' : 'collection'}: ${path}`);
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const snapDoc = (path) => {
    const d = store.get(path);
    return {
      id: path.split('/').pop(),
      exists: !!d,
      data: () => (d ? Object.freeze(clone(d)) : undefined),
      metadata: { fromCache: false, hasPendingWrites: false },
    };
  };
  const queryDocs = (col, order, dir, lim) => {
    const depth = col.split('/').length + 1;
    let rows = [...store.entries()].filter(([p]) => p.startsWith(col + '/') && p.split('/').length === depth);
    if (order)
      rows.sort((a, b) => {
        const x = a[1][order];
        const y = b[1][order];
        if (x === undefined) return 1;
        if (y === undefined) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1);
      });
    else rows.sort((a, b) => a[0].localeCompare(b[0]));
    if (lim) rows = rows.slice(0, lim);
    const docs = rows.map(([p]) => snapDoc(p));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const notify = () => listeners.forEach((l) => setTimeout(l, 0));
  const checkBody = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw { code: 'invalid_argument', message: 'body must be an object' };
    if (new TextEncoder().encode(JSON.stringify(data)).length > 262144) throw { code: 'invalid_argument', message: 'document over 256 KiB' };
  };
  function makeQuery(col, order = null, dir = 'asc', lim = null) {
    checkPath(col, false);
    return {
      path: col,
      orderBy: (f, d = 'asc') => makeQuery(col, f, d, lim),
      limit: (n) => makeQuery(col, order, dir, n),
      where: () => makeQuery(col, order, dir, lim),
      get: async () => queryDocs(col, order, dir, lim),
      onSnapshot(next) {
        const l = () => next(queryDocs(col, order, dir, lim));
        listeners.add(l);
        setTimeout(l, 5);
        return () => listeners.delete(l);
      },
      doc: (id) => makeDoc(col + '/' + (id || 'auto' + Math.random().toString(36).slice(2))),
      add: async (data) => {
        const r = makeDoc(col + '/auto' + Math.random().toString(36).slice(2));
        await r.set(data);
        return r;
      },
    };
  }
  function makeDoc(path) {
    checkPath(path, true);
    return {
      id: path.split('/').pop(),
      path,
      get: async () => snapDoc(path),
      set: async (data) => {
        checkBody(data);
        store.set(path, clone(data));
        notify();
      },
      update: async (data) => {
        if (!store.has(path)) throw { code: 'invalid_argument', message: 'update of missing doc' };
        store.set(path, { ...store.get(path), ...clone(data) });
        notify();
      },
      delete: async () => {
        store.delete(path);
        notify();
      },
      onSnapshot(next) {
        const l = () => next(snapDoc(path));
        listeners.add(l);
        setTimeout(l, 5);
        return () => listeners.delete(l);
      },
      collection: (sub) => makeQuery(path + '/' + sub),
    };
  }
  const db = Object.freeze({ doc: makeDoc, collection: (p) => makeQuery(p) });

  /* ---------- canned Claude answers ---------- */
  const R = {
    summary: {
      title_en: 'Mathematical Induction',
      title_zh: '數學歸納法',
      overview_en: 'This lecture shows how to prove a statement for every natural number. You prove a base case, then show that if it is true for k, it is also true for k + 1.',
      overview_zh: '這堂課教你如何證明一個敘述對所有自然數都成立：先證基礎情況，再證若對 k 成立則對 k + 1 也成立。',
      why_learn: [{ en: 'Many security proofs and algorithm analyses use induction.', zh: '很多資安證明與演算法分析都用歸納法。' }],
      goals: [{ en: 'Write a complete induction proof with a base case and an inductive step.', zh: '寫出含基礎步驟與歸納步驟的完整證明。' }],
      key_points: [
        { en: 'The base case starts the chain.', zh: '基礎步驟是起點。' },
        { en: 'The inductive step uses the inductive hypothesis.', zh: '歸納步驟要用到歸納假設。' },
      ],
      key_terms: [
        { term: 'base case', zh: '基礎步驟', def_en: 'The first value where you check the statement directly.', example_en: 'For n = 1, the sum is 1 = 1(1+1)/2.' },
        { term: 'inductive hypothesis', zh: '歸納假設', def_en: 'The assumption that the statement holds for k.', example_en: 'Assume 1 + 2 + … + k = k(k+1)/2.' },
      ],
      exam_angles: [{ en: 'Prove a summation formula by induction.', zh: '用歸納法證明求和公式。' }],
      first_question: { en: 'Why is the base case necessary in an induction proof?', zh_hint: '為什麼歸納法一定要有基礎步驟？', focus: 'base case', code: '' },
    },
    tutor: {
      understanding: 'partial',
      verdict_zh: '方向對了，但沒說明為什麼沒有起點整個推論就不成立。',
      good: ['知道基礎步驟是起點'],
      missing: ['沒有說明骨牌比喻：沒有第一張倒下，後面都不會倒'],
      misconceptions: [],
      model_answer_en: 'Without a base case, the inductive step only shows "if k then k + 1"; nothing proves the first statement, so the chain never starts.',
      model_answer_zh: '沒有基礎步驟，歸納步驟只證明「若 k 成立則 k+1 成立」，但沒有任何一個起點成立。',
      english: {
        corrected: 'The base case is necessary because it starts the chain.',
        changes: [{ original: 'base case is need because', corrected: 'The base case is necessary because', reason_zh: '需要冠詞 The；need 是動詞，這裡要用形容詞 necessary。' }],
        natural: 'We need a base case because the inductive step alone never gets the chain started.',
        summary_zh: '主要問題：冠詞和詞性。',
      },
      explanation: { en: '', zh: '' },
      next_action: 'deeper',
      next_question: { en: 'What would go wrong if the inductive step only worked for k ≥ 3, but the base case was n = 1?', zh_hint: '如果歸納步驟只對 k ≥ 3 成立，但基礎是 n = 1，會發生什麼問題？', focus: 'gaps in the chain', code: '' },
      card: { front: 'Why does an induction proof need a base case?', back: 'Without it, the inductive step proves nothing: the chain never starts.' },
    },
    opening: { en: 'Explain mathematical induction in simple English, with one example.', zh_hint: '用簡單英文解釋數學歸納法並舉例。', focus: 'induction', code: '' },
    recap: {
      summary_zh: '你理解了基礎步驟的角色，但歸納假設的用法還不穩。',
      strengths: ['知道歸納法的兩個步驟'],
      gaps: ['歸納假設 (inductive hypothesis) 要怎麼用在 k+1'],
      next_steps: ['做 3 題求和公式的歸納證明'],
      english_patterns: ['need（動詞）→ necessary（形容詞）'],
    },
    quiz: {
      title: 'Induction and logic practice',
      questions: [
        { id: 'q1', type: 'mcq', topic: 'logic', difficulty: 1, marks: 1, prompt_en: 'Which is equivalent to p → q?', prompt_zh: '哪一個等價於 p → q？', options: ['q → p', '¬p → ¬q', '¬q → ¬p', 'p ∧ q'], answer_index: 2, explanation_en: 'The contrapositive is equivalent.', explanation_zh: '逆否命題等價。' },
        { id: 'q2', type: 'tf', topic: 'sets', difficulty: 1, marks: 1, prompt_en: 'The empty set is a subset of every set.', prompt_zh: '空集合是每個集合的子集合。', answer_bool: true, explanation_en: 'Vacuously true.', explanation_zh: '空真。' },
        { id: 'q3', type: 'trace', topic: 'loops', difficulty: 2, marks: 2, prompt_en: 'What does this code print?', prompt_zh: '這段程式印出什麼？', code: 'total = 0\nfor i in range(4):\n    total += i\nprint(total)', expected_output: '6', explanation_en: '0+1+2+3 = 6', explanation_zh: '0+1+2+3 = 6' },
        { id: 'q4', type: 'parsons', topic: 'functions', difficulty: 2, marks: 2, prompt_en: 'Reorder the lines to define a function that returns the sum of a list.', prompt_zh: '排出回傳 list 總和的函式。', lines: ['def total(xs):', '    s = 0', '    for x in xs:', '        s += x', '    return s'], explanation_en: 'Accumulator pattern.', explanation_zh: '累加器寫法。' },
        { id: 'q5', type: 'proof', topic: 'induction', difficulty: 3, marks: 4, prompt_en: 'Prove that 1 + 2 + … + n = n(n+1)/2 for all n ≥ 1.', prompt_zh: '證明 1 + 2 + … + n = n(n+1)/2。', technique: 'induction', model_answer: 'Base case n = 1 … Inductive step …', rubric: ['base case', 'inductive hypothesis', 'algebra for k+1'], explanation_en: 'Standard induction.', explanation_zh: '標準歸納法。' },
        { id: 'q6', type: 'short', topic: 'CIA', difficulty: 2, marks: 2, prompt_en: 'Explain integrity with an example.', prompt_zh: '用例子解釋完整性。', model_answer: 'Integrity means data is not changed without authorisation, e.g. a tampered bank transfer.', rubric: ['definition', 'example'], explanation_en: 'Integrity = no unauthorised change.', explanation_zh: '完整性 = 未經授權不能被改。' },
      ],
    },
    plan: {
      advice_zh: '先完成 MATH7861 作業二，再每天穿插理論課的名詞複習。',
      weeks: [{ label: '10/1-10/7（期中假）', focus_zh: '補講義、建立閃卡' }],
      tasks: [
        { date: 'TODAY', course: 'MATH7861', title: 'MATH7861：做 4 題歸納法證明', minutes: 45, kind: 'practice', why: '期末考比重最高' },
        { date: 'TODAY', course: null, title: '複習今日閃卡', minutes: 15, kind: 'review', why: '每天固定複習' },
        { date: 'TOMORROW', course: 'CYBR7002', title: 'CYBR7002：用英文費曼講解 MFA', minutes: 30, kind: 'english', why: '練理論加英文' },
      ],
    },
    quizSheet: {
    title_en: 'Proof by induction: quiz sheet',
    title_zh: '數學歸納法考前重點',
    scope_zh: '依 W9 投影片整理：歸納法證明與遞迴定義',
    must_know: [
      { en: 'Induction proves P(n) for every n ≥ n₀ with a base case and an inductive step.', zh: '歸納法 = 基礎步驟 + 歸納步驟。' },
      { en: 'In the inductive step you assume P(k) and prove P(k+1).', zh: '假設 P(k) 成立，證明 P(k+1)。' },
    ],
    definitions: [
      { term: 'inductive hypothesis', zh: '歸納假設', def_en: 'The assumption that P(k) is true for an arbitrary k ≥ n₀.', notation: 'P(k)' },
      { term: 'base case', zh: '基礎步驟', def_en: 'A direct check that P(n₀) is true.', notation: '' },
    ],
    rules: [{ name_en: 'Principle of mathematical induction', zh: '數學歸納法原理', statement: '(P(n₀) ∧ ∀k ≥ n₀ (P(k) → P(k+1))) → ∀n ≥ n₀ P(n)', use_when_zh: '要證明對所有整數 n ≥ n₀ 都成立時' }],
    patterns: [
      {
        type_en: 'Prove a sum formula by induction',
        type_zh: '用歸納法證明求和公式',
        steps_en: ['State P(n).', 'Check the base case.', 'Assume P(k).', 'Add the next term and simplify to P(k+1).'],
        example_q: 'Prove 1 + 2 + … + n = n(n+1)/2.',
        example_a: 'Base: n = 1 gives 1 = 1. Step: assume the formula for k; add k+1 to get (k+1)(k+2)/2.',
      },
    ],
    traps: [{ en: 'Forgetting to say where the inductive hypothesis is used.', zh: '沒寫出哪裡用到歸納假設。' }],
    phrases: [{ en: 'By the inductive hypothesis, …', zh: '由歸納假設可知……' }],
    selfcheck: [{ q_en: 'What do you assume in the inductive step?', q_zh: '歸納步驟要假設什麼？', a_en: 'That P(k) is true for an arbitrary k ≥ n₀.', a_zh: '假設 P(k) 對任意 k ≥ n₀ 成立。' }],
  },
  preview: {
      title_en: 'Recursion',
      title_zh: '遞迴',
      basis_zh: '依課程一般內容整理（還沒有投影片）',
      what_en: 'This lecture shows how a function can call itself to solve a smaller version of the same problem.',
      what_zh: '這堂課教你怎麼讓函式呼叫自己，去解同一個問題的較小版本。',
      why_en: 'Recursion appears in the final exam and in tree-shaped data.',
      why_zh: '遞迴會出現在期末考，也常用在樹狀資料。',
      prerequisites: [{ en: 'How function calls and return values work', zh: '函式呼叫與回傳值' }],
      key_terms: [{ term: 'base case', zh: '終止條件', def_en: 'The input where the function stops calling itself.', example_en: 'if n == 0: return 1' }],
      watch_for: [{ en: 'How the call stack grows and shrinks', zh: '呼叫堆疊怎麼變長再變短' }],
      warmup: [{ q_en: 'What does f(3) return?', q_zh: 'f(3) 回傳什麼？', code: 'def f(n):\n    if n == 0:\n        return 1\n    return n * f(n - 1)', answer_en: '6', answer_zh: '3 × 2 × 1 = 6' }],
      ask_in_class: ['When should I use recursion instead of a loop?'],
      minutes: 25,
    },
    parse: {
      assessments: [
        { course: 'CSSE7030', name: 'Assignment 2', due: 'IN10', time: '15:00', weight: 25, kind: 'assignment', note: 'Gradescope' },
        { course: 'MATH7861', name: 'Final examination', due: null, time: '', weight: 60, kind: 'exam', note: 'hurdle' },
      ],
      tasks: [{ course: 'CSSE7030', title: 'CSSE7030：完成 A2 的 model 類別', due: 'IN10', priority: 1, minutes: 120, why: '最早截止' }],
      schedule: [{ course: 'CSSE7030', week: 11, topic: 'Recursion' }],
      notes_zh: 'A2 需要參加面試才算通過。',
    },
  };
  const ymd = (d) => d.toISOString().slice(0, 10);
  const fill = (obj) => {
    const t = new Date();
    const local = new Date(t.getTime() - t.getTimezoneOffset() * 60000);
    const map = { TODAY: ymd(local), TOMORROW: ymd(new Date(local.getTime() + 86400000)), IN10: ymd(new Date(local.getTime() + 10 * 86400000)) };
    return JSON.parse(JSON.stringify(obj).replace(/"(TODAY|TOMORROW|IN10)"/g, (_, k) => JSON.stringify(map[k])));
  };

  function respond(p) {
    if (/Write a bilingual study guide/.test(p)) return JSON.stringify(R.summary);
    if (/Write a short PREVIEW guide/.test(p)) return JSON.stringify(R.preview);
    if (/LAST-MINUTE REVIEW SHEET/.test(p)) return JSON.stringify(R.quizSheet);
    if (/LEARNER'S ANSWER/.test(p)) return JSON.stringify(R.tutor);
    if (/Summarise this tutoring session/.test(p)) return JSON.stringify(R.recap);
    if (/Create a practice set/.test(p)) return JSON.stringify(R.quiz);
    if (/Mark the learner's answers/.test(p)) {
      const items = p.slice(p.indexOf('ITEMS'), p.indexOf('Return ONLY JSON'));
      const ids = [...items.matchAll(/"id": "(q\d+)"/g)].map((m) => m[1]);
      return JSON.stringify({
        results: ids.map((id, i) => ({
          id,
          score: i % 2 ? 1 : 0.5,
          verdict: i % 2 ? 'correct' : 'partial',
          feedback_zh: '主要步驟正確，但少了歸納假設的使用說明。',
          missing: ['inductive hypothesis'],
          better_answer_en: 'Assume the formula holds for k. Then 1 + … + k + (k+1) = k(k+1)/2 + (k+1) = (k+1)(k+2)/2.',
          english_changes: [{ original: 'it mean', corrected: 'it means', reason_zh: '第三人稱單數要加 s' }],
        })),
      });
    }
    if (/day-by-day study plan/.test(p)) return JSON.stringify(fill(R.plan));
    if (/messy course information/.test(p)) return JSON.stringify(fill(R.parse));
    if (/Explain the following text/.test(p)) return '這題在問：為什麼歸納法需要**基礎步驟**（base case）。';
    if (/Transcribe all text/.test(p)) return '[Page 1]\nQuestion 1 (5 marks)\nProve that 3 divides n^3 - n for all n ≥ 1.';
    if (/Return ONLY JSON: \{"en"/.test(p)) return JSON.stringify(R.opening);
    if (/answering the learner's questions/.test(p)) return '**Authentication** 是「證明你是誰」，**authorisation** 是「你被允許做什麼」。\n\n| 概念 | 問的問題 |\n|---|---|\n| Authentication | Who are you? |\n| Authorisation | What can you do? |\n\nIn English: Authentication proves identity; authorisation grants permissions.';
    return '{}';
  }

  const TIERS = new Set(['default', 'complex', 'quick']);
  async function sample(input, opts = {}) {
    if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) throw { code: 'invalid_request', message: 'options must be a plain object' };
    const text = typeof input === 'string' ? input : Array.isArray(input) ? input.map((t) => t.content).join('\n') : null;
    if (!text) throw { code: 'invalid_request', message: 'input must be a string or turns' };
    if (Array.isArray(input) && (input[0].role !== 'user' || input[input.length - 1].role !== 'user')) throw { code: 'invalid_request', message: 'turns must start and end on user' };
    if (new TextEncoder().encode(text).length > 262144) throw { code: 'prompt_too_large', message: 'too large' };
    if (opts.modelTier && !TIERS.has(opts.modelTier)) throw { code: 'invalid_request', message: 'bad tier' };
    if (opts.cache !== undefined && opts.cache !== true && opts.cache !== false && (typeof opts.cache !== 'object' || !(opts.cache.gcTime > 0)))
      throw { code: 'invalid_request', message: 'bad cache' };
    if (opts.signal && !(opts.signal instanceof AbortSignal)) throw { code: 'invalid_request', message: 'signal must be AbortSignal' };
    if (opts.onText && typeof opts.onText !== 'function') throw { code: 'invalid_request', message: 'onText' };
    window.__prompts.push(text);
    window.__sampleCalls.push({ tier: opts.modelTier || 'default', bytes: text.length, images: opts.images ? opts.images.length : 0, prompt: text });
    const out = respond(text);
    await new Promise((r) => setTimeout(r, 150));
    if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'aborted' };
    if (opts.onText) opts.onText({ text: out.slice(0, 24), delta: out.slice(0, 24) });
    await new Promise((r) => setTimeout(r, 60));
    if (opts.onText) opts.onText({ text: out, delta: out.slice(24) });
    return { text: out, truncated: false, modelTierApplied: opts.modelTier || 'default' };
  }
  sample.json = async (input, opts) => {
    const r = await sample(input, opts);
    try {
      return JSON.parse(r.text);
    } catch {
      throw { code: 'invalid_json', message: 'no json', text: r.text };
    }
  };
  sample.limits = async () => ({
    maxPromptBytes: 262144,
    images: { maxCount: 4, maxInputBytes: 20000000, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
    tools: { maxCount: 8 },
  });

  const downloads = Object.freeze({
    save: async ({ filename, data }) => {
      window.__downloads.push({ filename, size: typeof data === 'string' ? data.length : data.size || data.byteLength });
      return { status: 'saved' };
    },
  });

  const caps = { db, sample, downloads };
  window.claude = { use: (name) => new Promise((r) => setTimeout(() => r(caps[name] || null), 30)) };
})();
