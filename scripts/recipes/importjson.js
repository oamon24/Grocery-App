// /recipes/importJson.js
(function () {
  const $ = (id) => document.getElementById(id);
  let wired = false;

  // Parse "1h 20m", "90s", "3m15s", or first number as minutes
  function parseLowerTimeToSeconds(raw) {
    const s = String(raw || "").toLowerCase();
    const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
    const m = s.match(/(\d+(?:\.\d+)?)\s*m/);
    const sec = s.match(/(\d+(?:\.\d+)?)\s*s/);
    if (h || m || sec) {
      const hh = h ? parseFloat(h[1]) : 0;
      const mm = m ? parseFloat(m[1]) : 0;
      const ss = sec ? parseFloat(sec[1]) : 0;
      return Math.max(0, Math.round(hh * 3600 + mm * 60 + ss));
    }
    const num = s.match(/\b(\d+(?:\.\d+)?)\b/);
    if (num) return Math.round(parseFloat(num[1]) * 60);
    return 0;
  }

  function normIng(x) {
    return {
      name:  String(x?.name || "").trim(),
      qty:   String(x?.qty  || "").replace(/\s+/g, ""),
      size:  String(x?.size || "").trim(),
      notes: String(x?.notes|| "").trim(),
    };
  }

  function openAddModal() {
    const addBtn = $("btnOpenAddRecipe");
    if (addBtn) { addBtn.click(); return; }
    if (typeof window.openRecipeModal === "function") { window.openRecipeModal("add"); }
  }

  function fillIngredients(list) {
    const box = $("rmIngredients");
    const addBtn = $("rmAddIngredient");
    if (!box || !addBtn) return;
    box.innerHTML = "";
    const arr = Array.isArray(list) ? list.map(normIng) : [];
    for (const ing of arr.length ? arr : [{ name: "", qty: "", size: "", notes: "" }]) {
      addBtn.click();
      const row = box.lastElementChild;
      if (!row) continue;
      const n = row.querySelector(".ing-name");
      const q = row.querySelector(".ing-qty");
      const s = row.querySelector(".ing-size");
      const nt = row.querySelector(".ing-notes");
      if (n)  n.value  = ing.name;
      if (q)  q.value  = ing.qty;
      if (s)  s.value  = ing.size;
      if (nt) nt.value = ing.notes;
    }
  }

  function fillSteps(list) {
    const box = $("rmStepsList");
    const addBtn = $("rmAddStep");
    if (!box || !addBtn) return;
    box.innerHTML = "";
    const steps = Array.isArray(list) ? list : [];
    for (const s of steps) {
      const text = String(s?.text || "");
      let timerSec = 0;
      if (typeof s?.timerSeconds === "number") timerSec = Math.max(0, s.timerSeconds | 0);
      else if (s?.timerText) timerSec = parseLowerTimeToSeconds(String(s.timerText));
      else timerSec = parseLowerTimeToSeconds(text);

      addBtn.click();
      const row = box.lastElementChild;
      if (!row) continue;
      const ta = row.querySelector(".step-text");
      const mm = row.querySelector(".step-mm");
      const ss = row.querySelector(".step-ss");
      if (ta) ta.value = text;
      if (timerSec > 0) {
        const M = Math.floor(timerSec / 60);
        const S = Math.max(0, Math.min(59, timerSec % 60));
        if (mm) mm.value = String(M);
        if (ss) ss.value = String(S);
      }
    }
    try { if (typeof window.rmSteps_setupDnd === "function") window.rmSteps_setupDnd(); } catch {}
    try { if (typeof window.rmSteps_renumber === "function") window.rmSteps_renumber(); } catch {}
  }

  async function handleFile(file) {
    if (!file) return;
    let text = "";
    try { text = await file.text(); } catch { alert("Failed to read file"); return; }
    let data = null;
    try { data = JSON.parse(text); } catch { alert("Invalid JSON"); return; }
    if (Array.isArray(data)) data = data[0] || {};
    openAddModal();

    // wait for modal DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (data?.name) { const el = $("rmName"); if (el) el.value = String(data.name); }
        if (data?.basePortions != null) {
          const el = $("rmBasePortions");
          if (el) el.value = Math.max(1, parseInt(data.basePortions, 10) || 1);
        }
        fillIngredients(data?.ingredients);
        fillSteps(data?.steps);
        try { if (typeof window.markRecipeDirty === "function") window.markRecipeDirty(); } catch {}
        try { $("rmName")?.focus(); } catch {}
      });
    });
  }

  function ensureFileInput() {
    let input = document.getElementById("importJsonFile");
    if (!input) {
      input = document.createElement("input");
      input.id = "importJsonFile";
      input.type = "file";
      input.accept = "application/json";
      input.style.display = "none";
      document.body.appendChild(input);
    }
    input.onchange = async () => {
      const f = input.files && input.files[0];
      input.value = "";
      await handleFile(f);
    };
    return input;
  }

  function init() {
    if (wired) return;
    const btn = $("importRecipe");
    if (!btn) return;
    if (btn.dataset.importInit === "1") return;
    btn.dataset.importInit = "1";
    const input = ensureFileInput();
    btn.addEventListener("click", () => input.click());
    wired = true;
  }

  // Run once even if DOMContentLoaded is replayed by boot()
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
