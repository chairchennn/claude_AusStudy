const KEY_API = "ausstudy_api_key";
const KEY_MODEL = "ausstudy_model";
const DEFAULT_MODEL = "claude-opus-5";

export function getApiKey() {
  return localStorage.getItem(KEY_API) || "";
}

export function setApiKey(key) {
  localStorage.setItem(KEY_API, key.trim());
}

export function getModel() {
  return localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL;
}

export function setModel(model) {
  localStorage.setItem(KEY_MODEL, model);
}

export function hasApiKey() {
  return getApiKey().length > 0;
}
