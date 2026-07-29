export function show(el) {
  el.classList.remove("hidden");
}

export function hide(el) {
  el.classList.add("hidden");
}

let toastTimer = null;
export function toast(message, { error = false } = {}) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.toggle("toast--error", error);
  show(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide(el), 4000);
}

export function understandingLabel(level) {
  switch (level) {
    case "clear":
      return { text: "理解清楚", cls: "badge--clear" };
    case "partial":
      return { text: "部分理解", cls: "badge--partial" };
    case "confused":
      return { text: "似乎有誤解", cls: "badge--confused" };
    default:
      return { text: level || "未知", cls: "" };
  }
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
