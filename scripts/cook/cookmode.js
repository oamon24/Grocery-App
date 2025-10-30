// Cook Mode modal. Drop in ./cook and include this script once on the page.
// Public API: window.cookMode.open(recipe, startIndex = -1)

(function () {

  const STATE = {
    el: null,
    titleEl: null,
    idxEl: null,
    textEl: null,
    timerEl: null,
    progressEl: null,
    timerBtn: null,
    current: { recipe: null, i: 0 },
    // UI tick no longer used for countdown; rAF drives rendering
    ticking: null,
    remaining: 0,
    stepDur: 0,
    endsAt: 0 // when > now, timer is running and remaining = ceil((endsAt-now)/1000)
  };

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function getTitle(r) { return String(r?.title || r?.name || "Untitled"); }
function getSteps(r) {
    const raw = Array.isArray(r?.steps) ? r.steps : [];
    return raw.map((s) => ({
      text: String(s?.text || "").trim() || "(step)",
      timerSeconds: Number.isFinite(s?.timerSeconds) ? s.timerSeconds
        : (Number.isFinite(s?.timerSec) ? s.timerSec : "")
    }));
  }

  function getIngredients(r) {
    const arr = Array.isArray(r?.ingredients) ? r.ingredients : [];
    return arr.map((it, idx) => ({
      idx,
      name: String(it?.name || "").trim(),
      qty: String(it?.qty || "").trim(),
      size: String(it?.size || "").trim()
    })).filter(x => x.name || x.qty || x.size);
  }

  // Per-household, per-recipe checklist persistence
  function checklistKey() {
    const HH = String(window.household || "");
    const rid = String(STATE.current?.recipe?.id || "").trim();
    return { HH, rid, KEY: `cook_checklist::${HH}::${rid}` };
  }
  function loadChecklist() {
    const { KEY } = checklistKey();
    try { return JSON.parse(localStorage.getItem(KEY) || "[]") || []; } catch { return []; }
  }
  function saveChecklist(list) {
    const { KEY } = checklistKey();
    try { localStorage.setItem(KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch {}
  }
  function clearChecklist() {
    saveChecklist([]);
    // Uncheck UI boxes if present
    if (STATE.ingsListEl) {
      STATE.ingsListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    }
  }


  async function ensureDom() {
    if (STATE.el) return;

    // Ensure stylesheet once so the modal is fixed + full-screen
    if (!document.getElementById("cookmode-css")) {
      const link = document.createElement("link");
      link.id = "cookmode-css";
      link.rel = "stylesheet";
      link.href = "scripts/cook/cookmode.css";
      document.head.appendChild(link);
    }

    // Load HTML fragment once
    const res = await fetch("scripts/cook/cookmode.html", { credentials: "same-origin" });
    const html = await res.text();
    const tpl = document.createElement("div");
    tpl.innerHTML = html;
    const el = tpl.querySelector("#cookModeModal");
    if (!el) throw new Error("cookmode.html missing #cookModeModal");
    document.body.appendChild(el);

 // Cache nodes
    STATE.el = el;
    STATE.titleEl = el.querySelector("#cmTitle");
    STATE.idxEl = el.querySelector("#cmStepIdx");
    STATE.textEl = el.querySelector("#cmStepText");
    STATE.timerEl = el.querySelector("#cmTimer");
    STATE.progressEl = el.querySelector("#cmProgress");
    STATE.timerBtn = el.querySelector("#cmTimerBtn");

    // Ingredients page nodes
    STATE.ingsEl = el.querySelector("#cmIngs");
    STATE.ingsListEl = el.querySelector("#cmIngsList");
    STATE.clearIngsBtn = el.querySelector("#cmClearIngsBtn");


// Wire controls
el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-action]");
      if (!a) return;
      const act = a.getAttribute("data-action");
      if (act === "close") close();
      if (act === "prev") prev();
      if (act === "next") next();
      if (act === "timer") toggleTimer();
      if (act === "minus1m") adjustTimer(-60);
      if (act === "plus1m") adjustTimer(60);
      if (act === "reset-timer") resetTimer();
            if (act === "silence-reset") {
        // Mark finished and acknowledged, mirror to bars, then reset
        const ctx = cmCurrentCtx();
        const now = Date.now();
        const existing = cmLoadTimer(ctx) || {};
        const data = { ...existing, running: false, remaining: 0, endsAt: now, acknowledged: true };
        cmSaveTimer(ctx, data);
        cmUpsertBars(ctx, data);
        resetTimer();
      }

      if (act === "clear-ings") clearChecklist();
    });



    // Explicitly wire the top-left ✕ button to ensure it always closes
    const cmCloseBtn = el.querySelector('.cm-topbar .cm-icon[data-action="close"]');
    if (cmCloseBtn) {
      cmCloseBtn.addEventListener("click", (ev) => {
        try { ev.preventDefault(); } catch {}
        try { ev.stopPropagation(); } catch {}
        close();
      }, { passive: false });
    }



    // Keyboard
    window.addEventListener("keydown", onKey, { passive: true });

    // Horizontal swipe inside Cook Mode to switch steps
    (function () {
   const area = el.querySelector(".cm-sheet") || el;
try { area.style.touchAction = "pan-y"; } catch {}
// Ensure horizontal swipes are delivered when starting on the scrollable ingredients list
const ings = el.querySelector(".cm-ings-list");
try { if (ings) ings.style.touchAction = "pan-y"; } catch {}

let startX = 0, startY = 0, startT = 0, tracking = false, fired = false, downOnInteractive = false;

      const isInteractive = (node) => !!(node && node.closest("button, input, textarea, select, a, .cm-btn"));

      const onDown = (e) => {
        if (e.isPrimary === false) return;
        if (!STATE.el || !STATE.el.classList.contains("show")) return;

        downOnInteractive = isInteractive(e.target);
        if (downOnInteractive) return;

        startX = e.clientX;
        startY = e.clientY;
        startT = performance.now ? performance.now() : Date.now();
        tracking = true;
        fired = false;

        // Block long-press text selection and context menus
        try { e.preventDefault(); } catch {}
        try { e.stopPropagation(); } catch {}
      };

      const onMove = (e) => {
        if (!tracking || fired) return;
        if (!STATE.el || !STATE.el.classList.contains("show")) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const dt = (performance.now ? performance.now() : Date.now()) - startT;

        const horiz = Math.abs(dx) >= 28 && Math.abs(dx) > Math.abs(dy) * 1.1;
        const fastEnough = dt < 900;
        const notVerticalScroll = Math.abs(dy) < 140;

        if (!(horiz && fastEnough && notVerticalScroll)) return;

        // This gesture is ours. Prevent page/tab handlers.
        try { e.preventDefault(); } catch {}
        try { e.stopPropagation(); } catch {}

        fired = true;
        tracking = false;

        if (dx < 0) next();
        else if (dx > 0) prev();
      };

      const cancel = () => { tracking = false; };

      // Capture so nothing behind the modal claims the gesture; allow preventDefault on move
      area.addEventListener("pointerdown", onDown, { capture: true, passive: false });
      area.addEventListener("pointermove", onMove, { capture: true, passive: false });
      area.addEventListener("pointerup", cancel, { capture: true, passive: true });
      area.addEventListener("pointercancel", cancel, { capture: true, passive: true });
      area.addEventListener("pointerleave", cancel, { capture: true, passive: true });
    })();

    // Close on backdrop
    // already handled via [data-action="close"]
  }




  function lockScroll(lock) {
    document.body.classList.toggle("modal-open", !!lock);
    if (lock) {
      document.body.dataset._cmScrollY = String(window.scrollY || 0);
      document.body.style.top = `-${window.scrollY || 0}px`;
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    } else {
      const y = parseInt(document.body.dataset._cmScrollY || "0", 10) || 0;
      document.body.style.top = "";
      document.body.style.position = "";
      document.body.style.width = "";
      window.scrollTo(0, y);
      delete document.body.dataset._cmScrollY;
    }
  }

  function onKey(e) {
    if (!STATE.el || !STATE.el.classList.contains("show")) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleTimer(); }
  }

function showStep(pageIndex) {
  const steps = getSteps(STATE.current.recipe);
  const nSteps = steps.length;
  const totalPages = nSteps + 1; // +1 for Ingredients page at index 0
  const controls = STATE.el ? STATE.el.querySelector(".cm-controls") : null;

  // Clamp page index
  STATE.current.i = Math.max(0, Math.min(pageIndex | 0, totalPages - 1));

  // Elements for pages
  const ingsNode = STATE.ingsEl;
  const stepNode = STATE.el?.querySelector("#cmStepPage");

  // No steps at all → still show Ingredients page as 0/0 equivalent
  if (!nSteps) {
    // Header
    STATE.idxEl.textContent = "Ingredients Prep";
    // Visibility
    if (ingsNode) ingsNode.hidden = false;
    if (stepNode) stepNode.hidden = true;

    // Hide timers and controls
    STATE.stepDur = 0;
    STATE.remaining = 0;
    STATE.timerEl.textContent = "00:00";
    STATE.timerEl.hidden = true;
    STATE.timerBtn.textContent = "Start";
    STATE.timerBtn.disabled = true;
    const mBtn0 = STATE.el.querySelector("#cmMinus1mBtn");
    const pBtn0 = STATE.el.querySelector("#cmPlus1mBtn");
    if (mBtn0) mBtn0.disabled = true;
    if (pBtn0) pBtn0.disabled = true;
    if (controls) controls.hidden = true;


    // Render ingredients list
    renderIngredientsList();

    // Progress is always 0% when there are no steps
    STATE.progressEl.style.width = "0%";

    // Persist progress as Ingredients (-1)
    const rid0 = String(STATE.current?.recipe?.id || "").trim();
    if (rid0) {
      const HH0 = String(window.household || "");
      const KEY0 = `cook_progress::${HH0}`;
      try {
        const now0 = Date.now();
        const map0 = (() => {
          try { return JSON.parse(localStorage.getItem(KEY0) || "{}") || {}; }
          catch { return {}; }
        })();
        map0[rid0] = { i: -1, ts: now0 };
        try { localStorage.setItem(KEY0, JSON.stringify(map0)); } catch {}
      } catch {}
    }

    stopTick();
    return;
  }

  // Ingredients page
  if (STATE.current.i === 0) {
    STATE.idxEl.textContent = "Ingredients Prep";
    if (ingsNode) ingsNode.hidden = false;
    if (stepNode) stepNode.hidden = true;

    // Hide timer UI and controls
    STATE.stepDur = 0;
    STATE.remaining = 0;
    STATE.timerEl.textContent = "00:00";
    STATE.timerEl.hidden = true;
    STATE.timerBtn.textContent = "Start";
    STATE.timerBtn.disabled = true;
    const mBtn = STATE.el.querySelector("#cmMinus1mBtn");
    const pBtn = STATE.el.querySelector("#cmPlus1mBtn");
    const rBtn = STATE.el.querySelector("#cmResetBtn");
    if (mBtn) mBtn.disabled = true;
    if (pBtn) pBtn.disabled = true;
    if (rBtn) rBtn.disabled = true;
    if (controls) controls.hidden = true;


    renderIngredientsList();

    // Progress: 0..nSteps
    const pct0 = nSteps > 0 ? (0 / nSteps) * 100 : 0;
    STATE.progressEl.style.width = pct0 + "%";

    // Persist progress as Ingredients (-1)
    const rid = String(STATE.current?.recipe?.id || "").trim();
    if (rid) {
      const HH = String(window.household || "");
      const KEY = `cook_progress::${HH}`;
      try {
        const now = Date.now();
        const map = (() => {
          try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
          catch { return {}; }
        })();
        map[rid] = { i: -1, ts: now };
        try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {}
      } catch {}
    }

    stopTick();
    return;
  }

  // Step pages (1..nSteps)
  if (ingsNode) ingsNode.hidden = true;
  if (stepNode) stepNode.hidden = false;

  const stepIdx = STATE.current.i - 1;
  const s = steps[stepIdx];

  // Render markdown-like text with **bold**, *italic*, "- " bullets, and "[ ] " task items.
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function inlineMd(str) {
    // Bold then italic
    let out = str;
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return out;
  }
  function renderStepMarkdown(src) {
    const lines = escapeHtml(src).split(/\r?\n/);
    const out = [];
    let listBuf = [];
    let listType = ""; // "ul" or "task"

    const flush = () => {
      if (!listBuf.length) return;
      if (listType === "task") {
        out.push(
          `<ul>` +
          listBuf.map(t => `<li><label><input type="checkbox" /> <span class="cm-step-line">${inlineMd(t)}</span></label></li>`).join("") +
          `</ul>`
        );
      } else if (listType === "ul") {
        out.push(
          `<ul>` +
          listBuf.map(t => `<li>${inlineMd(t)}</li>`).join("") +
          `</ul>`
        );
      }
      listBuf = [];
      listType = "";
    };

    for (const raw of lines) {
      if (/^\[ \]\s+/.test(raw)) {
        const text = raw.replace(/^\[ \]\s+/, "");
        if (listType && listType !== "task") flush();
        listType = "task";
        listBuf.push(text);
        continue;
      }
      if (/^-\s+/.test(raw)) {
        const text = raw.replace(/^-\s+/, "");
        if (listType && listType !== "ul") flush();
        listType = "ul";
        listBuf.push(text);
        continue;
      }
      // Paragraph line
      flush();
      if (raw.trim().length) out.push(`<p>${inlineMd(raw)}</p>`);
      else out.push("<br/>");
    }
    flush();
    return out.join("");
  }

  // Step content and header index
  STATE.textEl.innerHTML = renderStepMarkdown(s.text);
  // Make task checkboxes clickable for this session only
  STATE.textEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("click", (e) => {
      // do not persist; local only
      e.stopPropagation();
    });
  });
  STATE.idxEl.textContent = `${stepIdx + 1} / ${nSteps}`;

  // Timer for step — view reads from shared store; navigation never resets it
  STATE.stepDur = Number.isFinite(s.timerSeconds) ? Math.max(0, s.timerSeconds) : 0;

  // Enable/disable controls based on whether this step has a timer at all
  const mBtn = STATE.el.querySelector("#cmMinus1mBtn");
  const pBtn = STATE.el.querySelector("#cmPlus1mBtn");
  const rBtn = STATE.el.querySelector("#cmResetBtn");
  const hasTimer = !!STATE.stepDur;
  STATE.timerEl.hidden = !hasTimer;
  STATE.timerBtn.disabled = !hasTimer;
  if (mBtn) mBtn.disabled = !hasTimer;
  if (pBtn) pBtn.disabled = !hasTimer;
  if (rBtn) rBtn.disabled = !hasTimer;
  if (controls) controls.hidden = !hasTimer;


  // Refresh UI with a visibility-tied heartbeat
  cmUpdateStepTimerUI();
  cmStartUIBeat();



  // Progress: page 0..nSteps mapped to 0..100%

  const pct = nSteps > 0 ? (STATE.current.i / nSteps) * 100 : 0;
  STATE.progressEl.style.width = pct + "%";

  // Persist progress as step index. Ingredients saves as -1.
  const rid = String(STATE.current?.recipe?.id || "").trim();
  if (rid) {
    const HH = String(window.household || "");
    const KEY = `cook_progress::${HH}`;
    try {
      const now = Date.now();
      const stepI = (STATE.current.i === 0 ? -1 : Math.max(0, STATE.current.i - 1)); // page→step with -1 for Ingredients
      const map = (() => {
        try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
        catch { return {}; }
      })();
      map[rid] = { i: stepI, ts: now };
      try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {}
    } catch {}
  }

  stopTick();

  // Local helper to build Ingredients list
  function renderIngredientsList() {
    const list = getIngredients(STATE.current.recipe);
    if (!STATE.ingsListEl) return;
    const checked = new Set(loadChecklist());
    STATE.ingsListEl.innerHTML = "";
    list.forEach((ing) => {
      const li = document.createElement("li");
      li.className = "cm-ings-item";
      const id = `cmIng_${ing.idx}`;
      li.innerHTML = `
        <input type="checkbox" id="${id}" ${checked.has(ing.idx) ? "checked" : ""} />
        <label class="cm-ings-line" for="${id}">${[ing.qty, ing.size, ing.name].filter(Boolean).join(" ").trim()}</label>
      `;
      const cb = li.querySelector("input");
      cb.addEventListener("change", () => {
        const set = new Set(loadChecklist());
        if (cb.checked) set.add(ing.idx); else set.delete(ing.idx);
        saveChecklist(Array.from(set));
      });
      STATE.ingsListEl.appendChild(li);
    });
  }
}









  function stopTick() {
    if (STATE.ticking) {
      clearInterval(STATE.ticking);
      STATE.ticking = null;
    }
  }

  // --- Shared-timer helpers (Cook Mode <-> top/bottom bars) ---

  function hhKey() {
    return String(window.household || "");
  }

  function cmTimerId(rid, stepIdx) {
    return String(rid || "") + "::" + String(stepIdx | 0);
  }

  function cmCurrentCtx() {
    const r = STATE.current?.recipe || {};
    const rid = String(r.id || "");
    const stepIdx = Math.max(0, (STATE.current?.i | 0) - 1);
    const id = cmTimerId(rid, stepIdx);
    const label = `${getTitle(r)} — Step ${stepIdx + 1}`;
    return { rid, stepIdx, id, label, recipe: r };
  }

  function cmStorageKey(ctx) {
    return `cm_timer::${hhKey()}::${ctx.rid}::${ctx.stepIdx}`;
  }

  function cmLoadTimer(ctx) {
    try { return JSON.parse(localStorage.getItem(cmStorageKey(ctx)) || "null"); } catch { return null; }
  }

  function cmSaveTimer(ctx, data) {
    try { localStorage.setItem(cmStorageKey(ctx), JSON.stringify(data || null)); } catch {}
  }

  function cmClearTimer(ctx) {
    try { localStorage.removeItem(cmStorageKey(ctx)); } catch {}
  }

  function cmUpsertBars(ctx, data) {
    // Mirror into top/bottom bars. Running timers show in top bar. Done timers are endsAt<=now.
    const upsert = window.timerBars && window.timerBars.upsertTimer;
    const remove = window.timerBars && window.timerBars.removeTimer;
    if (!upsert) return;

    if (!data) { remove?.(ctx.id); return; }

    const now = Date.now();
    const running = !!data.running;
    const endsAt = Number.isFinite(data.endsAt)
      ? data.endsAt
      : (Number.isFinite(data.remaining) ? now + Math.max(0, data.remaining | 0) * 1000 : now);

    upsert({
      id: ctx.id,
      label: ctx.label,
      recipeId: ctx.rid,
      stepId: String(ctx.stepIdx),
      stepIndex: ctx.stepIdx,
      endsAt,
      running,
      acknowledged: !!data.acknowledged,
      recipe: ctx.recipe || null // include full recipe for deep-link
    });
  }


  function cmRemoveBars(ctx) {
    const remove = window.timerBars && window.timerBars.removeTimer;
    remove?.(ctx.id);
  }

// Global updater so Cook Mode always re-renders the current step timer.
// Safe to call from anywhere.
function cmUpdateStepTimerUI() {
  if (!STATE || !STATE.el) return;

  // Determine if current step has a timer
  const r = STATE.current?.recipe || {};
  const sIndex = Math.max(0, (STATE.current?.i | 0) - 1);
  const steps = getSteps(r);
  const s = steps[sIndex] || {};
  const hasTimer = Number.isFinite(s.timerSeconds) && s.timerSeconds > 0;

  // Guard elements
  const controls = STATE.el.querySelector("#cmTimerControls");
  const mBtn = STATE.el.querySelector("#cmMinus1mBtn");
  const pBtn = STATE.el.querySelector("#cmPlus1mBtn");
  const rBtn = STATE.el.querySelector("#cmResetBtn");
  const silenceBtn = STATE.el.querySelector("#cmSilenceResetBtn");

  STATE.timerEl.hidden = !hasTimer;
  if (controls) controls.hidden = !hasTimer;

  // Default disabled states when no timer
  const setControlsDisabled = (disabled) => {
    STATE.timerBtn.disabled = disabled;
    if (mBtn) mBtn.disabled = disabled;
    if (pBtn) pBtn.disabled = disabled;
    if (rBtn) rBtn.disabled = disabled;
  };

  if (!hasTimer) {
    STATE.timerEl.textContent = "00:00";
    STATE.timerBtn.textContent = "No timer";
    setControlsDisabled(true);
    if (silenceBtn) silenceBtn.hidden = true;
    return;
  }

  const ctx = cmCurrentCtx();
  const data = cmLoadTimer(ctx) || {};
  const now = Date.now();

  let remaining;
  if (data.running && Number.isFinite(data.endsAt)) {
    remaining = Math.max(0, Math.ceil((data.endsAt - now) / 1000));
  } else if (Number.isFinite(data.remaining)) {
    remaining = Math.max(0, data.remaining | 0);
  } else {
    remaining = Math.max(0, (s.timerSeconds | 0));
  }

  STATE.timerEl.textContent = fmt(remaining);

  // If countdown hit or passed zero while marked running, flip to finished now.
  if (data.running && remaining <= 0) {
    const finished = { ...data, running: false, remaining: 0, endsAt: now, acknowledged: false };
    cmSaveTimer(ctx, finished);
    cmUpsertBars(ctx, finished);
    Object.assign(data, finished);
    remaining = 0;
  }

  if (data.running) {
    STATE.timerBtn.textContent = "Pause";
    setControlsDisabled(false);
    if (silenceBtn) silenceBtn.hidden = true;
  } else if (remaining === 0) {
    // Finished state
    STATE.timerBtn.textContent = "Done";
    STATE.timerBtn.disabled = true;
    if (mBtn) mBtn.disabled = true;
    if (pBtn) pBtn.disabled = true;
    // Keep Reset enabled per spec
    if (rBtn) rBtn.disabled = false;
    if (silenceBtn) silenceBtn.hidden = false;
  } else if (Number.isFinite(data.remaining)) {
    STATE.timerBtn.textContent = "Resume";
    setControlsDisabled(false);
    if (silenceBtn) silenceBtn.hidden = true;
  } else {
    STATE.timerBtn.textContent = "Start";
    setControlsDisabled(false);
    if (silenceBtn) silenceBtn.hidden = true;
  }

}



// Visibility-tied UI heartbeat using requestAnimationFrame.
// Keeps the timer label moving even when other code stops intervals.
const CM_UI_BEAT = { raf: null };

function cmStartUIBeat() {
  if (CM_UI_BEAT.raf) return;
  const step = () => {
    cmUpdateStepTimerUI();
    CM_UI_BEAT.raf = requestAnimationFrame(step);
  };
  CM_UI_BEAT.raf = requestAnimationFrame(step);
}

function cmStopUIBeat() {
  if (!CM_UI_BEAT.raf) return;
  cancelAnimationFrame(CM_UI_BEAT.raf);
  CM_UI_BEAT.raf = null;
}

// Resume beat when tab becomes visible again
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && (window.cookMode?.isCookModeVisible?.())) {
    cmStartUIBeat();
  }
});


  // Toggle start/pause/resume and handle “Restart” as Stop+Reset
  function toggleTimer() {
    if (!STATE.stepDur) return;
    const ctx = cmCurrentCtx();
    const now = Date.now();
    const existing = cmLoadTimer(ctx) || { running: false, remaining: STATE.stepDur, endsAt: null, acknowledged: false };

    if (existing.running && Number.isFinite(existing.endsAt)) {
      // Pause
      const rem = Math.max(0, Math.ceil((existing.endsAt - now) / 1000));
      const data = { ...existing, running: false, remaining: rem, endsAt: now + rem * 1000 };
      cmSaveTimer(ctx, data);
      cmUpsertBars(ctx, data);
    } else {
      // Not running
      const baseRem = Number.isFinite(existing.remaining) ? (existing.remaining | 0) : (STATE.stepDur | 0);
      if (baseRem <= 0) {
        // Reset to pristine: clear stored timer so button shows “Start”
        cmClearTimer(ctx);
        cmRemoveBars(ctx);
      } else {
        // Start or Resume
        const data = { ...existing, running: true, endsAt: now + baseRem * 1000, acknowledged: false };
        cmSaveTimer(ctx, data);
        cmUpsertBars(ctx, data);
      }
    }

    try { /* immediate UI refresh */ 
const stepPageUpdate = (typeof cmUpdateStepTimerUI === "function") ? cmUpdateStepTimerUI : null;
      stepPageUpdate && stepPageUpdate();
    } catch {}
  }


  // +/- 1 minute adjusts remaining or endsAt without resetting other timers
function adjustTimer(deltaSec) {
    if (!STATE.stepDur) return;
    const d = (deltaSec | 0);
    const ctx = cmCurrentCtx();
    const now = Date.now();
    const existing = cmLoadTimer(ctx) || { running: false, remaining: STATE.stepDur, endsAt: null, acknowledged: false };

    if (existing.running && Number.isFinite(existing.endsAt)) {
      // Shift endsAt while running
      let newEnds = Number(existing.endsAt) + d * 1000;
      if (newEnds <= now) {
        // Hit zero or less → stop at 0; treat as finished
        const data = { ...existing, running: false, remaining: 0, endsAt: now };
        cmSaveTimer(ctx, data);
        cmUpsertBars(ctx, data);
      } else {
        const data = { ...existing, endsAt: newEnds };
        cmSaveTimer(ctx, data);
        cmUpsertBars(ctx, data);
      }
    } else {
      // Paused/not-started: adjust snapshot remaining
      const base = Number.isFinite(existing.remaining) ? (existing.remaining | 0) : (STATE.stepDur | 0);
      const rem = Math.max(0, base + d);
      const data = { ...existing, running: false, remaining: rem, endsAt: now + rem * 1000 };
      cmSaveTimer(ctx, data);
      if (rem > 0) cmUpsertBars(ctx, data); else cmRemoveBars(ctx);
    }

    try {
      const stepPageUpdate = (typeof cmUpdateStepTimerUI === "function") ? cmUpdateStepTimerUI : null;
      stepPageUpdate && stepPageUpdate();
    } catch {}
  }

  // Reset to pristine for this step
  function resetTimer() {
    if (!STATE.stepDur) return;
    const ctx = cmCurrentCtx();
    cmClearTimer(ctx);
    cmRemoveBars(ctx);
    try {
      const stepPageUpdate = (typeof cmUpdateStepTimerUI === "function") ? cmUpdateStepTimerUI : null;
      stepPageUpdate && stepPageUpdate();
    } catch {}
  }




function next() {
    const steps = getSteps(STATE.current.recipe);
    const totalPages = steps.length + 1; // include Ingredients page
    if (totalPages <= 1) return;
    const i = Math.min(totalPages - 1, STATE.current.i + 1);
    if (i !== STATE.current.i) showStep(i);
  }

  function prev() {
    const steps = getSteps(STATE.current.recipe);
    const totalPages = steps.length + 1; // include Ingredients page
    if (totalPages <= 1) return;
    const i = Math.max(0, STATE.current.i - 1);
    if (i !== STATE.current.i) showStep(i);
  }

  async function open(recipe, startIndex = -1) {
    await ensureDom();

    // Persisted progress: per-household map { [rid]: { i, ts } }
    const HH = String(window.household || "");
    const KEY = `cook_progress::${HH}`;
    const MAX_AGE = 12 * 60 * 60 * 1000; // 12h

    const loadMap = () => {
      try {
        const raw = localStorage.getItem(KEY);
        const obj = raw ? JSON.parse(raw) : {};
        return obj && typeof obj === "object" ? obj : {};
      } catch { return {}; }
    };
    const saveMap = (m) => { try { localStorage.setItem(KEY, JSON.stringify(m || {})); } catch {} };

    STATE.current.recipe = recipe || {};
    STATE.titleEl.textContent = getTitle(recipe);

    // Decide start index. If caller provided startIndex, honor it and skip persisted progress.
    let idx;
    if (Number.isFinite(startIndex)) {
      idx = startIndex | 0;
    } else {
      idx = -1;
      const rid = String(recipe?.id || "").trim();
      const now = Date.now();
      if (rid) {
        const map = loadMap();
        const rec = map[rid];
        if (rec && Number.isFinite(rec.i) && Number.isFinite(rec.ts) && now - rec.ts < MAX_AGE) {
          // Allow -1 to represent Ingredients
          idx = (rec.i | 0);
        } else {
          // initialize or reset stale
          map[rid] = { i: -1, ts: now };
          saveMap(map);
          idx = -1;
        }
      }
    }


STATE.el.classList.add("show");
    STATE.el.setAttribute("aria-hidden", "false");
    lockScroll(true);
    // Stored/start index is a STEP index. Ingredients is -1 → page 0.
    showStep(((idx | 0) < 0) ? 0 : Math.max(0, (idx | 0) + 1));
  }




  function close() {
    // Stop only the UI heartbeat; timers continue in shared store.
    cmStopUIBeat();
    if (!STATE.el) return;
    STATE.el.classList.remove("show");
    STATE.el.setAttribute("aria-hidden", "true");
    lockScroll(false); try { STATE._htmlController && STATE._htmlController.abort(); } catch {}
  }


  // Helpers for timer bars + navigation
  function isCookModeVisible() {
    return !!(STATE.el && STATE.el.classList.contains("show"));
  }
  function getCurrentContext() {
    const r = STATE.current?.recipe || {};
    const stepIndex = Math.max(0, (STATE.current?.i | 0) - 1);
    const steps = getSteps(r);
    const stepId = steps[stepIndex]?.id || String(stepIndex);
    return { recipeId: String(r.id || ""), stepId, stepIndex };
  }
  async function openCookModeAt(ctx) {
    const stepIndex = Math.max(0, ctx?.stepIndex | 0);
    let recipe = ctx?.recipe;
    if (!recipe && ctx?.recipeId && typeof window.getRecipeById === "function") {
      try { recipe = await window.getRecipeById(ctx.recipeId); } catch {}
    }
    if (!recipe) { console.warn("openCookModeAt: recipe object not provided"); return; }
    await open(recipe, stepIndex);
  }

  // Expose API
  window.cookMode = { open, close, next, prev, isCookModeVisible, getCurrentContext, openCookModeAt };
})();


