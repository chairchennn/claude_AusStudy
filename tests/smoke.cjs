// End-to-end smoke test: runs the app in Chromium with a mocked claude.ai runtime (tests/mock-claude.js),
// seeded with seed/seed.json, and walks every main flow. CDN libraries are served from node_modules.
// Run: npm install && node tests/make-fixtures.cjs && node tests/smoke.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');
const OUT = path.join(__dirname, 'out');
const FIX = path.join(__dirname, 'fixtures');
fs.mkdirSync(OUT, { recursive: true });
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'));
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-claude.js'), 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

// The artifact host wraps the page in this skeleton at publish time.
const skeleton = (content) =>
  `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px/1.4 system-ui;background:#fbfbfa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${content}</body></html>`;

async function routeAll(page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'app.test') {
      const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
      const file = path.join(APP, p);
      if (!file.startsWith(APP) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      let body = fs.readFileSync(file);
      if (p === '/index.html') body = skeleton(body.toString('utf8'));
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body });
    }
    if (url.hostname === 'cdn.jsdelivr.net') {
      const m = url.pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/);
      const file = m && path.join(ROOT, 'node_modules', m[1], m[2]);
      if (file && fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
      return route.fulfill({ status: 404, body: '' });
    }
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.abort();
  });
}

const problems = [];
function watch(page, label) {
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${label}] console.error: ${m.text()}`);
  });
}

async function newPage(browser, { mock = true, width = 1280, height = 900, scheme = 'light', seed = SEED } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, locale: 'zh-TW', timezoneId: 'Australia/Brisbane' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-01T09:00:00+10:00'));
  await routeAll(page);
  if (mock) {
    await page.addInitScript((s) => (window.__SEED__ = s), seed);
    await page.addInitScript(MOCK);
  }
  return { ctx, page };
}

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log('ok');
};
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (o.sw > o.cw + 1) problems.push(`[${label}] horizontal overflow: scrollWidth ${o.sw} > ${o.cw}`);
};

(async () => {
  const browser = await chromium.launch();
  const { page } = await newPage(browser);
  watch(page, 'desktop');
  const nav = (label) => page.locator('.rail__nav').getByRole('button', { name: label }).click();

  try {
    await step('home renders with seeded courses', async () => {
      await page.goto('http://app.test/');
      await page.getByRole('heading', { name: '今天的書桌' }).waitFor();
      await page.locator('.count').first().waitFor();
      await page.getByText('核對四科的評量日期', { exact: false }).first().waitFor();
      await page.locator('.classes').getByText('下次上課', { exact: false }).waitFor();
      const cls = await page.locator('.classes .cls').allInnerTexts();
      if (!cls.some((t) => /CSSE7030/.test(t) && /預習 W10/.test(t))) throw new Error('next classes wrong: ' + cls.join(' | '));
      await page.screenshot({ path: path.join(OUT, '01-home.png'), fullPage: true });
    });

    await step('upload txt + pdf + pptx to MATH7861', async () => {
      await nav('課程');
      await page.locator('.course-card', { hasText: 'MATH7861' }).click();
      await page.getByRole('button', { name: '新增講義 / 考古題' }).click();
      await page.setInputFiles('#up-file', [
        path.join(FIX, 'Week9-induction-notes.txt'),
        path.join(FIX, 'CYBR7002 Lecture 8 Cryptography.pdf'),
        path.join(FIX, 'Week 7 Authentication.pptx'),
      ]);
      await page.getByRole('button', { name: '儲存 3 份' }).waitFor({ timeout: 20000 });
      const fileInfo = await page.locator('.up__file').allInnerTexts();
      if (!fileInfo.some((t) => /2 頁/.test(t))) throw new Error('pdf pages not read: ' + fileInfo.join(' | '));
      if (!fileInfo.some((t) => /3 張投影片/.test(t))) throw new Error('pptx slides not read: ' + fileInfo.join(' | '));
      const weeks = await page.locator('.w-week').evaluateAll((els) => els.map((e) => e.value));
      if (weeks[0] !== '9' || weeks[2] !== '7') throw new Error('week guess wrong: ' + weeks);
      await page.screenshot({ path: path.join(OUT, '02-upload.png'), fullPage: true });
      await page.getByRole('button', { name: '儲存 3 份' }).click();
      await page.locator('.mat').nth(2).waitFor();
    });

    await step('extracted text: pptx order + notes, pdf boilerplate removed', async () => {
      await page.locator('.mat', { hasText: 'Authentication' }).click();
      await page.getByRole('button', { name: '看原文' }).click();
      const raw = await page.locator('.rawtext').innerText();
      if (!/Speaker notes\) Explain MFA/.test(raw)) throw new Error('notes missing: ' + raw);
      if (raw.indexOf('Biometrics') > raw.indexOf('Summary slide')) throw new Error('slide order wrong');
      await page.getByRole('button', { name: '← 回到講義列表' }).click();
      await page.locator('.mat', { hasText: 'Cryptography' }).click();
      await page.getByRole('button', { name: '看原文' }).click();
      const pdf = await page.locator('.rawtext').innerText();
      if (/CRICOS/.test(pdf) || !/Digital signatures/.test(pdf)) throw new Error('pdf text wrong: ' + pdf);
      await page.getByRole('button', { name: '← 回到講義列表' }).click();
    });

    await step('generate 導讀 and add key terms to cards', async () => {
      await page.locator('.mat', { hasText: 'induction' }).click();
      await page.getByRole('button', { name: '產生導讀' }).click();
      await page.getByRole('heading', { name: 'Mathematical Induction' }).waitFor();
      await page.getByRole('button', { name: '全部加入閃卡' }).click();
      await page.getByText('加入 2 張名詞卡').waitFor();
      await page.screenshot({ path: path.join(OUT, '03-guide.png'), fullPage: true });
    });

    await step('Socratic tutor: answer, feedback with correction table, next question', async () => {
      await page.getByRole('button', { name: '回答這題，開始問答' }).click();
      await page.getByText('Why is the base case necessary', { exact: false }).first().waitFor();
      await page.fill('#tutor-answer', 'base case is need because it is start');
      await page.getByRole('button', { name: '送出' }).click();
      await page.locator('.fb').getByText('部分理解').waitFor();
      await page.locator('table.corr').waitFor();
      await page.getByText('What would go wrong', { exact: false }).first().waitFor();
      await page.getByText('已把這個觀念加入閃卡').waitFor();
      await page.screenshot({ path: path.join(OUT, '04-tutor.png'), fullPage: true });
      await page.getByRole('button', { name: '結束並總結' }).click();
      await page.getByRole('heading', { name: '這次問答的總結' }).waitFor();
    });

    await step('tutor on a lecture without 導讀 offers guide-first start', async () => {
      await nav('課程');
      await page.locator('.course-card', { hasText: 'MATH7861' }).click();
      await page.locator('.mat', { hasText: 'Authentication' }).click();
      await page.getByRole('button', { name: '開始書僮問答' }).click();
      await page.getByRole('heading', { name: '先讀導讀，再開始問答' }).waitFor();
      await page.getByRole('button', { name: '產生導讀並開始' }).click();
      await page.locator('.guide-mini').waitFor();
      await page.locator('#tutor-answer').waitFor();
      await page.getByRole('button', { name: '換一個' }).click();
    });

    await step('quiz: generate, answer every type, mark', async () => {
      await nav('練習');
      await page.locator('.chip-btn', { hasText: 'MATH7861' }).click();
      await page.getByRole('button', { name: '出題', exact: true }).click();
      await page.getByRole('heading', { name: 'Induction and logic practice' }).waitFor();
      await page.locator('.q').nth(0).locator('.opt').nth(2).click();
      await page.locator('.q').nth(1).getByRole('button', { name: 'True 對' }).click();
      await page.locator('.q').nth(2).locator('textarea').fill('6');
      const pq = page.locator('.q').nth(3);
      for (const line of ['def total(xs):', '    s = 0', '    for x in xs:', '        s += x', '    return s'])
        await pq.locator('.parsons__col').first().locator('.pline', { hasText: line.trim() }).first().click();
      await page.locator('.q').nth(4).locator('textarea').fill('Base case n=1: 1 = 1. Assume true for k, then add k+1.');
      await page.locator('.q').nth(5).locator('textarea').fill('Integrity mean data is not changed, for example a bank transfer.');
      await page.getByRole('button', { name: '交卷並批改' }).click();
      await page.locator('.score__num').waitFor();
      const score = await page.locator('.score__num').innerText();
      // mcq, tf, trace, parsons correct (6 marks) + proof 0.5×4 + short 1×2 = 10/12 → 83
      if (score !== '83') {
        const dump = await page.evaluate(() => {
          const q = [...window.__db.entries()].find(([p]) => p.startsWith('quizzes/'))[1];
          return JSON.stringify({ results: q.results, responses: q.responses });
        });
        throw new Error('unexpected score ' + score + ' ' + dump);
      }
      await page.getByText('題已加入錯題本').waitFor();
      await page.screenshot({ path: path.join(OUT, '05-quiz.png'), fullPage: true });
    });

    await step('flashcards: review and rate', async () => {
      await page.getByRole('tab', { name: /閃卡/ }).click();
      await page.getByRole('button', { name: '開始複習' }).click();
      await page.locator('.index-card').waitFor();
      await page.getByRole('button', { name: /顯示答案/ }).click();
      await page.screenshot({ path: path.join(OUT, '06-card.png') });
      const before = await page.locator('.index-card__text').first().innerText();
      await page.locator('.rate__btn', { hasText: '記得' }).click();
      await page.waitForTimeout(200);
      const after = await page.locator('.index-card__text').first().innerText();
      if (before === after) throw new Error('card did not advance');
      const reviewed = await page.evaluate(() => [...window.__db.entries()].filter(([p, d]) => p.startsWith('cards/') && d.srs && d.srs.reps > 0).length);
      if (reviewed !== 1) throw new Error('expected 1 reviewed card, got ' + reviewed);
      await page.getByRole('button', { name: '結束' }).click();
    });

    await step('mistake book + history', async () => {
      await page.getByRole('tab', { name: /錯題本/ }).click();
      await page.locator('.mistake').first().waitFor();
      await page.getByRole('tab', { name: /紀錄/ }).click();
      await page.locator('.trend svg').waitFor();
      await page.locator('.history__row').first().waitFor();
    });

    await step('timetable → preview / prep / recording tasks', async () => {
      await nav('計畫');
      await page.locator('.tt .tt__cls', { hasText: 'CSSE7030' }).first().waitFor();
      await page.getByRole('button', { name: '產生預習與課前任務' }).click();
      await page.getByText(/加入 19 項預習/).waitFor();
      await page.getByText('CSSE7030：預習 W10（預習導讀＋暖身題）').first().waitFor();
      await page.getByRole('button', { name: '產生預習與課前任務' }).click();
      await page.getByText('這些任務都已經在清單裡了').waitFor();
    });

    await step('AI plan → tasks; parse course info → assessments', async () => {
      await nav('計畫');
      await page.locator('.timeline .wk.is-now').waitFor();
      await page.getByRole('button', { name: '請書僮排計畫' }).first().click();
      await page.getByRole('button', { name: '產生計畫' }).click();
      await page.getByRole('button', { name: /加入 3 項任務/ }).click();
      await page.getByText('MATH7861：做 4 題歸納法證明').first().waitFor();
      await page.getByRole('button', { name: '整理課程公告' }).click();
      await page.fill('#ip-text', 'CSSE7030 Assignment 2 (25%) is due in Week 11 Friday 3pm via Gradescope. Interview required.');
      await page.getByRole('button', { name: '幫我整理' }).click();
      await page.getByRole('button', { name: '套用' }).click();
      const a2 = await page.evaluate(() => (window.__db.get('courses/CSSE7030').assessments || []).find((a) => a.name === 'Assignment 2'));
      if (!a2 || !a2.due) throw new Error('A2 due date not merged: ' + JSON.stringify(a2));
      const exam = await page.evaluate(() => window.__db.get('courses/MATH7861').exam);
      if (!exam || exam.weight !== 60) throw new Error('exam not merged');
      const sched = await page.evaluate(() => window.__db.get('courses/CSSE7030').schedule);
      if (!sched || !sched.some((x) => x.week === 11 && x.topic === 'Recursion')) throw new Error('weekly topic not merged: ' + JSON.stringify(sched));
      await page.screenshot({ path: path.join(OUT, '07-plan.png'), fullPage: true });
    });

    await step('預習: guide for next week\'s lecture', async () => {
      await nav('課程');
      await page.locator('.course-card', { hasText: 'CSSE7030' }).click();
      await page.getByRole('tab', { name: /預習/ }).click();
      const row = page.locator('.prev-row', { hasText: 'W10' });
      await row.locator('input').fill('Functions and recursion');
      await row.getByRole('button', { name: '產生預習' }).click();
      await page.getByRole('heading', { name: 'Recursion' }).waitFor();
      await page.getByRole('button', { name: '看答案' }).click();
      await page.getByText('3 × 2 × 1 = 6').waitFor();
      await page.screenshot({ path: path.join(OUT, '07b-preview.png'), fullPage: true });
      const saved = await page.evaluate(() => window.__db.get('previews/CSSE7030-W10'));
      if (!saved || !saved.guide || saved.topic !== 'Functions and recursion') throw new Error('preview not saved: ' + JSON.stringify(saved));
      await page.getByRole('button', { name: '← 回到預習' }).click();
      await page.getByRole('heading', { name: '預習紀錄' }).waitFor();
    });

    await step('methods + settings export', async () => {
      await nav('方法');
      await page.getByRole('heading', { name: '理論課' }).waitFor();
      await page.locator('.diag', { hasText: '英文' }).click();
      await page.getByRole('heading', { name: '句型庫' }).waitFor();
      await page.screenshot({ path: path.join(OUT, '08-methods.png'), fullPage: true });
      await page.locator('.rail__foot').getByRole('button', { name: '設定' }).click();
      await page.getByRole('button', { name: '下載完整備份（JSON）' }).click();
      await page.getByRole('button', { name: '下載學習筆記（Markdown）' }).click();
      await page.waitForTimeout(400);
      const dl = await page.evaluate(() => window.__downloads.map((d) => d.filename));
      if (dl.length !== 2) throw new Error('downloads: ' + dl);
    });

    await step('free chat streams a Markdown answer', async () => {
      await nav('書僮');
      const change = page.getByRole('button', { name: '換一個' });
      if (await change.count()) await change.click();
      await page.locator('.mode', { hasText: '自由提問' }).click();
      await page.getByRole('button', { name: '開始', exact: true }).click();
      await page.fill('#chat-input', 'authentication vs authorisation?');
      await page.getByRole('button', { name: '送出' }).click();
      await page.locator('.msg--assistant table').waitFor();
    });

    await step('prompt sizes stay within limits', async () => {
      const calls = await page.evaluate(() => window.__sampleCalls);
      const big = calls.filter((c) => c.bytes > 200000);
      if (big.length) throw new Error('oversized prompt: ' + JSON.stringify(big));
      console.log(`(${calls.length} Claude calls, largest ${Math.max(...calls.map((c) => c.bytes))} chars)`);
    });

    // Phone width, every route, light + dark.
    for (const scheme of ['light', 'dark']) {
      await step(`phone layout (${scheme}) has no horizontal overflow`, async () => {
        const { ctx, page: p } = await newPage(browser, { width: 390, height: 844, scheme });
        watch(p, 'phone-' + scheme);
        await p.goto('http://app.test/');
        await p.getByRole('heading', { name: '今天的書桌' }).waitFor();
        await noOverflow(p, `phone-${scheme}-home`);
        await p.screenshot({ path: path.join(OUT, `09-phone-${scheme}-home.png`), fullPage: true });
        for (const label of ['課程', '書僮', '練習', '計畫', '方法']) {
          await p.locator('.tabbar').getByRole('button', { name: label }).click();
          await p.waitForTimeout(250);
          await noOverflow(p, `phone-${scheme}-${label}`);
          if (scheme === 'dark' || label === '練習') await p.screenshot({ path: path.join(OUT, `09-phone-${scheme}-${label}.png`), fullPage: true });
        }
        await p.locator('.tabbar').getByRole('button', { name: '課程' }).click();
        await p.locator('.course-card', { hasText: 'CSSE7030' }).click();
        await p.getByRole('tab', { name: /評量與考試/ }).click();
        await noOverflow(p, `phone-${scheme}-assess`);
        await p.screenshot({ path: path.join(OUT, `09-phone-${scheme}-assess.png`), fullPage: true });
        await ctx.close();
      });
    }

    await step('offline fallback (no claude runtime)', async () => {
      const { ctx, page: p } = await newPage(browser, { mock: false });
      watch(p, 'offline');
      await p.goto('http://app.test/');
      await p.getByText('離線模式', { exact: false }).first().waitFor();
      await p.locator('.rail__nav').getByRole('button', { name: '書僮' }).click();
      await p.getByText('AI 功能（導讀、問答、出題、批改、排計畫）需要在 claude.ai', { exact: false }).waitFor();
      await p.locator('.rail__nav').getByRole('button', { name: '課程' }).click();
      await p.getByRole('button', { name: '新增課程' }).first().click();
      await p.fill('#cf-code', 'comp7710');
      await p.fill('#cf-name', 'AI for Cyber Security');
      await p.getByRole('button', { name: '新增', exact: true }).click();
      await p.locator('.course-card', { hasText: 'COMP7710' }).waitFor();
      await p.reload();
      await p.locator('.rail__nav').getByRole('button', { name: '課程' }).click();
      await p.locator('.course-card', { hasText: 'COMP7710' }).waitFor();
      await ctx.close();
    });
  } catch (e) {
    console.log('FAILED');
    problems.unshift('step failed: ' + (e && e.message ? e.message : e));
    await page.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }).catch(() => {});
  }
  await browser.close();
  const real = problems.filter((p) => !/favicon/.test(p));
  if (real.length) {
    console.log('\nProblems:\n' + real.map((p) => ' - ' + p).join('\n'));
    process.exit(1);
  }
  console.log('\nAll smoke checks passed. Screenshots in tests/out/');
})();
