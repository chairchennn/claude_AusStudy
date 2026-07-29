// ---- Element refs ----
const els = {
  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  modelSelect: document.getElementById("modelSelect"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),

  tabs: document.querySelectorAll(".tab"),
  panelLearning: document.getElementById("panel-learning"),
  panelTodo: document.getElementById("panel-todo"),

  stepInput: document.getElementById("step-input"),
  materialInput: document.getElementById("materialInput"),
  startBtn: document.getElementById("startBtn"),

  summarySection: document.getElementById("summarySection"),
  materialSummaryEn: document.getElementById("materialSummaryEn"),

  stepQuestion: document.getElementById("step-question"),
  questionLoading: document.getElementById("questionLoading"),
  questionBox: document.getElementById("questionBox"),
  questionEn: document.getElementById("questionEn"),
  questionZhHint: document.getElementById("questionZhHint"),
  answerInput: document.getElementById("answerInput"),
  submitAnswerBtn: document.getElementById("submitAnswerBtn"),
  newMaterialBtn: document.getElementById("newMaterialBtn"),

  stepReview: document.getElementById("step-review"),
  reviewLoading: document.getElementById("reviewLoading"),
  reviewBox: document.getElementById("reviewBox"),
  understandingBadge: document.getElementById("understandingBadge"),
  correctionTableBody: document.getElementById("correctionTableBody"),
  zhTranslation: document.getElementById("zhTranslation"),
  nextQuestionBtn: document.getElementById("nextQuestionBtn"),
  restartBtn: document.getElementById("restartBtn"),

  historySection: document.getElementById("historySection"),
  historyList: document.getElementById("historyList"),
};

// ---- Settings modal ----
function openSettings() {
  els.apiKeyInput.value = getApiKey();
  els.modelSelect.value = getModel();
  show(els.settingsModal);
}

function closeSettings() {
  hide(els.settingsModal);
}

els.settingsBtn.addEventListener("click", openSettings);
els.closeSettingsBtn.addEventListener("click", closeSettings);
els.saveSettingsBtn.addEventListener("click", () => {
  setApiKey(els.apiKeyInput.value);
  setModel(els.modelSelect.value);
  closeSettings();
  toast("設定已儲存");
});

// ---- Tabs (only "learning" is functional in MVP) ----
els.tabs.forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    if (tabBtn.disabled) return;
    els.tabs.forEach((t) => {
      t.classList.remove("tab--active");
      t.setAttribute("aria-selected", "false");
    });
    tabBtn.classList.add("tab--active");
    tabBtn.setAttribute("aria-selected", "true");
  });
});

// ---- Flow: resetting to step 1 ----
function resetToInput() {
  hide(els.stepQuestion);
  hide(els.stepReview);
  hide(els.historySection);
  hide(els.summarySection);
  show(els.stepInput);
  els.answerInput.value = "";
  els.historyList.innerHTML = "";
  els.materialSummaryEn.textContent = "";
}

// ---- Flow: start practice ----
async function handleStart() {
  const material = els.materialInput.value.trim();
  if (!material) {
    toast("請先貼上學習素材", { error: true });
    return;
  }
  if (!hasApiKey()) {
    toast("請先設定 API Key", { error: true });
    openSettings();
    return;
  }

  startSession(material);
  hide(els.stepInput);
  show(els.stepQuestion);
  hide(els.stepReview);
  hide(els.historySection);
  await requestNextQuestion();
}

async function requestNextQuestion() {
  hide(els.questionBox);
  hide(els.stepReview);
  show(els.questionLoading);
  els.answerInput.value = "";
  els.startBtn.disabled = true;
  els.submitAnswerBtn.disabled = true;

  try {
    const q = await generateQuestion();
    if (q.materialSummaryEn) {
      els.materialSummaryEn.textContent = q.materialSummaryEn;
      show(els.summarySection);
    }
    els.questionEn.textContent = q.questionEn;
    els.questionZhHint.textContent = q.questionZhHint;
    show(els.questionBox);
  } catch (err) {
    toast(err.message, { error: true });
  } finally {
    hide(els.questionLoading);
    els.startBtn.disabled = false;
    els.submitAnswerBtn.disabled = false;
  }
}

async function handleSubmitAnswer() {
  const answer = els.answerInput.value.trim();
  if (!answer) {
    toast("請先輸入英文回答", { error: true });
    return;
  }

  show(els.stepReview);
  hide(els.reviewBox);
  show(els.reviewLoading);
  els.submitAnswerBtn.disabled = true;

  try {
    const result = await submitAnswer(answer);
    renderReview(result);
    renderHistory();
    show(els.reviewBox);
  } catch (err) {
    toast(err.message, { error: true });
    hide(els.stepReview);
  } finally {
    hide(els.reviewLoading);
    els.submitAnswerBtn.disabled = false;
  }
}

function renderReview(result) {
  const label = understandingLabel(result.understandingLevel);
  els.understandingBadge.textContent = label.text;
  els.understandingBadge.className = `badge ${label.cls}`;

  els.correctionTableBody.innerHTML = "";
  if (result.correctionTable.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="3">這次的句子沒有需要修改的地方，寫得很好！</td>`;
    els.correctionTableBody.appendChild(row);
  } else {
    for (const item of result.correctionTable) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(item.original)}</td>
        <td>${escapeHtml(item.corrected)}</td>
        <td>${escapeHtml(item.reason)}</td>
      `;
      els.correctionTableBody.appendChild(row);
    }
  }

  els.zhTranslation.textContent = result.zhTranslation;
}

function renderHistory() {
  const session = getSession();
  if (!session || session.qaTurns.length === 0) return;

  els.historyList.innerHTML = "";
  session.qaTurns
    .filter((t) => t.userAnswer)
    .forEach((turn, idx) => {
      const label = understandingLabel(turn.understandingLevel);
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>Q${idx + 1}:</strong> ${escapeHtml(turn.questionEn)}
        <span class="badge ${label.cls}">${label.text}</span>
      `;
      els.historyList.appendChild(li);
    });
  show(els.historySection);
}

els.startBtn.addEventListener("click", handleStart);
els.submitAnswerBtn.addEventListener("click", handleSubmitAnswer);
els.newMaterialBtn.addEventListener("click", resetToInput);
els.restartBtn.addEventListener("click", resetToInput);
els.nextQuestionBtn.addEventListener("click", requestNextQuestion);
