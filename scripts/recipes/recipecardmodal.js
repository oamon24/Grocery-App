/*
  Recipe card modal wiring
  Wires existing #recipeModal in addrecipes.html:
  - Save button shows "Close" until any change, then "Save"
  - Save writes to /recipes/{household}/recipes/{id}
  - Delete removes the doc when editing
  - Exposes window.openRecipeModal(id, recipe)
*/

(function () {
const $id = (s) => document.getElementById(s);
  const str = (v) => String(v ?? "").trim();

  function serverTS() {
    const fv = window.firebase?.firestore?.FieldValue;
    return fv?.serverTimestamp ? fv.serverTimestamp() : new Date();
  }

  function recipesCol() {
    const db = window.db;
    const hh = str(window.household || "");
    if (!db || !hh) throw new Error("Firestore or household not ready");
    // Path used by subscribeRecipes()
    return db.collection("recipes").doc(hh).collection("recipes");
  }

  function ensureModal() { return document.getElementById("recipeModal"); }

  function openUI(m) {
    m.classList.add("show");
    m.setAttribute("aria-hidden", "false");
    try { document.body.classList.add("modal-open"); } catch {}
  }

  function closeUI(m) {
    m.classList.remove("show");
    m.setAttribute("aria-hidden", "true");
    try { document.body.classList.remove("modal-open"); } catch {}
    document.dispatchEvent(new CustomEvent("recipes:closed"));
  }

function readTags(modal) {
  return Array.from(modal.querySelectorAll("#rmTags .tagchip.active"))
    .map(el => str(el.textContent))
    .filter(Boolean);
}


function buildState(modal) {
  const name = str($id("rmName", modal)?.value);
  const baseRaw = str($id("rmBasePortions", modal)?.value);
  const basePortions = baseRaw ? Number(baseRaw) : undefined;

  const ingredients = Array.from(modal.querySelectorAll("#rmIngredients .ing-row")).map(row => {
    const get = (sel) => str(row.querySelector(sel)?.value);
    const obj = { name: get(".ing-name"), qty: get(".ing-qty"), size: get(".ing-size"), notes: get(".ing-notes") };
    // drop empty rows
    return (obj.name || obj.qty || obj.size || obj.notes) ? obj : null;
  }).filter(Boolean);

  function toSec(v) {
    const s = str(v);
    if (!s) return "";
    if (/^\d+:\d{1,2}$/.test(s)) {
      const [m, sec] = s.split(":").map(n => parseInt(n, 10) || 0);
      return m * 60 + sec;
    }
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : "";
  }
  const steps = Array.from(modal.querySelectorAll("#rmStepsList .step-row")).map(row => {
    const text = str(row.querySelector(".step-text")?.value);
    const tval = str(row.querySelector(".step-timer")?.value);
    if (!text && !tval) return null;
    const timerSeconds = toSec(tval);
    return timerSeconds === "" ? { text } : { text, timerSeconds };
  }).filter(Boolean);

  const coverImg = $id("rmCoverPreview", modal);
  const photoUrl = (coverImg && coverImg.style.display !== "none" && str(coverImg.src)) ? coverImg.src : "";

  const tags = readTags(modal);

  return {
    title: name || "Untitled",
    name: name || "Untitled",
    basePortions,
    tags,
    ingredients,
    steps,
    photoUrl
  };
}


  function updateSaveButton(modal) {
    const btn = $id("rmSave", modal);
    if (!btn) return;
    if (modal.__dirty) {
      btn.textContent = "Save";
      btn.classList.add("primary");
      btn.title = "Save changes";
    } else {
      btn.textContent = "Close";
      btn.classList.remove("primary");
      btn.title = "Close";
    }
  }

  function markDirty(modal) {
    const now = JSON.stringify(buildState(modal));
    modal.__dirty = (now !== modal.__baseline);
    updateSaveButton(modal);
  }

function addTagChip(modal, tag) {
  const v = str(tag);
  if (!v) return;
  const wrap = $id("rmTags", modal);
  if (!wrap) return;
  // Use same markup as existing UI
  if (Array.from(wrap.querySelectorAll(".tagchip.active")).some(el => str(el.textContent) === v)) return;
  const chip = document.createElement("span");
  chip.className = "tagchip active";
  chip.textContent = v;
  wrap.appendChild(chip);
  markDirty(modal);
}



function addIngredientRow(modal, prefill = null) {
  const wrap = $id("rmIngredients", modal);
  if (!wrap) return;
  const row = document.createElement("div");
  row.className = "ing-row";
  row.innerHTML = `
    <div class="ing-name-wrap" style="position:relative;">
      <textarea class="ing-name" placeholder="Ingredient name"></textarea>
    </div>
    <input class="ing-qty"  type="text" placeholder="Qty" />
    <input class="ing-size" type="text" placeholder="Size" />
    <div></div>
    <textarea class="ing-notes" placeholder="Notes"></textarea>
    <button class="ing-del" type="button" title="Remove">✕</button>
  `;
  if (prefill) {
    if (prefill.name  != null) row.querySelector(".ing-name").value  = String(prefill.name);
    if (prefill.qty   != null) row.querySelector(".ing-qty").value   = String(prefill.qty);
    if (prefill.size  != null) row.querySelector(".ing-size").value  = String(prefill.size);
    if (prefill.notes != null) row.querySelector(".ing-notes").value = String(prefill.notes);
  }
  row.querySelector(".ing-del").addEventListener("click", () => { row.remove(); markDirty(modal); });
  row.addEventListener("input", () => markDirty(modal), true);
  wrap.appendChild(row);
}


function addStepRow(modal, prefill = null) {
  const wrap = $id("rmStepsList", modal);
  if (!wrap) return;
  const row = document.createElement("div");
  row.className = "step-row";
  row.innerHTML = `
    <div class="step-header" style="display:flex;align-items:center;gap:8px;">
      <div class="step-title" style="font-weight:600;">Step</div>
      <button type="button" class="step-del" title="Remove">✕</button>
    </div>
    <div class="step-body">
      <textarea class="step-text" placeholder="Write the instruction…"></textarea>
      <input class="step-timer" type="text" placeholder="Timer (sec or mm:ss)" />
    </div>
  `;
  if (prefill) {
    if (prefill.text != null) row.querySelector(".step-text").value = String(prefill.text);
    const t = prefill.timerSec ?? prefill.timerSeconds;
    if (t != null && t !== "") row.querySelector(".step-timer").value = String(t);
  }
  row.querySelector(".step-del").addEventListener("click", () => { row.remove(); markDirty(modal); });
  row.addEventListener("input", () => markDirty(modal), true);
  wrap.appendChild(row);
}


  function setState(modal, recipe) {
    const r = recipe || {};

    const titleEl = $id("rmTitle", modal);
    if (titleEl) titleEl.textContent = r?.id ? "Edit Recipe" : "Add Recipe";

    const nameEl = $id("rmName", modal);
    if (nameEl) nameEl.value = str(r.title || r.name);

    const baseEl = $id("rmBasePortions", modal);
    if (baseEl) baseEl.value = (r.basePortions ?? r.portions ?? "") || "";

    // Cover
    const imgUrl = str(r.photoUrl || r.imageUrl || r.coverUrl || r.image);
    const coverImg = $id("rmCoverPreview", modal);
    const coverName = $id("rmCoverName", modal);
    const coverRem = $id("rmCoverRemove", modal);
    const coverBtn = $id("rmCoverBtn", modal);
    if (coverImg) {
      if (imgUrl) { coverImg.src = imgUrl; coverImg.style.display = ""; }
      else { coverImg.removeAttribute("src"); coverImg.style.display = "none"; }
    }
    if (coverName) coverName.textContent = imgUrl ? "Existing cover" : "";
    if (coverRem) {
      coverRem.style.display = imgUrl ? "" : "none";
      coverRem.onclick = () => {
        if (coverImg) { coverImg.removeAttribute("src"); coverImg.style.display = "none"; }
        if (coverName) coverName.textContent = "";
        coverRem.style.display = "none";
        markDirty(modal);
      };
    }
    if (coverBtn) coverBtn.onclick = () => { window.showToast?.("Cover picker not wired"); };

    // Tags
    const tagsWrap = $id("rmTags", modal);
    if (tagsWrap) tagsWrap.innerHTML = "";
    const tags = Array.isArray(r.tags) ? r.tags : (typeof r.tags === "string" ? r.tags.split(",") : []);
    for (const t of tags) addTagChip(modal, t);

    const tagInput = $id("rmTagInput", modal);
    const tagAdd = $id("rmAddTag", modal);
    if (tagAdd) tagAdd.onclick = () => {
      const v = str(tagInput?.value);
      if (!v) return;
      addTagChip(modal, v);
      if (tagInput) tagInput.value = "";
      markDirty(modal);
    };
    if (tagInput) tagInput.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); tagAdd?.click(); }
    };

   // Ingredients
const ingWrap = $id("rmIngredients", modal);
if (ingWrap) ingWrap.innerHTML = "";
const ings = Array.isArray(r.ingredients) ? r.ingredients : [];
if (ings.length) {
  for (const ing of ings) {
    const pre = {
      name: String(ing?.name ?? ing ?? ""),
      qty:  String(ing?.qty  ?? ""),
      size: String(ing?.size ?? ""),
      notes:String(ing?.notes?? "")
    };
    addIngredientRow(modal, pre);
  }
} else {
  addIngredientRow(modal, { name: "", qty: "", size: "", notes: "" });
}
const addIng = $id("rmAddIngredient", modal);
if (addIng) addIng.addEventListener("click", (e) => {
  e.preventDefault(); e.stopImmediatePropagation();
  addIngredientRow(modal, { name: "", qty: "", size: "", notes: "" });
  markDirty(modal);
}, { capture: true });

// Steps
const stepsWrap = $id("rmStepsList", modal);
if (stepsWrap) stepsWrap.innerHTML = "";
const steps = Array.isArray(r.steps) ? r.steps : [];
for (const s of steps) {
  addStepRow(modal, { text: String(s?.text ?? s ?? ""), timerSec: s?.timerSeconds ?? s?.timerSec ?? "" });
}
const addStep = $id("rmAddStep", modal);
if (addStep) addStep.addEventListener("click", (e) => {
  e.preventDefault(); e.stopImmediatePropagation();
  addStepRow(modal, { text: "", timerSec: "" });
  markDirty(modal);
}, { capture: true });
  }

function wireOnce(modal) {
  if (modal.__wired) return;
  modal.__wired = true;

  modal.addEventListener("input", () => markDirty(modal));
  modal.addEventListener("change", () => markDirty(modal));

  // Capture-phase handlers to block legacy listeners in recipes.js
  const closeBtn = $id("rmClose", modal);
  if (closeBtn) closeBtn.addEventListener("click", (e) => {
    e.preventDefault(); e.stopImmediatePropagation();
    closeUI(modal);
  }, { capture: true });

  const saveBtn = $id("rmSave", modal);
  if (saveBtn) saveBtn.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopImmediatePropagation();
    if (!modal.__dirty) { closeUI(modal); return; }
    const id = str(modal.__editingId || "");
    try {
      const data = buildState(modal);
      const ref = id ? recipesCol().doc(id) : recipesCol().doc();
      const payload = { ...data, updatedAt: serverTS() };
      if (!id) payload.createdAt = serverTS();
      await ref.set(payload, { merge: true });
      window.showToast?.("Recipe saved");
    } catch (e2) {
      console.warn("save recipe failed", e2);
      window.showToast?.("Save failed");
    } finally {
      closeUI(modal);
    }
  }, { capture: true });

  const delBtn = $id("rmDelete", modal);
  if (delBtn) delBtn.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopImmediatePropagation();
    const id = str(modal.__editingId || "");
    if (!id) { closeUI(modal); return; }
    if (!window.confirm?.("Delete this recipe?")) return;
    try {
      await recipesCol().doc(id).delete();
      window.showToast?.("Recipe deleted");
    } catch (e2) {
      console.warn("delete recipe failed", e2);
      window.showToast?.("Delete failed");
    } finally {
      closeUI(modal);
    }
  }, { capture: true });
}


  async function populateAndOpen(modal, id, recipe) {
    wireOnce(modal);
    modal.__editingId = id || "";
    setState(modal, recipe || {});
    modal.__baseline = JSON.stringify(buildState(modal));
    modal.__dirty = false;
    updateSaveButton(modal);

    const delBtn = $id("rmDelete", modal);
    if (delBtn) delBtn.style.display = id ? "" : "none";

    openUI(modal);
  }

window.openRecipeModal = async function (id, recipe) {
  let modal = document.getElementById("recipeModal");
  if (!modal) {
    try {
      const mod = await import("./ui/loadModal.js");
      if (typeof mod.openModal === "function") {
        await mod.openModal("recipeModal", { silent: true });
      } else if (typeof mod.prewarm === "function") {
        await mod.prewarm(["recipeModal"]);
      }
      modal = document.getElementById("recipeModal");
    } catch {}
  }
  if (!modal) { window.showToast?.("Recipe editor unavailable"); return; }
  await populateAndOpen(modal, id, recipe);
};


  document.addEventListener("recipes:edit", (e) => {
    const d = e?.detail || {};
    try { window.openRecipeModal?.(d.id || null, d.recipe || {}); } catch {}
  });

// Auto-wire when modal node or Add button appears
function wireAddButton() {
  const b = document.getElementById("btnOpenAddRecipe");
  if (b && !b.__rmWired) {
    b.__rmWired = true;
    b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopImmediatePropagation();
      try { window.openRecipeModal?.("add"); } catch {}
    }, { capture: true });
  }
}
const mo = new MutationObserver(() => {
  const m = ensureModal();
  if (m) { wireOnce(m); updateSaveButton(m); }
  wireAddButton();
});
mo.observe(document.documentElement, { childList: true, subtree: true });
wireAddButton();
window.__recipesModalObserver = mo;
})();

