/* content.js — fixed guidance content: question types, learning methods, sentence frames, tips. */

const QTYPES = {
  mcq: { label: '選擇題', hint: '四選一，附解析' },
  tf: { label: '是非題', hint: '判斷對錯並寫理由' },
  short: { label: '簡答題', hint: '2-4 句英文作答' },
  scenario: { label: '情境題', hint: '把觀念用在真實情境' },
  compare: { label: '比較題', hint: '比較兩個容易混淆的觀念' },
  trace: { label: '程式追蹤', hint: '預測程式印出什麼' },
  debug: { label: '找錯誤', hint: '找出並修正一個 bug' },
  write: { label: '寫函式', hint: '照規格寫 Python 函式' },
  parsons: { label: '程式拼圖', hint: '把打亂的程式排回正確順序' },
  steps: { label: '計算題', hint: '寫出每一步' },
  proof: { label: '證明題', hint: '寫出完整證明' },
};

const QTYPES_BY_KIND = {
  programming: { all: ['trace', 'debug', 'write', 'parsons', 'mcq', 'short'], defaults: ['trace', 'debug', 'mcq', 'write'] },
  math: { all: ['steps', 'proof', 'mcq', 'tf', 'short'], defaults: ['steps', 'proof', 'tf', 'mcq'] },
  theory: { all: ['scenario', 'compare', 'short', 'mcq', 'tf'], defaults: ['scenario', 'compare', 'mcq', 'short'] },
};

/** Types whose answers Claude marks (everything else is marked in the page). */
const AI_MARKED = new Set(['short', 'scenario', 'compare', 'debug', 'write', 'steps', 'proof']);

const METHOD_GROUPS = [
  {
    id: 'logic',
    title: '邏輯課',
    courses: 'CSSE7030 程式 · MATH7861 離散數學',
    kinds: ['programming', 'math'],
    intro:
      '這兩科考的是「會不會做」，不是「讀過沒有」。期末考是紙筆作答、不能跑程式，所以練習時要逼自己在腦中和紙上把每一步想清楚。',
    methods: [
      {
        id: 'predict',
        name: '先預測，再執行',
        en: 'Predict → Run → Explain',
        steps: [
          '看到一段程式，先在紙上寫下你預測的輸出，和每個變數怎麼變（trace table）。',
          '再執行程式或對答案。',
          '錯了就找出是哪一行想錯，用一句話寫下「我原本以為…其實…」。',
        ],
        why: '程式追蹤是最常考、也最能訓練邏輯的題型。先預測再驗證，錯誤會變成記憶點。',
        action: { label: '練 5 題程式追蹤', kind: 'programming', types: ['trace', 'debug'] },
      },
      {
        id: 'parsons',
        name: '程式拼圖 → 自己寫',
        en: 'Parsons problems, then write it yourself',
        steps: ['先把打亂的程式行排回正確順序。', '熟了以後，不看提示從零寫一次同樣功能。', '最後改一個條件（例如輸入變成空 list），想想程式要怎麼改。'],
        why: '先專注在邏輯結構，不被語法卡住；再一步步拿掉提示，是初學程式最快的路。',
        action: { label: '練程式拼圖與寫函式', kind: 'programming', types: ['parsons', 'write'] },
      },
      {
        id: 'fading',
        name: '詳解 → 半詳解 → 自己解',
        en: 'Worked example fading',
        steps: [
          '完整讀懂一題詳解，每一步問自己「為什麼可以這樣做」。',
          '做一題只給前半步驟的題目，自己完成後半。',
          '最後獨立解一題同類型的題目。',
        ],
        why: '一開始就硬解，腦袋負擔太大；從範例逐步撤掉提示，最省力也最穩。數學課的「複習」步驟就是照這個順序：導讀 → 例題 → 基礎題 → 練習題。',
        action: { label: '到複習頁開始題型練習', route: 'review' },
      },
      {
        id: 'justify',
        name: '每一步都寫理由',
        en: 'Justify every step',
        steps: [
          '證明或計算的每一行旁邊，寫上根據什麼：定義、已知條件、歸納假設、哪條定理。',
          '寫不出理由的那一步，就是你還不懂的地方，回去看講義那一段。',
          '手寫的過程可以拍照，附在答案裡讓書僮批改。',
        ],
        why: '離散數學的分數多半給在推理過程。寫理由會逼你檢查每一步，也是考試拿步驟分的方法。',
        action: { label: '練證明題', kind: 'math', types: ['proof'] },
      },
      {
        id: 'interleave',
        name: '交錯練習',
        en: 'Interleaving',
        steps: ['不要一次只練同一種題型。', '把歸納法、計數、關係、圖論（或迴圈、字串、字典、類別）混在一起練。', '每題先判斷「這題該用什麼方法」，再開始做。'],
        why: '考試不會告訴你這題考哪一章。混合練習會訓練你「選對方法」，這正是期末考最難的部分。',
        action: { label: '出一份混合題', kind: null, types: null },
      },
      {
        id: 'mock',
        name: '限時模擬考',
        en: 'Timed past papers',
        steps: ['考前三週開始，每週用一份考古題限時作答。', '寫完才對答案，把錯題加進錯題本。', '把考古題上傳成「考古題」類型，書僮出題時就會模仿它的風格。'],
        why: '時間壓力下的表現和平常練習差很多，提早習慣考試節奏才不會在考場慌。',
        action: { label: '上傳考古題', route: 'courses' },
      },
    ],
  },
  {
    id: 'theory',
    title: '理論課',
    courses: 'CYBR7001 資安基礎 · CYBR7002 資訊安全要點',
    kinds: ['theory'],
    intro:
      '理論課難，是因為名詞多、概念抽象、沒有標準算法，而且全是英文。方法是：把抽象變具體（例子、情境），把「背」變成「用」（解釋、比較、套情境）。',
    methods: [
      {
        id: 'why-first',
        name: '先問「為什麼要學」',
        en: 'Purpose before content',
        steps: ['上傳講義，先看書僮的導讀：老師為什麼教這個、你要學會什麼。', '帶著導讀裡的問題去讀投影片，只找答案，不逐字讀。', '讀完回答導讀最後的問題。'],
        why: '知道目的，讀的時候會主動找重點，而不是每一行都想背。',
        action: { label: '上傳講義做導讀', route: 'courses' },
      },
      {
        id: 'ces',
        name: '概念 → 例子 → 情境',
        en: 'Concept → Example → Scenario',
        steps: [
          '每學一個名詞，配一個真實例子，例如 2022 年 Optus 和 Medibank 的資料外洩。',
          '再想：「如果我是這間公司的資安人員，事前能做什麼？事後要做什麼？」',
          '用 2-3 句英文寫下來。',
        ],
        why: '理論題通常考「應用」。有具體例子，觀念才記得住，考試也寫得出來。',
        action: { label: '練情境題', kind: 'theory', types: ['scenario'] },
      },
      {
        id: 'feynman',
        name: '費曼學習法',
        en: 'Feynman technique, in English',
        steps: [
          '選一個概念，用 3-5 句簡單英文，解釋給「沒來上課的同學」聽，加一個例子。',
          '書僮會指出你漏掉或講錯的重點，順便修正英文。',
          '照回饋重講一次，直到講得清楚。',
        ],
        why: '講不出來就代表還沒懂。這個方法同時練理解和英文表達，是理論課加英文最有效率的組合。',
        action: { label: '開始費曼練習', route: 'tutor', mode: 'feynman' },
      },
      {
        id: 'compare',
        name: '比較表',
        en: 'Compare & contrast tables',
        steps: [
          '把容易混淆的觀念放進同一張表：threat / vulnerability / risk、IDS / IPS、對稱 / 非對稱加密、identification / authentication / authorisation。',
          '欄位用：定義、目的、例子、優點、限制。',
          '遮住表格，試著自己重畫一次。',
        ],
        why: '考試很愛考「差在哪」。比較的過程會逼你找出每個觀念真正的界線。',
        action: { label: '練比較題', kind: 'theory', types: ['compare'] },
      },
      {
        id: 'recall',
        name: '主動回想 + 間隔重複',
        en: 'Retrieval practice + spaced repetition',
        steps: ['導讀裡的關鍵名詞，一鍵加入閃卡。', '每天 15 分鐘，複習書僮排好的卡片，不要重讀講義。', '看到卡片先在心裡回答，再翻面打分數。'],
        why: '考試考的是「想得起來」。練習回想比重讀有效得多，間隔重複則讓你在快忘記時剛好複習到。',
        action: { label: '去複習閃卡', route: 'practice', tab: 'review' },
      },
      {
        id: 'structure',
        name: '答題骨架',
        en: 'Define → Explain → Example → Evaluate',
        steps: ['簡答與申論題照固定結構寫：定義 → 說明怎麼運作或為什麼 → 舉例 → 評估（優缺點、限制、建議）。', '每一段用下面「句型庫」的句型開頭。', '寫完對照評分重點，看哪一段最弱。'],
        why: '有骨架就不怕不知道從哪裡寫起，閱卷老師也容易找到得分點。',
        action: { label: '練簡答題', kind: 'theory', types: ['short', 'scenario'] },
      },
    ],
  },
  {
    id: 'english',
    title: '英文',
    courses: '讀得懂、寫得出、說得出',
    kinds: [],
    intro:
      '英文不用另外花一大段時間練，把它放進每天的讀書流程：用中文理解，用英文輸出，再看修改表找出你的固定錯誤。',
    methods: [
      {
        id: 'zh-then-en',
        name: '先中文理解，再英文輸出',
        en: 'Understand in Chinese, answer in English',
        steps: ['看不懂的段落按「用中文解釋」。', '懂了以後，一定用英文回答書僮的問題。', '不會的字先寫中文，書僮會幫你換成自然的英文。'],
        why: '卡在英文就沒辦法思考內容。先把觀念弄懂，再專心練表達，兩件事分開做比較有效。',
        action: { label: '開始書僮問答', route: 'tutor' },
      },
      {
        id: 'patterns',
        name: '修改表 → 找出固定錯誤',
        en: 'Track your recurring mistakes',
        steps: ['每次回答後看「原句 / 修正 / 原因」表。', '問答結束時，書僮會整理你這次的常見錯誤（時態、單複數、冠詞、介系詞）。', '下次回答前先看一眼，刻意避開。'],
        why: '多數人的英文錯誤只有幾種，一直重複。找出你的那幾種，改善最快。',
        action: null,
      },
      {
        id: 'frames',
        name: '句型骨架',
        en: 'Sentence frames',
        steps: ['理論題用下面的句型開頭，先求正確，再求漂亮。', '每週挑 3 個新句型，在問答裡刻意用。'],
        why: '有現成的學術句型，就能把力氣放在內容。',
        action: null,
      },
      {
        id: 'terms',
        name: '雙語名詞卡',
        en: 'Bilingual term cards',
        steps: ['每堂課的術語做成「英文 ↔ 中文 + 定義 + 例句」卡片。', '複習時看中文想英文，這一面最重要，因為考試要你寫出英文。'],
        why: '專有名詞是理論課最大的門檻，先把名詞變熟，讀講義和寫答案都會快很多。',
        action: { label: '去複習閃卡', route: 'practice', tab: 'review' },
      },
      {
        id: 'listen',
        name: '先導讀，再聽錄影',
        en: 'Preview before Echo360',
        steps: ['聽課或看 Echo360 錄影前，先看書僮的導讀和關鍵名詞。', '錄影開英文字幕，0.9 倍速。', '只抓重點句，聽完用一句英文說出這堂課在講什麼。'],
        why: '先知道會出現哪些字和主題，聽力負擔會小很多。',
        action: null,
      },
    ],
  },
];

const WEEKLY_RHYTHM = [
  { when: '每堂課後 24 小時內', what: '上傳講義 → 看導讀 → 書僮問答 5-8 題', minutes: 40 },
  { when: '每天', what: '閃卡複習（書僮排好的到期卡片）', minutes: 15 },
  { when: '每天', what: '用英文回答 2-3 題，看修改表', minutes: 10 },
  { when: '每週兩次', what: '混合題型練習 8-10 題，錯題進錯題本', minutes: 40 },
  { when: '週末', what: '重做錯題本 + 讓書僮排下週計畫', minutes: 30 },
  { when: '考前三週起', what: '每週一份考古題，限時作答', minutes: 120 },
];

const SENTENCE_FRAMES = [
  { use: '定義', en: 'X refers to …', zh: 'X 指的是…' },
  { use: '定義', en: 'X is a type of … that …', zh: 'X 是一種…，它會…' },
  { use: '說明', en: 'The main purpose of X is to …', zh: 'X 的主要目的是…' },
  { use: '說明', en: 'X works by …', zh: 'X 的運作方式是…' },
  { use: '說明', en: 'X protects … against … by …', zh: 'X 透過…來保護…不受…威脅' },
  { use: '比較', en: 'Unlike X, Y …', zh: '和 X 不同，Y…' },
  { use: '比較', en: 'Both X and Y …; however, X …, whereas Y …', zh: 'X 和 Y 都…；不過 X…，而 Y…' },
  { use: '舉例', en: 'For example, in the 2022 Optus breach, …', zh: '例如在 2022 年 Optus 資料外洩事件中…' },
  { use: '舉例', en: 'A typical case is when …', zh: '典型的情況是…' },
  { use: '因果', en: 'As a result, …', zh: '因此…' },
  { use: '因果', en: 'This can lead to …', zh: '這可能導致…' },
  { use: '評估', en: 'One limitation of X is that …', zh: 'X 的一個限制是…' },
  { use: '評估', en: 'X is effective when …, but less effective when …', zh: 'X 在…時有效，但在…時效果較差' },
  { use: '建議', en: 'Therefore, the organisation should …', zh: '因此，這個組織應該…' },
  { use: '語氣', en: 'This suggests that …', zh: '這顯示…' },
  { use: '語氣', en: 'It is likely that …', zh: '很可能…' },
];

const TIPS = [
  '讀講義前先看導讀：知道「為什麼要學」，讀的時候才知道要找什麼。',
  '回答書僮的問題時，不會的英文字先寫中文，書僮會幫你換成自然的英文。',
  '閃卡看到題目先在心裡回答，再翻面。只看答案不算複習。',
  '理論課的每個名詞，都配一個真實例子（Optus、Medibank、你打工的地方）。',
  '數學題每一步寫理由。寫不出理由的那一步，就是要回去讀的地方。',
  '程式題先在紙上預測輸出，再執行。錯了就寫一句「我原本以為…其實…」。',
  '練習題不要只練同一種，混在一起練，考試才知道每題該用什麼方法。',
  '期末考前三週開始，每週一份考古題限時寫。',
  '英文答題用固定骨架：定義 → 說明 → 舉例 → 評估。',
  '累的時候不用硬撐：15 分鐘閃卡也算有讀書。',
];
