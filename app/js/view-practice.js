/* view-practice.js — 練習: generate & mark question sets, spaced-repetition flashcards, mistake book, history. */

function PracticeView({ params }) {
  const s = useStore();
  const [tab, setTab] = useState(params.tab || 'quiz');
  const [quizId, setQuizId] = useState(params.quiz || null);
  useEffect(() => {
    if (params.tab) setTab(params.tab);
    if (params.quiz) setQuizId(params.quiz);
    else if (params.tab === 'quiz' && (params.course || params.materials)) setQuizId(null);
  }, [Router.state.seq]);
  const today = U.today();
  const due = s.cards.filter((c) => SRS.isDue(c, today)).length;
  const mistakes = s.cards.filter((c) => c.kind === 'mistake' && !c.suspended).length;
  const quiz = quizId && Store.get('quizzes', quizId);
  return html`<div class="view">
    <header class="page-head"><div><p class="eyebrow">主動回想比重讀有效</p><h1 class="page-title">練習</h1></div></header>
    <${Tabs} value=${tab} onChange=${(t) => (setTab(t), setQuizId(null))} label="練習分頁" tabs=${[
      { id: 'quiz', label: '出題' },
      { id: 'review', label: '閃卡', count: due },
      { id: 'mistakes', label: '錯題本', count: mistakes },
      { id: 'history', label: '紀錄' },
    ]} />
    ${tab === 'quiz' ? (quiz ? html`<${QuizRunner} key=${quiz.id} quiz=${quiz} onNew=${() => setQuizId(null)} />` : html`<${QuizSetup} params=${params} onCreated=${setQuizId} />`) : null}
    ${tab === 'review' ? html`<${Review} params=${params} />` : null}
    ${tab === 'mistakes' ? html`<${Mistakes} params=${params} />` : null}
    ${tab === 'history' ? html`<${History} onOpen=${(id) => (setTab('quiz'), setQuizId(id))} />` : null}
  </div>`;
}

/* ---------- quiz setup ---------- */
function QuizSetup({ params, onCreated }) {
  const s = useStore();
  const rt = useRuntime();
  const ai = useAI();
  const courses = Store.courses();
  const [course, setCourse] = useState(params.course || (courses[0] && courses[0].code) || '');
  const c = Store.course(course);
  const kindTypes = QTYPES_BY_KIND[(c && c.kind) || 'theory'] || QTYPES_BY_KIND.theory;
  const [types, setTypes] = useState(params.types || kindTypes.defaults);
  const [picked, setPicked] = useState(params.materials || []);
  const [count, setCount] = useState(params.count || 8);
  const autoRan = useRef(false);
  const [difficulty, setDifficulty] = useState(params.difficulty || 'standard');
  const [focus, setFocus] = useState(params.focus || '');
  const [useWeak, setUseWeak] = useState(true);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTypes(kindTypes.defaults);
    setPicked([]);
  }, [course]);
  useEffect(() => {
    if (!course && courses[0]) setCourse(courses[0].code);
  }, [courses.length]);

  const mats = s.materials
    .filter((m) => m.courseCode === course)
    .sort((a, b) => (b.week || 0) - (a.week || 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const weak = [
    ...new Set(
      s.sessions
        .filter((x) => x.courseCode === course)
        .flatMap((x) => x.turns || [])
        .filter((t) => t.fb && t.fb.understanding !== 'clear')
        .map((t) => t.q.focus)
        .filter(Boolean)
    ),
  ].slice(-8);
  const allTypes = [...new Set([...kindTypes.all, ...types])];
  const toggleType = (t) => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t]);
  const toggleMat = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const create = () =>
    ai.run(async ({ signal, onProgress }) => {
      if (!types.length) throw new Error('至少選一種題型。');
      const chosen = picked.map((id) => Store.get('materials', id)).filter(Boolean);
      const exams = chosen.filter((m) => m.kind === 'exam');
      const content = chosen.filter((m) => m.kind !== 'exam');
      const spec = { types, count, difficulty, focus: focus.trim() };
      const r = await AI.generateQuiz({ course: c, materials: content, examMaterials: exams, spec, weakTopics: useWeak ? weak : [], signal, onProgress });
      const questions = r.questions.map((q) => (q.type === 'parsons' ? { ...q, order: U.shuffle(q.lines.map((_, i) => i)) } : q));
      const id = U.uid('q');
      await Store.set('quizzes', id, {
        courseCode: course,
        materialIds: chosen.map((m) => m.id),
        spec,
        title: r.title,
        questions,
        responses: {},
        results: {},
        status: 'open',
        tag: params.tag || null,
        createdAt: U.nowIso(),
      });
      onCreated(id);
    });

  // From 複習: the learner already chose the material and asked for the quiz, so start generating.
  useEffect(() => {
    if (params.auto && !autoRan.current && rt.ai === 'ready' && course) {
      autoRan.current = true;
      create();
    }
  }, [rt.ai]);

  return html`<div class="stack">
    <${AIGate} />
    <div class="panel stack">
      <${Field} label="課程" id="qz-course">
        <div class="chips" id="qz-course">${courses.map(
          (x) => html`<button type="button" key=${x.code} class=${U.cls('chip-btn', 'c-' + (x.color || 'pen'), course === x.code && 'is-on')} onClick=${() => setCourse(x.code)}>${x.code}</button>`
        )}</div>
      </${Field}>
      <div class="field">
        <span class="field__label">題型（${c ? (COURSE_KINDS[c.kind] || {}).label + '課' : ''}推薦已勾選）</span>
        <div class="chips">${allTypes.map(
          (t) => html`<button type="button" key=${t} class=${U.cls('chip-btn', types.includes(t) && 'is-on')} title=${QTYPES[t].hint} onClick=${() => toggleType(t)}>
            ${types.includes(t) ? '✓ ' : ''}${QTYPES[t].label}</button>`
        )}
        <details class="more-types"><summary>其他題型</summary>
          <div class="chips">${Object.keys(QTYPES).filter((t) => !allTypes.includes(t)).map(
            (t) => html`<button type="button" key=${t} class="chip-btn" onClick=${() => toggleType(t)}>${QTYPES[t].label}</button>`
          )}</div>
        </details></div>
      </div>
      <div class="field">
        <span class="field__label">出題範圍（不選就用課程一般內容；選「考古題」會模仿它的風格）</span>
        ${mats.length
          ? html`<ul class="pick">${mats.map(
              (m) => html`<li key=${m.id}><label class="pick__item">
                <input type="checkbox" id=${'qz-m-' + m.id} checked=${picked.includes(m.id)} onChange=${() => toggleMat(m.id)} />
                <span class="pick__week">${m.week ? 'W' + m.week : '—'}</span>
                <span class="pick__title">${m.title}</span>
                ${m.kind === 'exam' ? html`<${Pill} tone="pen">考古題</${Pill}>` : null}
              </label></li>`
            )}</ul>`
          : html`<p class="muted small">這門課還沒有講義，會用課程的一般內容出題。</p>`}
      </div>
      <div class="form-grid">
        <${Field} label="題數" id="qz-count"><select id="qz-count" value=${count} onChange=${(e) => setCount(Number(e.target.value))}>
          ${[3, 5, 8, 10, 12].map((n) => html`<option value=${n}>${n} 題</option>`)}</select></${Field}>
        <${Field} label="難度" id="qz-diff"><select id="qz-diff" value=${difficulty} onChange=${(e) => setDifficulty(e.target.value)}>
          <option value="basic">基礎（確認觀念）</option><option value="standard">標準（tutorial 程度）</option><option value="exam">考試程度</option></select></${Field}>
        <${Field} label="特別想練（選填）" id="qz-focus"><input id="qz-focus" value=${focus} onInput=${(e) => setFocus(e.target.value)} placeholder="例如：mathematical induction、PCI DSS" /></${Field}>
      </div>
      ${weak.length
        ? html`<label class="check"><input type="checkbox" id="qz-weak" checked=${useWeak} onChange=${(e) => setUseWeak(e.target.checked)} />
            優先出我問答卡住的主題：<span class="muted">${weak.join('、')}</span></label>`
        : null}
      <div class="form-actions">
        <${Btn} kind="primary" icon="spark" disabled=${ai.busy || rt.ai !== 'ready' || !course} onClick=${create}>出題</${Btn}>
      </div>
      <${Thinking} ai=${ai} label="書僮出題中" detail="大約 30-90 秒" />
      <${AIError} ai=${ai} onRetry=${create} />
    </div>
  </div>`;
}

/* ---------- quiz runner ---------- */
const normOut = (s) =>
  String(s || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .trim();

function correctAnswerText(q) {
  if (q.type === 'mcq') return `${'ABCDEF'[q.answer_index]}. ${q.options[q.answer_index]}`;
  if (q.type === 'tf') return q.answer_bool ? 'True（對）' : 'False（錯）';
  if (q.type === 'trace') return q.expected_output;
  if (q.type === 'parsons') return q.lines.join('\n');
  if (q.type === 'steps') return [q.model_answer, q.final_answer && `Answer: ${q.final_answer}`].filter(Boolean).join('\n\n');
  return q.model_answer;
}

function responseText(q, r) {
  if (!r) return '';
  if (q.type === 'mcq') return r.choice != null ? `${'ABCDEF'[r.choice]}. ${q.options[r.choice]}` : '';
  if (q.type === 'tf') return `${r.choice === true ? 'True' : r.choice === false ? 'False' : '—'}${r.text ? ' — ' + r.text : ''}`;
  if (q.type === 'parsons') return (r.seq || []).map((i) => q.lines[i]).join('\n');
  return r.text || '';
}

/** Grade what the page can grade; return the items Claude must mark. */
function localGrade(q, r) {
  if (q.type === 'mcq') return { score: r && r.choice === q.answer_index ? 1 : 0 };
  if (q.type === 'tf') return { score: r && r.choice === q.answer_bool ? 1 : 0 };
  if (q.type === 'parsons') {
    const seq = (r && r.seq) || [];
    const ok = seq.length === q.lines.length && seq.every((i, k) => q.lines[i] === q.lines[k]);
    return { score: ok ? 1 : 0 };
  }
  if (q.type === 'trace') return normOut(r && r.text) === normOut(q.expected_output) ? { score: 1 } : null;
  return null;
}

function QuizRunner({ quiz, onNew }) {
  const ai = useAI();
  const draftKey = 'quiz:' + quiz.id;
  const [resp, setResp] = useState(() => ({ ...(quiz.responses || {}), ...U.store.get(draftKey, {}) }));
  const [images, setImages] = useState({});
  const graded = quiz.status === 'graded';
  const course = Store.course(quiz.courseCode);
  useEffect(() => {
    if (!graded) U.store.set(draftKey, resp);
  }, [resp]);
  const setR = (id, patch) => setResp((x) => ({ ...x, [id]: { ...(x[id] || {}), ...patch } }));
  const answered = quiz.questions.filter((q) => responseText(q, resp[q.id]).trim() || (images[q.id] || []).length).length;

  const submit = () =>
    ai.run(async ({ signal, onProgress }) => {
      const results = {};
      const toAI = [];
      for (const q of quiz.questions) {
        const r = resp[q.id];
        const local = localGrade(q, r);
        if (local && (local.score === 1 || !['trace'].includes(q.type))) {
          results[q.id] = { score: local.score, verdict: local.score === 1 ? 'correct' : 'incorrect', local: true };
          continue;
        }
        if (!AI_MARKED.has(q.type) && q.type !== 'trace') continue;
        const text = responseText(q, r);
        if (!text.trim() && !(images[q.id] || []).length) {
          results[q.id] = { score: 0, verdict: 'incorrect', feedback_zh: '沒有作答。', local: true };
          continue;
        }
        toAI.push({
          id: q.id,
          type: q.type,
          prompt: q.prompt_en,
          code: q.code || undefined,
          expected_output: q.type === 'trace' ? q.expected_output : undefined,
          model_answer: q.model_answer || undefined,
          final_answer: q.final_answer || undefined,
          rubric: q.rubric.length ? q.rubric : undefined,
          answer: text,
        });
      }
      if (toAI.length) {
        const withImg = toAI.filter((x) => (images[x.id] || []).length);
        const plain = toAI.filter((x) => !(images[x.id] || []).length);
        // Keep only results for the items we actually sent, so a stray id can't overwrite a local mark.
        const only = (res, items) => Object.fromEntries(Object.entries(res).filter(([id]) => items.some((x) => x.id === id)));
        if (plain.length) Object.assign(results, only(await AI.grade({ course, items: plain, signal, onProgress }), plain));
        for (const item of withImg) Object.assign(results, only(await AI.grade({ course, items: [item], images: images[item.id], signal, onProgress }), [item]));
        for (const item of toAI) if (!results[item.id]) results[item.id] = { score: 0, verdict: 'incorrect', feedback_zh: '書僮沒有批改到這題，可以重新送出。' };
      }
      const marks = U.sum(quiz.questions.map((q) => q.marks || 1));
      const got = U.sum(quiz.questions.map((q) => ((results[q.id] && results[q.id].score) || 0) * (q.marks || 1)));
      const score = marks ? got / marks : 0;
      // Wrong or partial answers go to the mistake book.
      let added = 0;
      for (const q of quiz.questions) {
        const r = results[q.id];
        if (!r || r.score >= 1) continue;
        await Store.set('cards', U.uid('k'), {
          courseCode: quiz.courseCode,
          kind: 'mistake',
          front: q.prompt_en || QTYPES[q.type].label,
          back: correctAnswerText(q),
          extra: { qtype: q.type, code: q.code, zh: q.explanation_zh, explanation: q.explanation_en, yours: responseText(q, resp[q.id]), topic: q.topic },
          source: { type: 'quiz', quizId: quiz.id },
          srs: SRS.fresh(),
          createdAt: U.nowIso(),
        });
        added++;
      }
      await Store.patch('quizzes', quiz.id, { responses: resp, results, score, status: 'graded', gradedAt: U.nowIso(), mistakesAdded: added });
      U.store.set(draftKey, {});
      Store.bumpDay('quizQs', quiz.questions.length);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

  const score = quiz.score;
  return html`<div class="stack">
    <header class="quiz-head">
      <div><${CourseChip} code=${quiz.courseCode} /> <span class="muted small">${U.fmtTime(quiz.createdAt)} · ${quiz.questions.length} 題 · ${
        { basic: '基礎', standard: '標準', exam: '考試程度' }[quiz.spec && quiz.spec.difficulty] || ''
      }</span></div>
      <h2 class="quiz-head__title">${quiz.title}</h2>
      ${graded
        ? html`<div class="score">
            <span class="score__num">${Math.round(score * 100)}</span><span class="score__unit">分</span>
            <span class="muted">${quiz.mistakesAdded ? `${quiz.mistakesAdded} 題已加入錯題本` : '全對！'}</span>
          </div>`
        : html`<${Progress} value=${answered / quiz.questions.length} label="作答進度" /><span class="muted small">已作答 ${answered}/${quiz.questions.length}</span>`}
    </header>
    <ol class="questions">
      ${quiz.questions.map(
        (q, i) => html`<${QuestionCard} key=${q.id} n=${i + 1} q=${q} r=${resp[q.id]} result=${graded ? quiz.results[q.id] : null}
          onChange=${(patch) => setR(q.id, patch)} images=${images[q.id]} onImages=${(f) => setImages({ ...images, [q.id]: f })} disabled=${graded || ai.busy} />`
      )}
    </ol>
    <${Thinking} ai=${ai} label="書僮批改中" />
    <${AIError} ai=${ai} onRetry=${submit} />
    <div class="row wrap">
      ${!graded ? html`<${Btn} kind="primary" icon="check" disabled=${ai.busy || !answered} onClick=${submit}>交卷並批改</${Btn}>` : null}
      ${graded && quiz.tag && quiz.tag.startsWith('quizprep:')
        ? html`<${Btn} kind="primary" icon="left" onClick=${() => go('review', { tab: 'quiz', course: quiz.courseCode })}>回到小考準備</${Btn}>`
        : null}
      <${Btn} kind="ghost" icon="plus" onClick=${onNew}>出新的一份</${Btn}>
      ${graded ? html`<${Btn} kind="ghost" icon="card" onClick=${() => go('practice', { tab: 'mistakes', course: quiz.courseCode })}>看錯題本</${Btn}>` : null}
    </div>
  </div>`;
}

function QuestionCard({ q, n, r = {}, result, onChange, disabled, images, onImages }) {
  const verdictTone = result ? (result.score >= 1 ? 'ok' : result.score > 0 ? 'warn' : 'bad') : null;
  const mono = ['trace', 'debug', 'write'].includes(q.type);
  return html`<li class=${U.cls('q', verdictTone && 'q--' + verdictTone)}>
    <div class="q__head">
      <span class="q__n">${n}</span>
      <span class="q__type">${QTYPES[q.type].label}</span>
      ${q.topic ? html`<span class="q__topic">${q.topic}</span>` : null}
      <span class="q__marks">${q.marks} 分</span>
      ${result ? html`<span class=${'pill pill--' + verdictTone}>${result.score >= 1 ? '正確' : result.score > 0 ? `部分 ${Math.round(result.score * 100)}%` : '錯誤'}</span>` : null}
    </div>
    ${q.prompt_en ? html`<${Bilingual} en=${q.prompt_en} zh=${q.prompt_zh} />` : null}
    ${q.type === 'trace' && !q.prompt_en ? html`<p class="en">What does this code print?</p>` : null}
    ${q.type === 'proof' && q.technique && result ? html`<p class="muted small">建議方法：${q.technique}</p>` : null}
    <${CodeBlock} code=${q.code} />

    ${q.type === 'mcq'
      ? html`<div class="opts" role="radiogroup">${q.options.map(
          (o, k) => html`<label key=${k} class=${U.cls('opt', r.choice === k && 'is-on', result && k === q.answer_index && 'is-right', result && r.choice === k && k !== q.answer_index && 'is-wrong')}>
            <input type="radio" name=${'q-' + q.id} id=${'q-' + q.id + '-' + k} checked=${r.choice === k} disabled=${disabled} onChange=${() => onChange({ choice: k })} />
            <span class="opt__key">${'ABCDEF'[k]}</span><span class="opt__text">${o}</span>
          </label>`
        )}</div>`
      : null}
    ${q.type === 'tf'
      ? html`<div class="stack-sm">
          <div class="row">
            ${[true, false].map(
              (v) => html`<button type="button" key=${String(v)} class=${U.cls('tf', r.choice === v && 'is-on')} disabled=${disabled} onClick=${() => onChange({ choice: v })}>${v ? 'True 對' : 'False 錯'}</button>`
            )}
          </div>
          <textarea id=${'q-' + q.id + '-why'} rows="2" placeholder="理由（英文，選填）" value=${r.text || ''} disabled=${disabled} onInput=${(e) => onChange({ text: e.target.value })}></textarea>
        </div>`
      : null}
    ${q.type === 'parsons' ? html`<${Parsons} q=${q} r=${r} disabled=${disabled} onChange=${onChange} />` : null}
    ${['short', 'scenario', 'compare', 'trace', 'debug', 'write', 'steps', 'proof'].includes(q.type)
      ? html`<textarea id=${'q-' + q.id + '-text'} class=${U.cls('answer', mono && 'mono')} rows=${q.type === 'short' || q.type === 'trace' ? 3 : 7}
          placeholder=${{
            trace: '寫下程式會印出的內容（每行一行）',
            debug: '寫出修正後的程式，並用一句話說明錯在哪',
            write: 'def ...',
            steps: '寫出每一步（也可以附上手寫照片）',
            proof: '寫出證明，每一步寫理由（也可以附上手寫照片）',
          }[q.type] || '用英文作答（不會的字可以先寫中文）'}
          value=${r.text ?? (q.type === 'debug' ? q.code : '')} disabled=${disabled} onInput=${(e) => onChange({ text: e.target.value })}></textarea>`
      : null}
    ${(q.type === 'steps' || q.type === 'proof') && !result ? html`<${ImagePicker} id=${'q-img-' + q.id} files=${images} onChange=${onImages} />` : null}

    ${result
      ? html`<div class="q__result">
          ${q.type !== 'mcq'
            ? html`<div class="q__answer"><span class="fb__tag">正確答案</span>${['trace', 'parsons', 'write', 'debug'].includes(q.type) ? html`<${CodeBlock} code=${correctAnswerText(q)} plain=${q.type === 'trace'} />` : html`<${Md} text=${correctAnswerText(q)} />`}</div>`
            : null}
          ${result.feedback_zh ? html`<p class="q__fb">${result.feedback_zh}</p>` : null}
          ${result.missing && result.missing.length ? html`<div class="small"><b>漏掉的重點：</b>${result.missing.join('；')}</div>` : null}
          ${q.explanation_en || q.explanation_zh ? html`<div class="q__explain"><p class="en">${q.explanation_en}</p><p class="zh">${q.explanation_zh}</p></div>` : null}
          ${result.better_answer_en ? html`<div class="fb__line"><span class="fb__tag">更好的答案</span><${Md} text=${result.better_answer_en} /></div>` : null}
          <${CorrectionTable} changes=${result.english_changes} />
        </div>`
      : null}
  </li>`;
}

function Parsons({ q, r, disabled, onChange }) {
  const seq = r.seq || [];
  const order = q.order || q.lines.map((_, i) => i);
  const pool = order.filter((i) => !seq.includes(i));
  return html`<div class="parsons">
    <div class="parsons__col">
      <div class="parsons__label">點選程式碼，依序排到右邊</div>
      ${pool.map((i) => html`<button type="button" key=${i} class="pline" disabled=${disabled} onClick=${() => onChange({ seq: [...seq, i] })}>${q.lines[i]}</button>`)}
      ${!pool.length ? html`<span class="muted small">全部排好了</span>` : null}
    </div>
    <div class="parsons__col parsons__col--answer">
      <div class="parsons__label">你的程式（點一下可移回）</div>
      ${seq.map((i, k) => html`<button type="button" key=${k} class="pline pline--placed" disabled=${disabled} onClick=${() => onChange({ seq: seq.filter((_, j) => j !== k) })}>${q.lines[i]}</button>`)}
    </div>
  </div>`;
}

/* ---------- flashcards ---------- */
function examDateFor(code) {
  const c = Store.course(code);
  return (c && c.exam && c.exam.date) || Store.state.settings.semester.examEnd || null;
}

function Review({ params }) {
  const s = useStore();
  const today = U.today();
  const [course, setCourse] = useState(params.course || 'all');
  const [kind, setKind] = useState(params.kind || 'all');
  const [reverse, setReverse] = useState(false);
  // A given set of cards (e.g. last week's before a quiz) starts right away, due or not.
  const [queue, setQueue] = useState(params.cards && params.cards.length ? params.cards.slice(0, 40) : null);
  const [flipped, setFlipped] = useState(false);
  const [doneN, setDoneN] = useState(0);
  const [mode, setMode] = useState('study');
  const match = (c) => (course === 'all' || c.courseCode === course) && (kind === 'all' || c.kind === kind);
  const due = s.cards.filter((c) => match(c) && SRS.isDue(c, today)).sort((a, b) => String(a.srs && a.srs.due).localeCompare(String(b.srs && b.srs.due)));
  const current = queue && queue.length ? Store.get('cards', queue[0]) : null;

  const start = (ids) => {
    setQueue(ids.slice(0, 30));
    setFlipped(false);
    setDoneN(0);
  };
  const rate = async (rating) => {
    if (!current) return;
    const srs = SRS.next(current.srs, rating, today, examDateFor(current.courseCode));
    const rest = queue.slice(1);
    setQueue(rating === 1 ? [...rest, current.id] : rest);
    setFlipped(false);
    setDoneN((n) => n + 1);
    await Store.patch('cards', current.id, { srs });
    Store.bumpDay('reviews');
  };
  useEffect(() => {
    if (!current) return;
    const onKey = (e) => {
      if (/input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped(true);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (mode === 'browse') return html`<${CardBrowser} onBack=${() => setMode('study')} />`;

  if (queue) {
    if (!current)
      return html`<div class="panel center stack">
        <h3>這一輪複習完了</h3>
        <p class="muted">複習了 ${doneN} 張。${due.length ? `還有 ${due.length} 張到期。` : '今天的卡片都完成了。'}</p>
        <div class="row center wrap">
          ${params.back ? html`<${Btn} kind="primary" onClick=${() => go(params.back.route, params.back.params || {})}>${params.back.label || '回上一頁'}</${Btn}>` : null}
          ${due.length ? html`<${Btn} kind=${params.back ? 'ghost' : 'primary'} onClick=${() => start(due.map((c) => c.id))}>再來一輪</${Btn}>` : null}
          <${Btn} kind="ghost" onClick=${() => setQueue(null)}>回到閃卡</${Btn}>
        </div>
      </div>`;
    const preview = SRS.preview(current.srs, today, examDateFor(current.courseCode));
    return html`<div class="stack">
      <div class="row between"><span class="muted small">${params.cards && params.label ? `${params.label} · ` : ''}剩 ${queue.length} 張 · 已複習 ${doneN}</span>
        <${Btn} kind="ghost" size="sm" onClick=${() => setQueue(null)}>結束</${Btn}></div>
      <${FlashCard} card=${current} flipped=${flipped} reverse=${reverse} onFlip=${() => setFlipped(true)} />
      ${flipped
        ? html`<div class="rate">${SRS.RATINGS.map(
            (rt) => html`<button type="button" key=${rt.value} class=${'rate__btn rate__btn--' + rt.tone} onClick=${() => rate(rt.value)}>
              <span class="rate__label">${rt.label}</span><span class="rate__when">${preview[rt.value]}</span><kbd>${rt.key}</kbd>
            </button>`
          )}</div>`
        : html`<div class="row center"><${Btn} kind="primary" icon="flip" onClick=${() => setFlipped(true)}>顯示答案（空白鍵）</${Btn}></div>`}
    </div>`;
  }

  const kinds = { all: '全部', term: '名詞', concept: '觀念', mistake: '錯題', code: '程式' };
  return html`<div class="stack">
    <div class="panel stack">
      <div class="row wrap">
        <div class="chips">
          <button type="button" class=${U.cls('chip-btn', course === 'all' && 'is-on')} onClick=${() => setCourse('all')}>全部課程</button>
          ${Store.courses().map((c) => html`<button type="button" key=${c.code} class=${U.cls('chip-btn', 'c-' + (c.color || 'pen'), course === c.code && 'is-on')} onClick=${() => setCourse(c.code)}>${c.code}</button>`)}
        </div>
      </div>
      <div class="row wrap">
        <div class="chips">${Object.entries(kinds).map(([k, v]) => html`<button type="button" key=${k} class=${U.cls('chip-btn', kind === k && 'is-on')} onClick=${() => setKind(k)}>${v}</button>`)}</div>
        <label class="check"><input type="checkbox" id="rv-reverse" checked=${reverse} onChange=${(e) => setReverse(e.target.checked)} /> 名詞卡反過來（看中文想英文）</label>
      </div>
      <div class="review-start">
        <div><span class="big-num">${due.length}</span> <span class="muted">張到期</span></div>
        <${Btn} kind="primary" icon="card" disabled=${!due.length} onClick=${() => start(due.map((c) => c.id))}>開始複習</${Btn}>
        <${Btn} kind="ghost" onClick=${() => setMode('browse')}>瀏覽 / 新增卡片（${s.cards.length}）</${Btn}>
      </div>
      ${!s.cards.length
        ? html`<p class="muted small">還沒有卡片。導讀裡的關鍵名詞可以一鍵加入；問答和練習答錯的地方也會自動變成卡片。</p>`
        : null}
    </div>
  </div>`;
}

function FlashCard({ card, flipped, reverse, onFlip }) {
  const e = card.extra || {};
  const rev = reverse && card.kind === 'term';
  const front = rev ? `${e.zh || ''}${e.def ? '\n' + e.def : ''}` : card.front;
  return html`<div class=${U.cls('index-card', flipped && 'is-flipped')} onClick=${!flipped ? onFlip : undefined}>
    <div class="index-card__meta"><${CourseChip} code=${card.courseCode} short /><span>${{ term: '名詞', concept: '觀念', mistake: '錯題', code: '程式' }[card.kind] || ''}</span>
      ${card.source && card.source.type === 'starter' ? html`<span class="muted">書僮預設卡</span>` : null}</div>
    <div class="index-card__front">
      ${rev ? html`<div class="muted small">這個英文名詞是？</div>` : null}
      <div class="index-card__text">${front}</div>
      ${!rev && e.code ? html`<${CodeBlock} code=${e.code} />` : null}
    </div>
    ${flipped
      ? html`<div class="index-card__back">
          ${rev ? html`<div class="index-card__text"><mark>${card.front}</mark></div>` : html`<div class="index-card__answer">${card.back}</div>`}
          ${e.example ? html`<div class="en small">e.g. ${e.example}</div>` : null}
          ${e.explanation ? html`<div class="en small">${e.explanation}</div>` : null}
          ${e.zh && card.kind !== 'term' ? html`<div class="zh small">${e.zh}</div>` : null}
          ${e.yours ? html`<div class="small muted">你當時的答案：${U.truncate(e.yours, 200)}</div>` : null}
        </div>`
      : null}
  </div>`;
}

function CardBrowser({ onBack }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('all');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ front: '', back: '', courseCode: Store.courses()[0] ? Store.courses()[0].code : '' });
  const list = s.cards
    .filter((c) => course === 'all' || c.courseCode === course)
    .filter((c) => !q || (c.front + ' ' + c.back).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const add = async () => {
    if (!draft.front.trim() || !draft.back.trim()) return toast('正面和背面都要填。', 'warn');
    await Store.set('cards', U.uid('k'), { ...draft, kind: 'concept', source: { type: 'manual' }, srs: SRS.fresh(), createdAt: U.nowIso() });
    setDraft({ ...draft, front: '', back: '' });
    toast('已新增卡片', 'ok');
  };
  return html`<div class="stack">
    <div class="row between"><${Btn} kind="ghost" size="sm" icon="left" onClick=${onBack}>回到複習</${Btn}><span class="muted small">共 ${list.length} 張</span></div>
    <div class="panel form-grid">
      <${Field} label="課程" id="cb-course"><select id="cb-course" value=${draft.courseCode} onChange=${(e) => setDraft({ ...draft, courseCode: e.target.value })}>
        ${Store.courses().map((c) => html`<option value=${c.code}>${c.code}</option>`)}</select></${Field}>
      <${Field} label="正面（問題）" id="cb-front"><textarea id="cb-front" rows="2" value=${draft.front} onInput=${(e) => setDraft({ ...draft, front: e.target.value })}></textarea></${Field}>
      <${Field} label="背面（答案）" id="cb-back"><textarea id="cb-back" rows="2" value=${draft.back} onInput=${(e) => setDraft({ ...draft, back: e.target.value })}></textarea></${Field}>
      <div class="form-actions"><${Btn} kind="primary" icon="plus" onClick=${add}>新增卡片</${Btn}></div>
    </div>
    <div class="row wrap">
      <input id="cb-search" class="grow" placeholder="搜尋卡片" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <select id="cb-filter" value=${course} onChange=${(e) => setCourse(e.target.value)}>
        <option value="all">全部課程</option>${Store.courses().map((c) => html`<option value=${c.code}>${c.code}</option>`)}</select>
    </div>
    <ul class="cardlist">
      ${list.slice(0, 200).map(
        (c) => html`<li key=${c.id} class=${U.cls('cardrow', c.suspended && 'is-off')}>
          ${editing === c.id
            ? html`<${CardEdit} card=${c} onDone=${() => setEditing(null)} />`
            : html`<${CourseChip} code=${c.courseCode} short />
              <div class="cardrow__text"><div class="cardrow__front">${c.front}</div><div class="cardrow__back muted">${U.truncate(c.back, 140)}</div></div>
              <span class="cardrow__due small muted">${c.suspended ? '已暫停' : c.srs && c.srs.due ? (c.srs.due <= U.today() ? '到期' : U.fmtDate(c.srs.due)) : ''}</span>
              <div class="row">
                <${Btn} kind="ghost" size="sm" icon="edit" onClick=${() => setEditing(c.id)} aria-label="編輯">編輯</${Btn}>
                <${Btn} kind="ghost" size="sm" onClick=${() => Store.patch('cards', c.id, { suspended: !c.suspended })}>${c.suspended ? '恢復' : '暫停'}</${Btn}>
                <${ConfirmBtn} label="刪除" onConfirm=${() => Store.remove('cards', c.id)} />
              </div>`}
        </li>`
      )}
    </ul>
    ${list.length > 200 ? html`<p class="muted small">只顯示最新 200 張，用搜尋找其他卡片。</p>` : null}
  </div>`;
}

function CardEdit({ card, onDone }) {
  const [f, setF] = useState({ front: card.front, back: card.back });
  return html`<div class="stack grow">
    <textarea id=${'ce-f-' + card.id} rows="2" value=${f.front} onInput=${(e) => setF({ ...f, front: e.target.value })}></textarea>
    <textarea id=${'ce-b-' + card.id} rows="3" value=${f.back} onInput=${(e) => setF({ ...f, back: e.target.value })}></textarea>
    <div class="row"><${Btn} kind="primary" size="sm" icon="check" onClick=${async () => (await Store.patch('cards', card.id, f), onDone())}>儲存</${Btn}>
      <${Btn} kind="ghost" size="sm" onClick=${onDone}>取消</${Btn}></div>
  </div>`;
}

/* ---------- mistake book ---------- */
function Mistakes({ params = {} }) {
  const s = useStore();
  const [course, setCourse] = useState(params.course || 'all');
  const list = s.cards
    .filter((c) => c.kind === 'mistake' && (course === 'all' || c.courseCode === course))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const topics = [...new Set(list.map((c) => c.extra && c.extra.topic).filter(Boolean))].slice(0, 6);
  return html`<div class="stack">
    <div class="row wrap between">
      <div class="chips">
        <button type="button" class=${U.cls('chip-btn', course === 'all' && 'is-on')} onClick=${() => setCourse('all')}>全部</button>
        ${Store.courses().map((c) => html`<button type="button" key=${c.code} class=${U.cls('chip-btn', 'c-' + (c.color || 'pen'), course === c.code && 'is-on')} onClick=${() => setCourse(c.code)}>${c.code}</button>`)}
      </div>
      ${list.length && course !== 'all'
        ? html`<${Btn} kind="primary" size="sm" icon="spark" onClick=${() => go('practice', { tab: 'quiz', course, focus: topics.join(', ') })}>針對錯題出新題</${Btn}>`
        : null}
    </div>
    ${!list.length
      ? html`<${Empty} icon="flag" title="錯題本是空的">練習交卷後，答錯或只對一部分的題目會自動收進來，並排進閃卡複習。</${Empty}>`
      : html`<ul class="mistakes">
          ${list.map(
            (c) => html`<li key=${c.id} class="mistake">
              <div class="row between wrap"><span class="row"><${CourseChip} code=${c.courseCode} short />
                ${c.extra && c.extra.qtype ? html`<span class="q__type">${QTYPES[c.extra.qtype] ? QTYPES[c.extra.qtype].label : ''}</span>` : null}
                ${c.extra && c.extra.topic ? html`<span class="q__topic">${c.extra.topic}</span>` : null}</span>
                <span class="small muted">${U.fmtTime(c.createdAt)}</span></div>
              <div class="en">${c.front}</div>
              <${CodeBlock} code=${c.extra && c.extra.code} />
              <details>
                <summary>看答案與解析</summary>
                ${c.extra && c.extra.yours ? html`<div class="small"><span class="fb__tag">你的答案</span> ${c.extra.yours}</div>` : null}
                <div class="small"><span class="fb__tag">正確答案</span></div><${Md} text=${c.back} />
                ${c.extra && c.extra.explanation ? html`<p class="en small">${c.extra.explanation}</p>` : null}
                ${c.extra && c.extra.zh ? html`<p class="zh small">${c.extra.zh}</p>` : null}
              </details>
              <div class="row wrap">
                <span class="small muted">下次複習：${c.srs && c.srs.due ? U.relDay(c.srs.due) : '今天'}</span>
                <${ConfirmBtn} label="移出錯題本" confirm="確定移出" icon="check" onConfirm=${() => Store.remove('cards', c.id)} />
              </div>
            </li>`
          )}
        </ul>`}
  </div>`;
}

/* ---------- history ---------- */
function History({ onOpen }) {
  const s = useStore();
  const list = s.quizzes.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const byCourse = U.groupBy(list.filter((q) => q.status === 'graded'), (q) => q.courseCode);
  return html`<div class="stack">
    ${byCourse.size
      ? html`<div class="trend-grid">${[...byCourse].map(([code, qs]) => html`<${ScoreTrend} key=${code} code=${code} quizzes=${qs.slice().reverse()} />`)}</div>`
      : null}
    ${!list.length
      ? html`<${Empty} icon="practice" title="還沒有練習紀錄">到「出題」選課程和題型，書僮會出一份題目並批改。</${Empty}>`
      : html`<ul class="history">
          ${list.map(
            (q) => html`<li key=${q.id}><button type="button" class="history__row" onClick=${() => onOpen(q.id)}>
              <${CourseChip} code=${q.courseCode} short />
              <span class="history__title">${q.title}</span>
              <span class="small muted">${U.fmtTime(q.createdAt)} · ${(q.questions || []).length} 題</span>
              ${q.status === 'graded'
                ? html`<span class=${'score-chip ' + (q.score >= 0.8 ? 'is-ok' : q.score >= 0.5 ? 'is-warn' : 'is-bad')}>${Math.round(q.score * 100)}</span>`
                : html`<${Pill} tone="muted">未交卷</${Pill}>`}
            </button></li>`
          )}
        </ul>`}
  </div>`;
}

/** Score sparkline per course (oldest → newest), 0-100 scale. */
function ScoreTrend({ code, quizzes }) {
  const pts = quizzes.slice(-12).map((q) => Math.round((q.score || 0) * 100));
  const W = 220;
  const H = 64;
  const pad = 6;
  const x = (i) => pad + (pts.length === 1 ? (W - pad * 2) / 2 : (i * (W - pad * 2)) / (pts.length - 1));
  const y = (v) => H - pad - (v / 100) * (H - pad * 2);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = pts.length > 1 ? `${line} L${x(pts.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z` : '';
  const last = pts[pts.length - 1];
  return html`<div class=${'trend c-' + courseColor(code)}>
    <div class="row between"><${CourseChip} code=${code} short /><span class="trend__last">${last}<small>分</small></span></div>
    <svg viewBox=${`0 0 ${W} ${H}`} class="trend__svg" role="img" aria-label=${`${code} 最近 ${pts.length} 次練習分數`}>
      <line x1=${pad} x2=${W - pad} y1=${y(50)} y2=${y(50)} class="trend__grid" />
      <line x1=${pad} x2=${W - pad} y1=${y(80)} y2=${y(80)} class="trend__grid" />
      ${area ? html`<path d=${area} class="trend__area" />` : null}
      <path d=${line} class="trend__line" />
      <circle cx=${x(pts.length - 1)} cy=${y(last)} r="3.5" class="trend__dot" />
    </svg>
    <div class="small muted">${pts.length} 次 · 80 分與 50 分參考線</div>
  </div>`;
}
