/* view-tutor.js — 書僮: Socratic questioning, Feynman explanations, and free questions about a material. */

const TUTOR_MODES = {
  socratic: { label: '蘇格拉底問答', desc: '書僮一次問一題，依你的回答追問或先解釋，再修改你的英文。' },
  feynman: { label: '費曼講解', desc: '你用簡單英文把一個觀念講給書僮聽，書僮找出漏洞並修改英文。' },
  chat: { label: '自由提問', desc: '看不懂的地方直接問，書僮用中文回答，最後附一句英文說法。' },
};

async function createSession({ courseCode, materialIds, mode, concept }) {
  const id = U.uid('s');
  const mats = materialIds.map((x) => Store.get('materials', x)).filter(Boolean);
  let current = null;
  if (mode === 'socratic' && !concept && mats.length === 1 && mats[0].summary && mats[0].summary.first_question)
    current = mats[0].summary.first_question;
  const title =
    mats.length === 1 ? mats[0].title : mats.length ? `${mats.length} 份講義` : `${courseCode} 整科複習`;
  await Store.set('sessions', id, {
    courseCode,
    materialIds: mats.map((m) => m.id),
    mode,
    concept: concept || '',
    title,
    turns: [],
    chat: [],
    current,
    ended: false,
    startedAt: U.nowIso(),
    updatedAt: U.nowIso(),
  });
  return id;
}

function TutorView({ params }) {
  const s = useStore();
  // Returning to this tab resumes the session you left open.
  const [sessionId, setSessionIdRaw] = useState(params.session || U.store.get('tutor:active', null));
  const setSessionId = (id) => {
    setSessionIdRaw(id);
    U.store.set('tutor:active', id);
  };
  const [autoStarting, setAutoStarting] = useState(false);

  // Coming from a course/material/weak spot: start right away.
  useEffect(() => {
    if (params.session) return setSessionId(params.session);
    if (!params.course || !s.loaded) return;
    if (!params.materials && !params.focus) {
      setSessionId(null);
      return;
    }
    let cancelled = false;
    setAutoStarting(true);
    createSession({
      courseCode: params.course,
      materialIds: params.materials || [],
      mode: params.mode || 'socratic',
      concept: params.focus || '',
    }).then((id) => {
      if (!cancelled) {
        setSessionId(id);
        setAutoStarting(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [Router.state.seq, s.loaded]);

  const session = sessionId && Store.get('sessions', sessionId);
  if (autoStarting) return html`<div class="view"><div class="notice">準備問答中…</div></div>`;
  if (session) return html`<${TutorSession} key=${session.id} session=${session} onExit=${() => setSessionId(null)} />`;
  return html`<${TutorSetup} params=${params} onStart=${setSessionId} />`;
}

function TutorSetup({ params, onStart }) {
  const s = useStore();
  const courses = Store.courses();
  const [course, setCourse] = useState(params.course || (courses[0] && courses[0].code) || '');
  const [picked, setPicked] = useState(params.materials || []);
  const [mode, setMode] = useState(params.mode || 'socratic');
  const [concept, setConcept] = useState('');
  useEffect(() => {
    if (!course && courses[0]) setCourse(courses[0].code);
  }, [courses.length]);
  const mats = s.materials
    .filter((m) => m.courseCode === course)
    .sort((a, b) => (b.week || 0) - (a.week || 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
  const terms = mats
    .filter((m) => picked.includes(m.id) && m.summary)
    .flatMap((m) => m.summary.key_terms.map((t) => t.term))
    .slice(0, 14);
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const start = async () => {
    if (!course) return toast('先選一門課。', 'warn');
    const id = await createSession({ courseCode: course, materialIds: picked, mode, concept: mode === 'feynman' ? concept : '' });
    onStart(id);
  };
  const recent = s.sessions
    .slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 8);

  return html`<div class="view">
    <header class="page-head"><div><p class="eyebrow">一題一題確認你真的懂</p><h1 class="page-title">書僮問答</h1></div></header>
    <${AIGate} />
    <div class="grid-2 grid-2--wide-left">
      <div class="panel stack">
        <${Field} label="課程" id="tu-course">
          <div class="chips" id="tu-course">
            ${courses.map(
              (c) => html`<button type="button" key=${c.code} class=${U.cls('chip-btn', 'c-' + (c.color || 'pen'), course === c.code && 'is-on')}
                onClick=${() => (setCourse(c.code), setPicked([]))}>${c.code}</button>`
            )}
          </div>
        </${Field}>
        <div class="field">
          <span class="field__label">講義（可複選；不選就用整科的導讀）</span>
          ${mats.length
            ? html`<ul class="pick">
                ${mats.map(
                  (m) => html`<li key=${m.id}><label class="pick__item">
                    <input type="checkbox" id=${'tu-m-' + m.id} checked=${picked.includes(m.id)} onChange=${() => toggle(m.id)} />
                    <span class="pick__week">${m.week ? 'W' + m.week : '—'}</span>
                    <span class="pick__title">${m.title}</span>
                    ${m.summary ? html`<${Pill} tone="ok">已導讀</${Pill}>` : null}
                  </label></li>`
                )}
              </ul>`
            : html`<p class="muted small">這門課還沒有講義。可以直接開始（書僮用課程的一般內容出題），或先 <button type="button" class="link" onClick=${() => go('courses', { course, upload: true })}>上傳講義</button>。</p>`}
        </div>
        <div class="field">
          <span class="field__label">方式</span>
          <div class="modes">
            ${Object.entries(TUTOR_MODES).map(
              ([k, v]) => html`<button type="button" key=${k} class=${U.cls('mode', mode === k && 'is-on')} onClick=${() => setMode(k)}>
                <span class="mode__label">${v.label}</span><span class="mode__desc">${v.desc}</span>
              </button>`
            )}
          </div>
        </div>
        ${mode === 'feynman'
          ? html`<${Field} label="要講解的觀念" id="tu-concept" hint="留空就由書僮從講義挑一個">
              <input id="tu-concept" value=${concept} onInput=${(e) => setConcept(e.target.value)} placeholder="例如：defence in depth" />
              ${terms.length ? html`<div class="chips">${terms.map((t) => html`<button type="button" key=${t} class="chip-btn" onClick=${() => setConcept(t)}>${t}</button>`)}</div>` : null}
            </${Field}>`
          : null}
        <div class="form-actions"><${Btn} kind="primary" icon="tutor" onClick=${start} disabled=${!course}>開始</${Btn}></div>
      </div>

      <${Section} title="最近的問答">
        ${recent.length
          ? html`<ul class="sessions">
              ${recent.map((x) => {
                const levels = (x.turns || []).filter((t) => t.fb).map((t) => t.fb.understanding);
                return html`<li key=${x.id}><button type="button" class="session-row" onClick=${() => onStart(x.id)}>
                  <${CourseChip} code=${x.courseCode} short />
                  <span class="session-row__title">${x.title}</span>
                  <span class="session-row__meta">${TUTOR_MODES[x.mode] ? TUTOR_MODES[x.mode].label : ''} · ${x.mode === 'chat' ? `${Math.floor((x.chat || []).length / 2)} 問` : `${levels.length} 題`} · ${U.fmtTime(x.updatedAt)}</span>
                  <span class="dots">${levels.slice(-10).map((l, i) => html`<i key=${i} class=${'dot dot--' + LEVELS[l].tone}></i>`)}</span>
                </button></li>`;
              })}
            </ul>`
          : html`<p class="muted">還沒有問答紀錄。</p>`}
      </${Section}>
    </div>
  </div>`;
}

function TutorSession({ session, onExit }) {
  const course = Store.course(session.courseCode);
  const mats = (session.materialIds || []).map((x) => Store.get('materials', x)).filter(Boolean);
  if (session.mode === 'chat') return html`<${TutorChat} session=${session} course=${course} mats=${mats} onExit=${onExit} />`;
  return html`<${TutorQA} session=${session} course=${course} mats=${mats} onExit=${onExit} />`;
}

function SessionHeader({ session, mats, onExit, children }) {
  return html`<header class="session-head">
    <div class="session-head__info">
      <${CourseChip} code=${session.courseCode} />
      <span class="session-head__mode">${TUTOR_MODES[session.mode] ? TUTOR_MODES[session.mode].label : ''}</span>
      <span class="session-head__title">${mats.length ? mats.map((m) => m.title).join('、') : session.title}</span>
    </div>
    <div class="row wrap">${children}<${Btn} kind="ghost" size="sm" icon="left" onClick=${onExit}>換一個</${Btn}></div>
  </header>`;
}

function TutorQA({ session, course, mats, onExit }) {
  const ai = useAI();
  const rt = useRuntime();
  const draftKey = 'draft:' + session.id;
  const [answer, setAnswer] = useState(() => U.store.get(draftKey, ''));
  const [images, setImages] = useState([]);
  const [showGuide, setShowGuide] = useState(session.turns.length === 0);
  const [lastCard, setLastCard] = useState(null);
  const bottom = useRef(null);
  const guide = mats.length === 1 && mats[0].summary ? mats[0].summary : null;

  // One lecture without a 導讀: offer to write it first (English overview, why it is taught, what to learn), then ask.
  const needsGuide = session.mode === 'socratic' && mats.length === 1 && !mats[0].summary && !session.turns.length && !session.current;
  useEffect(() => U.store.set(draftKey, answer), [answer]);
  useEffect(() => {
    if (!session.current && !session.ended && !session.turns.length && rt.ai === 'ready' && !ai.busy && !needsGuide) fetchOpening();
  }, [rt.ai]);

  const guideThenAsk = () =>
    ai.run(async ({ signal, onProgress }) => {
      const m = mats[0];
      const summary = await AI.summarize({ course, material: m, text: await Store.getText(m.id), signal, onProgress });
      await Store.patch('materials', m.id, { summary, summaryAt: U.nowIso(), updatedAt: U.nowIso() });
      await Store.patch('sessions', session.id, { current: summary.first_question, updatedAt: U.nowIso() });
      setShowGuide(true);
    });

  const fetchOpening = (concept) =>
    ai.run(async ({ signal, onProgress }) => {
      const q = await AI.openingQuestion({ course, materials: mats, mode: session.mode, concept: concept || session.concept, signal, onProgress });
      await Store.patch('sessions', session.id, { current: q, updatedAt: U.nowIso() });
    });

  const skip = () => {
    const covered = session.turns.map((t) => t.q.focus).filter(Boolean);
    if (session.current && session.current.focus) covered.push(session.current.focus);
    fetchOpening(`a different key idea of the material, not about: ${covered.join(', ') || 'the previous question'}`);
  };

  const submit = (text) => {
    const q = session.current;
    if (!q) return;
    const sent = images;
    ai.run(async ({ signal, onProgress }) => {
      const fb = await AI.tutorTurn({ course, materials: mats, session, question: q, answer: text, signal, onProgress, images: sent });
      const turn = { q, a: text, fb, at: U.nowIso(), images: sent.length };
      const turns = [...session.turns, turn];
      // A session is one db document (256 KiB): very long ones wrap up and start fresh.
      const full = turns.length >= 30 || JSON.stringify(turns).length > 170000;
      const next = fb.next_action === 'wrap_up' || full ? null : fb.next_question;
      await Store.patch('sessions', session.id, { turns, current: next, full, updatedAt: U.nowIso() });
      setAnswer('');
      setImages([]);
      U.store.set(draftKey, '');
      Store.bumpDay('answered');
      if (fb.card && fb.understanding !== 'clear') {
        const id = U.uid('k');
        await Store.set('cards', id, {
          courseCode: session.courseCode,
          kind: 'concept',
          front: fb.card.front,
          back: fb.card.back,
          extra: { zh: fb.model_answer_zh },
          source: { type: 'tutor', sessionId: session.id, materialId: mats[0] ? mats[0].id : null },
          srs: SRS.fresh(),
          createdAt: U.nowIso(),
        });
        setLastCard(id);
      } else setLastCard(null);
      requestAnimationFrame(() => bottom.current && bottom.current.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
  };

  const finish = () =>
    ai.run(async ({ signal, onProgress }) => {
      const r = session.turns.length ? await AI.recap({ course, session, signal, onProgress }) : null;
      await Store.patch('sessions', session.id, { ended: true, recap: r, current: session.current, updatedAt: U.nowIso() });
    });

  const levels = session.turns.filter((t) => t.fb).map((t) => t.fb.understanding);

  return html`<div class="view view--session">
    <${SessionHeader} session=${session} mats=${mats} onExit=${onExit}>
      ${levels.length ? html`<span class="dots" aria-label="理解程度">${levels.map((l, i) => html`<i key=${i} class=${'dot dot--' + LEVELS[l].tone} title=${LEVELS[l].label}></i>`)}</span>` : null}
      ${!session.ended ? html`<${Btn} kind="ghost" size="sm" icon="flag" disabled=${ai.busy} onClick=${finish}>結束並總結</${Btn}>` : null}
    </${SessionHeader}>
    <${AIGate} />

    ${guide
      ? html`<details class="guide-mini" open=${showGuide} onToggle=${(e) => setShowGuide(e.target.open)}>
          <summary>導讀：${guide.title_en}</summary>
          <p class="en">${guide.overview_en}</p>
          <p class="zh">${guide.overview_zh}</p>
          <div class="grid-2">
            <div><h4>Why learn this</h4><ul>${guide.why_learn.map((x, i) => html`<li key=${i}>${x.en}<div class="zh small">${x.zh}</div></li>`)}</ul></div>
            <div><h4>You should be able to</h4><ul>${guide.goals.map((x, i) => html`<li key=${i}>${x.en}<div class="zh small">${x.zh}</div></li>`)}</ul></div>
          </div>
        </details>`
      : null}

    <ol class="thread">
      ${session.turns.map((t, i) => html`<${Turn} key=${i} n=${i + 1} turn=${t} cardId=${i === session.turns.length - 1 ? lastCard : null} />`)}
    </ol>
    <div ref=${bottom}></div>

    ${session.ended
      ? html`<${Recap} session=${session} onNew=${onExit} />`
      : session.current
        ? html`<div class="ask">
            <div class="ask__q">
              <span class="ask__n">Q${session.turns.length + 1}</span>
              <div class="ask__body">
                ${session.current.focus ? html`<span class="ask__focus">${session.current.focus}</span>` : null}
                <${Bilingual} key=${session.current.en} en=${session.current.en} zh=${session.current.zh} />
                <${CodeBlock} code=${session.current.code} />
                <${ExplainBtn} key=${'x' + session.current.en} text=${session.current.en} label="這題在問什麼？" />
              </div>
            </div>
            <textarea id="tutor-answer" class="answer" rows="5" value=${answer} disabled=${ai.busy}
              placeholder="用英文回答。不會的字可以先寫中文，書僮會幫你改成自然的英文。（Ctrl + Enter 送出）"
              onInput=${(e) => setAnswer(e.target.value)}
              onKeyDown=${(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && answer.trim()) submit(answer.trim());
              }}></textarea>
            <div class="ask__bar">
              <${ImagePicker} id="tutor-img" files=${images} onChange=${setImages} />
              <span class="spacer"></span>
              <${Btn} kind="ghost" size="sm" disabled=${ai.busy} onClick=${skip}>換一題</${Btn}>
              <${Btn} kind="ghost" size="sm" disabled=${ai.busy} onClick=${() => submit('')}>我不知道，先解釋</${Btn}>
              <${Btn} kind="primary" icon="check" disabled=${ai.busy || (!answer.trim() && !images.length)} onClick=${() => submit(answer.trim())}>送出</${Btn}>
            </div>
          </div>`
        : !ai.busy
          ? session.turns.length
            ? html`<div class="panel center">
                <p>${session.full ? '這一輪問答已經很長了，先總結，再開新的一輪。' : '這份講義的重點都問過了。'}</p>
                <div class="row wrap center"><${Btn} kind="primary" icon="flag" onClick=${finish}>產生總結</${Btn}>
                <${Btn} kind="ghost" onClick=${() => fetchOpening('the hardest idea in the material')}>再挑戰一題</${Btn}></div>
              </div>`
            : needsGuide
              ? html`<div class="panel guide-cta">
                  <h3>先讀導讀，再開始問答</h3>
                  <p>這份講義還沒有導讀。書僮會先用英文整理：在講什麼、老師為什麼要教、你要學會什麼，再從第一個重點開始問你。</p>
                  <div class="row wrap">
                    <${Btn} kind="primary" icon="spark" disabled=${rt.ai !== 'ready'} onClick=${guideThenAsk}>產生導讀並開始</${Btn}>
                    <${Btn} kind="ghost" disabled=${rt.ai !== 'ready'} onClick=${() => fetchOpening()}>直接開始問答</${Btn}>
                  </div>
                </div>`
              : html`<div class="panel center"><${Btn} kind="primary" icon="spark" disabled=${rt.ai !== 'ready'} onClick=${() => fetchOpening()}>產生第一題</${Btn}></div>`
          : null}
    <${Thinking} ai=${ai} label=${session.current ? '書僮正在看你的回答' : '書僮正在想題目'} />
    <${AIError} ai=${ai} />
  </div>`;
}

function Turn({ turn, n, cardId }) {
  const fb = turn.fb;
  return html`<li class="turn">
    <div class="turn__q">
      <span class="turn__n">Q${n}</span>
      <div>
        ${turn.q.focus ? html`<span class="ask__focus">${turn.q.focus}</span>` : null}
        <div class="en">${turn.q.en}</div>
        ${turn.q.zh ? html`<div class="zh small">${turn.q.zh}</div>` : null}
        <${CodeBlock} code=${turn.q.code} />
      </div>
    </div>
    <div class="turn__a">
      <span class="turn__who">你的回答</span>
      <div class="turn__text">${turn.a || html`<span class="muted">（我不知道）</span>`}</div>
      ${turn.images ? html`<span class="muted small">附 ${turn.images} 張手寫照片</span>` : null}
    </div>
    ${fb ? html`<${Feedback} fb=${fb} cardId=${cardId} />` : null}
  </li>`;
}

function Feedback({ fb, cardId }) {
  const [showModel, setShowModel] = useState(fb.understanding !== 'clear');
  const e = fb.english || {};
  return html`<div class=${'fb fb--' + LEVELS[fb.understanding].tone}>
    <div class="fb__head"><${LevelPill} level=${fb.understanding} /><span>${fb.verdict_zh}</span></div>
    ${fb.good.length || fb.missing.length || fb.misconceptions.length
      ? html`<div class="fb__cols">
          ${fb.good.length ? html`<div class="fb__col fb__col--ok"><h4>做得好</h4><ul>${fb.good.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul></div>` : null}
          ${fb.missing.length ? html`<div class="fb__col fb__col--warn"><h4>可以補上</h4><ul>${fb.missing.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul></div>` : null}
          ${fb.misconceptions.length ? html`<div class="fb__col fb__col--bad"><h4>觀念要修正</h4><ul>${fb.misconceptions.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul></div>` : null}
        </div>`
      : null}
    ${fb.explanation && (fb.explanation.en || fb.explanation.zh)
      ? html`<div class="fb__explain"><h4>先解釋一下</h4><p class="en">${fb.explanation.en}</p><p class="zh">${fb.explanation.zh}</p></div>`
      : null}
    ${fb.model_answer_en
      ? html`<div class="fb__model">
          <button type="button" class="link" onClick=${() => setShowModel(!showModel)}>${showModel ? '收起參考答案' : '看參考答案'}</button>
          ${showModel ? html`<p class="en">${fb.model_answer_en}</p>${fb.model_answer_zh ? html`<p class="zh">${fb.model_answer_zh}</p>` : null}` : null}
        </div>`
      : null}
    ${e.corrected || (e.changes && e.changes.length)
      ? html`<div class="fb__english">
          <h4>英文修改 <span class="muted small">${e.summary_zh}</span></h4>
          <${CorrectionTable} changes=${e.changes} />
          ${e.corrected ? html`<div class="fb__line"><span class="fb__tag">修正後</span><span class="en">${e.corrected}</span></div>` : null}
          ${e.natural ? html`<div class="fb__line"><span class="fb__tag">更自然</span><span class="en">${e.natural}</span><${CopyBtn} text=${e.natural} /></div>` : null}
        </div>`
      : null}
    ${cardId && Store.get('cards', cardId)
      ? html`<div class="fb__card muted small"><${Icon} name="card" size=${14} /> 已把這個觀念加入閃卡
          <button type="button" class="link" onClick=${() => Store.remove('cards', cardId)}>不要這張</button></div>`
      : null}
  </div>`;
}

function Recap({ session, onNew }) {
  const r = session.recap;
  const levels = session.turns.filter((t) => t.fb).map((t) => t.fb.understanding);
  const count = (l) => levels.filter((x) => x === l).length;
  return html`<section class="panel recap">
    <h3>這次問答的總結</h3>
    <div class="row wrap">
      <${Pill} tone="ok">清楚 ${count('clear')}</${Pill}><${Pill} tone="warn">部分 ${count('partial')}</${Pill}><${Pill} tone="bad">不懂 ${count('confused')}</${Pill}>
    </div>
    ${r
      ? html`<p>${r.summary_zh}</p>
          <div class="grid-2">
            ${r.strengths.length ? html`<div><h4>做得好的地方</h4><ul>${r.strengths.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul></div>` : null}
            ${r.gaps.length ? html`<div><h4>還要加強</h4><ul>${r.gaps.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul></div>` : null}
            ${r.next_steps.length ? html`<div><h4>下一步</h4><ul>${r.next_steps.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul></div>` : null}
            ${r.english_patterns.length ? html`<div><h4>你的英文常見錯誤</h4><ul>${r.english_patterns.map((x, i) => html`<li key=${i}>${x}</li>`)}</ul></div>` : null}
          </div>`
      : html`<p class="muted">沒有回答紀錄。</p>`}
    <div class="row wrap">
      <${Btn} kind="primary" icon="card" onClick=${() => go('practice', { tab: 'review' })}>去複習閃卡</${Btn}>
      <${Btn} kind="ghost" icon="practice" onClick=${() => go('practice', { course: session.courseCode, materials: session.materialIds, tab: 'quiz' })}>用同樣講義出題</${Btn}>
      <${Btn} kind="ghost" icon="plus" onClick=${onNew}>新的問答</${Btn}>
    </div>
  </section>`;
}

function TutorChat({ session, course, mats, onExit }) {
  const ai = useAI();
  const [q, setQ] = useState('');
  const [stream, setStream] = useState('');
  const chat = session.chat || [];
  const bottom = useRef(null);
  const full = JSON.stringify(chat).length > 170000;
  const send = () => {
    const text = q.trim();
    if (!text || full) return;
    const turns = [...chat, { role: 'user', content: text }];
    setQ('');
    ai.run(async ({ signal }) => {
      await Store.patch('sessions', session.id, { chat: turns, updatedAt: U.nowIso() });
      const r = await AI.chat({ course, materials: mats, turns, signal, onText: (t) => setStream(t) });
      await Store.patch('sessions', session.id, { chat: [...turns, { role: 'assistant', content: r.text }], updatedAt: U.nowIso() });
      setStream('');
      Store.bumpDay('answered');
      requestAnimationFrame(() => bottom.current && bottom.current.scrollIntoView({ behavior: 'smooth' }));
    });
  };
  const pending = ai.busy && chat.length && chat[chat.length - 1].role === 'user';
  return html`<div class="view view--session">
    <${SessionHeader} session=${session} mats=${mats} onExit=${onExit} />
    <${AIGate} />
    ${!chat.length
      ? html`<${Empty} icon="tutor" title="有什麼看不懂的？">
          例如：「What is the difference between authentication and authorisation?」、「這頁的 inclusion–exclusion 怎麼用？」、「這段 Python 為什麼會印出 None？」
        </${Empty}>`
      : null}
    <ol class="chat">
      ${chat.map(
        (m, i) => html`<li key=${i} class=${'msg msg--' + m.role}>
          ${m.role === 'user' ? html`<div class="msg__text">${m.content}</div>` : html`<${Md} text=${m.content} />`}
        </li>`
      )}
      ${pending && stream ? html`<li class="msg msg--assistant"><${Md} text=${stream} /></li>` : null}
    </ol>
    <div ref=${bottom}></div>
    <${Thinking} ai=${ai} label="書僮回答中" />
    <${AIError} ai=${ai} />
    ${full ? html`<div class="notice">這段對話已經很長了，按「換一個」開新的對話，書僮會回答得更準。</div>` : null}
    <div class="ask ask--chat">
      <textarea id="chat-input" class="answer" rows="3" value=${q} disabled=${ai.busy} placeholder="輸入問題（中英文都可以，Ctrl + Enter 送出）"
        onInput=${(e) => setQ(e.target.value)}
        onKeyDown=${(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
        }}></textarea>
      <div class="ask__bar"><span class="spacer"></span><${Btn} kind="primary" icon="right" disabled=${ai.busy || !q.trim()} onClick=${send}>送出</${Btn}></div>
    </div>
  </div>`;
}
