/* extract.js — turn lecture files into plain text in the browser (nothing is uploaded except the text you save).
   PDF via pdf.js, PPTX/DOCX via JSZip, TXT/MD directly. Also: chunking + relevance picking for prompts. */

const Extract = (() => {
  const LIBS = {
    pdf: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    pdfWorker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
    jszip: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  };
  const loading = {};
  const loadScript = (src) => {
    if (!loading[src])
      loading[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = () => {
          delete loading[src];
          reject(new Error('讀取檔案的工具載入失敗，請檢查網路後再試。'));
        };
        document.head.appendChild(s);
      });
    return loading[src];
  };

  async function pdfLib() {
    // Loading the worker script on the page lets pdf.js run on the main thread (no cross-origin Worker needed).
    await loadScript(LIBS.pdfWorker);
    await loadScript(LIBS.pdf);
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    return lib;
  }

  /* ---------- cleanup ---------- */
  const BOILER = [
    /^cricos\b/i,
    /^cricos code/i,
    /^the university of queensland$/i,
    /^uq$/i,
    /^copyright\b/i,
    /^©/,
    /^commonwealth of australia/i,
    /^warning:? this material has been reproduced/i,
    /^do not remove this notice/i,
    /^\d{1,3}$/,
    /^page \d+( of \d+)?$/i,
  ];
  const tidy = (t) =>
    t
      .replace(/ /g, ' ')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !BOILER.some((re) => re.test(l)))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  /** Drop short lines that repeat on most pages (running headers / footers). */
  function dropRepeated(pages) {
    if (pages.length < 4) return pages;
    const counts = new Map();
    for (const p of pages) for (const l of new Set(p.split('\n'))) if (l.length < 90) counts.set(l, (counts.get(l) || 0) + 1);
    const limit = Math.max(3, Math.ceil(pages.length * 0.5));
    const drop = new Set([...counts].filter(([, n]) => n >= limit).map(([l]) => l));
    if (!drop.size) return pages;
    return pages.map((p) => p.split('\n').filter((l) => !drop.has(l)).join('\n'));
  }

  const join = (pages, label) => pages.map((t, i) => `[${label} ${i + 1}]\n${t}`).join('\n\n');

  /* ---------- PDF ---------- */
  async function openPdf(file) {
    const lib = await pdfLib();
    const data = new Uint8Array(await file.arrayBuffer());
    return lib.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  }

  async function fromPdf(file, onProgress) {
    const doc = await openPdf(file);
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let text = '';
      let lastY = null;
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        const y = it.transform ? it.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 3 && !text.endsWith('\n')) text += '\n';
        else if (text && !/[\s\n]$/.test(text) && it.str && !/^\s/.test(it.str)) text += ' ';
        text += it.str;
        if (it.hasEOL) text += '\n';
        lastY = y;
      }
      pages.push(tidy(text));
      if (onProgress) onProgress(i, doc.numPages);
    }
    const cleaned = dropRepeated(pages);
    const empty = cleaned.filter((t) => t.replace(/\s/g, '').length < 25).length;
    return {
      text: join(cleaned, 'Page'),
      units: doc.numPages,
      unitLabel: '頁',
      scanned: doc.numPages > 0 && empty / doc.numPages > 0.6,
      emptyPages: empty,
    };
  }

  /** Render chosen PDF pages to PNG blobs (for scanned exams: Claude reads the images). */
  async function pdfPageImages(file, pageNumbers, maxSide = 1600) {
    const doc = await openPdf(file);
    const blobs = [];
    for (const n of pageNumbers) {
      if (n < 1 || n > doc.numPages) continue;
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, maxSide / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      blobs.push(await new Promise((r) => canvas.toBlob(r, 'image/png')));
    }
    return { blobs, total: doc.numPages };
  }

  async function pdfPageCount(file) {
    const doc = await openPdf(file);
    return doc.numPages;
  }

  /* ---------- Office files ---------- */
  const xmlText = (xml, paraTag, textTag) => {
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    const paras = Array.from(dom.getElementsByTagName(paraTag));
    return paras
      .map((p) => Array.from(p.getElementsByTagName(textTag)).map((t) => t.textContent).join(''))
      .filter((s) => s.trim())
      .join('\n');
  };
  const numberOf = (name) => Number((name.match(/(\d+)\.xml$/) || [])[1] || 0);

  async function fromPptx(file, onProgress) {
    await loadScript(LIBS.jszip);
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => numberOf(a) - numberOf(b));
    const pages = [];
    let i = 0;
    for (const name of slides) {
      let text = xmlText(await zip.file(name).async('string'), 'a:p', 'a:t');
      // Speaker notes often hold the lecturer's actual explanation.
      const rels = zip.file(name.replace('slides/', 'slides/_rels/') + '.rels');
      if (rels) {
        const relXml = await rels.async('string');
        const m = relXml.match(/Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/);
        const notesFile = m && zip.file('ppt/notesSlides/' + m[1]);
        if (notesFile) {
          const notes = xmlText(await notesFile.async('string'), 'a:p', 'a:t')
            .split('\n')
            .filter((l) => !/^\d+$/.test(l.trim()))
            .join('\n');
          if (notes.trim()) text += `\n(Speaker notes) ${notes}`;
        }
      }
      pages.push(tidy(text));
      if (onProgress) onProgress(++i, slides.length);
    }
    const cleaned = dropRepeated(pages);
    return { text: join(cleaned, 'Slide'), units: slides.length, unitLabel: '張投影片', scanned: false };
  }

  async function fromDocx(file) {
    await loadScript(LIBS.jszip);
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const doc = zip.file('word/document.xml');
    if (!doc) throw new Error('讀不到這個 Word 檔的內容。');
    const text = tidy(xmlText(await doc.async('string'), 'w:p', 'w:t'));
    return { text, units: 1, unitLabel: '份文件', scanned: false };
  }

  async function fromPlain(file) {
    const text = tidy(await file.text());
    return { text, units: 1, unitLabel: '份文字檔', scanned: false };
  }

  const kindOf = (file) => {
    const n = (file.name || '').toLowerCase();
    if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
    if (n.endsWith('.pptx')) return 'pptx';
    if (n.endsWith('.docx')) return 'docx';
    if (/\.(txt|md|markdown|py|csv|json)$/.test(n) || (file.type || '').startsWith('text/')) return 'text';
    if (/\.(png|jpe?g|webp|gif)$/.test(n) || (file.type || '').startsWith('image/')) return 'image';
    if (n.endsWith('.ppt') || n.endsWith('.doc')) return 'legacy';
    return 'unknown';
  };

  async function extractFile(file, onProgress) {
    const kind = kindOf(file);
    if (kind === 'pdf') return { kind, ...(await fromPdf(file, onProgress)) };
    if (kind === 'pptx') return { kind, ...(await fromPptx(file, onProgress)) };
    if (kind === 'docx') return { kind, ...(await fromDocx(file)) };
    if (kind === 'text') return { kind, ...(await fromPlain(file)) };
    if (kind === 'legacy')
      throw new Error('舊版 .ppt / .doc 讀不到。請在 PowerPoint 或 Word 另存成 .pptx / .docx，或匯出成 PDF。');
    if (kind === 'image') return { kind, text: '', units: 1, unitLabel: '張圖片', scanned: true };
    throw new Error('這種檔案還不支援。可以上傳 PDF、PPTX、DOCX、TXT 或 MD。');
  }

  /* ---------- chunking + relevance ---------- */
  function chunks(text, target = 1400) {
    const parts = String(text || '').split(/\n(?=\[(?:Page|Slide) \d+\])/);
    const out = [];
    let buf = '';
    for (const p of parts) {
      if (p.length > target * 2) {
        if (buf) {
          out.push(buf);
          buf = '';
        }
        for (let i = 0; i < p.length; i += target) out.push(p.slice(i, i + target));
        continue;
      }
      if ((buf + '\n' + p).length > target && buf) {
        out.push(buf);
        buf = p;
      } else buf = buf ? buf + '\n' + p : p;
    }
    if (buf) out.push(buf);
    return out;
  }

  /** Keep the parts of `text` most related to `query`, in original order, within maxChars. */
  function pickRelevant(text, query, maxChars = 12000) {
    text = String(text || '');
    if (text.length <= maxChars) return text;
    const cs = chunks(text);
    const q = U.tokens(query);
    if (!q.length) return text.slice(0, maxChars);
    const df = new Map();
    const toks = cs.map((c) => {
      const t = U.tokens(c);
      for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1);
      return t;
    });
    const qset = new Set(q);
    const scored = cs.map((c, i) => {
      let s = 0;
      const tf = new Map();
      for (const w of toks[i]) if (qset.has(w)) tf.set(w, (tf.get(w) || 0) + 1);
      for (const [w, n] of tf) s += (1 + Math.log(n)) * Math.log(1 + cs.length / (df.get(w) || 1));
      return { i, s, len: c.length };
    });
    scored.sort((a, b) => b.s - a.s);
    const keep = new Set();
    let used = 0;
    for (const x of scored) {
      if (used + x.len > maxChars) continue;
      keep.add(x.i);
      used += x.len;
    }
    return cs.filter((_, i) => keep.has(i)).join('\n…\n');
  }

  /** Evenly sample a long text down to maxChars (keeps the whole lecture's shape). */
  function sampleEvenly(text, maxChars) {
    text = String(text || '');
    if (text.length <= maxChars) return text;
    const cs = chunks(text, 1200);
    const step = cs.length / Math.max(1, Math.floor(maxChars / 1250));
    const out = [];
    let used = 0;
    for (let k = 0; k < cs.length && used < maxChars; k += Math.max(1, step)) {
      const c = cs[Math.floor(k)];
      out.push(c);
      used += c.length;
    }
    return out.join('\n…\n');
  }

  return { extractFile, pdfPageImages, pdfPageCount, kindOf, chunks, pickRelevant, sampleEvenly, tidy };
})();
