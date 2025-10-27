/*
  Centralized modal loader
  - Lazy-loads HTML partials into DOM once
  - Caches nodes by id
  - Handles open/close, backdrop, Esc, body lock, and focus
*/
import { showToast, setBodyLock } from "../ui/ui.js";

const registry = {
  options:      { id: "optionsModal",      url: "/partials/modals/options.html" },
  weeklyItems:  { id: "weeklyItemsModal",  url: "/partials/modals/weeklyItems.html" },
  recipe:       { id: "recipeModal",       url: "/partials/modals/recipe.html" },
  addToList:    { id: "addToListModal",    url: "/partials/modals/addToList.html" },
  itemDialog:   { id: "itemDialog",        url: "/partials/modals/itemDialog.html" },
  photoPopup:   { id: "photoPopup",        url: "/partials/modals/photoPopup.html" }
};

const cache = new Map(); // key -> Element

async function ensureLoaded(key){
  const meta = registry[key];
  if (!meta) throw new Error("Unknown modal key: " + key);
  if (cache.has(key)) return cache.get(key);

  // If already in DOM from server render, cache it
  let el = document.getElementById(meta.id);
  if (!el) {
    const res = await fetch(meta.url, { credentials: "same-origin" });
    const html = await res.text();
    document.body.insertAdjacentHTML("beforeend", html);
    el = document.getElementById(meta.id);
    if (!el) throw new Error("Partial missing element id=" + meta.id);
  }

  // Wire close handlers once
  if (!el._wired) {
    el._wired = true;
    const close = () => closeModal(key);
    const bd = el.querySelector(".backdrop");
    const x  = el.querySelector("[id$='Close'], [aria-label='Close']");
    if (bd) bd.addEventListener("click", close);
    if (x)  x.addEventListener("click", close);
    el._escHandler = (ev) => { if (ev.key === "Escape") close(); };
    document.addEventListener("keydown", el._escHandler);

    // Return focus to opener
    el._returnFocus = null;
  }

  cache.set(key, el);
  return el;
}

export async function openModal(key){
  // One-time back/edge-swipe integration
  if (!window.__modalHistoryWired) {
    window.__modalHistoryWired = true;
    window.__modalStack = window.__modalStack || [];
    window.addEventListener("popstate", () => {
      const st = window.__modalStack || [];
      const top = st[st.length - 1];
      if (top) {
        try { closeModal(top, true); } catch {}
      }
    });
  }

  const el = await ensureLoaded(key);
  const wasVisible = el.classList.contains("show");

  el._returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  el.classList.add("show");
  el.setAttribute("aria-hidden","false");
  setBodyLock(true);

  // Push a history entry the first time this modal becomes visible
  if (!wasVisible) {
    try { (window.__modalStack || (window.__modalStack = [])).push(key); } catch {}
    try { history.pushState({ modal: key }, ""); } catch {}
  }

  // Specific after-open hooks
  if (key === "options") {
    // paint auth/household status
    try {
      const status = document.getElementById("optAuthStatus");
      const u = (window.auth && window.auth.currentUser) || null;
      const hh = localStorage.getItem("household") || "";
      if (status) status.textContent = u
        ? (u.email ? `Signed in as ${u.email}` : `Signed in`)
          + (hh ? ` • household: ${hh}` : "")
        : "Not signed in";
      const hhEl = document.getElementById("optHousehold");
      if (hhEl && !hhEl.value) hhEl.value = hh;
      const prefer = document.getElementById("optEmail");
      const pass   = document.getElementById("optPassword");
      (prefer?.value ? pass : prefer)?.focus();
    } catch {}
  } else if (key === "weeklyItems") {
    // ensure subscription after the partial is injected
    try {
      if (typeof window.subscribeWeekly === "function") {
        window.subscribeWeekly();
      } else {
        setTimeout(() => {
          try { if (typeof window.subscribeWeekly === "function") window.subscribeWeekly(); } catch {}
        }, 0);
      }
    } catch {}
  }

}


export function closeModal(key, fromHistory){
  const meta = registry[key];
  if (!meta) return;
  const el = document.getElementById(meta.id);
  if (!el) return;

  // If invoked by UI (close button, backdrop, Escape), delegate to history
  if (!fromHistory) {
    try { history.back(); } catch {}
    return;
  }

  // Actual close work when coming from popstate
  el.classList.remove("show");
  el.setAttribute("aria-hidden","true");
  setBodyLock(false);
  try { el._returnFocus?.focus(); } catch {}

  // Maintain modal stack
  try {
    const st = window.__modalStack || [];
    const idx = st.lastIndexOf(key);
    if (idx !== -1) st.splice(idx, 1);
  } catch {}
}


export function registerModal(key, { id, url }){
  registry[key] = { id, url };
}

export function prewarm(modalKeys = []){
  modalKeys.forEach(k => ensureLoaded(k).catch(()=>{}));
}

// Expose globally for legacy callers if needed
window.openModal  = openModal;
window.closeModal = closeModal;
window.modalPrefetch = prewarm;
