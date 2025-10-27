/*
  Kaufland PWA — UI kernel
  Provides: showToast(), switchTab(), setBodyLock()
  Safe defaults. No behavior change unless called.
*/

// ----- Toast -----
let toastEl = null;
let toastTimer = 0;

export function showToast(message, opts = {}) {
  const msg = String(message ?? "");
  const timeout = Number.isFinite(opts.timeout) ? opts.timeout : 1800;

  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "appToast";
    Object.assign(toastEl.style, {
      position: "fixed",
      left: "50%",
      // sit above bottom nav and safe area
      bottom: "calc(70px + env(safe-area-inset-bottom, 0px) + 18px)",
      transform: "translateX(-50%)",
      maxWidth: "min(92vw, 520px)",
      padding: "10px 14px",
      borderRadius: "14px",
      background: "rgba(0,0,0,0.82)",
      color: "white",
      fontSize: "14px",
      // above all modals/lightbox/popups
      zIndex: "400000",
      boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
      opacity: "0",
      transition: "opacity .18s ease",
      pointerEvents: "auto" // tap to dismiss if needed
    });
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = msg;
  toastEl.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.style.opacity = "0";
  }, timeout);
}


// ----- Body lock for modals -----
export function setBodyLock(locked) {
  if (locked) document.body.classList.add("modal-open");
  else document.body.classList.remove("modal-open");
}

// ----- Tab switching stub -----
// Keeps API compatible with your existing code. Actual view toggling
// will be implemented when we migrate tab logic.
export function switchTab(tab) {
  try {
    const t = String(tab || "").trim() || "list";
    localStorage.setItem("activeTab", t);
    // Defer to any legacy handler already on the page
    if (typeof window.setActiveTab === "function") {
      window.setActiveTab(t);
    }
  } catch (e) {
    console.error("switchTab failed:", e);
  }
}

// ----- Shopping tab: checked / unchecked toggle + Clear + Auto-purge + Hint -----
(function () {
  const toggleFab = document.getElementById("checkedToggleFab");
  if (!toggleFab || toggleFab._wired) return;
  toggleFab._wired = true;

  // Constants
  const PURGE_DAYS = 14;
  const PURGE_MS = PURGE_DAYS * 24 * 60 * 60 * 1000;

  // Visible only on Shopping tab. Synced by setActiveTab() via window.syncToggleVisibility()
  window.syncToggleVisibility = function () {
    try {
      const t = window.activeTab || localStorage.getItem("activeTab") || "list";
      toggleFab.style.display = (t === "shopping") ? "block" : "none";
    } catch {
      toggleFab.style.display = "none";
    }
  };
  window.syncToggleVisibility();


  // Restore mode or default to unchecked
  window.shoppingViewMode = localStorage.getItem("shoppingViewMode");
  if (window.shoppingViewMode !== "checked" && window.shoppingViewMode !== "unchecked") {
    window.shoppingViewMode = "unchecked";
    try { localStorage.setItem("shoppingViewMode", "unchecked"); } catch {}
  }

  // Clear Checked FAB removed


  // Checked-view hint removed


  // Removed clear button and hint


  const applyLabelAndAux = () => {
    toggleFab.textContent =
      window.shoppingViewMode === "checked" ? "Show Unchecked" : "Show Checked";
  };

  applyLabelAndAux();

  toggleFab.addEventListener("click", () => {
    window.shoppingViewMode = window.shoppingViewMode === "checked" ? "unchecked" : "checked";
    try { localStorage.setItem("shoppingViewMode", window.shoppingViewMode); } catch {}
    applyLabelAndAux();
    if (typeof window.scheduleRenderItems === "function") {
      window.scheduleRenderItems(window.lastSnapshotItems || []);
    }
  });

  // Auto-purge on load: drop items checked more than PURGE_DAYS ago
  (function autoPurgeOldChecked() {
    const now = Date.now();
    const last = Number(localStorage.getItem("checkedPurgeAt") || 0);
    // Run at most once per hour
    if (now - last < 60 * 60 * 1000) return;

    const items = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : null;
    if (!items || !items.length) return;

    const keep = [];
    let removed = 0;
    for (const it of items) {
      const ts =
        it && it.checkedAt
          ? (typeof it.checkedAt === "object" && it.checkedAt.seconds
              ? it.checkedAt.seconds * 1000
              : (it.checkedAt._client || it.checkedAt || 0))
          : 0;
      const isOldChecked = it && it.checked === true && ts && (now - ts > PURGE_MS);
      if (isOldChecked) removed++;
      else keep.push(it);
    }
    if (removed) {
      window.lastSnapshotItems = keep;
      if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(keep);
      if (typeof window.showToast === "function") window.showToast(`Auto-purged ${removed} old checked item(s)`);
      document.dispatchEvent(new CustomEvent("ui:auto-purge-checked", { detail: { removed, days: PURGE_DAYS } }));
    }
    try { localStorage.setItem("checkedPurgeAt", String(now)); } catch {}
  })();
})();



// Helper: define recent checked (12h window) — ignore items that are NOT currently checked
if (typeof window.isRecentChecked !== "function") {
  window.isRecentChecked = function (it) {
    if (!it || it.checked !== true || !it.checkedAt) return false;

    // Load suppression set written by "Clear Checked"
    let clearedSet = null;
    try {
      const arr = JSON.parse(localStorage.getItem("clearedCheckedKeys") || "[]");
      clearedSet = new Set(Array.isArray(arr) ? arr : []);
    } catch {
      clearedSet = new Set();
    }

    // Compute a stable key for suppression matching
    const key = String(
      (it && (it.id || it.docId || it.uid || it.key || it.name || it.title)) ||
        JSON.stringify({
          n: it && (it.name || it.title || ""),
          u: it && (it.unit || ""),
          s: it && (it.sku || "")
        })
    );

    const ts =
      typeof it.checkedAt === "object" && it.checkedAt.seconds
        ? it.checkedAt.seconds * 1000
        : (it.checkedAt._client || it.checkedAt || 0);

    // Suppress if previously cleared, otherwise honor 12h window
    if (clearedSet.has(key)) return false;
return Date.now() - ts < 12 * 60 * 60 * 1000; // 12 hours
  };
}

// --- Accessibility + keyboard navigation ---
document.addEventListener("keydown", e => {
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const tabs = Array.from(document.querySelectorAll(".tab"));
    if (!tabs.length) return;
    const active = tabs.findIndex(t => t.classList.contains("active"));
    const next = (e.key === "ArrowRight")
      ? (active + 1) % tabs.length
      : (active - 1 + tabs.length) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.click();
  }
}, { passive: true });
