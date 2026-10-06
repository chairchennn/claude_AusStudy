// Builds seed/seed.json: the starting data written into the artifact's db (courses, semester, starter cards, first tasks).
// Course facts come from UQ's public course pages and earlier course profiles, so every course is marked verified: false.
// Run: node seed/build-seed.mjs [YYYY-MM-DD start date for card due dates]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const today = process.argv[2] || '2026-10-01';
const addDays = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};
const now = `${today}T00:00:00.000Z`;
const EXAM_WINDOW = '11/7–11/21 考試期間（時間表公布後填入日期）';

const settings = {
  semester: {
    name: 'UQ 2026 Semester 2',
    start: '2026-07-27',
    breakStart: '2026-09-28',
    breakEnd: '2026-10-02',
    classesEnd: '2026-10-30',
    revisionStart: '2026-11-02',
    examStart: '2026-11-07',
    examEnd: '2026-11-21',
    holidays: ['2026-10-05'],
  },
  minutes: { weekday: 120, weekend: 180 },
  english: 'B1',
  showZh: true,
};

// Assessment details come from the 2026 Semester 2 Electronic Course Profiles (screenshots the user shared on 2026-10-01).
const courses = {
  CSSE7030: {
    code: 'CSSE7030',
    name: 'Introduction to Programming',
    nameZh: '程式設計入門',
    kind: 'programming',
    color: 'teal',
    order: 1,
    verified: true,
    preview: true,
    note: '期末考 40%，需達門檻（hurdle）',
    topics: [
      'Python basics: types, expressions, variables',
      'Functions and docstrings',
      'Conditionals and loops',
      'Strings, lists, tuples and dictionaries',
      'File input and output',
      'Testing and debugging',
      'Classes and objects (OOP)',
      'Inheritance',
      'GUI programming and MVC (tkinter)',
    ],
    schedule: [],
    assessments: [
      { id: 'a-csse-1', name: 'Computer exercise 1 (Assignment 1)', due: '2026-09-04', time: '15:00', weight: 15, kind: 'assignment', status: 'done', note: '' },
      { id: 'a-csse-2', name: 'In-semester exam（期中考）', due: null, weight: 25, kind: 'exam', status: 'done', note: '9/5–9/20 之間的週六，已考完' },
      { id: 'a-csse-3', name: 'Computer exercise 2 (Assignment 2)', due: '2026-10-23', time: '15:00', weight: 20, kind: 'assignment', status: 'todo', note: '' },
    ],
    exam: { name: '期末考', date: null, weight: 40, note: 'Hurdle（需達門檻）· 身分驗證 · 現場考試' },
  },
  CYBR7001: {
    code: 'CYBR7001',
    name: 'Fundamentals of Cyber Security',
    nameZh: '資安基礎',
    kind: 'theory',
    color: 'plum',
    order: 2,
    verified: true,
    preview: false,
    note: '沒有期末考；3A 研究報告和 3B 研究發表都需達門檻',
    topics: [
      'Core concepts: CIA triad, threats, vulnerabilities, risk',
      'Threat actors and their motives',
      'Preventative, offensive and defensive cyber security',
      'Cyber crime',
      'Law, privacy and regulation in Australia',
      'Governance, policy and national security',
      'Human factors and social engineering',
    ],
    schedule: [],
    assessments: [
      { id: 'a-cybr1-1', name: 'Assignment 1: Individual Work', due: '2026-09-01', time: '16:00', weight: 35, kind: 'assignment', status: 'done', note: '' },
      { id: 'a-cybr1-2', name: 'Assignment 2: Group Submission', due: '2026-09-22', time: '16:00', weight: 15, kind: 'assignment', status: 'done', note: '小組' },
      { id: 'a-cybr1-3', name: 'Assignment 3A: Research Paper', due: '2026-10-20', time: '16:00', weight: 20, kind: 'assignment', status: 'todo', note: 'Hurdle（需達門檻）' },
      { id: 'a-cybr1-4', name: 'Assignment 3B: Research Seminar (Individual)', due: '2026-11-09', weight: 30, kind: 'presentation', status: 'todo', note: '11/9–11/13 之間現場個人發表 · Hurdle · 身分驗證' },
    ],
    exam: null,
  },
  CYBR7002: {
    code: 'CYBR7002',
    name: 'Information Security Essentials',
    nameZh: '資訊安全要點',
    kind: 'theory',
    color: 'ochre',
    order: 3,
    verified: true,
    preview: false,
    note: '期末考 55%，需達門檻（hurdle）；10/16 同一天有 Report 和 Quiz 3',
    topics: [
      'Governance of information and ICT assets',
      'Business impact analysis (confidentiality, integrity, availability)',
      'Risk management and types of controls',
      'Access control and authentication protocols',
      'Biometrics for authentication',
      'Applied cryptography',
      'Network and wireless network security',
      'Physical security',
      'HR security and securing the human',
      'Phishing and social engineering',
      'Payment card industry (PCI DSS) security',
      'Cloud computing security',
      'Industrial control systems',
      'Cooperative and automated vehicles',
    ],
    schedule: [],
    assessments: [
      { id: 'a-cybr2-6', name: 'Report', due: '2026-10-16', time: '14:00', weight: 15, kind: 'assignment', status: 'todo', note: '線上繳交' },
      { id: 'a-cybr2-1', name: 'In-class Quiz 1', due: '2026-08-21', weight: 3.75, kind: 'quiz', status: 'done', note: '四次小考合計 15%' },
      { id: 'a-cybr2-2', name: 'In-class Quiz 2', due: '2026-09-11', weight: 3.75, kind: 'quiz', status: 'done', note: '四次小考合計 15%' },
      { id: 'a-cybr2-3', name: 'In-class Quiz 3', due: '2026-10-16', weight: 3.75, kind: 'quiz', status: 'todo', note: '週五 applied class 時間線上作答；四次合計 15%' },
      { id: 'a-cybr2-4', name: 'In-class Quiz 4', due: '2026-10-30', weight: 3.75, kind: 'quiz', status: 'todo', note: '週五 applied class 時間線上作答；四次合計 15%' },
      { id: 'a-cybr2-5', name: 'Presentation（小組）', due: '2026-09-21', weight: 15, kind: 'presentation', status: 'done', note: '9/21–9/22' },
    ],
    exam: { name: '期末考', date: null, weight: 55, note: 'Hurdle（需達門檻）· 身分驗證 · 現場考試' },
  },
  MATH7861: {
    code: 'MATH7861',
    name: 'Discrete Mathematics',
    nameZh: '離散數學',
    kind: 'math',
    color: 'moss',
    order: 4,
    verified: true,
    preview: true,
    note: '期末考 50%，需達門檻（hurdle）',
    topics: [
      'Propositional and predicate logic',
      'Valid arguments and proof techniques',
      'Elementary set theory',
      'Relations and functions',
      'Induction and recursive definitions',
      'Counting: pigeonhole principle, inclusion–exclusion',
      'Introductory probability',
      'Elementary graph theory',
      'Binary operations, semigroups and groups',
      'Fields and applications of finite fields',
      'Elementary number theory',
    ],
    schedule: [],
    assessments: [
      { id: 'a-math-1', name: 'Applied class exercises（每週 applied class）', due: null, weight: 30, kind: 'quiz', status: 'doing', note: '每週三 applied class 當場完成，12 次取最好 8 次（第 2–13 週，最後一次 10/28）' },
      { id: 'a-math-2', name: 'In-semester examination（期中考）', due: null, weight: 20, kind: 'exam', status: 'done', note: '9/5–9/20 之間的週六，已考完' },
    ],
    exam: { name: '期末考', date: null, weight: 50, note: 'Hurdle（需達門檻）· 身分驗證 · 現場考試' },
    // Each Wednesday applied class opens with a quiz on the previous week's content (learner, 2026-10-06; ECP: best 8 of 12, 30%).
    weeklyQuiz: { on: true, label: 'Applied class 小考', classType: 'applied', covers: 'prev', fromWeek: 2, toWeek: 13, best: 8, of: 12, weight: 30 },
  },
};

// Weekly timetable (screenshot shared 2026-10-01). Monday's CYBR7002 lecture clashes with MATH7861, so it is watched as a recording.
const timetable = {
  classes: [
    { id: 'c01', courseCode: 'CYBR7002', type: 'lecture', day: 1, start: '10:00', end: '12:00', location: '', mode: 'recording', note: '和 MATH7861 講課衝堂' },
    { id: 'c02', courseCode: 'MATH7861', type: 'lecture', day: 1, start: '10:00', end: '11:00', location: '03-206 Steele Building', mode: 'in-person' },
    { id: 'c03', courseCode: 'CSSE7030', type: 'lecture', day: 2, start: '12:00', end: '14:00', location: '03-309 Steele Building', mode: 'in-person' },
    { id: 'c04', courseCode: 'MATH7861', type: 'lecture', day: 2, start: '14:00', end: '15:00', location: '03-206 Steele Building', mode: 'in-person' },
    { id: 'c05', courseCode: 'MATH7861', type: 'applied', day: 3, start: '12:00', end: '14:00', location: '32-208 Gordon Greenwood Building', mode: 'in-person' },
    { id: 'c06', courseCode: 'CYBR7001', type: 'lecture', day: 3, start: '16:00', end: '18:00', location: '84-128 Therapies Building', mode: 'in-person' },
    { id: 'c07', courseCode: 'MATH7861', type: 'lecture', day: 4, start: '13:00', end: '14:00', location: '63-348', mode: 'in-person' },
    { id: 'c08', courseCode: 'CSSE7030', type: 'applied', day: 4, start: '14:00', end: '16:00', location: '11A-101 ModWest', mode: 'in-person' },
    { id: 'c09', courseCode: 'CSSE7030', type: 'practical', day: 4, start: '16:00', end: '18:00', location: '69-315 Building 69', mode: 'in-person' },
    { id: 'c10', courseCode: 'CYBR7001', type: 'applied', day: 5, start: '08:00', end: '09:00', location: '47A-141', mode: 'in-person' },
    { id: 'c11', courseCode: 'CYBR7002', type: 'applied', day: 5, start: '09:00', end: '10:00', location: '32-215 Gordon Greenwood Building', mode: 'in-person' },
  ],
  updatedAt: now,
};

// [kind, front, back, extra]
const CARDS = {
  CSSE7030: [
    ['code', 'What does this print?', '[2, 5, 8]\nrange(start, stop, step)：從 2 開始每次 +3，不包含 10。', { code: 'print(list(range(2, 10, 3)))' }],
    ['concept', 'What is the difference between a list and a tuple in Python?', 'A list is mutable (it can be changed); a tuple is immutable.\nlist 可以改、tuple 不能改；tuple 可以當 dict 的 key。'],
    ['concept', 'What does a function return if it has no return statement?', 'None.\n沒有 return 的函式會回傳 None。'],
    ['code', 'What does this print?', '3 1 3.5\n// 整數除法、% 餘數、/ 一般除法（結果是 float）。', { code: 'print(7 // 2, 7 % 2, 7 / 2)' }],
    ['code', 'What does this print?', 'yth n\n[1:4] 取索引 1、2、3（不含 4）；-1 是最後一個字元。', { code: 's = "python"\nprint(s[1:4], s[-1])' }],
    ['concept', 'What does d.get(key, default) do for a dictionary d?', 'It returns d[key] if the key exists, otherwise default, without raising KeyError.\n找不到 key 時回傳預設值，不會報錯。'],
    ['code', 'What does this print?', 'None\nlist.sort() 原地排序並回傳 None；要新的排序 list 用 sorted(nums)。', { code: 'nums = [3, 1, 2]\nresult = nums.sort()\nprint(result)' }],
    ['concept', 'What is the difference between == and is?', '== compares values; is checks whether two names refer to the same object.\n== 比較值，is 比較是不是同一個物件。'],
    ['concept', 'In a class, what is self?', 'The first parameter of an instance method; it refers to the object the method was called on.\nself 代表呼叫這個方法的物件本身。'],
    ['concept', 'What does __init__ do?', 'It initialises a new object: it runs when the object is created and sets its attributes.\n建立物件時自動執行，用來設定屬性的初始值。'],
    ['concept', 'What is MVC in GUI programming?', 'Model–View–Controller: the model holds data and logic, the view displays it, the controller handles user input and updates both.\nModel 管資料、View 管畫面、Controller 處理使用者操作。'],
    ['code', 'What does this print?', '[1, 2, 3]\ny = x 沒有複製 list，x 和 y 指向同一個物件（aliasing）。', { code: 'x = [1, 2]\ny = x\ny.append(3)\nprint(x)' }],
  ],
  MATH7861: [
    ['concept', 'What is the contrapositive of p → q? Is it equivalent to p → q?', '¬q → ¬p. Yes, it is logically equivalent.\n逆否命題和原命題等價；逆命題 q → p 則不一定。'],
    ['concept', 'Negate ∀x P(x).', '∃x ¬P(x).\n「所有 x 都成立」的否定是「存在一個 x 不成立」。'],
    ['concept', 'What is a tautology?', 'A compound proposition that is true for every truth assignment, e.g. p ∨ ¬p.\n恆真式：不論真假值怎麼給都為真。'],
    ['concept', 'What are the steps of a proof by mathematical induction?', '1) Base case: prove P(n₀). 2) Inductive step: assume P(k) and prove P(k + 1). Then P(n) holds for all n ≥ n₀.\n基礎步驟＋歸納步驟（假設 P(k) 成立，證明 P(k+1)）。'],
    ['concept', 'State the pigeonhole principle.', 'If n + 1 or more objects are placed into n boxes, some box contains at least two objects.\n鴿籠原理。'],
    ['concept', 'Inclusion–exclusion for two sets: |A ∪ B| = ?', '|A| + |B| − |A ∩ B|\n排容原理：交集被算了兩次，要減掉一次。'],
    ['concept', 'How many r-combinations of n objects are there, C(n, r)?', 'n! / (r! (n − r)!)\n不考慮順序的選法數。'],
    ['concept', 'Which three properties make a relation an equivalence relation?', 'Reflexive, symmetric and transitive.\n自反、對稱、遞移。'],
    ['concept', 'What does a ≡ b (mod n) mean?', 'n divides a − b; equivalently, a and b leave the same remainder when divided by n.\na 和 b 除以 n 的餘數相同。'],
    ['concept', 'State the handshaking lemma.', 'In any graph, the sum of the vertex degrees equals 2|E|. So the number of odd-degree vertices is even.\n握手定理。'],
    ['concept', 'When does a connected graph have an Euler circuit?', 'When every vertex has even degree.\n連通圖，且每個頂點的度數都是偶數。'],
    ['concept', 'Define injective, surjective and bijective functions.', 'Injective: different inputs give different outputs. Surjective: every element of the codomain is an output. Bijective: both.\n一對一、映成、一一對應。'],
    ['concept', 'What are the group axioms?', 'A set with a binary operation that is closed and associative, has an identity element, and in which every element has an inverse.\n封閉、結合律、單位元素、反元素。'],
  ],
  CYBR7001: [
    ['term', 'CIA triad', '機密性、完整性、可用性\nConfidentiality, integrity and availability: the three core goals of information security.', { zh: '機密性、完整性、可用性', def: 'Confidentiality, integrity and availability: the three core goals of information security.', example: 'A ransomware attack mainly harms availability.' }],
    ['concept', 'What is the difference between a threat, a vulnerability and a risk?', 'Threat: something that could cause harm. Vulnerability: a weakness that could be exploited. Risk: the likelihood and impact of a threat exploiting a vulnerability.\n威脅、弱點、風險；風險 ≈ 可能性 × 影響。'],
    ['term', 'Threat actor', '威脅行為者\nA person or group that carries out an attack, e.g. nation-states, cybercriminals, hacktivists, insiders.', { zh: '威脅行為者', def: 'A person or group that carries out an attack, e.g. nation-states, cybercriminals, hacktivists, insiders.', example: 'A disgruntled employee can be an insider threat actor.' }],
    ['term', 'Defence in depth', '縱深防禦\nSeveral layers of security controls, so if one fails the others still protect the asset.', { zh: '縱深防禦', def: 'Several layers of security controls, so if one fails the others still protect the asset.', example: 'A firewall, MFA and offline backups together are defence in depth.' }],
    ['term', 'Social engineering', '社交工程\nManipulating people into giving information or access instead of attacking technology.', { zh: '社交工程', def: 'Manipulating people into giving information or access instead of attacking technology.', example: 'A fake IT support call asking for your password.' }],
    ['term', 'Principle of least privilege', '最小權限原則\nGive users and programs only the access they need for their job.', { zh: '最小權限原則', def: 'Give users and programs only the access they need for their job.', example: 'An intern should not have administrator rights.' }],
    ['concept', 'What are the ASD Essential Eight?', 'Application control, patch applications, configure Microsoft Office macro settings, user application hardening, restrict administrative privileges, patch operating systems, multi-factor authentication, regular backups.\n澳洲訊號局（ASD）建議的八項基本防護策略。'],
    ['concept', "What is Australia's Notifiable Data Breaches (NDB) scheme?", 'Under the Privacy Act 1988, covered organisations must notify affected individuals and the OAIC when a data breach is likely to cause serious harm.\n可能造成嚴重傷害的資料外洩，必須通知當事人和 OAIC。'],
    ['term', 'Zero-day vulnerability', '零時差漏洞\nA flaw that the vendor does not know about yet, so no patch exists.', { zh: '零時差漏洞', def: 'A flaw that the vendor does not know about yet, so no patch exists.', example: 'Attackers used the zero-day before a fix was released.' }],
    ['term', 'Ransomware', '勒索軟體\nMalware that encrypts or steals data and demands payment.', { zh: '勒索軟體', def: 'Malware that encrypts or steals data and demands payment.', example: 'Ransomware can stop a hospital from opening patient records.' }],
    ['concept', 'Why is attributing a cyber attack difficult?', 'Attackers use proxies, compromised machines and false flags, and evidence crosses national borders, so it is hard to prove who is responsible.\n攻擊者會用跳板、偽旗和跨國設施，很難證明是誰做的。'],
    ['term', 'Attack surface', '攻擊面\nAll the points where an attacker could try to enter a system or take data out.', { zh: '攻擊面', def: 'All the points where an attacker could try to enter a system or take data out.', example: 'Every new internet-facing service increases the attack surface.' }],
  ],
  CYBR7002: [
    ['concept', 'What are the three types of authentication factor?', 'Something you know (password), something you have (phone, token), something you are (biometrics). MFA combines two or more different types.\n知道的、擁有的、本身的特徵；MFA 要組合不同類型。'],
    ['term', 'FAR and FRR (biometrics)', '誤接受率／誤拒絕率\nFAR: impostors wrongly accepted. FRR: genuine users wrongly rejected. Lowering one usually raises the other; the EER is where they are equal.', { zh: '誤接受率／誤拒絕率', def: 'FAR: impostors wrongly accepted. FRR: genuine users wrongly rejected. The EER is where they are equal.', example: 'A very strict fingerprint reader has a low FAR but a higher FRR.' }],
    ['concept', 'Symmetric vs asymmetric encryption?', 'Symmetric uses one shared secret key (fast, e.g. AES). Asymmetric uses a public/private key pair (slower, e.g. RSA), which solves key distribution and enables digital signatures.\n對稱：同一把鑰匙；非對稱：公鑰與私鑰。'],
    ['concept', 'Which properties should a cryptographic hash function have?', 'Pre-image resistance (one-way), second pre-image resistance and collision resistance; a small input change gives a very different output.\n單向、抗第二原像、抗碰撞。'],
    ['concept', 'How does a digital signature work?', "The sender signs a hash of the message with their private key; anyone can verify it with the sender's public key. It gives integrity, authentication and non-repudiation.\n用私鑰簽、公鑰驗；提供完整性、身分驗證、不可否認。"],
    ['concept', 'Identification vs authentication vs authorisation?', 'Identification: claiming who you are. Authentication: proving it. Authorisation: what you are allowed to do.\n識別、驗證、授權。'],
    ['term', 'Phishing, spear phishing, whaling', '網路釣魚／魚叉式釣魚／捕鯨\nPhishing targets many people; spear phishing targets a specific person or group; whaling targets senior executives.', { zh: '網路釣魚／魚叉式釣魚／捕鯨', def: 'Phishing targets many people; spear phishing targets specific people; whaling targets senior executives.', example: 'An email pretending to be the CEO asks finance to pay an invoice.' }],
    ['term', 'PCI DSS', '支付卡產業資料安全標準\nSecurity requirements for organisations that store, process or transmit cardholder data.', { zh: '支付卡產業資料安全標準', def: 'Security requirements for organisations that store, process or transmit cardholder data.', example: 'An online shop must protect stored card numbers under PCI DSS.' }],
    ['concept', 'What is the cloud shared responsibility model?', 'The provider secures the cloud infrastructure; the customer secures what they put in it (data, identities, configuration). The split depends on IaaS, PaaS or SaaS.\n雲端業者負責雲本身，客戶負責雲裡的資料與設定。'],
    ['concept', 'IDS vs IPS?', 'An IDS detects suspicious traffic and alerts; an IPS sits inline and can block it automatically.\nIDS 偵測並告警，IPS 可以直接阻擋。'],
    ['concept', 'Why is availability usually the top priority in industrial control systems?', 'ICS run physical processes such as power and water; downtime can endanger safety and is very costly, and the systems are old and hard to patch.\n工控系統停機會影響安全與民生，所以可用性優先。'],
    ['term', 'Separation of duties', '職責分離\nSplitting a critical task between people so no single person can misuse it.', { zh: '職責分離', def: 'Splitting a critical task between people so no single person can misuse it.', example: 'One staff member creates a payment and another approves it.' }],
    ['concept', "What is WPA3's main improvement over WPA2-Personal?", 'WPA3 replaces the pre-shared-key handshake with SAE, which resists offline password-guessing and provides forward secrecy.\nWPA3 改用 SAE，能抵抗離線字典攻擊。'],
  ],
};

const docs = { 'meta/settings': settings, 'meta/timetable': timetable };
for (const [code, c] of Object.entries(courses)) docs[`courses/${code}`] = { ...c, createdAt: now, updatedAt: now };

let n = 0;
for (const [code, list] of Object.entries(CARDS)) {
  list.forEach(([kind, front, back, extra], i) => {
    const due = addDays(today, n++ % 4);
    const id = `starter-${code.toLowerCase()}-${String(i + 1).padStart(2, '0')}`;
    docs[`cards/${id}`] = {
      courseCode: code,
      kind,
      front,
      back,
      extra: extra || {},
      source: { type: 'starter' },
      srs: { due, interval: 0, ease: 2.5, reps: 0, lapses: 0, last: null },
      createdAt: now,
    };
  });
}

const tasks = [
  [today, null, '核對四科的評量日期：把 ECP 的 Assessment 表貼到「計畫 → 整理課程公告」', 20, 'other', 1, '倒數、計畫和衝刺建議都靠這些日期。', true],
  [today, 'MATH7861', 'MATH7861：上傳最近一週的講義，看導讀，回答 5 題書僮問答', 45, 'study', 2, '期末考過往占 60% 且有門檻，越早開始越好。'],
  [today, null, '複習今日閃卡（書僮預設卡）', 15, 'review', 2, '先熟悉閃卡的用法；之後每天 15 分鐘。'],
  [addDays(today, 1), 'CYBR7002', 'CYBR7002：上傳一份講義，用「費曼講解」以英文講一個觀念', 40, 'english', 2, '理論課最需要把觀念講出來，同時練英文。'],
  [addDays(today, 1), 'CSSE7030', 'CSSE7030：出 5 題程式追蹤題（練習 → 出題）', 30, 'practice', 2, '期末考是紙筆作答，追蹤程式是最常考的題型。'],
  [addDays(today, 1), null, '請書僮排接下來兩週的計畫（寫上打工和作業時間）', 10, 'other', 2, '有了作業日期和你的時間，計畫才會準。'],
];
tasks.forEach(([date, courseCode, title, minutes, kind, priority, why, done], i) => {
  docs[`tasks/starter-t${i + 1}`] = { date, courseCode, title, minutes, kind, priority, why, done: !!done, doneAt: done ? now : null, order: i, source: 'starter', createdAt: now };
});

const out = join(dirname(fileURLToPath(import.meta.url)), 'seed.json');
writeFileSync(out, JSON.stringify(docs, null, 1));
console.log(`wrote ${Object.keys(docs).length} documents to ${out}`);
