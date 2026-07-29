import { getApiKey, getModel } from "../config.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Calls the Claude API and expects a JSON object back, constrained by `schema`.
 * Throws on missing key, HTTP error, refusal, or unparsable output.
 */
export async function callClaudeStructured({ system, userContent, schema, maxTokens = 8000 }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("尚未設定 API Key，請點右上角齒輪圖示設定。");
  }

  const body = {
    model: getModel(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema },
    },
  };

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error("網路連線失敗，請確認網路狀態後再試一次。");
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || `API 錯誤（HTTP ${response.status}）`;
    throw new Error(message);
  }

  if (data.stop_reason === "refusal") {
    throw new Error("AI 拒絕回應此內容，請換一段素材或問題再試一次。");
  }

  const textBlock = (data.content || []).find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("AI 沒有回傳可用的內容，請再試一次。");
  }

  try {
    return JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error("AI 回傳格式解析失敗，請再試一次。");
  }
}
