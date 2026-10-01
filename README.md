# 書僮 AusStudy

UQ Master of Cyber Security（2026 Semester 2）的讀書助手。它是發布在 claude.ai 上的私人頁面（Artifact）：AI 功能用你自己的 Claude 帳號，不需要 API key，也不用在電腦上開伺服器。

**開啟：** https://claude.ai/artifact/7Ppstkxa2fqd8vqzFVoJXU （私人頁面，只有你能開）

## 功能

| 分頁 | 做什麼 |
|---|---|
| 今日 | 今天／下次上課、考試倒數、今日任務、到期閃卡、書僮建議、最近卡住的題目 |
| 課程 | 上傳講義（PDF、PPTX 含講者備註、DOCX、TXT；掃描檔與照片可用 AI 辨識），產生英文導讀：在講什麼、老師為什麼教、學完要會什麼、關鍵名詞、可能的考法 |
| 預習 | 在課程頁設定哪幾門課要預習（目前 CSSE7030、MATH7861）。講課前產生預習導讀：這週學什麼、先複習哪些舊觀念、上課注意聽什麼、暖身題、可以在課堂問的問題 |
| 書僮 | 蘇格拉底問答、費曼講解、自由提問。每次回答都判斷理解程度，給內容回饋和英文修改表（原句 / 修正 / 原因），沒懂的觀念自動變成閃卡 |
| 練習 | 依課程類型出題（程式追蹤、找錯誤、寫函式、程式拼圖、計算、證明、情境、比較、選擇、是非），可模仿考古題風格；批改、錯題本、間隔重複閃卡、分數趨勢 |
| 計畫 | 學期時間軸、每週課表、依課表產生預習／課前準備／看錄影任務、待辦、請書僮排計畫、貼上課程公告或 ECP 評量表（含每週主題）自動整理 |
| 方法 | 針對邏輯課、理論課、英文的讀書方法，每週節奏、考前衝刺、答題句型庫 |

## 資料與隱私

- 資料存在這個 Artifact 的雲端資料庫，手機和電腦同步。存取規則設成只有 Contributor 以上的人讀得到，只分享「檢視」權限的人看不到你的資料。
- AI 呼叫用的是你自己 Claude 方案的額度，第一次使用時 claude.ai 會詢問。
- 講義只在瀏覽器裡轉成文字，資料庫只存文字。這個 repo 是 public，**不要把講義檔案放進 repo**。
- 四門課的評量資訊依 2026 S2 的 ECP（2026-10-01 核對），課表依 my timetable 截圖輸入。

## 程式結構

```
app/                 頁面本體（Preact + htm，從 jsDelivr 載入，沒有 build step）
  index.html         Artifact 頁面
  css/app.css        樣式（淺色 / 深色、手機版）
  js/util.js         日期、Markdown、學期週次
  js/schedule.js     課表：今天的課、接下來的講課、預習／課前／錄影任務
  js/runtime.js      claude.ai 能力介接（sample / db / downloads）
  js/store.js        資料層：雲端 db，離線時改用 localStorage
  js/ai.js           所有給 Claude 的提示詞（導讀、問答、出題、批改、計畫、整理公告）
  js/extract.js      PDF / PPTX / DOCX 轉文字、段落挑選
  js/srs.js          間隔重複排程（會配合考試日期）
  js/content.js      題型、讀書方法、句型庫
  js/view-*.js       各分頁
seed/                初始資料（學期、四門課、課表、50 張預設閃卡、第一批任務）
  class-tasks.cjs    用頁面自己的 schedule.js 算出課表帶出的任務
tests/               Playwright 測試，用模擬的 claude.ai runtime 跑完整流程
```

## 開發與測試

```bash
npm install
npm test        # 產生測試檔案並跑 tests/smoke.cjs（桌機、手機、深色模式、離線模式）
```

改完程式後，在 Claude Code 請 Claude 重新發布到同一個 Artifact 網址（`app/index.html` 加上 `css/`、`js/` 檔案）。

## 舊版

`claude/personal-learning-app-plan-urucmg` 分支是 7/29 做的第一版（需要 API key 和本機伺服器），已由這一版取代。
