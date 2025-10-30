/*
  Kaufland PWA — bootstrap + globals only
  No feature logic here. Imports run side effects in their own modules.
*/

// Performance marker: initial parse time
performance.mark?.("main:start");

import { initFirebase, auth, db, storage } from "./firebase.js";
import { showToast, switchTab } from "./ui/ui.js";
import "./modals/itemDialog.js";
import "./modals/addItems.js";
import * as dataSync from "./dataSync.js";
import * as weekly from "./modals/weeklyItems.js"; 
import { prefetchAllData } from "./data/prefetch.js";
import { openModal } from "./ui/loadModal.js";


// Timers must load before Cook Mode so button handlers can reference the API

import * as cookTimers from "./cook/timers.js";
import * as cookMode from "./cook/cookmode.js";
import "./timers/topbar.js";
import "./timers/donebar.js";


import "./recipes/reciperender.js";
import { initRecipes } from "./recipes.js";
import "./recipes/importJson.js";
import { openLightbox } from "./lightbox.js";
import * as photo from "./photo.js";


window.openLightbox   = openLightbox; // used by renderRow()
window.openPhotoPicker = photo.openPhotoPicker;
window.uploadItemPhoto = photo.uploadItemPhoto;
window.removeItemPhoto = photo.removeItemPhoto;
window.openOptionsModal = openOptionsModal;

// List modules are loaded dynamically in boot() for path compatibility




import "./modals/manager.js"; // centralized modal open/close control
import "./modals/addToList.js"; // Recipes → Add to List modal
import "./utils/markdown.js"; // safe Markdown + cook checkbox binding
import "./cook/session.js";   // cook session helpers
import { initAddItemAutocomplete } from "./utils/autocomplete.js";
import { initBottomNav } from "./ui/bottomNav.js";
import "./modals/household.js";
import "./modals/theme.js";
import { openOptionsModal } from "./modals/optionsModal.js";
import { initFilterDrawer } from "./ui/filterDrawer.js";









export async function boot() {
  try {
    await initFirebase();

    // Expose Firebase handles for legacy callers
    window.auth = auth;
    window.db = db;
    window.storage = storage;
    try {
      window.household = localStorage.getItem("household") || window.household || "";
    } catch {
      window.household = window.household || "";
    }


    // Ensure global used by row renderer exists
    window.lastAddedId = null;


    // Minimal UI globals
    window.showToast = showToast;
    window.switchTab = switchTab;
    try { initFilterDrawer(); } catch {}


    // Compatibility shims for list rendering (cover missing globals after refactor)
    if (typeof window.renderBoth !== "function") {
      window.renderBoth = function(items) {
        try { if (typeof window.renderList === "function") window.renderList(items); } catch(e){ console.warn("renderList failed", e); }
        try { if (typeof window.renderShopping === "function") window.renderShopping(items); } catch(e){ console.warn("renderShopping failed", e); }
      };
    }
    if (typeof window.scheduleRenderItems !== "function") {
      window._rafItems = 0; window._pendingItems = null;
      window.scheduleRenderItems = function(items){
        window._pendingItems = items;
        if (window._rafItems) return;
        window._rafItems = requestAnimationFrame(() => {
          window._rafItems = 0;
          const data = window._pendingItems; window._pendingItems = null;
          try { window.renderBoth(data || []); } catch(e){ console.warn("renderBoth shim failed", e); }
        });
      };
    }

    // Resort immediately when the drawer changes mode
    document.addEventListener("ui:sort-changed", (e) => {
      const ctx = e && e.detail && e.detail.context;
      if (ctx === "list" || ctx === "shopping") {
        try { window.scheduleRenderItems?.(window.lastSnapshotItems || []); } catch {}
      } else if (ctx === "weekly") {
        // Forward to weekly modal to handle its own resorting
        document.dispatchEvent(new CustomEvent("weekly:sort-changed", { detail: e.detail }));
      }
    });


    // React to sort-mode changes per context
    document.addEventListener("ui:sort-changed", (e) => {
      const ctx = e?.detail?.context;
      if (ctx === "list" || ctx === "shopping") {
        try { window.scheduleRenderItems?.(window.lastSnapshotItems || []); } catch {}
      } else if (ctx === "weekly") {
        // Bubble to weekly modal; its module should re-render on this signal.
        document.dispatchEvent(new CustomEvent("weekly:sort-changed", { detail: e.detail }));
      }
    });


 



    // Simple helpers used by Weekly Items and Item Dialog
    if (typeof window.findExistingItem !== "function") {
      window.findExistingItem = function(nameOrKey){
        const key = String(nameOrKey || "").toLowerCase();
        const arr = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
        return arr.find(it => ((it.nameKey || it.name || "").toLowerCase() === key)) || null;
      };
    }
    if (typeof window.addQtyStr !== "function") {
      // Minimal merge: prefer b if a empty, else "a + b" if both exist, else whichever exists
      window.addQtyStr = function(a, b){
        const A = String(a || "").trim(), B = String(b || "").trim();
        if (A && B && A !== B) return A + " + " + B;
        return B || A || "";
      };
    }

    // Recreate legacy tab wiring lost from inline scripts
    if (typeof window.setActiveTab !== "function") {
      window.setActiveTab = function setActiveTab(tab) {
  const t = String(tab || "").trim() || "list";

  // record current tab for renderBoth() and scheduleRenderItems()
  window.activeTab = t;

  try { localStorage.setItem("activeTab", t); } catch {}


        // Sections
        const secList    = document.getElementById("listSection");
        const secRecipes = document.getElementById("recipesView");

        if (secList)    secList.style.display    = (t === "recipes") ? "none" : "";
        if (secRecipes) secRecipes.style.display = (t === "recipes") ? "" : "none";

       // List vs Shopping panes inside listSection
try {
  const listList      = document.getElementById("list_list");
  const emptyList     = document.getElementById("empty_list");
  const listShopping  = document.getElementById("list_shopping");
  const emptyShopping = document.getElementById("empty_shopping");
  const addRow        = document.getElementById("addRow");
  const toggleRow     = document.getElementById("toggleListItemsRow");

  const isShopping = (t === "shopping");

  // Show only relevant list container
  if (listList)      listList.style.display      = isShopping ? "none" : "";
  if (emptyList)     emptyList.style.display     = isShopping ? "none" : "";
  if (listShopping)  listShopping.style.display  = isShopping ? "" : "none";
  if (emptyShopping) {
    const hasItems = !!(listShopping && listShopping.children.length);
    emptyShopping.style.display = (isShopping && !hasItems) ? "" : "none";
  }

  // Hide Add/Toggle rows when in Shopping tab
  if (addRow)    addRow.style.display    = isShopping ? "none" : "";
  if (toggleRow) toggleRow.style.display = isShopping ? "none" : "";
} catch {}


        // Bottom nav active state
        try {
          const tabListBtn     = document.getElementById("tabList");
          const tabShoppingBtn = document.getElementById("tabShopping");
          const tabRecipesBtn  = document.getElementById("tabRecipes");
          [tabListBtn, tabShoppingBtn, tabRecipesBtn].forEach(b => b && b.classList.remove("active"));
          if (t === "list"     && tabListBtn)     tabListBtn.classList.add("active");
          if (t === "shopping" && tabShoppingBtn) tabShoppingBtn.classList.add("active");
          if (t === "recipes"  && tabRecipesBtn)  tabRecipesBtn.classList.add("active");
        } catch {}

        // FABs visibility
        try {
          const wiFab  = document.getElementById("weeklyItemsFab");
          const addFab = document.getElementById("addItemsFab");
          if (wiFab)  wiFab.style.display  = (t === "shopping") ? "block" : "none";
          if (addFab) addFab.style.display = (t === "shopping") ? "block" : "none";
          if (typeof window.syncToggleVisibility === "function") window.syncToggleVisibility();
        } catch {}
      };

        // Click handlers for bottom nav tabs
      document.addEventListener("click", (e) => {
        const btn = e.target.closest("#tabList, #tabShopping, #tabRecipes");
        if (!btn) return;
        const idToTab = { tabList: "list", tabShopping: "shopping", tabRecipes: "recipes" };
        const next = idToTab[btn.id] || "list";
        window.setActiveTab(next);
      });

      // Swipe between tabs on the main content
      (function () {
        // Listen on window in CAPTURE phase and allow preventDefault on move
        const area = window;

        // Favor vertical scroll while still allowing our horizontal gesture
        try {
          document.documentElement.style.touchAction = "pan-y";
          document.body.style.touchAction = "pan-y";
        } catch {}

        // match bottom-nav order; stop at ends
        const order = ["list", "shopping", "recipes"];

        let startX = 0, startY = 0, startT = 0, tracking = false, fired = false;

        const onDown = (e) => {
          if (e.isPrimary === false) return;
          if (document.body.classList.contains("modal-open")) return;

          startX = e.clientX;
          startY = e.clientY;
          startT = performance.now ? performance.now() : Date.now();
          tracking = true;
          fired = false;
        };

        const onMove = (e) => {
          if (!tracking || fired) return;
          if (document.body.classList.contains("modal-open")) return;

          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          const dt = (performance.now ? performance.now() : Date.now()) - startT;

          // Looser heuristics: small distance, more time, tolerate some vertical drift
          const horiz = Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy) * 1.1;
          const fastEnough = dt < 900;
          const notVerticalScroll = Math.abs(dy) < 140;

          if (!(horiz && fastEnough && notVerticalScroll)) return;

          // Prevent sheet/backdrop components from claiming the gesture
          try { e.preventDefault(); } catch {}

          const current = String(window.activeTab || "list");
          const idx = order.indexOf(current);
          if (idx === -1) return;

          let nextIdx = idx;
          if (dx < 0) { // swipe left → next tab
            nextIdx = Math.min(order.length - 1, idx + 1);
          } else if (dx > 0) { // swipe right → previous tab
            nextIdx = Math.max(0, idx - 1);
          }

          if (nextIdx !== idx) {
            fired = true;
            tracking = false;
            window.setActiveTab(order[nextIdx]);
          }
        };

        const onUpOrCancel = () => {
          tracking = false;
        };

        // Capture so sheets/backdrops cannot block; passive:false so preventDefault works
        area.addEventListener("pointerdown", onDown, { capture: true, passive: true });
        area.addEventListener("pointermove", onMove, { capture: true, passive: false });
        area.addEventListener("pointerup", onUpOrCancel, { capture: true, passive: true });
        area.addEventListener("pointercancel", onUpOrCancel, { capture: true, passive: true });
        area.addEventListener("pointerleave", onUpOrCancel, { capture: true, passive: true });
      })();




    }

   // Load list renderers with correct folder ("lists") before any paint
try {
  try { await import("./lists/render.js"); } catch { await import("./render.js"); }
  try { await import("./lists/row.js"); } catch { await import("./row.js"); }
} catch (e) {
  console.error("Failed to load list modules", e);
}



// Ensure rows are painted after modules are present so handlers attach
try { window.scheduleRenderItems?.(window.lastSnapshotItems || []); } catch {}


    // First paint from cache to avoid blank UI while waiting for Firestore
    try {
      const cached = JSON.parse(localStorage.getItem("cache_items") || "[]");
      if (Array.isArray(cached) && cached.length) {
        window.lastSnapshotItems = cached;
        window.scheduleRenderItems(cached);
      }
    } catch {}



   // Whitelist data sync shims (no blanket assign)
const expose = {
  ensureHouseholdDoc: dataSync.ensureHouseholdDoc,
  subscribeList: dataSync.subscribeList,
  subscribeRecipes: dataSync.subscribeRecipes,
  updateItem: dataSync.updateItem,
  updateItemAndCatalog: dataSync.updateItemAndCatalog,
  removeItem: dataSync.removeItem,
  unsubscribeAll: dataSync.unsubscribeAll,
  // recipes
  deleteSharedRecipe: dataSync.deleteSharedRecipe
};
Object.entries(expose).forEach(([k, v]) => {
  if (typeof v === "function") window[k] = v;
});



    

    // Weekly Items bridge (module self-attaches; only copy exports if provided)
    (function () {
      const names = ["openWeeklyItems", "closeWeeklyItems", "subscribeWeekly", "addWeeklyCheckedToShopping"];
      for (const n of names) {
        if (typeof window[n] !== "function" && typeof weekly[n] === "function") {
          window[n] = weekly[n];
        }
      }
    })();

    // Cook Mode API
    if (!window.cookMode || typeof window.cookMode.open !== "function") {
      window.cookMode = (cookMode.cookMode || cookMode);
    }
    // Cook step timers bridge + Top/Done bar adapter
    (function () {
      const names = ["createStepTimer", "updateTimerUI", "resetStepTimer"];
      for (const n of names) {
        if (typeof window[n] !== "function" && typeof cookTimers[n] === "function") {
          window[n] = cookTimers[n];
        }
      }

      // Wrap selected APIs to mirror state into window.timerBars when present.
      // Safe no-ops if timerBars is absent or payloads do not match expected shape.

      // updateTimerUI: proxy to bars.upsertTimer with tolerant field mapping
      try {
        const _origUpdate = typeof window.updateTimerUI === "function" ? window.updateTimerUI : null;
        window.updateTimerUI = function proxyUpdateTimerUI(data, ...rest) {
          try { _origUpdate && _origUpdate.call(this, data, ...rest); } catch (e) { console.warn("updateTimerUI orig failed", e); }
          try {
            const t = (data && typeof data === "object") ? data : null;
            const bars = window.timerBars;
            if (!t || !bars || typeof bars.upsertTimer !== "function") return;

            // Derive a stable id. Prefer explicit id, else stepId, else recipeId:stepIndex.
            const id =
              (t.id != null ? String(t.id) : "") ||
              (t.stepId != null ? String(t.stepId) : "") ||
              ((t.recipeId != null && t.stepIndex != null) ? String(t.recipeId) + ":" + String(t.stepIndex | 0) : "");

            if (!id) return;

            // Compute endsAt when only secondsRemaining provided
            let endsAt = Number(t.endsAt);
            if (!Number.isFinite(endsAt)) {
              const sec = Number(t.secondsRemaining);
              if (Number.isFinite(sec)) endsAt = Date.now() + Math.max(0, Math.ceil(sec)) * 1000;
            }

            bars.upsertTimer({
              id,
              label: String(t.label || "Timer"),
              recipeId: (t.recipeId != null) ? String(t.recipeId) : "",
              stepId: (t.stepId != null) ? String(t.stepId) : "",
              stepIndex: (t.stepIndex != null) ? (t.stepIndex | 0) : 0,
              endsAt: Number.isFinite(endsAt) ? endsAt : Date.now(),
              running: !!t.running,
              acknowledged: !!t.acknowledged,
              recipe: t.recipe || null
            });
          } catch (e) {
            console.warn("timerBars upsert proxy failed", e);
          }
        };
      } catch (e) { console.warn("wrap updateTimerUI failed", e); }

      // resetStepTimer: proxy to bars.removeTimer
      try {
        const _origReset = typeof window.resetStepTimer === "function" ? window.resetStepTimer : null;
        window.resetStepTimer = function proxyResetStepTimer(id, ...rest) {
          try { _origReset && _origReset.call(this, id, ...rest); } catch (e) { console.warn("resetStepTimer orig failed", e); }
          try {
            const bars = window.timerBars;
            if (!bars || typeof bars.removeTimer !== "function") return;
            const key = (id != null) ? String(id) : "";
            if (key) bars.removeTimer(key);
          } catch (e) {
            console.warn("timerBars remove proxy failed", e);
          }
        };
      } catch (e) { console.warn("wrap resetStepTimer failed", e); }
    })();


    // Timers core + UI
    (function () {
      const tc = (typeof window !== "undefined" && window.timersCore) ? window.timersCore : null;
      const tu = (typeof window !== "undefined" && window.timersUI) ? window.timersUI : null;

      const core = ["timers", "unlockAudio", "requestWakeLock", "releaseWakeLock"];
      const ui = ["initTimerUI", "openTimerDrawer", "closeTimerDrawer"];

      if (tc) {
        for (const n of core) {
          if (typeof window[n] !== "function" && typeof tc[n] === "function") window[n] = tc[n];
        }
      }
      if (tu) {
        for (const n of ui) {
          if (typeof window[n] !== "function" && typeof tu[n] === "function") window[n] = tu[n];
        }
        try { if (typeof tu.initTimerUI === "function") tu.initTimerUI(); } catch {}
      }
    })();


    // Ensure recipes renderer exists before subscriptions paint
    try { initRecipes(); } catch {}

    // Replay DOMContentLoaded for modules that attached listeners after the real event
    try {
      if (!window.__domReadyReplayed) {
        window.__domReadyReplayed = true;
        const ev = new Event("DOMContentLoaded");
        window.dispatchEvent(ev);
        document.dispatchEvent(ev);
      }
    } catch {}

    // Ensure DOM is fully ready before wiring autocomplete
try { initAddItemAutocomplete(); } catch (e) { console.warn("autocomplete init failed", e); }


    // Restore tab and start listeners
    try {
      const savedTab = localStorage.getItem("activeTab") || "list";
      if (typeof window.setActiveTab === "function") window.setActiveTab(savedTab);
    } catch {}
    try { dataSync.subscribeList && dataSync.subscribeList(); } catch {}
    try { dataSync.subscribeRecipes && dataSync.subscribeRecipes(); } catch {}

    console.info("Kaufland PWA boot:", {
      firebase: !!window.firebase,
      auth: !!auth,
      db: !!db,
      storage: !!storage
    });

    // Defer non-critical startup tasks
    if (window.requestIdleCallback) {
      requestIdleCallback(() => {
        try { dataSync.ensureHouseholdDoc?.(); } catch {}
      });
    }

    // --- Prewarm the Photo Picker modal so its DOM exists before use ---
    try {
      const { prewarm } = await import("./ui/loadModal.js");
      prewarm(["photoPopup"]);
    } catch (e) {
      console.warn("Photo popup prewarm failed", e);
    }

    // Register Service Worker

    if ("serviceWorker" in navigator) {
      try {
        navigator.serviceWorker.register("/sw.js");
      } catch (e) {
        console.warn("SW registration failed", e);
      }
    }

      // One-time Firestore prefetch (data only, no photos)
    // Hydrates local cache so the app works fully offline for lists and recipes.
    // Uses a localStorage flag per user to avoid repeated full downloads.
    try {
      const uid = window.auth?.currentUser?.uid || "anon";
      const KEY = `prefetch:v1:${uid}`;
      const already = localStorage.getItem(KEY) === "1";
      const online = typeof navigator !== "undefined" ? navigator.onLine : true;

      // Defer to idle time to avoid blocking first paint
      const kickoff = async () => {
        if (!online || already || !window.db) return;
        const hh = window.household || (await window.getHouseholdId?.());
        if (!hh) return;
        try {
          await prefetchAllData({ household: hh, onProgress: null });
          localStorage.setItem(KEY, "1");
          console.info("[offline] data prefetch complete");
        } catch (e) {
          console.warn("[offline] data prefetch failed", e);
        }
      };

      if ("requestIdleCallback" in window) {
        requestIdleCallback(kickoff, { timeout: 5000 });
      } else {
        setTimeout(kickoff, 0);
      }
    } catch {}



    // --- Initial tab state (single source of truth) ---
    try {
      const initial = localStorage.getItem("activeTab") || "list";
      // Ensure shim exists before calling
      if (typeof window.setActiveTab === "function") {
        window.setActiveTab(initial);
      } else {
        window.activeTab = initial;
      }
    } catch {}


        // --- List show/hide toggle wiring (restores lost inline behavior) ---
    try {
      const KEY = "list.collapsed";
      const sec = document.getElementById("listSection");
      const btn = document.getElementById("toggleListItemsButton");
      if (sec && btn) {
        // Load initial state: prefer saved, else attribute default
        let collapsed;
        try {
          const saved = localStorage.getItem(KEY);
          if (saved === null) {
            collapsed = (sec.getAttribute("data-list-collapsed") === "true");
          } else {
            collapsed = (saved === "1");
          }
        } catch { collapsed = (sec.getAttribute("data-list-collapsed") === "true"); }

        const apply = () => {
          sec.setAttribute("data-list-collapsed", collapsed ? "true" : "false");
          btn.setAttribute("aria-pressed", collapsed ? "false" : "true");
          btn.textContent = collapsed ? "🔽 Show items" : "🔼 Hide items";
        };

        apply();

        btn.addEventListener("click", () => {
          collapsed = !collapsed;
          apply();
          try { localStorage.setItem(KEY, collapsed ? "1" : "0"); } catch {}
        });
      }
    } catch {}

 
    // --- Weekly Items FAB wiring ---
try {
  const wiFab = document.getElementById("weeklyItemsFab");
  if (wiFab && typeof window.openWeeklyItems === "function") {
    wiFab.addEventListener("click", async () => {
      try {
        await window.openWeeklyItems();
      } finally {
        // Ensure Show Checked button restores when modal closes
        document.addEventListener(
          "weekly:closed",
          () => { try { window.syncToggleVisibility?.(); } catch {} },
          { once: true }
        );
      }
    });
  }
} catch {}




// --- Options modal wiring (auth + household + theme) ---
// Works with lazy-loaded modal. No duplicate openBtn handler.
// Wires when #optionsModal appears and keeps status in sync.
try {
  if (!window.__optionsModalObserver) {
    // One-time auth state hook updates status when user changes
    try {
      auth?.onAuthStateChanged?.(() => {
        try {
          const el = document.getElementById("optAuthStatus");
          if (!el) return;
          const u = auth?.currentUser;
          const hh = localStorage.getItem("household") || "";
          el.textContent = u
            ? (u.email ? `Signed in as ${u.email}` : `Signed in (anonymous: ${u.uid.slice(0,6)}…)`) + (hh ? ` • household: ${hh}` : "")
            : "Not signed in";
        } catch {}
      });
    } catch {}

    // Helper to attach all internal listeners once the modal exists
    const wireOptionsModal = async (modal) => {
      if (!modal || modal.__wired) return;
      modal.__wired = true;

      // Query elements inside the modal
      const emailEl   = modal.querySelector("#optEmail");
      const passEl    = modal.querySelector("#optPassword");
      const signinBtn = modal.querySelector("#optionsSigninEmail");
      const signoutBtn= modal.querySelector("#optionsSignout");
      const statusEl  = modal.querySelector("#optAuthStatus");

      const hhEl   = modal.querySelector("#optHousehold");
      const hhSave = modal.querySelector("#optionsSaveHousehold");

      const themeSel = modal.querySelector("#optionsThemeSelect");
      const themeCol = modal.querySelector("#optionsThemeColor");

      // Prefill household and status
      try {
        const hh = localStorage.getItem("household") || "";
        if (hhEl && !hhEl.value) hhEl.value = hh;
      } catch {}
      (function refreshAuthStatus(){
        try {
          const u = auth?.currentUser;
          const hh = localStorage.getItem("household") || "";
          if (statusEl) {
            statusEl.textContent = u
              ? (u.email ? `Signed in as ${u.email}` : `Signed in (anonymous: ${u?.uid?.slice?.(0,6)}…)`) + (hh ? ` • household: ${hh}` : "")
              : "Not signed in";
          }
        } catch {}
      })();

      // Household Set
      if (hhSave) hhSave.addEventListener("click", async () => {
        const v = String(hhEl?.value || "").trim();
        if (!v) { showToast("Enter a household id"); hhEl?.focus(); return; }
        try {
          localStorage.setItem("household", v);
          window.household = v;
          await window.ensureHouseholdDoc?.(v);
          await window.subscribeList?.();
          await window.subscribeRecipes?.();
          showToast("Household set");
          // update status line
          try {
            const u = auth?.currentUser;
            const hh = localStorage.getItem("household") || "";
            if (statusEl) {
              statusEl.textContent = u
                ? (u.email ? `Signed in as ${u.email}` : `Signed in (anonymous: ${u.uid.slice(0,6)}…)`) + (hh ? ` • household: ${hh}` : "")
                : "Not signed in";
            }
          } catch {}
        } catch (e) {
          console.warn(e); showToast("Failed to set household");
        }
      });

      // Email/Password Sign-in
      if (signinBtn) signinBtn.addEventListener("click", async () => {
        const email = String(emailEl?.value || "").trim();
        const pass  = String(passEl?.value || "");
        if (!email || !pass) { showToast("Enter email and password"); return; }
        try {
          const authApi = (window.firebase?.auth ? window.firebase.auth() : auth);
          if (!authApi) { showToast("Auth not initialized"); return; }
          await authApi.signInWithEmailAndPassword(email, pass);
          // Post-login data subscriptions
          await window.ensureHouseholdDoc?.();
          await window.subscribeList?.();
          await window.subscribeRecipes?.();
        } catch (e) {
          console.error(e);
          showToast(e?.message || "Sign-in failed");
        }
      });

      // Sign out
      if (signoutBtn) signoutBtn.addEventListener("click", async () => {
        try {
          await auth.signOut();
          showToast("Signed out");
        } catch (e) {
          console.warn(e); showToast("Sign-out failed");
        }
      });

      // Theme handling + Android address-bar color sync
      const setThemeColorMeta = () => {
        const root  = document.documentElement;
        const cs    = getComputedStyle(root);
        const mode  = localStorage.getItem("theme.mode")  || "system";
        const cstom = (localStorage.getItem("theme.color") || "").trim();

        // Determine effective scheme
        const forcedDark = root.getAttribute("data-theme") === "dark";
        const forcedLight = root.getAttribute("data-theme") === "light";
        const systemDark = !forcedDark && !forcedLight &&
          window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        const isDark = forcedDark || systemDark;

        // Rule:
        // - Dark -> use surface (not accent)
        // - Else if custom mode -> use custom accent
        // - Else -> use surface
        const surface = (cs.getPropertyValue("--surface") || (isDark ? "#17171c" : "#ffffff")).trim();
        const color = isDark ? surface : ((mode === "custom" && cstom) ? cstom : surface);

        // Replace the meta node to force Android to repaint the bar
        let oldMeta = document.querySelector('meta[name="theme-color"]:not([media])');
        const meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        meta.setAttribute("content", color);
        if (oldMeta && oldMeta.parentNode) {
          oldMeta.parentNode.insertBefore(meta, oldMeta.nextSibling);
          oldMeta.remove();
        } else {
          document.head.appendChild(meta);
        }

        // Update again on the next frame to catch toolbar transitions
        requestAnimationFrame(() => {
          const m = document.querySelector('meta[name="theme-color"]:not([media])');
          if (m) m.setAttribute("content", color);
        });
      };

      const applyTheme = (mode, color) => {
        const root = document.documentElement;
        root.removeAttribute("data-theme");
        if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);

        if (mode === "custom" && color) {
          // Keep tokens in sync; UI can remain accentful in light
          root.style.setProperty("--accent", color);
          root.style.setProperty("--primary", color);
        } else {
          root.style.removeProperty("--accent");
          root.style.removeProperty("--primary");
        }

        // Persist
        try {
          localStorage.setItem("theme.mode", mode);
          if (color) localStorage.setItem("theme.color", color);
        } catch {}

        // Update browser UI bar immediately
        setThemeColorMeta();
      };


      try {
        const savedMode = localStorage.getItem("theme.mode") || "system";
        const savedCol  = localStorage.getItem("theme.color") || "#ff2a7f";
        if (themeSel) themeSel.value = savedMode;
        if (themeCol) themeCol.value = savedCol;

        applyTheme(savedMode, savedCol);

        // Also react to OS scheme flips when mode = system
        const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
        if (mql && !window.__themeMqlBound) {
          window.__themeMqlBound = true;
          mql.addEventListener("change", () => {
            const mode = localStorage.getItem("theme.mode") || "system";
            if (mode === "system") setThemeColorMeta();
          });
        }
      } catch {}

      themeSel?.addEventListener("change", () => applyTheme(themeSel.value, themeCol?.value));
      themeCol?.addEventListener("input", () => {
        if ((themeSel?.value || "") === "custom") applyTheme("custom", themeCol.value);
      });
    };

    // Try now, then observe for lazy insert
    const tryWire = () => {
      const modal = document.getElementById("optionsModal");
      if (modal) wireOptionsModal(modal);
    };
    tryWire();

    const mo = new MutationObserver(() => tryWire());
    mo.observe(document.documentElement, { childList: true, subtree: true });
    window.__optionsModalObserver = mo;
  }
} catch (e) {
  console.warn("Options modal wiring failed", e);
}

// Bottom nav wiring
try { initBottomNav?.(); } catch {}




  } catch (e) {
    console.error("Boot error:", e);
  }
  
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
  // Performance marker: boot finished
  performance.mark?.("main:end");
  performance.measure?.("boot", "main:start", "main:end");
  
}

