/*
  Kaufland PWA — Modular Refactor Scaffold
  This file is a placeholder. Move code here from index.html as planned.
  Vanilla JS modules only. No external libs.
*/

// Purpose: Recipe → List conversion modal.
// import { parseQtyParts, scaleQtyStr, addQtyStr } from '../utils/quantities.js';
export function openAddToListModal(){ /* TODO */ }
export function closeAddToListModal(){ /* TODO */ }
/*
  Recipes → Add to List modal
  Listens for `recipes:add-to-list` from reciperender.js and opens a servings-scaling modal.
  Merges scaled ingredient quantities into List with unit-aware addition, then commits a Firestore batch.

  Depends on globals provided in bootstrap:
    - db, household, showToast, setActiveTab
    - lastSnapshotItems, scheduleRenderItems, findExistingItem
*/

(function(){
  if (window.__addToListModalReady) return;
  window.__addToListModalReady = true;

  const $ = (id) => document.getElementById(id);
  const toast = (m) => { try { window.showToast?.(m); } catch{} };
  const ts = () => (window.firebase?.firestore?.FieldValue?.serverTimestamp?.()) || null;

  // Parse "number + tail" e.g. "200 g", "0.5kg", "3,5 l"
  function splitNumTail(s){
    const v = String(s || "").trim();
    const m = v.match(/^([+-]?\d+(?:[.,]\d+)?)(.*)$/);
    if (!m) return null;
    const num = parseFloat(m[1].replace(",", "."));
    if (!isFinite(num)) return null;
    const tail = (m[2] || "").trim();
    return { num, tail };
  }
  function fmt(n){
    if (!isFinite(n)) return "";
    const r = Math.round(n * 100) / 100;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    // Use comma as decimal if original had comma often; keep simple here
    return String(r).replace(".", ",");
  }
  function scaleQtyStr(qty, factor){
    const v = String(qty || "").trim();
    if (!v) return "";
    const p = splitNumTail(v);
    if (!p) return v; // free text stays as-is
    const scaled = p.num * factor;
    if (!isFinite(scaled)) return v;
    const numStr = fmt(scaled);
    return p.tail ? (numStr + (p.tail.startsWith(" ") ? "" : " ") + p.tail) : numStr;
  }
  // Merge with unit awareness. Sum numbers only when the unit tail text matches exactly.
  function mergeQtyUnitAware(a, b){
    const A = String(a || "").trim();
    const B = String(b || "").trim();
    if (!A) return B;
    if (!B) return A;

    const parts = (str) => String(str).split("+").map(x => x.trim()).filter(Boolean);

    const sums = Object.create(null); // tail -> sum
    const order = [];                 // first-seen order of numeric unit tails
    const extras = [];                // free-text parts

    function ingest(part){
      const p = splitNumTail(part);
      if (!p) { extras.push(part); return; }
      const key = p.tail; // exact unit text
      if (!(key in sums)) { sums[key] = 0; order.push(key); }
      sums[key] += p.num;
    }
    parts(A).forEach(ingest);
    parts(B).forEach(ingest);

    const out = [];
    for (const key of order){
      const sum = sums[key];
      if (!sum) continue; // drop zeros
      const numStr = fmt(sum);
      out.push(key ? (numStr + (key.startsWith(" ") ? "" : " ") + key) : numStr);
    }
    out.push(...extras);
    return out.join(" + ");
  }

  // DOM
  function ensureModal(){
    let modal = $("addToListModal");
    if (modal) return modal;

    // minimal styles
    if (!$("atlStyles")) {
      const st = document.createElement("style");
      st.id = "atlStyles";
      st.textContent = `
      #addToListModal{position:fixed;inset:0;display:none;place-items:center;background:color-mix(in oklab, var(--surface), rgba(0,0,0,35));z-index:20000;padding:16px}
      #addToListModal .sheet{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-lg);padding:14px;max-width:560px;width:min(560px, 92vw)}
      #atlList{display:grid;grid-template-columns:auto 1fr auto;gap:6px;max-height:45vh;overflow:auto;border-top:1px solid var(--border);padding-top:8px}
      #atlList div:last-child{text-align:right}
      #atlTitle{font-weight:700;margin-bottom:6px}
      `;

      document.head.appendChild(st);
    }

      modal = document.createElement("div");
    modal.id = "addToListModal";
    modal.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="atlTitle">
        <div id="atlTitle" class="h">Add to list</div>
        <div class="row" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
          <label for="atlServings" style="white-space:nowrap">Servings</label>
          <button id="atlMinus" type="button" aria-label="Decrease servings" style="width:36px;height:36px;border:1px solid var(--border);border-radius:10px">−</button>
          <input id="atlServings" type="number" min="1" step="1" value="1" style="width:92px;text-align:center">
          <button id="atlPlus" type="button" aria-label="Increase servings" style="width:36px;height:36px;border:1px solid var(--border);border-radius:10px">+</button>
          <div id="atlBaseNote" class="muted" style="margin-left:auto;"></div>
        </div>
        <div id="atlList"></div>
        <div class="row" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:12px;">
          <button id="atlClearAll" type="button" aria-label="Clear all checkboxes">Clear All</button>
          <button id="atlCancel" type="button">Cancel</button>
          <button id="atlConfirm" type="button" class="primary">Add all to shopping</button>
        </div>
      </div>
    `;
    modal.addEventListener("click", (e)=>{ if (e.target === modal) close(); });
    document.body.appendChild(modal);
    return modal;

  }

  let current = { recipe:null, base:1, servings:1, factor:1, rows:[] };

  function open(recipe){
    const modal = ensureModal();
    current.recipe = recipe || {};
    const base = Number(current.recipe?.basePortions ?? current.recipe?.portions) || 1;
    current.base = Math.max(1, base);
    current.servings = current.base;
    current.factor = current.servings / current.base;

    $("atlTitle").textContent = `Add “${String(current.recipe?.name || current.recipe?.title || "Recipe") }”`;
    $("atlBaseNote").textContent = `(base: ${current.base})`;
    $("atlServings").value = String(current.servings);

    renderRows();

    modal.style.display = "grid";
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open");

    if (!modal.__wired){
      modal.__wired = true;
      $("atlCancel")?.addEventListener("click", close);
      $("atlConfirm")?.addEventListener("click", onConfirm);
      $("atlServings")?.addEventListener("input", ()=>{
        const n = Math.max(1, parseInt($("atlServings").value || "1", 10) || 1);
        current.servings = n;
        current.factor = n / current.base;
        renderRows();
      });
      $("atlMinus")?.addEventListener("click", ()=>{
        const el = $("atlServings"); if (!el) return;
        const cur = parseInt(el.value || "1", 10) || 1;
        const next = Math.max(1, cur - 1);
        if (next !== cur) {
          el.value = String(next);
          el.dispatchEvent(new Event("input", { bubbles:true }));
        }
      });
      $("atlPlus")?.addEventListener("click", ()=>{
		const el = $("atlServings"); if (!el) return;
        const cur = parseInt(el.value || "1", 10) || 1;
        const next = cur + 1;
        el.value = String(next);
        el.dispatchEvent(new Event("input", { bubbles:true }));
      });
      $("atlClearAll")?.addEventListener("click", ()=>{
        const list = $("atlList");
        if (!list) return;
        const inputs = list.querySelectorAll('input[type="checkbox"]');
        inputs.forEach(cb => { cb.checked = false; });
        if (Array.isArray(current.rows)) current.rows.forEach(r => { r.selected = false; });
      });
      window.addEventListener("keydown", (e)=>{ if (e.key === "Escape") close(); });
    }


  }

  function close(){
    const modal = $("addToListModal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open");
  }

  function renderRows(){
    const list = $("atlList"); if (!list) return;
    list.innerHTML = "";
    const ings = Array.isArray(current.recipe?.ingredients) ? current.recipe.ingredients : [];
    current.rows = ings.map(ing => {
      const name = String(ing?.name || "").trim();
      const qty  = String(ing?.qty  || "").trim();
      const scaled = scaleQtyStr(qty, current.factor);
      return { name, qty: scaled, selected: true };
    }).filter(r => r.name);

    for (const r of current.rows){
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!r.selected;
      cb.setAttribute("aria-label", `Select ${r.name}`);
      cb.addEventListener("change", () => { r.selected = cb.checked; });

      const name = document.createElement("div"); name.textContent = r.name;
      const qty  = document.createElement("div"); qty.textContent  = r.qty;

      list.appendChild(cb);
      list.appendChild(name);
      list.appendChild(qty);
    }
  }

  async function onConfirm(){
    try {
      const hh = String(window.household || "").trim();
      const fs = window.db;
      if (!hh) { toast("Set household in Options"); return; }
      if (!fs) { toast("Firestore not initialized"); return; }

      const col = fs.collection("lists").doc(hh).collection("items");
      const batch = fs.batch();

      const existing = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
      const updates = []; // { obj, prev }
      const inserts = []; // optimistic new items to append

      for (const r of current.rows){
        if (!r.selected) continue;
        const key = String(r.name || "").toLowerCase();

        // Prefer project helper if present
        const found = (typeof window.findExistingItem === "function")
          ? window.findExistingItem(key)
          : existing.find(x => ((x.nameKey || x.name || "").toLowerCase() === key));

        if (found) {
          const prev = {
            qty: String(found.qty || "").trim(),
            checked: !!found.checked,
            checkedAt: found.checkedAt ?? null
          };
          const nextQty = mergeQtyUnitAware(prev.qty, r.qty);

          // optimistic local update
          found.qty = nextQty;
          found.checked = false;
          try { delete found.qtyBeforeCheck; } catch {}
          found.checkedAt = null;
          updates.push({ obj: found, prev });

          batch.set(col.doc(String(found.id)), {
            qty: nextQty,
            checked: false,
            checkedAt: null,
            addedToShoppingAt: ts(),
            updatedAt: ts()
          }, { merge:true });
        } else {
          const ref = col.doc();
          const nowMs = Date.now();

          // Optimistic object uses client clocks for immediate render
          const optimistic = {
            id: ref.id,
            name: r.name,
            nameKey: key,
            qty: r.qty,
            size: "",
            checked: false,
            createdAt: { _client: nowMs },
            updatedAt: { _client: nowMs }
          };
          inserts.push(optimistic);

          // Server write uses server timestamps
          const writePatch = {
            id: ref.id,
            name: r.name,
            nameKey: key,
            qty: r.qty,
            size: "",
            checked: false,
            createdAt: ts(),
            updatedAt: ts()
          };
          batch.set(ref, writePatch, { merge:true });
        }
      }

      // Optimistic UI: append new items and render before commit
      if (inserts.length){
        if (Array.isArray(window.lastSnapshotItems)) {
          window.lastSnapshotItems.push(...inserts);
        } else {
          window.lastSnapshotItems = [...existing, ...inserts];
        }
      }
      try { if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(window.lastSnapshotItems || existing); } catch {}

      // Close immediately and switch tab
      try { window.setActiveTab?.("shopping"); } catch {}
      close();
      toast("Adding…");

      // Background commit
      batch.commit().then(()=>{
        toast("Added to shopping");
      }).catch((e)=>{
        console.warn("Add to list failed", e);
        // Revert optimistic inserts
        try{
          if (Array.isArray(window.lastSnapshotItems)) {
            const ids = new Set(inserts.map(x => x.id));
            window.lastSnapshotItems = window.lastSnapshotItems.filter(it => !ids.has(it?.id));
          }
          // Revert optimistic updates
          for (const u of updates){
            u.obj.qty = u.prev.qty;
            u.obj.checked = u.prev.checked;
            u.obj.checkedAt = u.prev.checkedAt;
          }
          if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(window.lastSnapshotItems || existing);
        }catch{}
        toast("Add failed");
      });
    } catch (e) {
      console.warn("Add to list failed", e);
      toast("Add failed");
    }
  }



  // Open from recipe rows
  document.addEventListener("recipes:add-to-list", (e) => {
    try {
      const recipe = e?.detail?.recipe || null;
      if (!recipe) return;
      open(recipe);
    } catch (err) { console.warn("open add-to-list failed", err); }
  }, { passive:true });

})();
