// Creates small upload fixtures for the smoke test: a text note, a 2-page PDF and a 3-slide PPTX with speaker notes.
const fs = require('fs');
const path = require('path');
const JSZip = require(path.join(__dirname, '..', 'node_modules', 'jszip'));

const dir = path.join(__dirname, 'fixtures');
fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(
  path.join(dir, 'Week9-induction-notes.txt'),
  `MATH7861 Week 9 — Mathematical induction
Principle: to prove P(n) for all n >= 1, prove P(1) (base case) and show P(k) -> P(k+1) (inductive step).
Example: 1 + 2 + ... + n = n(n+1)/2.
Strong induction assumes P(1), ..., P(k) to prove P(k+1).
Common mistakes: forgetting the base case; not using the inductive hypothesis.
`
);

function makePdf(pages) {
  const objects = [];
  let n = 4;
  const entries = pages.map((lines) => ({ p: n++, c: n++, lines }));
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${entries.map((e) => e.p + ' 0 R').join(' ')}] /Count ${entries.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (const e of entries) {
    const esc = (s) => s.replace(/[()\\]/g, (m) => '\\' + m);
    const stream = 'BT /F1 16 Tf 72 720 Td ' + e.lines.map((l, i) => (i ? '0 -24 Td ' : '') + `(${esc(l)}) Tj`).join(' ') + ' ET';
    objects[e.p] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${e.c} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objects[e.c] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

fs.writeFileSync(
  path.join(dir, 'CYBR7002 Lecture 8 Cryptography.pdf'),
  makePdf([
    ['Lecture 8: Applied cryptography', 'Symmetric encryption uses one shared key (AES).', 'Asymmetric encryption uses a key pair (RSA).', 'CRICOS code 00025B'],
    ['Hash functions', 'Properties: pre-image resistance, collision resistance.', 'Digital signatures: sign with private key, verify with public key.', 'CRICOS code 00025B'],
  ])
);

(async () => {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const body = (texts) =>
    `<p:cSld><p:spTree>${texts.map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`).join('')}</p:spTree></p:cSld>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}>${body(['Authentication factors', 'Something you know, have, are'])}</p:sld>`);
  zip.file('ppt/slides/slide2.xml', `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}>${body(['Biometrics', 'FAR versus FRR'])}</p:sld>`);
  zip.file('ppt/slides/slide10.xml', `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}>${body(['Summary slide'])}</p:sld>`);
  zip.file(
    'ppt/slides/_rels/slide1.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>'
  );
  zip.file('ppt/notesSlides/notesSlide1.xml', `<?xml version="1.0" encoding="UTF-8"?><p:notes ${NS}>${body(['Explain MFA with a bank example.', '1'])}</p:notes>`);
  fs.writeFileSync(path.join(dir, 'Week 7 Authentication.pptx'), await zip.generateAsync({ type: 'nodebuffer' }));
  console.log('fixtures written to', dir);
})();
