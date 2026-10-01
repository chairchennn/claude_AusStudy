/* view-methods.js — 方法: learning methods matched to the learner's three problems, weekly rhythm, exam sprint, sentence frames. */

function runMethodAction(a, course) {
  if (!a) return;
  if (a.route === 'tutor') return go('tutor', { mode: a.mode, course: course && course.code });
  if (a.route === 'practice') return go('practice', { tab: a.tab || 'quiz', course: course && course.code });
  if (a.route) return go(a.route, course ? { course: course.code } : {});
  const target = course && (!a.kind || course.kind === a.kind) ? course : Store.courses().find((c) => !a.kind || c.kind === a.kind);
  go('practice', { tab: 'quiz', course: target && target.code, types: a.types || undefined });
}

function MethodCard({ m, course }) {
  return html`<article class="method">
    <header><h3 class="method__name">${m.name}</h3><p class="method__en">${m.en}</p></header>
    <ol class="method__steps">${m.steps.map((x, i) => html`<li key=${i}>${x}</li>`)}</ol>
    <p class="method__why"><b>為什麼有效</b>${m.why}</p>
    ${m.action ? html`<${Btn} kind="ghost" size="sm" icon="right" onClick=${() => runMethodAction(m.action, course)}>${m.action.label}</${Btn}>` : null}
  </article>`;
}

function MethodsView() {
  const s = useStore();
  const today = U.today();
  const sem = s.settings.semester;
  const [group, setGroup] = useState('theory');
  const g = METHOD_GROUPS.find((x) => x.id === group);
  const toExam = U.isYmd(sem.examStart) ? U.daysBetween(today, sem.examStart) : null;
  const frameGroups = U.groupBy(SENTENCE_FRAMES, (f) => f.use);

  const sprint = Store.courses().map((c) => {
    const exam = c.exam || {};
    const left = (c.assessments || []).filter((a) => a.status !== 'done' && (!a.due || a.due >= today));
    const focus = {
      programming: '每天 2-3 題程式追蹤 + 1 題寫函式；考前兩週在紙上寫程式。',
      math: '每週一份考古題的一半；證明題每一步寫理由；錯題隔兩天重做。',
      theory: '名詞卡每天複習；每週 2 題情境題、1 張比較表；用英文費曼講解。',
    }[c.kind];
    return { c, exam, left, focus };
  });

  return html`<div class="view">
    <header class="page-head"><div><p class="eyebrow">依你的狀況挑選</p><h1 class="page-title">讀書方法</h1></div></header>

    <section class="diagnosis">
      <button type="button" class=${U.cls('diag', group === 'logic' && 'is-on')} onClick=${() => setGroup('logic')}>
        <span class="diag__k">邏輯課</span><span class="diag__v">CSSE7030 · MATH7861</span><span class="diag__d">想確認邏輯、練寫題目</span>
      </button>
      <button type="button" class=${U.cls('diag', group === 'theory' && 'is-on')} onClick=${() => setGroup('theory')}>
        <span class="diag__k">理論課</span><span class="diag__v">CYBR7001 · CYBR7002</span><span class="diag__d">你說的弱點：沒有方法</span>
      </button>
      <button type="button" class=${U.cls('diag', group === 'english' && 'is-on')} onClick=${() => setGroup('english')}>
        <span class="diag__k">英文</span><span class="diag__v">讀、寫、說</span><span class="diag__d">每天放進讀書流程</span>
      </button>
    </section>

    <${Section} title=${g.title} sub=${g.courses}>
      <p class="lead">${g.intro}</p>
      <div class="method-grid">${g.methods.map((m) => html`<${MethodCard} key=${m.id} m=${m} />`)}</div>
    </${Section}>

    ${group === 'english'
      ? html`<${Section} title="句型庫" sub="理論題答題時直接套用。澳洲拼法：organisation、authorisation、defence。">
          <div class="frames">
            ${[...frameGroups].map(
              ([use, list]) => html`<div class="frames__group" key=${use}>
                <h4>${use}</h4>
                <ul>${list.map((f, i) => html`<li key=${i}><span class="en">${f.en}</span><span class="zh">${f.zh}</span><${CopyBtn} text=${f.en} /></li>`)}</ul>
              </div>`
            )}
          </div>
        </${Section}>`
      : null}

    <${Section} title="每週節奏" sub="一個固定的循環，比偶爾讀很久有效。">
      <div class="table-wrap">
        <table class="rhythm">
          <thead><tr><th>什麼時候</th><th>做什麼</th><th>時間</th></tr></thead>
          <tbody>${WEEKLY_RHYTHM.map((r, i) => html`<tr key=${i}><td class="nowrap">${r.when}</td><td>${r.what}</td><td class="num">${U.fmtMinutes(r.minutes)}</td></tr>`)}</tbody>
        </table>
      </div>
    </${Section}>

    <${Section} title="考前衝刺" sub=${toExam != null && toExam > 0 ? `距離考試期開始（${U.fmtDate(sem.examStart)}）還有 ${toExam} 天` : sem.name}>
      <div class="table-wrap">
        <table class="sprint">
          <thead><tr><th>課程</th><th>還沒完成的評量</th><th>衝刺重點</th></tr></thead>
          <tbody>
            ${sprint.map(
              ({ c, exam, left, focus }) => html`<tr key=${c.code}>
                <td><${CourseChip} code=${c.code} short /></td>
                <td>${left.length || c.exam
                  ? html`<ul class="plain">
                      ${left.map((a, i) => html`<li key=${i}>${a.name}${a.weight ? ` ${a.weight}%` : ''}${a.due ? ` · ${U.fmtDate(a.due)}` : ''}</li>`)}
                      ${c.exam ? html`<li>${exam.name || '期末考'}${exam.weight ? ` ${exam.weight}%` : ''} · ${exam.date ? U.fmtDate(exam.date) : examWindowLabel(sem)}${exam.note ? ` · ${exam.note}` : ''}</li>` : null}
                    </ul>`
                  : html`<span class="muted">—</span>`}</td>
                <td>${focus}</td>
              </tr>`
            )}
          </tbody>
        </table>
      </div>
      ${s.courses.some((c) => c.verified === false) ? html`<p class="small muted">評量資訊依過往課綱整理，請以本學期 ECP 為準。</p>` : null}
    </${Section}>
  </div>`;
}
