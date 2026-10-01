// Runs the page's own schedule logic (app/js/util.js + app/js/schedule.js) in Node to list the
// preview / class-prep / recording tasks implied by seed/seed.json, from a start date to the last class.
// Usage: node seed/class-tasks.cjs [from YYYY-MM-DD] → prints JSON and writes seed/class-tasks.json
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({
  preact: { h() {}, render() {}, Fragment: {} },
  preactHooks: {},
  htm: { bind: () => () => null },
  console,
});
for (const f of ['app/js/util.js', 'app/js/schedule.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });

const seed = JSON.parse(fs.readFileSync(path.join(root, 'seed', 'seed.json'), 'utf8'));
const settings = seed['meta/settings'];
const courses = Object.entries(seed)
  .filter(([k]) => k.startsWith('courses/'))
  .map(([, v]) => v);
const from = process.argv[2] || '2026-10-01';
ctx.__args = { timetable: seed['meta/timetable'], courses, sem: settings.semester, from, to: settings.semester.classesEnd };
const tasks = vm.runInContext('buildClassTasks(__args)', ctx);
const docs = tasks.map((t, i) => ({
  id: 'class-' + t.key,
  data: { ...t, done: false, order: i, source: 'class', createdAt: `${from}T00:00:00.000Z` },
}));
fs.writeFileSync(path.join(root, 'seed', 'class-tasks.json'), JSON.stringify(docs, null, 1));
for (const d of docs) console.log(d.data.date, '·', d.data.title, `(${d.data.minutes} 分)`);
console.log(`${docs.length} tasks → seed/class-tasks.json`);
