const KEY_API = "ausstudy_api_key";
const KEY_MODEL = "ausstudy_model";
const DEFAULT_MODEL = "claude-opus-5";

function getApiKey() {
  return localStorage.getItem(KEY_API) || "";
}

function setApiKey(key) {
  localStorage.setItem(KEY_API, key.trim());
}

function getModel() {
  return localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL;
}

function setModel(model) {
  localStorage.setItem(KEY_MODEL, model);
}

function hasApiKey() {
  return getApiKey().length > 0;
}
