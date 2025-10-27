// Bottom Done Bar + alarm loop
(function () {
  const ALARM_URL = "/assets/alarm.mp3";
  const STATE = { audio: null, playingId: null, el: null, msgEl: null, openBtn: null, ackBtn: null };

  function ensureDom() {
    // ensure stylesheet
    if (!document.getElementById("timer-bars-css")) {
      const link = document.createElement("link");
      link.id = "timer-bars-css";
      link.rel = "stylesheet";
      link.href = "scripts/timers/timer-bars.css";
      document.head.appendChild(link);
    }

    if (!STATE.el) {
      let bar = document.getElementById("timerDoneBar");
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "timerDoneBar";
        bar.className = "timer-done-bar";
        bar.hidden = true;
        bar.innerHTML = `
          <div id="timerDoneMsg">⏰ Timer done</div>
          <div class="actions">
            <button id="timerDoneOpen" type="button">Open</button>
            <button id="timerDoneAck" type="button">Acknowledge</button>
          </div>
        `;
        document.body.appendChild(bar);
      }
      // enforce global stacking and placement above Cook Mode
      try {
        bar.style.position = "fixed";
        bar.style.left = "0";
        bar.style.right = "0";
        bar.style.bottom = "0";
        bar.style.zIndex = "10001"; // Cook Mode is 9999
      } catch {}
      STATE.el = bar;
    }

    STATE.msgEl = document.getElementById("timerDoneMsg");
    STATE.openBtn = document.getElementById("timerDoneOpen");
    STATE.ackBtn  = document.getElementById("timerDoneAck");

    if (!STATE.el || !STATE.msgEl || !STATE.openBtn || !STATE.ackBtn) return false;

    // idempotent listeners
    STATE.openBtn.removeEventListener?.("click", onOpen);
    STATE.ackBtn.removeEventListener?.("click", onAck);
    STATE.openBtn.addEventListener("click", onOpen);
    STATE.ackBtn.addEventListener("click", onAck);
    return true;
  }


  function loopAlarmStart(id) {
    if (STATE.playingId === id) return;
    loopAlarmStop();
    try {
      STATE.audio = new Audio(ALARM_URL);
      STATE.audio.loop = true;
      const p = STATE.audio.play();
      p?.catch(() => {});
      STATE.playingId = id;
    } catch {}
  }
  function loopAlarmStop() {
    try { STATE.audio?.pause(); } catch {}
    STATE.audio = null; STATE.playingId = null;
  }

  function currentDoneCandidate() {
    const done = window.timerBars?.mostRecentDone?.();
    return done || null;
  }


  function render() {
    if (!ensureDom()) return;
    const cand = currentDoneCandidate();
    if (!cand) {
      STATE.el.hidden = true;
      try { STATE.el.style.display = "none"; } catch {}
      loopAlarmStop();
      return;
    }
    STATE.msgEl.textContent = `⏰ ${cand.label || "Timer"} done`;
    STATE.el.hidden = false;
    try { STATE.el.style.display = "flex"; } catch {}
    if (!cand.acknowledged) loopAlarmStart(cand.id);
  }


  function onOpen() {
    const cand = currentDoneCandidate(); if (!cand) return;
    window.cookMode?.openCookModeAt?.({
      recipe: cand.recipe || null,
      recipeId: cand.recipeId,
      stepIndex: cand.stepIndex | 0
    });
    cand.acknowledged = true; render();
  }


  function onAck() {
    const cand = currentDoneCandidate(); if (!cand) return;
    cand.acknowledged = true; loopAlarmStop(); render();
  }

  function tick(){ render(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { ensureDom(); render(); setInterval(tick, 1000); }, { once: true });
  } else { ensureDom(); render(); setInterval(tick, 1000); }
})();
