// Top Active Timers Bar + shared registry (chips + count chip)
// Exposes window.timerBars: { upsertTimer, removeTimer, mostRecentDone, isCookModeVisible }
(function () {
  const REG = new Map(); // id -> {id,label,recipeId,stepId,stepIndex,endsAt,running,acknowledged,ts}
  const STATE = {
    topBar: null,
    chipsWrap: null,
    countChip: null
  };

  // ---- DOM ----
  function ensureDom() {
    // ensure stylesheet
    if (!document.getElementById("timer-bars-css")) {
      const link = document.createElement("link");
      link.id = "timer-bars-css";
      link.rel = "stylesheet";
      link.href = "scripts/timers/timer-bars.css";
      document.head.appendChild(link);
    }

    // ensure container
    if (!STATE.topBar) {
      let bar = document.getElementById("timerTopBar");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "timerTopBar";
        bar.className = "timer-top-bar";
        bar.hidden = true;
        bar.innerHTML = `
          <div class="chips" id="timerTopChips"></div>
          <button class="tt-chip" id="timerChip" type="button" title="Active timers">
            <span id="timerChipCount">0</span>
          </button>
        `;
        document.body.insertBefore(bar, document.body.firstChild || null);
      }
      STATE.topBar = bar;
    }

    if (!STATE.chipsWrap) STATE.chipsWrap = document.getElementById("timerTopChips");
    if (!STATE.countChip) STATE.countChip = document.getElementById("timerChip");

    return !!(STATE.topBar && STATE.chipsWrap && STATE.countChip);
  }


  function fmt(sec) {
    sec = Math.max(0, Math.ceil(sec || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function isCookModeVisible() {
    return !!(window.cookMode?.isCookModeVisible?.());
  }

  function remainingFor(t) {
    const now = Date.now();
    if (t.running && Number.isFinite(t.endsAt)) {
      return Math.max(0, Math.ceil((t.endsAt - now) / 1000));
    }
    return 0;
  }

  // ---- Public registry API used by Cook Mode ----
  function upsertTimer(t) {
    // required fields: id,label,recipeId,stepId,stepIndex,endsAt,running,acknowledged
    const clean = {
      id: String(t.id || ""),
      label: String(t.label || "Timer"),
      recipeId: String(t.recipeId || ""),
      stepId: String(t.stepId || ""),
      stepIndex: (t.stepIndex | 0),
      endsAt: Number(t.endsAt) || Date.now(),
      running: !!t.running,
      acknowledged: !!t.acknowledged,
      recipe: t.recipe || null, // carry full recipe for deep-link
      ts: Date.now()
    };
    if (!clean.id) return;
    REG.set(clean.id, clean);
    render();
  }


  function removeTimer(id) {
    if (!id) return;
    REG.delete(String(id));
    render();
  }

  // Done candidate for bottom bar module
  function mostRecentDone() {
    let best = null;
    const now = Date.now();
    for (const t of REG.values()) {
      const isDone = Number.isFinite(t.endsAt) && t.endsAt <= now;
      if (!isDone) continue;
      if (!best || (t.endsAt > best.endsAt)) best = t;
    }
    return best || null;
  }

  // ---- Rendering ----
  function renderChips() {
    if (!ensureDom()) return;
    // Build a list of running, not-done timers
    const now = Date.now();
    const running = [];
    for (const t of REG.values()) {
      const done = Number.isFinite(t.endsAt) && t.endsAt <= now;
      if (t.running && !done) running.push(t);
    }

    // Sort by soonest to end
    running.sort((a, b) => a.endsAt - b.endsAt);

    // Show/hide top bar: only outside Cook Mode and when at least one is running
    STATE.topBar.hidden = !(running.length && !isCookModeVisible());

    // Count chip shows total active timers (running + not-acknowledged done)
    let activeCount = 0;
    for (const t of REG.values()) {
      const done = Number.isFinite(t.endsAt) && t.endsAt <= now;
      if ((t.running && !done) || (done && !t.acknowledged)) activeCount++;
    }
    const countEl = document.getElementById("timerChipCount");
    if (countEl) countEl.textContent = String(activeCount);
    STATE.countChip.hidden = activeCount === 0;

    // Diff render chips
    const frag = document.createDocumentFragment();
    running.forEach((t) => {
      const li = document.createElement("button");
      li.className = "tt-chip";
      const rem = remainingFor(t);
      li.textContent = `${fmt(rem)} • ${t.label}`;
      li.setAttribute("data-id", t.id);
      li.addEventListener("click", () => {
        // pass recipe when available; fallback to recipeId
        window.cookMode?.openCookModeAt?.({
          recipe: t.recipe || null,
          recipeId: t.recipeId,
          stepIndex: t.stepIndex | 0
        });
      });
      frag.appendChild(li);
    });

    STATE.chipsWrap.innerHTML = "";
    STATE.chipsWrap.appendChild(frag);
  }

  function render() {
    renderChips();
    // Bottom done bar module polls mostRecentDone() itself
  }

  // ---- Heartbeat ----
  function tick() {
    render();
  }


  // Expose API
  window.timerBars = { upsertTimer, removeTimer, mostRecentDone, isCookModeVisible };

  // Init
  const start = () => { ensureDom(); render(); setInterval(tick, 1000); };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
