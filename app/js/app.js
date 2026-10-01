/* app.js — shell: side rail (desktop) / tab bar (phone), routing, boot. */

const NAV = [
  { id: 'home', label: '今日', icon: 'home' },
  { id: 'courses', label: '課程', icon: 'courses' },
  { id: 'tutor', label: '書僮', icon: 'tutor' },
  { id: 'practice', label: '練習', icon: 'practice' },
  { id: 'plan', label: '計畫', icon: 'plan' },
  { id: 'methods', label: '方法', icon: 'methods' },
];

const VIEWS = {
  home: HomeView,
  courses: CoursesView,
  tutor: TutorView,
  practice: PracticeView,
  plan: PlanView,
  methods: MethodsView,
  settings: SettingsView,
};

function NavButton({ item, active, badge, variant }) {
  return html`<button type="button" class=${U.cls(variant, active && 'is-on')} aria-current=${active ? 'page' : undefined} onClick=${() => go(item.id)}>
    <${Icon} name=${item.icon} size=${variant === 'tabbar__item' ? 22 : 20} />
    <span>${item.label}</span>
    ${badge ? html`<span class="badge" aria-label=${badge + ' 張到期'}>${badge > 99 ? '99+' : badge}</span>` : null}
  </button>`;
}

function App() {
  const r = useRoute();
  const s = useStore();
  const rt = useRuntime();
  const today = U.today();
  const phase = semesterPhase(today, s.settings.semester);
  const due = s.cards.filter((c) => SRS.isDue(c, today)).length;
  const View = VIEWS[r.route] || HomeView;
  const badgeFor = (id) => (id === 'practice' ? due : 0);

  return html`<div class="shell">
    <aside class="rail">
      <button type="button" class="brand" onClick=${() => go('home')}>
        <span class="brand__mark">書僮</span>
        <span class="brand__sub">UQ · MCyberSec</span>
      </button>
      <div class="rail__week">
        <span class="rail__phase">${phase.short || ''}</span>
        <span class="rail__label">${phase.label}</span>
      </div>
      <nav class="rail__nav" aria-label="主要">
        ${NAV.map((n) => html`<${NavButton} key=${n.id} item=${n} active=${r.route === n.id} badge=${badgeFor(n.id)} variant="rail__item" />`)}
      </nav>
      <div class="rail__foot">
        <${NavButton} item=${{ id: 'settings', label: '設定', icon: 'settings' }} active=${r.route === 'settings'} variant="rail__item" />
        <span class="rail__status">${rt.db === 'cloud' ? '雲端同步' : rt.db === 'local' ? '只存在這台裝置' : '連線中…'}</span>
      </div>
    </aside>

    <header class="topbar">
      <button type="button" class="brand brand--small" onClick=${() => go('home')}><span class="brand__mark">書僮</span></button>
      <span class="topbar__week">${phase.label}</span>
      <button type="button" class=${U.cls('iconbtn', r.route === 'settings' && 'is-on')} aria-label="設定" onClick=${() => go('settings')}><${Icon} name="settings" /></button>
    </header>

    <main class="main" id="main">
      ${rt.db === 'local'
        ? html`<div class="notice notice--warn">離線模式：資料只存在這台裝置的瀏覽器。到 claude.ai 開啟這個頁面，才會存到雲端並在手機、電腦間同步。</div>`
        : null}
      ${s.error ? html`<div class="notice notice--bad">${s.error}</div>` : null}
      <${View} key=${r.route} params=${r.params} />
    </main>

    <nav class="tabbar" aria-label="主要">
      ${NAV.map((n) => html`<${NavButton} key=${n.id} item=${n} active=${r.route === n.id} badge=${badgeFor(n.id)} variant="tabbar__item" />`)}
    </nav>
    <${ToastRegion} />
  </div>`;
}

(function boot() {
  Store.setErrorHandler((msg) => toast(msg, 'bad', 6000));
  const root = document.getElementById('app');
  root.textContent = '';
  render(html`<${App} />`, root);
  Store.init();
})();
