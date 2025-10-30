/*
  Recipes module — renderer bridge + editor UI wiring
  - Defines window.setRecipesAndRepaint(arr)
  - Flushes any pending snapshot set by dataSync.subscribeRecipes()
  - Caches to localStorage.cache_recipes for fast boot
  - Reattaches collapsible behavior for Tags, Ingredients, and Steps sections
*/

export function initRecipes() {
  // Define renderer bridge once
  if (typeof window.setRecipesAndRepaint !== "function") {
    window.setRecipesAndRepaint = function setRecipesAndRepaint(arr) {
      try { window.lastSnapshotRecipes = Array.isArray(arr) ? arr : []; } catch {}
      try { localStorage.setItem("cache_recipes", JSON.stringify(window.lastSnapshotRecipes || [])); } catch {}

      // Update header counter
      try {
        const el = document.getElementById("recipesCount");
        if (el) {
          const n = (window.lastSnapshotRecipes || []).length;
          el.textContent = String(n);
        }
      } catch {}


      // Prefer scheduler if present, else direct renderer
      try {
        if (typeof window.scheduleRenderRecipes === "function") {
          window.scheduleRenderRecipes(window.lastSnapshotRecipes);
        } else if (typeof window.renderRecipes === "function") {
          window.renderRecipes(window.lastSnapshotRecipes);
        }
      } catch (e) {
        console.warn("recipes: paint failed", e);
      }
    };

  }

  // If dataSync queued a snapshot before renderer existed, flush it now
  try {
    if (window.__recipesPending) {
      const arr = Array.isArray(window.__recipesPending) ? window.__recipesPending : [];
      delete window.__recipesPending;
      window.setRecipesAndRepaint(arr);
    }
  } catch {}

  // --- Collapsible sections wiring (migrated from inline IIFEs) ---
  function wireCollapsible(sectionId, caretId, storageKey) {
    const wrap = document.getElementById(sectionId);
    if (!wrap || wrap._collapsibleInit) return;
    wrap._collapsibleInit = true;

    const caret = document.getElementById(caretId);

    // Restore last-open state
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "0") wrap.removeAttribute("open");
      if (saved === "1") wrap.setAttribute("open", "");
    } catch {}

    const updateCaret = () => {
      if (!caret) return;
      caret.style.transform = wrap.hasAttribute("open") ? "rotate(0deg)" : "rotate(-90deg)";
    };

    updateCaret();

    wrap.addEventListener("toggle", () => {
      updateCaret();
      try { localStorage.setItem(storageKey, wrap.hasAttribute("open") ? "1" : "0"); } catch {}
    });
  }

  function wireRecipeEditorCollapsibles() {
    // Tags
    wireCollapsible("rmTagsWrap", "rmTagsCaret", "rmTags.open");
    // Ingredients
    wireCollapsible("rmIngredientsWrap", "rmIngredientsCaret", "rmIngredients.open");
    // Steps
    wireCollapsible("rmSteps", "rmStepsCaret", "rmSteps.open");
  }

  // Run once on DOM ready and also whenever the modal opens later
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireRecipeEditorCollapsibles, { once: true });
  } else {
    wireRecipeEditorCollapsibles();
  }

  // If another part of the app opens the recipe editor dynamically, expose a hook
   window.__wireRecipeEditorCollapsibles = wireRecipeEditorCollapsibles;

  // --- Recipe editor: open/close + prefill + minimal rows ---
  try {
    const $ = (id) => document.getElementById(id);

    const modal         = $("recipeModal");
    const openBtn       = $("btnOpenAddRecipe");
    const closeBtn      = $("rmClose");
    const saveBtn       = $("rmSave");
    const rmDelete      = $("rmDelete");

    // Containers
    const ingListEl     = $("rmIngredients");
    const addIngBtn     = $("rmAddIngredient");
    const stepsListEl   = $("rmStepsList");
    const addStepBtn    = $("rmAddStep");

// Cover bits
    const coverPreview  = $("rmCoverPreview");
    const coverRemove   = $("rmCoverRemove");
    const coverName     = $("rmCoverName");
    const coverBtn      = $("rmCoverBtn");

    function setCoverFromFile(file){
      if (!(file instanceof File)) return;
      const localUrl = URL.createObjectURL(file);
      if (coverPreview) {
        coverPreview.src = localUrl;
        coverPreview.style.display = "block";
      }
      if (coverRemove) coverRemove.style.display = "";
      if (coverName) coverName.textContent = String(file.name || "photo");
      try { document.getElementById("recipeModal")?.removeAttribute("data-cover-removed"); } catch {}
      if (coverBtn) coverBtn.textContent = "Change cover photo";
      markDirty?.();
    }

    // Add / Change
    if (coverBtn && !coverBtn._wired) {
      coverBtn._wired = true;
      coverBtn.addEventListener("click", async () => {
        try {
          const file = await (window.openPhotoPicker?.({}) || Promise.resolve(null));
          if (file) setCoverFromFile(file);
        } catch (e) { console.warn("cover pick failed", e); }
      });
    }

    // Tap image to change as well
    if (coverPreview && !coverPreview._wiredPick) {
      coverPreview._wiredPick = true;
      coverPreview.addEventListener("click", async () => {
        try {
          const file = await (window.openPhotoPicker?.({}) || Promise.resolve(null));
          if (file) setCoverFromFile(file);
        } catch (e) { console.warn("cover pick failed", e); }
      });
    }

    // Remove
    if (coverRemove && !coverRemove._wired) {
      coverRemove._wired = true;
      coverRemove.addEventListener("click", () => {
        try { coverPreview?.removeAttribute("src"); } catch {}
        if (coverPreview) coverPreview.style.display = "none";
        if (coverName) coverName.textContent = "";
        const modalEl = document.getElementById("recipeModal");
        if (modalEl) modalEl.setAttribute("data-cover-removed", "1");
        if (coverRemove) coverRemove.style.display = "none";
        if (coverBtn) coverBtn.textContent = "Add cover photo";
        markDirty?.();
      });
    }


    // Dirty state toggles Save/Close label
    let recipeDirty = false;
    function updateSaveUi() {
      if (!saveBtn) return;
      saveBtn.textContent = recipeDirty ? "Save" : "Close";
      saveBtn.classList.toggle("btn-pink", !!recipeDirty);
    }
    function markDirty() {
      if (!recipeDirty) { recipeDirty = true; updateSaveUi(); }
    }
    if (modal) {
      modal.addEventListener("input", markDirty, true);
      modal.addEventListener("change", markDirty, true);
    }

// ---------- Tags: selected + common, both clickable ----------
const tagsRow = $("rmTags");

function getCommonTags() {
  const src = Array.isArray(window.lastSnapshotRecipes) ? window.lastSnapshotRecipes : [];
  const counts = new Map();
  for (const r of src) {
    const arr = Array.isArray(r?.tags) ? r.tags : [];
    for (const tRaw of arr) {
      const t = String(tRaw || "").trim().toLowerCase();
      if (!t) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30);
}


function renderTagsUI(preset = []) {
  if (!tagsRow) return;
  const selected = new Set((Array.isArray(preset) ? preset : []).map(s => String(s).toLowerCase()));

  tagsRow.innerHTML = "";

  // Count badge
  const badge = document.createElement("span");
  badge.className = "pill muted";
  badge.textContent = `${selected.size} tags`;
  tagsRow.appendChild(badge);

  // Selected chips (click to remove)
  if (selected.size) {
    const selWrap = document.createElement("div");
    selWrap.className = "tagchips selected";
    selected.forEach(t => {
      const chip = document.createElement("span");
      chip.className = "tagchip active";
      chip.dataset.role = "selected";
      chip.dataset.tag = t;
      chip.title = "Click to remove";
      chip.textContent = t;
      selWrap.appendChild(chip);
    });
    tagsRow.appendChild(selWrap);
  }

  // Common tags (click to add), excluding already selected
  const commons = getCommonTags().filter(([t]) => !selected.has(t));
  const commonWrap = document.createElement("div");
  commonWrap.className = "tagchips common";
  const label = document.createElement("div");
  label.className = "muted";
  label.textContent = "Common tags:";
  commonWrap.appendChild(label);

  commons.forEach(([t, n]) => {
    const chip = document.createElement("span");
    chip.className = "tagchip";
    chip.dataset.role = "common";
    chip.dataset.tag = t;
    chip.title = "Click to add";
    chip.textContent = `${t} (${n})`;
    commonWrap.appendChild(chip);
  });
  tagsRow.appendChild(commonWrap);
}


// One-time click wiring for add/remove
if (tagsRow && !tagsRow._wiredClicks) {
  tagsRow._wiredClicks = true;
  tagsRow.addEventListener("click", (e) => {
    const chip = e.target.closest(".tagchip");
    if (!chip) return;

    const role = chip.dataset.role;
    const t = chip.dataset.tag || chip.textContent;

    // Current selected set from DOM
    const current = new Set(
      Array.from(tagsRow.querySelectorAll(".tagchip.active"))
        .map(c => c.dataset.tag || c.textContent)
    );

    if (role === "common") {
      current.add(t);
      renderTagsUI([...current]);
      markDirty();
    } else if (role === "selected") {
      current.delete(t);
      renderTagsUI([...current]);
      markDirty();
    }
  });

  // Wire "Add tag" button and Enter key to add a custom tag
  const tagInput = document.getElementById("rmTagInput");
  const tagAdd   = document.getElementById("rmAddTag");

  if (tagAdd && !tagAdd._wired) {
    tagAdd._wired = true;
    tagAdd.addEventListener("click", () => {
      const v = String(tagInput?.value || "").trim().toLowerCase();
      if (!v) return;

      const current = new Set(
        Array.from(tagsRow.querySelectorAll(".tagchip.active"))
          .map(c => c.dataset.tag || c.textContent)
      );
      if (!current.has(v)) {
        current.add(v);
        renderTagsUI([...current]);
        try { markDirty(); } catch {}
      }
      if (tagInput) tagInput.value = "";
      try { tagInput?.focus(); } catch {}
    });
  }

  if (tagInput && !tagInput._wiredEnter) {
    tagInput._wiredEnter = true;
    tagInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); tagAdd?.click(); }
    });
  }
}



    // ---------- Ingredients ----------
    function createIngRow(prefill = null) {
      const row = document.createElement("div");
      row.className = "ing-row";
      row.innerHTML = `
        <div class="ing-name-wrap" style="position:relative;">
          <textarea class="ing-name" placeholder="Ingredient name"></textarea>
        </div>
        <input class="ing-qty"  type="text" placeholder="Qty" />
        <input class="ing-size" type="text" placeholder="Size" />
        <div></div>
        <div class="ing-notes-wrap" style="position:relative;">
          <textarea class="ing-notes" placeholder="Notes"></textarea>
        </div>
        <button class="ing-del" type="button" title="Remove">✕</button>
      `;

      // Prefill values
      if (prefill) {
        if (prefill.name  != null) row.querySelector(".ing-name").value  = String(prefill.name);
        if (prefill.qty   != null) row.querySelector(".ing-qty").value   = String(prefill.qty);
        if (prefill.size  != null) row.querySelector(".ing-size").value  = String(prefill.size);
        if (prefill.notes != null) row.querySelector(".ing-notes").value = String(prefill.notes);
      }

      // Helpers for approval tagging
      function getApprovalTag() {
        try {
          const email =
            (window.auth && window.auth.currentUser && window.auth.currentUser.email) ||
            window.currentUserEmail ||
            (typeof window.firebase?.auth === "function" ? window.firebase.auth()?.currentUser?.email : "") ||
            "";
          const uname = String(email).split("@")[0] || "";
          if (!uname) return "";
          return `${uname.toLowerCase()} approved`;
        } catch { return ""; }
      }

      function addApprovalTag() {
        const t = getApprovalTag();
        if (!t) return;
        const tagsRow = document.getElementById("rmTags");
        if (!tagsRow) return;

        const current = new Set(
          Array.from(tagsRow.querySelectorAll(".tagchip.active"))
            .map(c => c.dataset.tag || c.textContent)
        );
        if (!current.has(t)) {
          current.add(t);
          try { renderTagsUI([...current]); } catch {}
          try { markDirty(); } catch {}
        }
      }

       // Treat the entire row as the invisible button area.
      // Click: focus name textarea.
      // Long-press (500ms): add "<user> approved" tag, then focus name.
      (function wireRowPressArea(container) {
        const nameArea  = container.querySelector(".ing-name");
        let timer = 0;
        let fired = false;
        let downOnInteractive = false;

        // Make long-press reliable without breaking text inputs
        try {
          container.style.touchAction = "manipulation";
          container.style.webkitTouchCallout = "none";
          container.style.userSelect = "none";
          container.querySelectorAll("input, textarea, select").forEach((el) => {
            el.style.userSelect = "text";
            el.style.webkitTouchCallout = "default";
          });
        } catch {}

        const isInteractive = (el) => {
          return !!el.closest("button, input, textarea, select, .ing-del");
        };

        const onDown = (e) => {
          // Ignore non-primary buttons and non-primary pointers
          if ((typeof e.button === "number" && e.button !== 0) || e.isPrimary === false) return;

          downOnInteractive = isInteractive(e.target);
          if (downOnInteractive) return;

          // Suppress Chrome's long-press context menu
          try { e.preventDefault(); } catch {}

          fired = false;
          clearTimeout(timer);
          timer = setTimeout(() => {
            fired = true;
            addApprovalTag();
            try { nameArea?.focus(); } catch {}
          }, 500);
        };

        const cancel = () => {
          clearTimeout(timer);
        };

        const onUp = (e) => {
          clearTimeout(timer);
          if (downOnInteractive) return; // let native control handle it
          if (fired) {
            // Long-press already handled; block stray click
            try { e.preventDefault(); e.stopPropagation(); } catch {}
            return;
          }
          // Short tap → focus name
          try { nameArea?.focus(); } catch {}
        };

        // Block OS/browser context menu when pressing the row background
        container.addEventListener("contextmenu", (e) => {
          if (!isInteractive(e.target)) {
            try { e.preventDefault(); e.stopPropagation(); } catch {}
          }
        }, { passive: false });

        container.addEventListener("pointerdown", onDown, { passive: false });
        container.addEventListener("pointerup", onUp, { passive: false });
        container.addEventListener("pointercancel", cancel, { passive: true });
        container.addEventListener("pointerleave", cancel, { passive: true });
      })(row);


      // Delete unchanged
      row.querySelector(".ing-del").addEventListener("click", () => { row.remove(); markDirty(); });

      return row;
    }


    // expose for import JSON or other modules
    window.createIngRow = createIngRow;

    if (ingListEl) {
      ingListEl.addEventListener("click", (e) => {
        if (e.target.closest(".ing-del")) { /* handled on row */ }
      });
    }
    if (addIngBtn) addIngBtn.addEventListener("click", () => {
      if (!ingListEl) return;
      const row = createIngRow();
      ingListEl.appendChild(row);
      markDirty();
      const first = row.querySelector(".ing-name"); if (first) first.focus();
    });

    // ---------- Steps ----------
    function createStepRow(prefill = null) {
      const row = document.createElement("div");
      row.className = "step-row";
      row.innerHTML = `
        <div class="step-header" style="display:flex;align-items:center;gap:8px;">
          <div class="step-title" style="font-weight:600;">Step</div>
          <button type="button" class="step-del" title="Remove">✕</button>
        </div>
        <div class="step-body">
          <div class="step-toolbar" style="display:flex;gap:6px;margin-bottom:6px;">
            <button type="button" class="step-btn-checkbox" title="Insert checkbox [ ]">☑︎</button>
            <button type="button" class="step-btn-bullet" title="Insert bullet - ">•</button>
            <button type="button" class="step-btn-bold" title="Bold **selection**">B</button>
            <button type="button" class="step-btn-italic" title="Italic *selection*"><i>I</i></button>
          </div>
          <textarea class="step-text" placeholder="Write the instruction…"></textarea>
          <input class="step-timer" type="text" placeholder="Timer (sec or mm:ss)" />
        </div>
      `;

      const ta = row.querySelector(".step-text");

      function wrapSelection(startTok, endTok) {
        const s = ta.selectionStart ?? 0;
        const e = ta.selectionEnd ?? 0;
        const val = ta.value || "";
        const before = val.slice(0, s);
        const sel = val.slice(s, e);
        const after = val.slice(e);
        ta.value = before + startTok + sel + endTok + after;
        const caret = (before + startTok + sel + endTok).length;
        ta.focus();
        try { ta.setSelectionRange(caret, caret); } catch {}
        markDirty?.();
      }

      function prefixLines(prefix) {
        const s = ta.selectionStart ?? 0;
        const e = ta.selectionEnd ?? 0;
        const val = ta.value || "";
        // Expand to full lines
        const ls = val.lastIndexOf("\n", Math.max(0, s - 1)) + 1;
        const le = (val.indexOf("\n", e) === -1) ? val.length : val.indexOf("\n", e);
        const block = val.slice(ls, le);
        const updated = block.split("\n").map(line => {
          // Avoid double prefixing if already present
          if (prefix === "- " && line.startsWith("- ")) return line;
          if (prefix === "[ ] " && line.startsWith("[ ] ")) return line;
          return prefix + line;
        }).join("\n");
        ta.value = val.slice(0, ls) + updated + val.slice(le);
        const caret = ls + updated.length;
        ta.focus();
        try { ta.setSelectionRange(caret, caret); } catch {}
        markDirty?.();
      }

      const tb = row.querySelector(".step-body");

      tb.querySelector(".step-btn-bold")  .addEventListener("click", () => wrapSelection("**", "**"));
      tb.querySelector(".step-btn-italic").addEventListener("click", () => wrapSelection("*", "*"));
      tb.querySelector(".step-btn-bullet").addEventListener("click", () => prefixLines("- "));
      // Checkbox is just "[ ] " at the start of the line as requested
      tb.querySelector(".step-btn-checkbox").addEventListener("click", () => prefixLines("[ ] "));

      if (prefill) {
        if (prefill.text != null) ta.value = String(prefill.text);
        const ti = row.querySelector(".step-timer");
        if (prefill.timerSec != null && prefill.timerSec !== "") {
          ti.value = String(prefill.timerSec);
        } else if (prefill.timerSeconds != null) {
          ti.value = String(prefill.timerSeconds);
        }
      }

      row.querySelector(".step-del").addEventListener("click", () => { row.remove(); markDirty(); });
      return row;
    }

    function addStepRow(prefill = null) {
      if (!stepsListEl) return;
      const row = createStepRow(prefill);
      stepsListEl.appendChild(row);
      markDirty();
      return row;
    }
    window.addStepRow = addStepRow;

    // ---------- Open/close ----------
    function openRecipeModal(idOrMode, data = null) {
      const isAddMode = (idOrMode === "add");
      const recipe = data || null;

      // Query modal at call-time to avoid stale/null capture
      const modalEl = document.getElementById("recipeModal");
      if (!modalEl) { console.warn("recipeModal not found"); return; }

      // Track current editing id for Save handler
      modalEl.dataset.id = isAddMode ? "" : (recipe && recipe.id ? String(recipe.id) : "");

            $("rmTitle").textContent = isAddMode ? "Add Recipe" : "Edit Recipe";
      if (rmDelete) rmDelete.style.display = isAddMode ? "none" : "";
      // Clear remix mode flags
      try {
        delete modalEl.dataset.mode;
        delete modalEl.dataset.remixBaseId;
        delete modalEl.dataset.remixLabel;
      } catch {}


      // Reset dirty state and button label
      recipeDirty = false; updateSaveUi();

      // Prefill meta
      $("rmName").value = recipe && recipe.name ? String(recipe.name) : "";
      $("rmBasePortions").value = recipe && (recipe.basePortions ?? recipe.portions) ? String(recipe.basePortions ?? recipe.portions) : "";

      // Tags
      renderTagsUI(Array.isArray(recipe?.tags) ? recipe.tags : []);

      // Cover preview + remove button
      if (coverPreview) {
        const url = recipe && recipe.coverUrl ? String(recipe.coverUrl) : "";
        if (url) {
          coverPreview.src = url;
          coverPreview.style.display = "block";
          if (coverRemove) coverRemove.style.display = "";
          if (coverBtn)    coverBtn.textContent = "Change cover photo";
        } else {
          try { coverPreview.removeAttribute("src"); } catch {}
          coverPreview.style.display = "none";
          if (coverRemove) coverRemove.style.display = "none";
          if (coverBtn)    coverBtn.textContent = "Add cover photo";
        }
        // clear any previous "removed" flag
        try { modalEl.removeAttribute("data-cover-removed"); } catch {}
      }
      if (coverName) coverName.textContent = "";

      // Ingredients
      if (ingListEl) {
        ingListEl.innerHTML = "";
        const list = Array.isArray(recipe?.ingredients) && recipe.ingredients.length
          ? recipe.ingredients
          : [{ name: "", qty: "", size: "", notes: "" }];
        list.forEach(ing => ingListEl.appendChild(createIngRow(ing)));
      }

      // Steps
      if (stepsListEl) {
        stepsListEl.innerHTML = "";
        const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
        steps.forEach(s => addStepRow({ text: s?.text || "", timerSec: s?.timerSeconds || s?.timerSec || "" }));
      }

      // Collapse all sections on open and sync carets
      try {
        ["rmIngredientsWrap","rmSteps","rmTagsWrap"].forEach(id => { const el = $(id); if (el) el.removeAttribute("open"); });
        ["rmIngredientsCaret","rmStepsCaret","rmTagsCaret"].forEach(id => { const c = $(id); if (c) c.style.transform = "rotate(-90deg)"; });
        if (typeof window.__wireRecipeEditorCollapsibles === "function") window.__wireRecipeEditorCollapsibles();
      } catch {}

      // Show modal
      modalEl.classList.add("show");
      document.body.classList.add("modal-open");
      modalEl.setAttribute("aria-hidden", "false");
    }



    function closeModal() {
      const modalEl = document.getElementById("recipeModal");
      if (!modalEl) return;
      modalEl.classList.remove("show");
      document.body.classList.remove("modal-open");
      modalEl.setAttribute("aria-hidden", "true");
    }


    // Expose globals for other modules (renderer calls this)
    window.openRecipeModal  = openRecipeModal;
    window.closeRecipeModal = closeModal;
    // Handle "Remix" action from renderer
    document.addEventListener("recipes:remix", async (e) => {
      try {
        const base = e?.detail?.recipe || null;
        if (!base || !base.id) return;
        const label = prompt("Remix label (e.g., “Spicy”):", "Spicy") || "Remix";
        // Open editor seeded with base, but set remix mode flags
        openRecipeModal(base.id, base);
        const modalEl = document.getElementById("recipeModal");
        if (modalEl) {
          modalEl.dataset.mode = "remix";
          modalEl.dataset.remixBaseId = String(base.id);
          modalEl.dataset.remixLabel = label;
          // Update title to indicate remix
          const t = document.getElementById("rmTitle");
          if (t) t.textContent = `Remix: ${base.name || base.id}`;
        }
      } catch (err) {
        console.warn("remix flow failed", err);
      }
    }, { passive: true });

    // Wire buttons (delegated so late-created Add button works)
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.id === "btnOpenAddRecipe") {
        try { openRecipeModal("add"); } catch (err) { console.warn("open add failed", err); }
      }
    }, { passive: true });

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (addStepBtn) addStepBtn.addEventListener("click", () => addStepRow());

       if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
  try {
    const toast = (msg) => { try { window.showToast?.(msg); } catch {} };


    // Validate Firestore availability
    const hh = String(window.household || "").trim();
    if (!hh) { toast("Set household in Options"); return; }

    const fs = (window.db && typeof window.db.collection === "function") ? window.db : null;
    if (!fs) { toast("Firestore not initialized"); return; }

    // Collect fields
    const nameEl = document.getElementById("rmName");
    const portionsEl = document.getElementById("rmBasePortions");
    const coverEl = document.getElementById("rmCoverPreview");
    const modalEl = document.getElementById("recipeModal");
    const coverRemoved = !!(modalEl && modalEl.getAttribute("data-cover-removed") === "1");

    const name = String(nameEl?.value || "").trim();
    if (!name) { toast("Name is required"); nameEl?.focus(); return; }

    const basePortionsStr = String(portionsEl?.value ?? "").trim();
    const basePortions = basePortionsStr ? Math.max(0, parseInt(basePortionsStr, 10) || 0) : 0;

    // only include valid cover URLs
    let coverUrl = "";
    if (coverEl && coverEl.getAttribute("src")) {
      const src = String(coverEl.getAttribute("src") || "").trim();
      if (/^(https?:|blob:|data:image\/)/.test(src)) coverUrl = src;
    }

    // Tags: from active chips
    const tags = Array.from(document.querySelectorAll("#rmTags .tagchip.active"))
      .map(el => String(el.textContent || "").trim().toLowerCase())
      .filter(Boolean);

    // Ingredients
    const ingredients = Array.from(document.querySelectorAll("#rmIngredients .ing-row")).map(row => {
      const get = (sel) => String(row.querySelector(sel)?.value || "").trim();
      return {
        name: get(".ing-name"),
        qty: get(".ing-qty"),
        size: get(".ing-size"),
        notes: get(".ing-notes")
      };
    }).filter(r => r.name || r.qty || r.size || r.notes);

    // Steps with timer parsing
    const parseTimer = (s) => {
      const v = String(s || "").trim();
      if (!v) return "";
      if (/^\d+$/.test(v)) return parseInt(v, 10);
      const m = v.match(/^(\d+):([0-5]?\d)$/);
      if (m) return (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
      return "";
    };
    const steps = Array.from(document.querySelectorAll("#rmStepsList .step-row")).map(row => {
      const text = String(row.querySelector(".step-text")?.value || "").trim();
      const timerSeconds = parseTimer(row.querySelector(".step-timer")?.value || "");
      const out = { text };
      if (timerSeconds !== "") out.timerSeconds = timerSeconds;
      return out;
    }).filter(s => s.text);

    // Target ref
    const col = fs.collection("recipes").doc(hh).collection("recipes"); 
    const sharedCol = fs.collection("recipes").doc("_shared").collection("recipes");
    let id = String(modalEl?.dataset?.id || "").trim();
    const creating = !id;
    const ref = creating ? col.doc() : col.doc(id);
    if (creating) id = ref.id;

    const now = Date.now();

    // build data object
    const data = {
      id,
      name,
      basePortions,
      tags,
      ingredients,
      steps,
      updatedAt: now
    };

    // cover field logic: prefer delete when removed, else include when present
    if (coverRemoved) {
      const del = (window.firebase?.firestore?.FieldValue?.delete?.());
      if (del !== undefined) data.coverUrl = del;
      else data.coverUrl = ""; // fallback
    } else if (coverUrl) {
      data.coverUrl = coverUrl;
    }

    if (creating) data.createdAt = now;

    // scrub undefined recursively (ignore non-plain objects)
    const scrub = (v) => {
      if (Array.isArray(v)) return v.map(scrub).filter(x => x !== undefined);
      if (v && typeof v === "object" && v.constructor === Object) {
        const o = {};
        Object.keys(v).forEach(k => {
          const sv = scrub(v[k]);
          if (sv !== undefined) o[k] = sv;
        });
        return o;
      }
      return v === undefined ? undefined : v;
    };
    const clean = scrub(data);

    // ---- Optimistic cache update + repaint ----
    const prev = Array.isArray(window.lastSnapshotRecipes) ? window.lastSnapshotRecipes.slice() : [];
    const optimistic = { ...data, _syncing: true };
    try {
      const next = prev.slice();
      const idx = next.findIndex(r => String(r?.id || "") === id);
      if (idx >= 0) next[idx] = { ...next[idx], ...optimistic };
      else next.unshift(optimistic);
      window.lastSnapshotRecipes = next;
      try { localStorage.setItem("cache_recipes", JSON.stringify(next)); } catch {}

      // Update header counter
      try {
        const el = document.getElementById("recipesCount");
        if (el) el.textContent = String(next.length);
      } catch {}

      window.scheduleRenderRecipes?.(next);
    } catch {}

    // Close immediately and notify
    if (typeof closeModal === "function") closeModal();
    toast("Saving…");

        // ---- Firestore write in background ----
    try {

     // Remix mode: write a version under shared/_shared and set selectedVersionId in household
     const modalEl = document.getElementById("recipeModal");
     const mode = String(modalEl?.dataset?.mode || "");
     if (mode === "remix") {
       const baseId = String(modalEl?.dataset?.remixBaseId || id || "").trim();
       const label = String(modalEl?.dataset?.remixLabel || "").trim() || "Remix";
       const versionId = (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));

       // Compute a minimal diff vs canonical shared doc
       const baseSnap = await sharedCol.doc(baseId).get();
       const base = baseSnap.exists ? (baseSnap.data() || {}) : {};
       const diff = {};
       for (const k of ["name","basePortions","tags","ingredients","steps","coverUrl","desc"]) {
         const a = base?.[k];
         const b = clean?.[k];
         if (JSON.stringify(a) !== JSON.stringify(b)) diff[k] = b;
       }

       // Create version
       await sharedCol.doc(baseId).collection("versions").doc(versionId).set({
         authorUid: window.auth?.currentUser?.uid || "",
         label,
         baseVersionId: "original",
         diff,
         fullSnapshot: clean,
         createdAt: now,
         updatedAt: now,
       }, { merge: true });

       // Set household selection
       await ref.set({ selectedVersionId: versionId, updatedAt: now }, { merge: true });

     } else {
       // Normal create/update path
       await ref.set(clean, { merge: true });

       // Also mirror to shared library with the same id
       try {
         const sharedRef = sharedCol.doc(id);
         const sharedData = {
           ...clean,
           ownerUid: window.auth?.currentUser?.uid || "",
           originHousehold: hh,
           originRecipeId: id,
           visibility: "public",
           updatedAt: now
         };
         await sharedRef.set(sharedData, { merge: true });
       } catch (e) {
         console.warn("Shared publish failed", e);
       }
     }




      // Clear syncing flag in cache
      const cur = Array.isArray(window.lastSnapshotRecipes) ? window.lastSnapshotRecipes.slice() : [];
      const j = cur.findIndex(r => String(r?.id || "") === id);
      if (j >= 0) {
        const cleaned = { ...cur[j] };
        try { delete cleaned._syncing; } catch {}
        cur[j] = cleaned;
        window.lastSnapshotRecipes = cur;
        try { localStorage.setItem("cache_recipes", JSON.stringify(cur)); } catch {}
        // Header count unchanged
        window.scheduleRenderRecipes?.(cur);
      }
      toast("Saved");
    } catch (err) {
      console.warn("Save recipe failed", err);
      // ---- Roll back cache and UI ----
      try {
        window.lastSnapshotRecipes = prev;
        try { localStorage.setItem("cache_recipes", JSON.stringify(prev)); } catch {}
        try {
          const el = document.getElementById("recipesCount");
          if (el) el.textContent = String(prev.length);
        } catch {}
        window.scheduleRenderRecipes?.(prev);
      } catch {}
      toast("Save failed. Reverted.");
    }
  } catch (e) {
    console.warn("Save recipe failed", e);
    try { window.showToast?.("Save failed"); } catch {}
  }
});


    }
    // --- Delete recipe ---
if (rmDelete) {
  rmDelete.addEventListener("click", async () => {
    try {
      const toast = (msg) => { try { window.showToast?.(msg); } catch {} };

      // Confirm
      if (!window.confirm("Delete this recipe?")) return;

      const modal = document.getElementById("recipeModal");
      const id = String(modal?.dataset?.id || "").trim();
      if (!id) { toast("No recipe id"); return; }

      const hh = String(window.household || "").trim();
      if (!hh) { toast("Set household in Options"); return; }

      const fs = (window.db && typeof window.db.collection === "function") ? window.db : null;
      if (!fs) { toast("Firestore not initialized"); return; }

      // --- Optimistic remove from cache + repaint ---
      const prev = Array.isArray(window.lastSnapshotRecipes) ? window.lastSnapshotRecipes.slice() : [];
      let next = prev.filter(r => String(r?.id || "") !== id);
      try {
        window.lastSnapshotRecipes = next;
        try { localStorage.setItem("cache_recipes", JSON.stringify(next)); } catch {}
        // Update header counter
        try {
          const el = document.getElementById("recipesCount");
          if (el) el.textContent = String(next.length);
        } catch {}
        window.scheduleRenderRecipes?.(next);
      } catch {}

      // Close immediately and notify
      if (typeof closeModal === "function") closeModal();
      toast("Deleting…");

          // --- Firestore delete in background ---
      try {
        // Delete household copy only
        await fs.collection("recipes").doc(hh).collection("recipes").doc(id).delete();

        // If a shared doc exists and it has any versions, archive instead of delete
        try {
          const sharedRef = fs.collection("recipes").doc("_shared").collection("recipes").doc(id);
          const sharedSnap = await sharedRef.get();
          if (sharedSnap.exists) {
            const verSnap = await sharedRef.collection("versions").limit(1).get();
            if (!verSnap.empty) {
              await sharedRef.set({
                visibility: "archived",
                deletedAt: Date.now(),
                updatedAt: Date.now()
              }, { merge: true });
            }
            // If no versions, leave shared as-is by default
          }
        } catch (e) {
          console.warn("Shared archive check failed", e);
        }

        toast("Deleted");
      } catch (err) {


        console.warn("Delete recipe failed", err);
        // --- Roll back cache and UI ---
        try {
          window.lastSnapshotRecipes = prev;
          try { localStorage.setItem("cache_recipes", JSON.stringify(prev)); } catch {}
          try {
            const el = document.getElementById("recipesCount");
            if (el) el.textContent = String(prev.length);
          } catch {}
          window.scheduleRenderRecipes?.(prev);
        } catch {}
        toast("Delete failed. Restored.");
      }
    } catch (e) {
      console.warn("Delete recipe failed", e);
      try { window.showToast?.("Delete failed"); } catch {}
    }
  });
}


  } catch (e) {
    console.warn("recipe modal wiring failed", e);
  }
}


