import { callClaudeStructured } from "../../api/claudeClient.js";
import {
  QUESTION_SYSTEM_PROMPT,
  QUESTION_SCHEMA,
  ANSWER_REVIEW_SYSTEM_PROMPT,
  ANSWER_REVIEW_SCHEMA,
} from "../../shared/promptTemplates.js";

/**
 * In-memory session state for the current material.
 * Shape mirrors the future persisted record:
 * { id, createdAt, material, qaTurns: [{ questionEn, questionZhHint, userAnswer,
 *   correctedAnswer, correctionTable[], zhTranslation, understandingLevel, followUpType }] }
 */
let session = null;

export function startSession(material) {
  session = {
    id: `s_${Date.now()}`,
    createdAt: new Date().toISOString(),
    material,
    qaTurns: [],
  };
  return session;
}

export function getSession() {
  return session;
}

export async function generateQuestion() {
  if (!session) throw new Error("尚未開始練習。");

  const askedQuestions = session.qaTurns.map((t) => t.questionEn);
  const userContent = [
    `【學習素材】\n${session.material}`,
    askedQuestions.length
      ? `【已經問過的題目，請勿重複】\n${askedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
      : "",
    "請根據以上素材，提出一題新的蘇格拉底式延伸思考問題。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await callClaudeStructured({
    system: QUESTION_SYSTEM_PROMPT,
    userContent,
    schema: QUESTION_SCHEMA,
    maxTokens: 2000,
  });

  session.qaTurns.push({
    questionEn: result.questionEn,
    questionZhHint: result.questionZhHint,
    userAnswer: null,
    correctedAnswer: null,
    correctionTable: [],
    zhTranslation: null,
    understandingLevel: null,
    followUpType: null,
  });

  return result;
}

export async function submitAnswer(userAnswer) {
  if (!session || session.qaTurns.length === 0) {
    throw new Error("目前沒有進行中的題目。");
  }
  const currentTurn = session.qaTurns[session.qaTurns.length - 1];

  const userContent = [
    `【學習素材】\n${session.material}`,
    `【問題】\n${currentTurn.questionEn}`,
    `【使用者的英文回答】\n${userAnswer}`,
    "請潤飾修正這個回答，並依照系統指示回傳結構化結果。",
  ].join("\n\n");

  const result = await callClaudeStructured({
    system: ANSWER_REVIEW_SYSTEM_PROMPT,
    userContent,
    schema: ANSWER_REVIEW_SCHEMA,
    maxTokens: 4000,
  });

  currentTurn.userAnswer = userAnswer;
  currentTurn.correctedAnswer = result.correctedAnswer;
  currentTurn.correctionTable = result.correctionTable;
  currentTurn.zhTranslation = result.zhTranslation;
  currentTurn.understandingLevel = result.understandingLevel;

  return result;
}
