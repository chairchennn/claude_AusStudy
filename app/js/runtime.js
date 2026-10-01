/* runtime.js — the claude.ai capability bridge (sample = ask Claude, db = cloud store, downloads = save files).
   Every capability may be absent (page opened outside claude.ai, signed out, consent declined): callers get null. */

const RT = (() => {
  const hasClaude = typeof window !== 'undefined' && !!window.claude && typeof window.claude.use === 'function';
  const memo = {};
  const listeners = new Set();
  const state = {
    ai: hasClaude ? 'pending' : 'off', // pending | ready | denied | off
    db: hasClaude ? 'pending' : 'local', // pending | cloud | local
    images: null, // sample image limits when this view can send images
  };

  const emit = () => listeners.forEach((fn) => fn({ ...state }));
  const onChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const set = (patch) => {
    Object.assign(state, patch);
    emit();
  };

  function use(name) {
    if (!hasClaude) return Promise.resolve(null);
    if (!memo[name]) memo[name] = Promise.resolve(window.claude.use(name)).catch(() => null);
    return memo[name];
  }

  // Resolve AI availability early so the UI can show or hide AI controls.
  use('sample').then(async (sample) => {
    if (!sample) return set({ ai: 'off' });
    let images = null;
    try {
      const lim = await sample.limits();
      images = lim && lim.images ? lim.images : null;
    } catch {
      images = null;
    }
    set({ ai: state.ai === 'denied' ? 'denied' : 'ready', images });
  });

  const AI_ERRORS = {
    unavailable: 'AI 功能只在 claude.ai 上開啟這個頁面時能用。',
    not_granted: '這個頁面還沒被允許使用 Claude。請從頁面右上角的權限選單允許後重新整理。',
    sampling_disabled: '這個帳號目前不能從頁面呼叫 Claude。',
    not_declared: '這個版本的頁面沒有開啟 AI 功能。',
    capability_disabled: '這個檢視模式不能使用 AI 功能。',
    capability_removed: '這個 Claude App 版本太舊，請更新後再試。',
    rate_limited: 'Claude 使用量暫時到上限了，等幾分鐘再按一次。',
    session_expired: '登入已過期，請重新登入 claude.ai 後再試。',
    prompt_too_large: '一次送出的內容太長了。請少選幾份講義，或把文字分成幾段。',
    refused: 'Claude 沒有回答這個請求。換個問法或換一段內容再試。',
    empty_completion: 'Claude 沒有產生內容，請把要求縮小一點再試。',
    invalid_json: '書僮回覆的格式不完整，按「再試一次」重新產生。',
    image_rejected: '這張圖片不能用，請換一張 JPG 或 PNG（20MB 以內）。',
    images_unavailable: '這裡不能附上圖片，請改用文字作答。',
    upstream_error: '連線中斷了，按「再試一次」。',
    queue_overflow: '同時送出太多請求，請稍等再試。',
    invalid_request: '請求格式有誤（程式問題），請回報給書僮的維護者。',
    transform_error: '請求格式有誤（程式問題），請回報給書僮的維護者。',
  };

  function aiErrorText(e) {
    const code = (e && e.code) || 'upstream_error';
    return AI_ERRORS[code] || AI_ERRORS.upstream_error;
  }

  /**
   * Ask Claude. json: parse the reply as JSON. tier: quick | default | complex.
   * onProgress(chars) fires while the answer streams; onText(text) gets the whole text so far.
   */
  async function ask(prompt, opts = {}) {
    const sample = await use('sample');
    if (!sample) throw { code: 'unavailable', message: 'sample unavailable' };
    if (state.ai === 'denied') throw { code: 'not_granted', message: 'declined earlier in this view' };
    const options = { modelTier: opts.tier || 'default', cache: opts.cache ?? false };
    if (opts.signal) options.signal = opts.signal;
    if (opts.images && opts.images.length) options.images = opts.images;
    options.onText = ({ text }) => {
      if (opts.onProgress) opts.onProgress(text.length);
      if (opts.onText) opts.onText(text);
    };
    try {
      if (opts.json) return await sample.json(prompt, options);
      return await sample(prompt, options);
    } catch (e) {
      if (e && (e.code === 'not_granted' || e.code === 'sampling_disabled')) set({ ai: 'denied' });
      throw e;
    }
  }

  const DB_ERRORS = {
    quota_exceeded: '雲端資料庫已滿。請到「設定」刪除用不到的講義或匯出備份後清理。',
    resource_exhausted: '操作太頻繁了，請稍等一下再試。',
    invalid_argument: '這筆資料存不進去（可能太大，單筆上限 256KB）。',
    unavailable: '暫時連不上雲端資料庫，請稍後再試。',
    revoked: '這個頁面的存取權已變更，請重新整理。',
  };
  const dbErrorText = (e) => DB_ERRORS[(e && e.code) || 'unavailable'] || DB_ERRORS.unavailable;

  return {
    hasClaude,
    state,
    onChange,
    set,
    use,
    ask,
    aiErrorText,
    dbErrorText,
    db: () => use('db'),
    downloads: () => use('downloads'),
  };
})();
