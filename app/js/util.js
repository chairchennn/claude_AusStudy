/* util.js — shared globals: Preact + htm bindings, dates, ids, text helpers, a small safe Markdown renderer. */

const { h, render, Fragment } = preact;
const { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } = preactHooks;
const html = htm.bind(h);

const U = (() => {
  const DAY = 86400000;
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => ymd(new Date());
  const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const parseYmd = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  };
  /** Whole days from a to b (b - a). */
  const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / DAY);
  const addDays = (s, n) => {
    const t = parseYmd(s);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const weekday = (s) => parseYmd(s).getUTCDay();
  const isWeekend = (s) => {
    const w = weekday(s);
    return w === 0 || w === 6;
  };
  const fmtDate = (s, opts = {}) => {
    if (!isYmd(s)) return '';
    const t = parseYmd(s);
    const base = `${t.getUTCMonth() + 1}/${t.getUTCDate()}`;
    return opts.noWeekday ? base : `${base} 週${WEEKDAYS[t.getUTCDay()]}`;
  };
  const fmtLongDate = (s) => {
    const t = parseYmd(s);
    return `${t.getUTCFullYear()} 年 ${t.getUTCMonth() + 1} 月 ${t.getUTCDate()} 日 · 週${WEEKDAYS[t.getUTCDay()]}`;
  };
  const relDay = (s, ref = today()) => {
    if (!isYmd(s)) return '';
    const d = daysBetween(ref, s);
    if (d === 0) return '今天';
    if (d === 1) return '明天';
    if (d === 2) return '後天';
    if (d === -1) return '昨天';
    if (d < 0) return `${-d} 天前`;
    return `${d} 天後`;
  };
  const fmtTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const nowIso = () => new Date().toISOString();

  /** Path-safe unique id (db path grammar allows letters, digits and _-.~:@+). */
  const uid = (prefix = '') =>
    prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const cls = (...xs) => xs.filter(Boolean).join(' ');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
  const plural = (n, word) => `${n} ${word}`;
  const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
  const groupBy = (xs, f) => {
    const m = new Map();
    for (const x of xs) {
      const k = f(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  const fmtMinutes = (m) => {
    m = Math.round(Number(m) || 0);
    if (m < 60) return `${m} 分`;
    const hrs = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${hrs} 小時 ${rest} 分` : `${hrs} 小時`;
  };
  const fmtChars = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k 字元` : `${n} 字元`);

  const store = {
    get(key, fallback = null) {
      try {
        const v = localStorage.getItem('shutong:' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('shutong:' + key, JSON.stringify(value));
      } catch {
        /* storage may be unavailable (private window, preview) */
      }
    },
  };

  const escapeHtml = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  /** Inline Markdown on already-escaped text: `code`, **bold**, *em*, [text](https://link). */
  const inlineMd = (s) =>
    s
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  /** A small, safe Markdown subset → HTML. Input is escaped before any markup is added. */
  const md = (src) => {
    if (!src) return '';
    const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    let para = [];
    const flushPara = () => {
      if (para.length) {
        out.push(`<p>${para.map((l) => inlineMd(escapeHtml(l))).join('<br>')}</p>`);
        para = [];
      }
    };
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
      if (fence) {
        flushPara();
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre class="code"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        flushPara();
        const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inlineMd(escapeHtml(c.trim())));
        const head = row(line);
        i += 2;
        const body = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
        out.push(
          `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body
            .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
            .join('')}</tbody></table></div>`
        );
        continue;
      }
      const heading = line.match(/^\s*(#{1,4})\s+(.*)$/);
      if (heading) {
        flushPara();
        const level = Math.min(6, heading[1].length + 2);
        out.push(`<h${level}>${inlineMd(escapeHtml(heading[2]))}</h${level}>`);
        i++;
        continue;
      }
      if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
        flushPara();
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
          items.push(inlineMd(escapeHtml(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''))));
          i++;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.map((x) => `<li>${x}</li>`).join('')}</${tag}>`);
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        flushPara();
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${buf.map((l) => inlineMd(escapeHtml(l))).join('<br>')}</blockquote>`);
        continue;
      }
      if (!line.trim()) {
        flushPara();
        i++;
        continue;
      }
      para.push(line);
      i++;
    }
    flushPara();
    return out.join('');
  };

  /** Simple word tokens for relevance scoring (English + CJK bigrams). */
  const STOP = new Set(
    'the a an and or of to in on for is are was were be by with as at from that this it its into than then which what why how when who whom can could should would will may might do does did not no yes you your their there these those about over under between more most less such each other also very just only'.split(
      ' '
    )
  );
  const tokens = (s) => {
    const t = String(s || '').toLowerCase();
    const words = (t.match(/[a-z][a-z0-9_]{2,}/g) || []).filter((w) => !STOP.has(w));
    const cjk = t.match(/[一-鿿]{2,}/g) || [];
    for (const run of cjk) for (let k = 0; k < run.length - 1; k++) words.push(run.slice(k, k + 2));
    return words;
  };

  const download = async (filename, data) => {
    const dl = await RT.downloads();
    if (!dl) return { ok: false, reason: 'unavailable' };
    try {
      await dl.save({ filename, data });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e && e.code };
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  return {
    DAY, WEEKDAYS, pad, ymd, today, isYmd, parseYmd, daysBetween, addDays, weekday, isWeekend,
    fmtDate, fmtLongDate, relDay, fmtTime, nowIso, uid, clamp, shuffle, cls, sleep, truncate,
    plural, sum, groupBy, fmtMinutes, fmtChars, store, escapeHtml, md, tokens, download, copyText,
  };
})();

/** Course metadata helpers shared by every view. */
const COURSE_KINDS = {
  programming: { label: '程式', en: 'Programming', tone: 'logic' },
  math: { label: '數學', en: 'Maths', tone: 'logic' },
  theory: { label: '理論', en: 'Theory', tone: 'theory' },
};
const COURSE_COLORS = ['teal', 'plum', 'ochre', 'moss', 'pen'];

const MATERIAL_KINDS = {
  lecture: '講義',
  tutorial: '實作課 / Tutorial',
  exam: '考古題 / Sample exam',
  assignment: '作業說明',
  notes: '我的筆記',
  other: '其他',
};

const LEVELS = {
  clear: { label: '清楚掌握', short: '清楚', tone: 'ok' },
  partial: { label: '部分理解', short: '部分', tone: 'warn' },
  confused: { label: '還不太懂', short: '不懂', tone: 'bad' },
};

/** Where in the semester a date falls. sem = settings.semester. */
function semesterPhase(date, sem) {
  if (!sem || !U.isYmd(sem.start)) return { phase: 'unknown', label: '' };
  const breakDays =
    U.isYmd(sem.breakStart) && U.isYmd(sem.breakEnd) ? U.daysBetween(sem.breakStart, sem.breakEnd) + 1 : 0;
  const breakWeeks = Math.ceil(breakDays / 7);
  const rawWeek = Math.floor(U.daysBetween(sem.start, date) / 7) + 1;
  const weekAt = (d) => {
    const w = Math.floor(U.daysBetween(sem.start, d) / 7) + 1;
    return breakWeeks && U.isYmd(sem.breakStart) && d > sem.breakEnd ? w - breakWeeks : w;
  };
  if (date < sem.start) return { phase: 'before', label: `開學前 ${U.daysBetween(date, sem.start)} 天`, short: '開學前' };
  if (breakWeeks && date >= sem.breakStart && date <= sem.breakEnd) {
    const w = weekAt(U.addDays(sem.breakStart, -1));
    return { phase: 'break', week: w, label: `期中假 · 第 ${w} 週後`, short: '期中假' };
  }
  if (U.isYmd(sem.examStart) && date >= sem.examStart && (!U.isYmd(sem.examEnd) || date <= sem.examEnd))
    return { phase: 'exam', label: '考試期間', short: '考試期' };
  if (U.isYmd(sem.examEnd) && date > sem.examEnd) return { phase: 'after', label: '學期結束', short: '已結束' };
  if (U.isYmd(sem.revisionStart) && date >= sem.revisionStart)
    return { phase: 'revision', label: '複習週 · Revision period', short: '複習週' };
  if (U.isYmd(sem.classesEnd) && date > sem.classesEnd) return { phase: 'gap', label: '課程已結束', short: '停課' };
  const w = weekAt(date);
  return { phase: 'teaching', week: w, label: `第 ${w} 週`, short: `W${w}`, rawWeek };
}

/** "考試期 11/7–11/21" for exams whose exact date isn't published yet. */
function examWindowLabel(sem) {
  if (!sem || !U.isYmd(sem.examStart)) return '考試期';
  return `考試期 ${U.fmtDate(sem.examStart, { noWeekday: true })}–${U.isYmd(sem.examEnd) ? U.fmtDate(sem.examEnd, { noWeekday: true }) : ''}`;
}

/** Teaching-week start dates (Monday) for drawing the timeline. */
function semesterWeeks(sem) {
  if (!sem || !U.isYmd(sem.start)) return [];
  const end = U.isYmd(sem.examEnd) ? sem.examEnd : U.addDays(sem.start, 7 * 17);
  const weeks = [];
  let teach = 0;
  for (let d = sem.start; d <= end; d = U.addDays(d, 7)) {
    const mid = U.addDays(d, 2);
    const p = semesterPhase(mid, sem);
    if (p.phase === 'teaching') teach = p.week;
    weeks.push({ start: d, end: U.addDays(d, 6), phase: p.phase, week: p.phase === 'teaching' ? teach : null });
  }
  return weeks;
}
