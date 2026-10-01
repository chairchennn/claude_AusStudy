/* view-settings.js — 設定: semester dates, study time, English level, backup / export / import. */

function buildMarkdown() {
  const s = Store.state;
  const out = [`# 書僮學習紀錄`, ``, `匯出時間：${U.fmtTime(U.nowIso())} · ${s.settings.semester.name}`, ``];
  for (const c of Store.courses()) {
    out.push(`## ${c.code} ${c.name}${c.nameZh ? `（${c.nameZh}）` : ''}`, '');
    const mats = s.materials.filter((m) => m.courseCode === c.code && m.summary);
    for (const m of mats) {
      const sm = m.summary;
      out.push(`### 導讀：${m.title}`, '', sm.overview_en, '', sm.overview_zh, '');
      if (sm.key_points.length) out.push('**重點**', '', ...sm.key_points.map((p) => `- ${p.en}（${p.zh}）`), '');
      if (sm.key_terms.length) out.push('| Term | 中文 | Definition |', '|---|---|---|', ...sm.key_terms.map((t) => `| ${t.term} | ${t.zh} | ${t.def_en} |`), '');
    }
    const sessions = s.sessions.filter((x) => x.courseCode === c.code && (x.turns || []).length);
    for (const x of sessions) {
      out.push(`### 問答：${x.title}（${U.fmtTime(x.startedAt)}）`, '');
      (x.turns || []).forEach((t, i) => {
        out.push(`**Q${i + 1}. ${t.q.en}**`, '', `> ${t.a || '（我不知道）'}`, '');
        if (t.fb) {
          out.push(`- 理解：${LEVELS[t.fb.understanding].label}。${t.fb.verdict_zh}`);
          if (t.fb.model_answer_en) out.push(`- 參考答案：${t.fb.model_answer_en}`);
          if (t.fb.english && t.fb.english.corrected) out.push(`- 英文修正：${t.fb.english.corrected}`);
          for (const ch of (t.fb.english && t.fb.english.changes) || []) out.push(`  - ${ch.original} → ${ch.corrected}（${ch.reason_zh}）`);
          out.push('');
        }
      });
      if (x.recap && x.recap.english_patterns && x.recap.english_patterns.length)
        out.push('**英文常見錯誤**', '', ...x.recap.english_patterns.map((p) => `- ${p}`), '');
    }
    const mistakes = s.cards.filter((k) => k.courseCode === c.code && k.kind === 'mistake');
    if (mistakes.length) {
      out.push(`### 錯題本`, '');
      for (const k of mistakes) out.push(`- **${k.front.replace(/\n/g, ' ')}**`, `  - 正確答案：${String(k.back).replace(/\n/g, ' ')}`);
      out.push('');
    }
  }
  return out.join('\n');
}

function SettingsView() {
  const s = useStore();
  const rt = useRuntime();
  const [sem, setSem] = useState({ ...s.settings.semester });
  const [importing, setImporting] = useState(null);
  const [progress, setProgress] = useState('');
  useEffect(() => setSem({ ...s.settings.semester }), [JSON.stringify(s.settings.semester)]);

  const saveSem = async () => {
    for (const k of ['start', 'breakStart', 'breakEnd', 'classesEnd', 'revisionStart', 'examStart', 'examEnd'])
      if (sem[k] && !U.isYmd(sem[k])) return toast('日期格式不對。', 'warn');
    await Store.patch('meta', 'settings', { semester: sem });
    toast('已儲存學期日期', 'ok');
  };
  const setPref = (patch) => Store.patch('meta', 'settings', patch);

  const exportJson = async () => {
    setProgress('準備備份…');
    const data = await Store.exportAll();
    setProgress('');
    const r = await U.download(`shutong-backup-${U.today()}.json`, JSON.stringify(data, null, 1));
    toast(r.ok ? '已下載備份' : r.reason === 'declined' ? '已取消' : '這裡不能下載檔案，請在 claude.ai 上開啟。', r.ok ? 'ok' : 'warn');
  };
  const exportMd = async () => {
    const r = await U.download(`shutong-notes-${U.today()}.md`, buildMarkdown());
    toast(r.ok ? '已下載筆記' : r.reason === 'declined' ? '已取消' : '這裡不能下載檔案，請在 claude.ai 上開啟。', r.ok ? 'ok' : 'warn');
  };
  const pickImport = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'shutong') throw new Error('not shutong');
      setImporting({ name: file.name, data });
    } catch {
      toast('這不是書僮的備份檔（.json）。', 'bad');
    }
  };
  const runImport = async () => {
    try {
      const n = await Store.importAll(importing.data, (i, total) => setProgress(`匯入中 ${i}/${total}`));
      toast(`已匯入 ${n} 筆資料`, 'ok');
    } catch (e) {
      toast('匯入失敗：' + (e.message || RT.dbErrorText(e)), 'bad');
    } finally {
      setProgress('');
      setImporting(null);
    }
  };

  const fields = [
    ['start', '第 1 週開始'],
    ['breakStart', '期中假開始'],
    ['breakEnd', '期中假結束'],
    ['classesEnd', '最後一堂課'],
    ['revisionStart', '複習週開始'],
    ['examStart', '考試期開始'],
    ['examEnd', '考試期結束'],
  ];
  const counts = { 課程: s.courses.length, 講義: s.materials.length, 閃卡: s.cards.length, 問答: s.sessions.length, 練習: s.quizzes.length, 任務: s.tasks.length };

  return html`<div class="view">
    <header class="page-head"><div><p class="eyebrow">書僮</p><h1 class="page-title">設定</h1></div></header>

    <${Section} title="學期日期" sub="時間軸、週次和計畫都以這裡為準。UQ 官方日期請看 my.UQ 的 academic calendar。">
      <div class="panel form-grid form-grid--dates">
        <${Field} label="學期名稱" id="st-name"><input id="st-name" value=${sem.name} onInput=${(e) => setSem({ ...sem, name: e.target.value })} /></${Field}>
        ${fields.map(([k, label]) => html`<${Field} key=${k} label=${label} id=${'st-' + k}><input id=${'st-' + k} type="date" value=${sem[k] || ''} onInput=${(e) => setSem({ ...sem, [k]: e.target.value })} /></${Field}>`)}
        <div class="form-actions"><${Btn} kind="primary" icon="check" onClick=${saveSem}>儲存日期</${Btn}>
          <span class="muted small">今天：${semesterPhase(U.today(), sem).label}</span></div>
      </div>
    </${Section}>

    <${Section} title="讀書偏好">
      <div class="panel form-grid">
        <${Field} label="平日每天可讀（分鐘）" id="st-wd"><input id="st-wd" type="number" min="15" step="15" value=${s.settings.minutes.weekday}
          onChange=${(e) => setPref({ minutes: { ...s.settings.minutes, weekday: Number(e.target.value) || 60 } })} /></${Field}>
        <${Field} label="週末每天可讀（分鐘）" id="st-we"><input id="st-we" type="number" min="15" step="15" value=${s.settings.minutes.weekend}
          onChange=${(e) => setPref({ minutes: { ...s.settings.minutes, weekend: Number(e.target.value) || 60 } })} /></${Field}>
        <${Field} label="書僮用的英文難度" id="st-en" hint="越簡單越好讀；英文進步後再調高。">
          <select id="st-en" value=${s.settings.english} onChange=${(e) => setPref({ english: e.target.value })}>
            <option value="B1">簡單（B1）</option><option value="B2">標準學術（B2）</option><option value="C1">進階學術（C1）</option>
          </select></${Field}>
        <label class="check"><input type="checkbox" id="st-zh" checked=${s.settings.showZh} onChange=${(e) => setPref({ showZh: e.target.checked })} />
          題目預設顯示中文提示（關掉可以逼自己先讀英文）</label>
      </div>
    </${Section}>

    <${Section} title="資料">
      <div class="panel stack">
        <p>${rt.db === 'cloud'
          ? '你的資料存在這個頁面的雲端資料庫：手機和電腦會同步，在 Claude Code 裡也可以請 Claude 讀取、幫你分析。'
          : '目前是離線模式：資料只存在這台裝置的瀏覽器。到 claude.ai 開啟這個頁面才會存到雲端。'}</p>
        <div class="counts">${Object.entries(counts).map(([k, v]) => html`<span key=${k}><b>${v}</b> ${k}</span>`)}</div>
        <div class="row wrap">
          <${Btn} kind="ghost" icon="download" onClick=${exportJson}>下載完整備份（JSON）</${Btn}>
          <${Btn} kind="ghost" icon="download" onClick=${exportMd}>下載學習筆記（Markdown）</${Btn}>
          <label class="btn btn--ghost" for="st-import"><${Icon} name="upload" size=${18} /><span>從備份匯入</span></label>
          <input id="st-import" type="file" accept=".json,application/json" hidden onChange=${(e) => (e.target.files[0] && pickImport(e.target.files[0]), (e.target.value = ''))} />
        </div>
        ${importing
          ? html`<div class="notice notice--warn">
              <span>要匯入「${importing.name}」嗎？同一筆資料會被備份裡的版本覆蓋。</span>
              <${Btn} kind="primary" size="sm" onClick=${runImport}>匯入</${Btn}><${Btn} kind="ghost" size="sm" onClick=${() => setImporting(null)}>取消</${Btn}>
            </div>`
          : null}
        ${progress ? html`<p class="muted small">${progress}</p>` : null}
      </div>
    </${Section}>

    <${Section} title="關於 AI 功能">
      <div class="panel prose">
        <p>導讀、問答、出題、批改和排計畫都是請 Claude 處理，用的是你自己 Claude 方案的額度。第一次使用時 claude.ai 會問你是否允許。</p>
        <p>講義檔案在你的瀏覽器裡轉成文字，只有文字會存進資料庫。請不要把講義公開分享，課程教材的著作權屬於 UQ。</p>
        <p>AI 狀態：${{ ready: '可以使用', pending: '連線中', denied: '已拒絕', off: '無法使用（不在 claude.ai 上）' }[rt.ai]}${rt.images ? ' · 可以附上照片' : ''}</p>
      </div>
    </${Section}>
  </div>`;
}
