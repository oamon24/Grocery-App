// scripts/ui/filterDrawer.js
// High-z-index bottom drawer for per-context sorting.
// Exports: initFilterDrawer()

import { setBodyLock } from "./ui.js";

const LS_KEYS = {
  list: "sort.list",
  shopping: "sort.shopping",
  weekly: "sort.weekly",
};

function getContext() {
  // weekly has precedence if its modal is visible
  const wi = document.getElementById("weeklyItemsModal");
  if (wi && wi.classList.contains("show")) return "weekly";
  const t = (window.activeTab || localStorage.getItem("activeTab") || "list");
  return (t === "shopping") ? "shopping" : "list";
}

function getSort(ctx) {
  try {
    const key = LS_KEYS[ctx] || LS_KEYS.list;
    return localStorage.getItem(key) || "route";
  } catch {
    return "route";
  }
}

function setSort(ctx, mode) {
  const key = LS_KEYS[ctx] || LS_KEYS.list;
  try { localStorage.setItem(key, mode); } catch {}
}

function openDrawer() {
  const backdrop = document.getElementById("filterBackdrop");
  const drawer   = document.getElementById("filterDrawer");
  const select   = document.getElementById("filterMode");
  if (!backdrop || !drawer || !select) return;

  const ctx  = getContext();
  const mode = getSort(ctx);
  select.value = mode;

  backdrop.hidden = false;
  drawer.hidden = false;
  // allow layout, then animate
  requestAnimationFrame(() => {
    drawer.classList.add("show");
  });

  setBodyLock(true);
  try { select.focus(); } catch {}

  const esc = (e) => {
    if (e.key === "Escape") closeDrawer();
  };
  document.addEventListener("keydown", esc, { once: true });
  drawer._escHandler = esc;
}

function closeDrawer() {
  const backdrop = document.getElementById("filterBackdrop");
  const drawer   = document.getElementById("filterDrawer");
  if (!backdrop || !drawer) return;

  drawer.classList.remove("show");
  // wait for transition
  setTimeout(() => {
    backdrop.hidden = true;
    drawer.hidden = true;
  }, 220);
  setBodyLock(false);

  if (drawer._escHandler) {
    document.removeEventListener("keydown", drawer._escHandler);
    delete drawer._escHandler;
  }
}

function onChangeMode(e) {
const mode = String(e.target.value || "route");
const ctx = getContext();
setSort(ctx, mode);
document.dispatchEvent(new CustomEvent("ui:sort-changed", {
detail: { context: ctx, mode }
}));
// Immediate refresh so the new sort is applied without relying on listeners only
try { window.scheduleRenderItems?.(window.lastSnapshotItems || []); } catch {}
}

export function initFilterDrawer() {
  // Wire once
  if (window.__filterDrawerWired) return;
  window.__filterDrawerWired = true;

  // Ensure DOM exists (graceful fallback: create if missing)
  if (!document.getElementById("filterBackdrop")) {
    const backdrop = document.createElement("div");
    backdrop.id = "filterBackdrop";
    backdrop.className = "filter-backdrop";
    document.body.appendChild(backdrop);
  }
  if (!document.getElementById("filterDrawer")) {
    const d = document.createElement("div");
    d.id = "filterDrawer";
    d.className = "filter-drawer";
    d.innerHTML = `
      <div class="head">
        <div class="title">Sort &amp; Filter</div>
        <button id="filterClose" class="icon-btn" type="button" aria-label="Close">✕</button>
      </div>
      <div class="body">
        <label for="filterMode" class="muted" style="font-size:12px;">Sort items by</label>
        <select id="filterMode">
          <option value="route">Route</option>
          <option value="category">Category</option>
          <option value="alpha">Alphabetically</option>
        </select>
      </div>`;
    document.body.appendChild(d);
  }

  const btn      = document.getElementById("filterbtn"); // renamed id in index.html
  const backdrop = document.getElementById("filterBackdrop");
  const drawer   = document.getElementById("filterDrawer");
  const closeBtn = document.getElementById("filterClose");
  const select   = document.getElementById("filterMode");

  if (btn && !btn._wiredFilter) {
    btn.addEventListener("click", () => openDrawer(), { passive: true });
    btn._wiredFilter = true;
  }
  if (backdrop && !backdrop._wired) {
    backdrop.addEventListener("click", () => closeDrawer(), { passive: true });
    backdrop._wired = true;
  }
  if (closeBtn && !closeBtn._wired) {
    closeBtn.addEventListener("click", () => closeDrawer(), { passive: true });
    closeBtn._wired = true;
  }
  if (select && !select._wired) {
    select.addEventListener("change", onChangeMode);
    select._wired = true;
  }

  // Keep drawer state sane when weekly modal opens/closes
  document.addEventListener("weekly:open", () => {
    if (!drawer.hidden) {
      // If drawer is open and weekly opens over it, bump body lock and context
      setBodyLock(true);
    }
  });
  document.addEventListener("weekly:close", () => {
    // no-op; drawer manages its own lock
  });
}
