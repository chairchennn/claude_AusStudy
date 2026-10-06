/* view-drill.js — 題型練習 for maths: study worked examples, then solve easy problems of the same types yourself
   (check against the full solution), then move on to real, graded practice (練習題). No Socratic questioning. */

const drillIdForMaterial = (materialId) => `m-${materialId}`;
const drillIdForWeek = (code, week) => `wk-${code}-W${week}`;

/** How far a drill has got: every example understood, every basic problem self-marked. */
function drillProgress(d) {
  const ex = (d && d.examples) || [];
  const bs = (d && d.basics) || [];
  const seen = (d && d.seen) || {};
  const res = (d && d.results) || {};
  return {
    exists: !!d,
    seen: ex.filter((_, i) => seen[i]).length,
    marked: bs.filter((_, i) => res[i]).length,
    ok: bs.filter((_, i) => res[i] === 'ok').length,
    examples: ex.length > 0 && ex.every((_, i) => seen[i]),
    basics: bs.length > 0 && bs.every((_, i) => res[i]),
  };
}

const DRILL_STAGES = [
  { id: 'examples', label: '例題', sub: '看懂附詳解的例題' },
  { id: 'basics', label: '基礎題', sub: '自己做，再對詳解' },
  { id: 'practice', label: '練習題', sub: '正式出題並批改' },
];

function DrillSteps({ steps }) {
  return html`<ol class="drill-steps">${steps.map(
    (st, i) => html`<li key=${i}><span class="en">${st.en}</span>${st.why_zh ? html`<span class="drill-why">${st.why_zh}</span>` : null}</li>`
  )}</ol>`;
}

/**
 * The drill for some materials. `stage` opens on 例題 or 基礎題; `onNext` is the last step (real practice by default).
 */
function DrillView({ course, materials, drillId, scope, stage: startStage = 'examples', backLabel = '← 回上一頁', onClose, nextLabel, onNext }) {
  const s = useStore();
  const rt = useRuntime();
  const ai = useAI();
  const d = s.drills.find((x) => x.id === drillId) || null;
  const p = drillProgress(d);
  const [stage, setStage] = useState(startStage === 'basics' ? 'basics' : 'examples');
  const [shown, setShown] = useState({});
  const [hints, setHints] = useState({});
  const [answers, setAnswers] = useState({});

  const generate = () =>
    ai.run(async ({ signal, onProgress }) => {
      const r = await AI.drill({ course, materials, scope, signal, onProgress });
      if (!r.examples.length || !r.basics.length) throw new Error('書僮這次沒有出完題目，請按「再試一次」。');
      await Store.set('drills', drillId, {
        courseCode: course.code,
        materialIds: materials.map((m) => m.id),
        scope: scope || '',
        ...r,
        seen: {},
        results: {},
        createdAt: U.nowIso(),
      });
      setShown({});
      setHints({});
      toast('題型練習準備好了：先看例題', 'ok');
    });
  const markSeen = (i) => Store.patch('drills', drillId, { seen: { ...(d.seen || {}), [i]: true }, updatedAt: U.nowIso() });
  const mark = async (i, result) => {
    await Store.patch('drills', drillId, { results: { ...(d.results || {}), [i]: result }, updatedAt: U.nowIso() });
    if (result !== 'again') return;
    const b = d.basics[i];
    await Store.set('cards', U.uid('k'), {
      courseCode: course.code,
      kind: 'mistake',
      front: b.prompt_en,
      back: [...b.steps.map((st) => st.en), b.answer_en ? `Answer: ${b.answer_en}` : ''].filter(Boolean).join('\n'),
      extra: { qtype: 'steps', zh: b.prompt_zh, topic: b.type_en, yours: answers[i] || '' },
      source: { type: 'drill', drillId, materialId: materials[0] ? materials[0].id : null },
      srs: SRS.fresh(),
      createdAt: U.nowIso(),
    });
    toast('已加入錯題本，之後會出現在閃卡複習', 'info');
  };
  const practice =
    onNext ||
    (() =>
      go('practice', {
        tab: 'quiz',
        course: course.code,
        materials: materials.map((m) => m.id),
        count: 6,
        auto: true,
        focus: d && d.types.length ? `題型：${d.types.map((t) => t.en).join('、')}` : '',
      }));
  const ask = (q) => go('tutor', { course: course.code, materials: materials.map((m) => m.id), mode: 'chat', focus: q });

  const stageDone = { examples: p.examples, basics: p.basics, practice: false };
  return html`<article class="material drill">
    <div class="row between wrap">
      <button type="button" class="link" onClick=${onClose}>${backLabel}</button>
      ${scope ? html`<span class="muted small">${scope}</span>` : null}
    </div>
    <header class="material__head">
      <p class="eyebrow">題型練習 · ${course.code}</p>
      <h2 class="material__title">${(d && d.title_en) || '先看例題，再自己做'}</h2>
      ${d && d.title_zh ? html`<p class="material__zh">${d.title_zh}</p>` : null}
    </header>

    <ol class="drill-stages">${DRILL_STAGES.map(
      (st, i) => html`<li key=${st.id} class=${U.cls('drill-stage', stage === st.id && 'is-on', stageDone[st.id] && 'is-done')}>
        <button type="button" disabled=${!d} onClick=${() => (st.id === 'practice' ? practice() : setStage(st.id))}>
          <span class="step__n">${stageDone[st.id] ? '✓' : i + 1}</span>
          <span><b>${st.label}</b><span class="muted small">${st.sub}</span></span>
        </button>
      </li>`
    )}</ol>

    ${!d
      ? html`<div class="panel stack">
          <p>書僮會先出 <b>3 題附完整解答的例題</b>，每一步都寫理由；再出 <b>4 題簡單的同類題</b>讓你自己做、對詳解；最後才是正式練習。</p>
          <${AIGate} />
          <div class="row"><${Btn} kind="primary" icon="spark" disabled=${ai.busy || rt.ai !== 'ready'} onClick=${generate}>產生題型練習</${Btn}></div>
          <${Thinking} ai=${ai} label="書僮出例題中" />
          <${AIError} ai=${ai} onRetry=${generate} />
        </div>`
      : stage === 'examples'
        ? html`<div class="stack">
            ${d.types.length
              ? html`<div class="chips"><span class="muted small">這次的題型：</span>${d.types.map((t, i) => html`<span key=${i} class="chip">${t.en}${t.zh ? ` · ${t.zh}` : ''}</span>`)}</div>`
              : null}
            <p class="muted small">每一題都附完整解答。先看題目想一下，再一步一步看懂解法；看懂了就按「我看懂了」。</p>
            <ol class="drill-list">${d.examples.map(
              (e, i) => html`<li key=${i} class=${U.cls('drill-item', d.seen && d.seen[i] && 'is-done')}>
                <div class="drill-item__type">例題 ${i + 1}${e.type_en ? ` · ${e.type_en}` : ''}</div>
                <${Bilingual} en=${e.prompt_en} zh=${e.prompt_zh} />
                <div class="drill-sol">
                  <div class="drill-sol__label">詳解</div>
                  <${DrillSteps} steps=${e.steps} />
                  ${e.answer_en ? html`<div class="drill-answer"><b>答案</b> ${e.answer_en}</div>` : null}
                  ${e.tip_zh ? html`<p class="drill-tip">關鍵：${e.tip_zh}</p>` : null}
                </div>
                <div class="row wrap">
                  ${d.seen && d.seen[i]
                    ? html`<${Pill} tone="ok">看懂了</${Pill}>`
                    : html`<${Btn} kind="ghost" size="sm" icon="check" onClick=${() => markSeen(i)}>我看懂了</${Btn}>`}
                  <button type="button" class="link" onClick=${() => ask(e.prompt_en)}>哪一步看不懂？問書僮</button>
                </div>
              </li>`
            )}</ol>
            <div class="row wrap">
              <${Btn} kind=${p.examples ? 'primary' : 'ghost'} icon="right" onClick=${() => (setStage('basics'), window.scrollTo(0, 0))}>下一步：基礎題（${d.basics.length} 題）</${Btn}>
              <span class="muted small">看懂 ${p.seen} / ${d.examples.length} 題</span>
            </div>
          </div>`
        : html`<div class="stack">
            <p class="muted small">換你做。先在紙上或下面的框寫出步驟，卡住可以看提示；寫完按「對答案」，再誠實標記。標「還不熟」的題目會進錯題本。</p>
            <ol class="drill-list">${d.basics.map((b, i) => {
              const result = d.results && d.results[i];
              return html`<li key=${i} class=${U.cls('drill-item', result === 'ok' && 'is-done', result === 'again' && 'is-again')}>
                <div class="drill-item__type">基礎題 ${i + 1}${b.type_en ? ` · ${b.type_en}` : ''}</div>
                <${Bilingual} en=${b.prompt_en} zh=${b.prompt_zh} />
                <textarea rows="3" aria-label=${`基礎題 ${i + 1} 你的作答`} placeholder="寫下你的步驟（也可以寫在紙上）" value=${answers[i] || ''}
                  onInput=${(ev) => setAnswers({ ...answers, [i]: ev.target.value })}></textarea>
                ${b.hint_zh
                  ? hints[i]
                    ? html`<p class="drill-hint">提示：${b.hint_zh}</p>`
                    : html`<button type="button" class="link" onClick=${() => setHints({ ...hints, [i]: true })}>看提示</button>`
                  : null}
                ${shown[i] || result
                  ? html`<div class="drill-sol">
                      <div class="drill-sol__label">詳解</div>
                      <${DrillSteps} steps=${b.steps} />
                      ${b.answer_en ? html`<div class="drill-answer"><b>答案</b> ${b.answer_en}</div>` : null}
                    </div>
                    ${result
                      ? html`<${Pill} tone=${result === 'ok' ? 'ok' : 'warn'}>${result === 'ok' ? '做對了' : '還不熟 · 已進錯題本'}</${Pill}>`
                      : html`<div class="row wrap">
                          <${Btn} kind="primary" size="sm" icon="check" onClick=${() => mark(i, 'ok')}>我做對了</${Btn}>
                          <${Btn} kind="ghost" size="sm" onClick=${() => mark(i, 'again')}>還不熟</${Btn}>
                        </div>`}`
                  : html`<div class="row"><${Btn} kind="ghost" size="sm" onClick=${() => setShown({ ...shown, [i]: true })}>對答案</${Btn}></div>`}
              </li>`;
            })}</ol>
            <div class="row wrap">
              <${Btn} kind=${p.basics ? 'primary' : 'ghost'} icon="practice" onClick=${practice}>${nextLabel || '開始練習題（6 題）'}</${Btn}>
              <span class="muted small">${p.marked ? `做對 ${p.ok} / ${p.marked} 題` : `共 ${d.basics.length} 題`}</span>
              <button type="button" class="link" disabled=${ai.busy || rt.ai !== 'ready'} onClick=${generate}>換一組題目</button>
            </div>
            <${Thinking} ai=${ai} label="書僮出新的一組題目" />
            <${AIError} ai=${ai} onRetry=${generate} />
          </div>`}
  </article>`;
}
