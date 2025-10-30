/*
  Cook Session — Phase 5
  Persistent task checkbox state with 12h TTL and cross-tab sync.
  API:
    cookSession.attachTaskCheckboxBinding(containerEl, contextKey) -> unbind()
    cookSession.clearContext(contextKey)
*/
(function(){
  const LS_KEY = "cookSession.v1";
  const CH_NAME = "cookSession";
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
  const bc = ("BroadcastChannel" in self) ? new BroadcastChannel(CH_NAME) : null;

  function now(){ return Date.now(); }
  function readStore(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
    catch { return {}; }
  }
  function writeStore(store){
    localStorage.setItem(LS_KEY, JSON.stringify(store));
    if (bc) bc.postMessage({ type:"storeUpdated" });
  }

  function readEntry(contextKey){
    const s = readStore();
    const v = s[contextKey];
    if (!v) return { map: {}, lastUsedAt: null };
    if (v && typeof v === 'object' && v.map && typeof v.map === 'object') {
      return { map: v.map || {}, lastUsedAt: Number(v.lastUsedAt || 0) || null };
    }
    return { map: (typeof v === 'object' ? v : {}), lastUsedAt: null };
  }

  function isExpired(entry){
    if (!entry) return false;
    if (!entry.lastUsedAt) return false;
    return (now() - entry.lastUsedAt) > SESSION_TTL_MS;
  }

  function getContext(contextKey){
    const entry = readEntry(contextKey);
    return isExpired(entry) ? {} : entry.map;
  }

  function setContext(contextKey, map){
    const s = readStore();
    s[contextKey] = { map: map || {}, lastUsedAt: now() };
    writeStore(s);
  }

  function clearContext(contextKey){
    const s = readStore();
    if (s.hasOwnProperty(contextKey)) {
      delete s[contextKey];
      writeStore(s);
    }
  }

  function ensureFresh(contextKey){
    const s = readStore();
    const entry = readEntry(contextKey);
    if (isExpired(entry)) {
      s[contextKey] = { map: {}, lastUsedAt: now() };
      writeStore(s);
      try { if (typeof window.showToast === 'function') window.showToast('Started a fresh cooking session — checkmarks reset.'); } catch {}
      return true;
    }
    s[contextKey] = { map: entry.map || {}, lastUsedAt: now() };
    writeStore(s);
    return false;
  }

  function detach(containerEl){
    if (containerEl && containerEl._cookTaskHandler) {
      containerEl.removeEventListener('change', containerEl._cookTaskHandler);
      delete containerEl._cookTaskHandler;
    }
  }

  function attachTaskCheckboxBinding(containerEl, contextKey){
    if (!containerEl || !contextKey) return;
    ensureFresh(contextKey);

    const inputs = Array.from(containerEl.querySelectorAll('input.md-task'));
    const saved = getContext(contextKey);

    inputs.forEach((inp, idx) => {
      if (!inp.dataset.taskIndex) inp.dataset.taskIndex = String(idx);
      const i = inp.dataset.taskIndex;
      if (Object.prototype.hasOwnProperty.call(saved, i)) {
        inp.checked = !!saved[i];
      }
    });

    const onChange = (ev) => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (!t.classList.contains('md-task')) return;
      const i = t.dataset.taskIndex || "0";
      const map = getContext(contextKey);
      map[i] = !!t.checked;
      setContext(contextKey, map);
    };

    detach(containerEl);
    containerEl.addEventListener('change', onChange);
    containerEl._cookTaskHandler = onChange;

    return () => detach(containerEl);
  }

  if (bc) { bc.onmessage = () => {}; }

  window.cookSession = { attachTaskCheckboxBinding, clearContext };
})();
