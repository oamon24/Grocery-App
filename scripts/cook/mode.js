/*
  Cook Mode with per-step Timer controls — migrated.
  Public API: cookMode.open(recipe, startIndex=0), close(), next(), prev(), setIndex(i)
*/
(function(){
  if (window.__cookModeSingletonLoaded) return;
  window.__cookModeSingletonLoaded = true;

  // ===== Step Photo Preloader =====
  const __stepImageCache = new Map();
  async function preloadImage(url){
    if (!url) return;
    if (__stepImageCache.has(url)) return __stepImageCache.get(url);
    const p = (async () => {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = 'high';
      img.src = url;
      try { await img.decode(); } catch(e){}
      return img;
    })();
    __stepImageCache.set(url, p);
    return p;
  }

  // Lazy DOM refs. Resolved on open()
  let modal, overlay, sheet, btnClose, elCount, elBody, elPhoto, elPhotoBtn, swipeRegion;
  let tLabel, tMeta, tProg, btnStart, btnPause, btnResume, btnReset, btnStop, btnM10s, btnM1, btnS1;
  const showPhotoBtn = (show) => { if (elPhotoBtn) elPhotoBtn.style.display = show ? "" : "none"; };

  function resolveRefs() {
    const modals = document.querySelectorAll("#cookModeModal");
    modal  = modals[modals.length - 1] || null;
    if (!modal) return false;

    overlay   = modal.querySelector("#cookModeOverlay");
    sheet     = modal.querySelector("#cookModeSheet");
    btnClose  = modal.querySelector("#cookModeClose");
    elCount   = modal.querySelector("#cookStepCount");
    elBody    = modal.querySelector("#cookStepBody");
    elPhoto   = modal.querySelector("#cookStepPhoto");
    elPhotoBtn= modal.querySelector("#cookStepPhotoBtn");
    swipeRegion = modal.querySelector("#cookModeBody");

    tLabel    = modal.querySelector("#cookTimerLabel");
    tMeta     = modal.querySelector("#cookTimerMeta");
    tProg     = modal.querySelector("#cookTimerProgress > div");
    btnStart  = modal.querySelector("#cookTimerStart");
    btnPause  = modal.querySelector("#cookTimerPause");
    btnResume = modal.querySelector("#cookTimerResume");
    btnReset  = modal.querySelector("#cookTimerReset");
    btnStop   = modal.querySelector("#cookTimerStop");
    btnM10s   = modal.querySelector("#cookM10s");
    btnM1     = modal.querySelector("#cookM1");
    btnS1     = modal.querySelector("#cookS1");
    return true;
  }

  // ===== State =====
  const state = {
    recipe: null,
    index: 0,
    cleanupTasksBinding: null,
    listenersBound: false,
    touch: { startX:0, startY:0, active:false },
    unsubTimers: null
  };

  // ===== Helpers =====
  function fmt(ms){
    ms = Math.max(0, ms|0);
    const s = Math.floor(ms/1000);
    const hh = Math.floor(s/3600);
    const mm = Math.floor((s%3600)/60);
    const ss = s%60;
    return (hh>0? (String(hh).padStart(2,'0')+':'):'') + String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  }
  function now(){ return Date.now(); }
  function remainingFor(t){
    if (!t) return 0;
    if (t.isPaused) return Math.max(0, t.remainingMs|0);
    if (t.endsAt == null) return 0;
    return Math.max(0, t.endsAt - now());
  }
  function progressFor(t){
    if (!t) return 0;
    const total = t.durationMs || (t.remainingMs||0);
    if (!total) return 0;
    const rem = remainingFor(t);
    const done = total - rem;
    return Math.max(0, Math.min(1, done/total));
  }
  function findTimerForStep(recipeId, stepId, stepIndex){
    if (!window.timers || typeof window.timers.list !== 'function') return null;
    const arr = window.timers.list();
    return arr.find(t => t.context
      && String(t.context.recipeId||'') === String(recipeId||'')
      && String(t.context.stepId||'') === String(stepId||'')
      && Number(t.context.stepIndex||0) === Number(stepIndex||0)
    ) || null;
  }

  // Progress persistence
  const PROG_LS_KEY = 'cookProgress.v1';
  const PROG_TTL_MS = 12 * 60 * 60 * 1000;
  const _readProgStore = () => { try { return JSON.parse(localStorage.getItem(PROG_LS_KEY) || '{}'); } catch { return {}; } };
  const _writeProgStore = (s) => localStorage.setItem(PROG_LS_KEY, JSON.stringify(s));
  function _getSavedIndex(recipeId){
    if (!recipeId) return null;
    const e = _readProgStore()[String(recipeId)];
    if (!e) return null;
    const ts = Number(e.lastUsedAt || 0);
    if (!Number.isFinite(ts) || (Date.now() - ts) > PROG_TTL_MS) return null;
    const idx = Number(e.index);
    return Number.isFinite(idx) ? idx : null;
  }
  function _saveIndex(recipeId, index){
    if (!recipeId) return;
    const s = _readProgStore();
    s[String(recipeId)] = { index: Number(index)||0, lastUsedAt: Date.now() };
    _writeProgStore(s);
  }
  function _clearIndex(recipeId){
    if (!recipeId) return;
    const s = _readProgStore();
    delete s[String(recipeId)];
    _writeProgStore(s);
  }

  // ===== API =====
  function open(recipe, startIndex=0){
    if (!recipe) return;
    if (!resolveRefs()) { console.warn("Cook Mode modal not found"); return; }

    const stepsArr = Array.isArray(recipe.steps) ? recipe.steps : [];
    state.recipe = Object.assign({}, recipe, { steps: stepsArr });

    try {
      const urls = stepsArr.map(s => s && s.photoUrl).filter(Boolean);
      if (urls.length) Promise.allSettled(urls.map(preloadImage));
    } catch {}

    let desired = startIndex|0;
    try {
      const saved = _getSavedIndex(state.recipe && state.recipe.id);
      if (saved != null && desired === 0) desired = saved;
    } catch {}
    const maxIdx = stepsArr.length;
    state.index = Math.max(0, Math.min(desired, maxIdx));
    try { _saveIndex(state.recipe && state.recipe.id, state.index); } catch {}

    render();
    show();
    if (window.timers && typeof window.timers.unlockAudio === 'function') window.timers.unlockAudio();

    if (!state.listenersBound) { bindListeners(); state.listenersBound = true; }
    if (window.timers && typeof window.timers.subscribe === 'function') {
      if (state.unsubTimers) state.unsubTimers();
      state.unsubTimers = window.timers.subscribe(() => updateTimerUI());
    }

    if (!window.__cookUITick){
      let last = 0, raf = 0;
      const loop = (ts) => {
        if (!modal || modal.style.display !== 'block') { window.__cookUITick = null; cancelAnimationFrame(raf); return; }
        if (!last || (ts - last) >= 200) { updateTimerUI(); last = ts; }
        raf = requestAnimationFrame(loop);
      };
      window.__cookUITick = true;
      raf = requestAnimationFrame(loop);
    }
  }

  const COOK_MODE_STATE_KEY = 'cookModeOpen';
  function show(){
    modal.style.display = 'block';
    sheet.focus?.();
    document.documentElement.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    try { history.pushState({ [COOK_MODE_STATE_KEY]: true }, ''); } catch {}
  }
  function hide(){
    modal.style.display = 'none';
    document.documentElement.style.overflow = '';
    document.body.classList.remove('modal-open');
  }
  function onCookModePopState(){
    try {
      if (modal.style.display === 'block') {
        unbindListeners();
        state.listenersBound = false;
        state.recipe = null;
        state.index = 0;
        hide();
      }
    } catch{}
  }
  window.addEventListener('popstate', onCookModePopState);
  function maybePopCookHistory(){ try { if (history.state && history.state[COOK_MODE_STATE_KEY]) history.back(); } catch{} }

  function close(){
    if (typeof state.cleanupTasksBinding === 'function') { state.cleanupTasksBinding(); state.cleanupTasksBinding = null; }
    if (state.unsubTimers) { state.unsubTimers(); state.unsubTimers = null; }
    try { if (window.__cookUITick) window.__cookUITick = null; } catch {}
    unbindListeners(); state.listenersBound = false;
    state.recipe = null; state.index = 0; hide(); maybePopCookHistory();
  }

  function next(){ if (!state.recipe) return; const steps = state.recipe.steps || []; if (state.index < steps.length) setIndex(state.index + 1); }
  function prev(){ if (!state.recipe) return; if (state.index > 0) setIndex(state.index - 1); }
  function setIndex(i){
    if (typeof state.cleanupTasksBinding === 'function') { state.cleanupTasksBinding(); state.cleanupTasksBinding = null; }
    state.index = i; try { _saveIndex(state.recipe && state.recipe.id, state.index); } catch {}
    render(); updateTimerUI();
  }

  function render(){
    const steps = state.recipe.steps || [];
    const isPrep = state.index === 0;
    const step = isPrep ? null : (steps[state.index - 1] || { text:"", photoUrl:null });
    const n = isPrep ? 0 : state.index;

    if (isPrep) {
      if (elPhoto) { elPhoto.removeAttribute('src'); elPhoto.style.display = 'none'; elPhoto.alt = ''; }
      const timerCard = modal.querySelector('#cookTimerCard'); if (timerCard) timerCard.style.display = 'none';
      elCount.textContent = 'Ingredients';

      const ings = Array.isArray(state.recipe.ingredients) ? state.recipe.ingredients : [];
      const total = ings.length;

      if (!total) { elBody.innerHTML = '<p>No ingredients.</p>'; return; }

      const headerHTML = `
        <div id="prepHeader" style="display:flex; align-items:center; gap:10px; justify-content:space-between; margin-bottom:8px;">
          <div id="prepCounter" style="font-weight:600;">0 / ${total} prepped</div>
          <div style="flex:1; height:6px; background:#161616; border:1px solid rgba(255,255,255,.12); border-radius:6px; overflow:hidden; margin:0 10px;">
            <div id="prepProg" style="height:100%; width:0%; background:#3a86ff;"></div>
          </div>
          <button id="prepReset" class="tbtn" type="button">Start Again</button>
        </div>
      `;
      const listHTML = '<ul style="margin:0; padding-left:18px;">' + ings.map((ing,i) => {
        const text = [ing.qty, ing.size, ing.name, ing.notes].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
        return `<li style="margin:6px 0;"><label><input type="checkbox" class="md-task" data-task-index="${i}"> ${text}</label></li>`;
      }).join('') + '</ul>';
      const hintHTML = `<div style="margin-top:12px; text-align:center; font-size:0.9em; opacity:0.8;">Swipe to See Step&nbsp;1 →</div>`;
      elBody.innerHTML = headerHTML + listHTML + hintHTML;

      const recipeId = state.recipe.id || 'temp';
      const contextKey = `recipe:${recipeId}:step:prep`;
      if (window.cookSession && typeof window.cookSession.attachTaskCheckboxBinding === 'function') {
        state.cleanupTasksBinding = window.cookSession.attachTaskCheckboxBinding(elBody, contextKey);
      }

      const counterEl = elBody.querySelector('#prepCounter');
      const progEl    = elBody.querySelector('#prepProg');
      const inputs    = Array.from(elBody.querySelectorAll('input.md-task'));
      const updatePrepProgress = () => {
        const done = inputs.filter(i => i.checked).length;
        if (counterEl) counterEl.textContent = `${done} / ${total} prepped`;
        if (progEl)    progEl.style.width = total ? Math.round((done/total)*100) + '%' : '0%';
      };
      elBody.addEventListener('change', (e) => { if (e.target?.classList?.contains('md-task')) updatePrepProgress(); });
      const resetBtn = elBody.querySelector('#prepReset');
      if (resetBtn) resetBtn.addEventListener('click', () => {
        if (window.cookSession?.clearContext) window.cookSession.clearContext(contextKey);
        inputs.forEach(i => { i.checked = false; }); updatePrepProgress();
      });
      updatePrepProgress();
      return;
    }

    const timerCard = modal.querySelector('#cookTimerCard'); if (timerCard) timerCard.style.display = '';

    if (step.photoUrl) {
      (async () => {
        try { await preloadImage(step.photoUrl); } catch {}
        elPhoto.src = step.photoUrl; elPhoto.style.display = ''; elPhoto.alt = state.recipe.name ? `${state.recipe.name} – Step ${n}` : `Step ${n}`;
      })();
    } else {
      elPhoto.removeAttribute('src'); elPhoto.style.display = 'none'; elPhoto.alt = '';
    }
    showPhotoBtn(true);
    { // preload neighbors
      const idx0 = (state.index - 1) | 0;
      const prevUrl = steps[idx0 - 1]?.photoUrl;
      const nextUrl = steps[idx0 + 1]?.photoUrl;
      if (step.photoUrl) preloadImage(step.photoUrl);
      if (prevUrl) preloadImage(prevUrl);
      if (nextUrl) preloadImage(nextUrl);
    }

    elCount.textContent = (steps.length > 0) ? `Step ${n} of ${steps.length}` : 'No steps';
    elBody.innerHTML = (window.renderMarkdownSafe ? window.renderMarkdownSafe(step.text || '') : (step.text || ''));
    {
      const recipeId = state.recipe.id || 'temp';
      const stepId = step.id || String(state.index - 1);
      const contextKey = `recipe:${recipeId}:step:${stepId}`;
      if (window.cookSession?.attachTaskCheckboxBinding) {
        state.cleanupTasksBinding = window.cookSession.attachTaskCheckboxBinding(elBody, contextKey);
      }
    }
    tLabel.textContent = step.timerSec ? `Timer • ${Math.floor(step.timerSec/60)}m ${step.timerSec%60}s` : 'Timer';
    updateTimerUI();
  }

  function currentStepContext(){
    const steps = state.recipe.steps || [];
    const idx = Math.max(0, state.index - 1);
    const step = steps[idx] || {};
    return {
      recipeId: state.recipe.id || 'temp',
      stepId: step.id || String(idx),
      stepIndex: idx,
      goTo: () => { if (window.cookMode?.setIndex) window.cookMode.setIndex(idx + 1); }
    };
  }

  function updateTimerUI(){
    const steps = state.recipe?.steps || [];
    const idx = Math.max(0, state.index - 1);
    const step = steps[idx] || {};
    const ctx = currentStepContext();
    const timer = findTimerForStep(ctx.recipeId, ctx.stepId, ctx.stepIndex);

    if (!timer) {
      btnStart.style.display = '';
      btnPause.style.display = 'none';
      btnResume.style.display = 'none';
      btnReset.style.display = 'none';
      if (btnStop) { btnStop.textContent = 'Stop'; btnStop.className = 'tbtn'; }
      tMeta.textContent = step.timerSec ? fmt(step.timerSec * 1000) : '--:--';
      tProg.style.width = '0%';
      return;
    }

    const rem = remainingFor(timer);
    const p = Math.round(progressFor(timer) * 100);
    const isDone = !!timer.isDone;

    tMeta.textContent = (timer.isPaused ? 'Paused · ' : '') + fmt(rem);
    tProg.style.width = p + '%';

    btnStart.style.display = 'none';
    btnPause.style.display = timer.isPaused || isDone ? 'none' : '';
    btnResume.style.display = timer.isPaused && !isDone ? '' : 'none';
    btnReset.style.display = isDone ? 'none' : '';
    if (btnStop) {
      if (isDone) { btnStop.textContent = 'Silence & Reset'; btnStop.className = 'btn-pink'; }
      else { btnStop.textContent = 'Stop'; btnStop.className = 'tbtn'; }
    }
  }

  function createStepTimer(){
    const steps = state.recipe.steps || [];
    const idx = Math.max(0, state.index - 1);
    const step = steps[idx] || {};
    const ctx = currentStepContext();
    const label = (state.recipe.name ? state.recipe.name + ' – ' : '') + `Step ${state.index}`;
    const durationMs = (Number.isFinite(step.timerSec) ? step.timerSec*1000 : 60_000);
    const context = { ...ctx, recipe: { id: state.recipe.id, name: state.recipe.name, steps: state.recipe.steps } };
    return window.timers.create({ label, durationMs, context });
  }
  function resetStepTimer(){
    const ctx = currentStepContext();
    const t = findTimerForStep(ctx.recipeId, ctx.stepId, ctx.stepIndex);
    if (t) window.timers.stop(t.id);
    createStepTimer();
  }

 function bindListeners(){
  if (!modal) return;

  const safeOn = (el, ev, fn, opts) => { if (el && fn) el.addEventListener(ev, fn, opts || {}); };
  const safeOff = (el, ev, fn) => { if (el && fn) el.removeEventListener(ev, fn); };

  safeOn(btnClose, "click", close);
  safeOn(overlay, "click", close);
  document.addEventListener("keydown", onKey);

  if (swipeRegion) {
    safeOn(swipeRegion, "touchstart", onTouchStart, { passive: true });
    safeOn(swipeRegion, "touchmove", onTouchMove, { passive: true });
    safeOn(swipeRegion, "touchend", onTouchEnd);
  }

  safeOn(btnStart, "click", () => { window.timers?.unlockAudio?.(); createStepTimer(); updateTimerUI(); });
  safeOn(btnPause, "click", () => {
    const ctx = currentStepContext();
    const t = findTimerForStep(ctx.recipeId, ctx.stepId, ctx.stepIndex);
    if (t) window.timers.pause(t.id);
  });
  safeOn(btnResume, "click", () => {
    window.timers?.unlockAudio?.();
    const ctx = currentStepContext();
    const t = findTimerForStep(ctx.recipeId, ctx.stepId, ctx.stepIndex);
    if (t) window.timers.resume(t.id);
  });
  safeOn(btnReset, "click", () => { window.timers?.unlockAudio?.(); resetStepTimer(); });
  safeOn(btnStop, "click", () => {
    const ctx = currentStepContext();
    const t = findTimerForStep(ctx.recipeId, ctx.stepId, ctx.stepIndex);
    if (!t) { updateTimerUI(); return; }
    window.timers.stop(t.id);
    updateTimerUI();
  });
  safeOn(btnM10s, "click", () => { const c=currentStepContext(); const t=findTimerForStep(c.recipeId,c.stepId,c.stepIndex); if (t && window.timers.adjust) window.timers.adjust(t.id,-10*1000); });
  safeOn(btnM1, "click", () => { const c=currentStepContext(); const t=findTimerForStep(c.recipeId,c.stepId,c.stepIndex); if (t && window.timers.adjust) window.timers.adjust(t.id,-60*1000); });
  safeOn(btnS1, "click", () => { const c=currentStepContext(); const t=findTimerForStep(c.recipeId,c.stepId,c.stepIndex); if (t) window.timers.snooze(t.id,1); });

  safeOn(elPhotoBtn, "click", () => {
    if (!state?.recipe) return;
    const steps = Array.isArray(state.recipe.steps) ? state.recipe.steps : [];
    const idx = state.index - 1;
    if (idx < 0 || idx >= steps.length) return;
    const step = steps[idx] || {};
    const stepId = step.id || String(idx + 1);
    const recipeId = state.recipe.id;
    if (typeof openPhotoPicker !== "function") { alert("Photo picker not available."); return; }

    openPhotoPicker({
      onFile: async (file) => {
        if (!file) return;
        try {
          const prevPath = step.photoPath || null;
          const { url, path } = await uploadStepPhoto(file, recipeId, stepId, prevPath);
          step.photoUrl = url;
          step.photoPath = path;
          steps[idx] = step;
          if (elPhoto) { elPhoto.src = url; elPhoto.style.display = ""; elPhoto.alt = `${state.recipe.name||""} – Step ${idx+1}`; }
          await db.collection("recipes").doc(household).collection("recipes").doc(recipeId)
            .set({ steps, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: (auth?.currentUser?.email||auth?.currentUser?.uid||"unknown") }, { merge: true });
          if (typeof showToast === "function") showToast("Photo updated");
        } catch(e){ console.error(e); alert("Upload failed: " + (e.message || e)); }
      }
    });
  });
}


  function unbindListeners(){
    try {
      if (btnClose)  btnClose.removeEventListener('click', close);
      if (overlay)   overlay.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
      if (swipeRegion) {
        swipeRegion.removeEventListener('touchstart', onTouchStart);
        swipeRegion.removeEventListener('touchmove', onTouchMove);
        swipeRegion.removeEventListener('touchend', onTouchEnd);
      }
    } catch{}
  }


  function onKey(e){ if (modal.style.display !== 'block') return; if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev(); else if (e.key === 'Escape') close(); }
  function onTouchStart(ev){ const t = ev.changedTouches && ev.changedTouches[0]; if (!t) return; state.touch.active = true; state.touch.startX = t.clientX; state.touch.startY = t.clientY; }
  function onTouchMove(ev){}
  function onTouchEnd(ev){
    if (!state.touch.active) return;
    const t = ev.changedTouches && ev.changedTouches[0]; state.touch.active = false; if (!t) return;
    const dx = t.clientX - state.touch.startX; const dy = t.clientY - state.touch.startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) next(); else prev(); }
  }

  window.cookMode = { open, close, next, prev, setIndex };
})();
export const cookMode = window.cookMode;
