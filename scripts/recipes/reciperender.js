/*
  Recipes renderer — flex layout, no shared grid, no reserved image space.
  Row layout:
    [thumb if present]  [content: title, description, tags]  [actions: Edit (top), Add to list (below)]
  Requirements:
    - If no image, no blank space.
    - Actions on far right, stacked. "Add to list" width capped to "Edit".
*/

(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Scaffold ----------
  function ensureScaffold() {
    const view = $("recipesView");
    if (!view) return null;

    // One-time CSS to fix right alignment, vertical stacking, and equal widths
    (function ensureStyles() {
      if (document.getElementById("recipesStyles")) return;
      const style = document.createElement("style");
      style.id = "recipesStyles";
         style.textContent = `
#recipesList{display:flex;flex-direction:column;gap:12px}
.recipe-row{display:flex;align-items:flex-start;gap:12px;flex-wrap:nowrap}
.recipe-row .thumb{width:64px;height:64px;object-fit:cover;border-radius:8px;flex:0 0 auto}
.recipe-row .content{flex:1 1 auto;min-width:0}
.recipe-row .actions{display:flex;flex-direction:column;gap:8px;margin-left:auto;align-items:stretch;flex:0 0 auto}
.recipe-row .actions button{display:inline-flex;align-items:center;justify-content:center;width:100%;box-sizing:border-box;line-height:1.2;white-space:nowrap}
.recipe-row .actions button::before,
.recipe-row .actions button::after{content:none}
.recipes-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.recipes-toolbar .recipes-tags{flex:1 1 220px;min-width:160px}
      `;


      document.head.appendChild(style);
    })();

    let toolbar = view.querySelector('[data-role="recipes-toolbar"]');
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.setAttribute("data-role", "recipes-toolbar");
      toolbar.className = "recipes-toolbar";

      let addBtn = document.getElementById("btnOpenAddRecipe");
      if (!addBtn) {
        addBtn = document.createElement("button");
        addBtn.id = "btnOpenAddRecipe";
        addBtn.type = "button";
        addBtn.className = "primary";
        addBtn.textContent = "Add Recipe";
      }

      // Tag filter bar removed; use top search UI (#rcSearchWrap)
      toolbar.append(addBtn);
      view.appendChild(toolbar);
    }


    // Ensure Import button sits to the right of Add inside the toolbar
    try {
      const addBtn = document.getElementById("btnOpenAddRecipe");
      // Find an existing "Import Recipe" button if it was placed elsewhere in DOM
      const importBtn = Array.from(view.querySelectorAll("button"))
        .find(b => (b.textContent || "").trim() === "Import Recipe");

      const desired = [addBtn, importBtn].filter(Boolean);
      desired.forEach(el => { if (el.parentElement !== toolbar) toolbar.appendChild(el); });
      // Reorder to enforce left-to-right sequence even if already inside toolbar
      desired.forEach(el => toolbar.appendChild(el));
    } catch {}


    let empty = $("recipesEmpty");
    if (!empty) {
      empty = document.createElement("div");
      empty.id = "recipesEmpty";
      empty.className = "recipes-empty";
      empty.textContent = "No recipes yet";
      view.appendChild(empty);
    }

    let list = $("recipesList");
    if (!list) {
      list = document.createElement("div");
      list.id = "recipesList";
      list.className = "recipes-list";
      view.appendChild(list);
    }

    /* recipesTagFilter removed; filtering driven by #rcSearchWrap */


    return { list, empty };
  }



  // ---------- Utilities ----------
  function getSelectedTag() {
    try { return (localStorage.getItem("recipes.filter.tag") || "").trim(); }
    catch { return ""; }
  }

  function getTags(r) {
    const out = [];
    const push = (v) => { const s = String(v || "").trim(); if (s) out.push(s); };
    if (Array.isArray(r?.tags)) r.tags.forEach(push);
    else if (typeof r?.tags === "string") r.tags.split(",").forEach(push);
    if (!out.length && typeof r?.tag === "string") push(r.tag);
    if (!out.length && typeof r?.category === "string") push(r.category);
    return [...new Set(out)];
  }

  const getTitle = (r) => String(r?.title || r?.name || "Untitled");
  const getDesc  = (r) => String(r?.description || r?.desc || r?.summary || r?.notes || "");
  const getImg   = (r) => String(r?.photoUrl || r?.imageUrl || r?.coverUrl || r?.image || "");

  // ---------- Toolbar tag bar (removed) ----------
  function renderTagBar(recipes) { /* removed */ }



  // ---------- Row factory (flex) ----------
  function makeRow(r) {
    const row = document.createElement("div");
    row.className = "recipe-row";
    if (r?.id) row.dataset.id = String(r.id);

    // Optional thumbnail. Do not create when missing.
    const src = getImg(r);
    if (src) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.alt = getTitle(r);
      img.src = src;
      row.appendChild(img);
    }

    // Middle content
    const content = document.createElement("div");
    content.className = "content";

     const title = document.createElement("div");
    title.className = "title";
    title.textContent = getTitle(r);
    if (r && r.sharedOnly) {
      const pill = document.createElement("span");
      pill.textContent = "Shared";
      pill.className = "pill";
      title.appendChild(pill);
    }


    // Portions under title, e.g., "(3 portions)"
    const pVal = (r && (r.basePortions ?? r.portions));
    const pStr = (pVal === 0 || pVal) ? String(pVal).trim() : "";
    if (pStr) {
      const m = document.createElement("div");
      m.className = "portions";
      m.textContent = `(${pStr} portions)`;
      content.appendChild(m);
    }

    const desc = getDesc(r);
    if (desc) {
      const d = document.createElement("div");
      d.className = "desc";
      d.textContent = desc;
      content.appendChild(d);
    }

    const tags = getTags(r);
    if (tags.length) {
      const tagRow = document.createElement("div");
      tagRow.className = "tags";
      for (const t of tags) {
        const chip = document.createElement("span");
        chip.className = "r-tag";
        chip.textContent = t;
        tagRow.appendChild(chip);
      }
      content.appendChild(tagRow);
    }

    // Title should be first inside content
    content.prepend(title);
    row.appendChild(content);

    // Right-side actions: stacked
    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "recipe-edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      try {
        if (typeof window.openRecipeModal === "function") {
          window.openRecipeModal(r?.id || null, r);
        } else {
          document.dispatchEvent(new CustomEvent("recipes:edit", { detail: { id: r?.id || null, recipe: r } }));
        }
      } catch (e) { console.warn("recipes:edit trigger failed", e); }
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "recipe-add";
    addBtn.textContent = "Add to list";
    addBtn.addEventListener("click", () => {
      try {
        document.dispatchEvent(new CustomEvent("recipes:add-to-list", { detail: { id: r?.id || null, recipe: r } }));
      } catch (e) { console.warn("recipes:add-to-list dispatch failed", e); }
    });

        // Remix button for non-owners or shared-only entries
    const uid = window.auth?.currentUser?.uid || "";
    const isOwner = uid && r && r.ownerUid && String(r.ownerUid) === String(uid);
    if (!isOwner) {
      const remixBtn = document.createElement("button");
      remixBtn.type = "button";
      remixBtn.className = "recipe-remix";
      remixBtn.textContent = "Remix";
      remixBtn.addEventListener("click", () => {
        try {
          document.dispatchEvent(new CustomEvent("recipes:remix", { detail: { id: r?.id || null, recipe: r } }));
        } catch (e) { console.warn("recipes:remix dispatch failed", e); }
      });
      actions.appendChild(remixBtn);
    }

    actions.append(editBtn, addBtn);
    row.appendChild(actions);


    // Cap "Add to list" width to the "Edit" button width
    requestAnimationFrame(() => {
      try {
        const w = editBtn.offsetWidth;
        if (w > 0) addBtn.style.maxWidth = w + "px";
      } catch {}
    });

    // ===== Long-press approve → add "<user> approved" tag =====
    (function wireApproveLongPress(target) {
      // Skip if no id
      const rid = String(r?.id || "").trim();
      if (!rid) return;

      // Compute approval tag like in recipes.js editor
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

      // Singleton lightweight popup
      function openApprovePopup(recipe) {
        let pop = document.getElementById("approvePopup");
        if (!pop) {
          pop = document.createElement("div");
          pop.id = "approvePopup";
          pop.className = "modal-lite";
          Object.assign(pop.style, {
            position:"fixed", inset:"0", display:"grid", placeItems:"center",
            background:"color-mix(in oklab, var(--surface), rgba(0,0,0,.35))",
            zIndex:"20000", padding:"16px"
          });
          pop.innerHTML = `
            <div class="sheet" style="background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-md);padding:16px;min-width:260px;max-width:90vw;">
              <div class="h" style="font-weight:700;margin-bottom:8px;">Approve recipe?</div>
              <div class="muted" id="aprvName" style="margin-bottom:12px;"></div>
              <div class="row" style="display:flex;gap:8px;justify-content:flex-end;">
                <button type="button" data-role="cancel">Cancel</button>
                <button type="button" class="primary" data-role="yes">Yes</button>
              </div>
            </div>`;
          document.body.appendChild(pop);
          pop.addEventListener("click", (e) => {
            if (e.target === pop) pop.style.display = "none";
          });
        }
        pop.querySelector("#aprvName").textContent = getTitle(recipe);
        pop.style.display = "grid";

        const yes = pop.querySelector('[data-role="yes"]');
        const cancel = pop.querySelector('[data-role="cancel"]');

        const cleanup = () => {
          yes.onclick = null;
          cancel.onclick = null;
          pop.style.display = "none";
        };

        yes.onclick = async () => {
          try {
            const t = getApprovalTag();
            if (!t) { try { window.showToast?.("No user email"); } catch {} cleanup(); return; }

            const hh = String(window.household || "").trim();
            const fs = (window.db && typeof window.db.collection === "function") ? window.db : null;
            const fv = (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) || null;
            if (!hh || !fs || !fv || !fv.arrayUnion) { try { window.showToast?.("Firestore not initialized"); } catch {} cleanup(); return; }

            await fs.collection("recipes").doc(hh).collection("recipes").doc(rid)
              .set({ tags: fv.arrayUnion(t) }, { merge: true });

            // Optimistic cache update
            try {
              const cached = Array.isArray(window.lastSnapshotRecipes) ? window.lastSnapshotRecipes.slice() : [];
              const idx = cached.findIndex(x => String(x?.id || "") === rid);
              if (idx >= 0) {
                const before = Array.isArray(cached[idx].tags) ? cached[idx].tags : [];
                if (!before.includes(t)) cached[idx] = { ...cached[idx], tags: [...before, t] };
              }
              window.lastSnapshotRecipes = cached;
              try { localStorage.setItem("cache_recipes", JSON.stringify(cached)); } catch {}
              window.scheduleRenderRecipes?.(cached);
            } catch {}

            try { window.showToast?.("Approved"); } catch {}
          } catch (e) {
            console.warn("approve failed", e);
            try { window.showToast?.("Approve failed"); } catch {}
          } finally {
            cleanup();
          }
        };

        cancel.onclick = cleanup;
      }

      // Long-press approve + double-tap Cook Mode on the text content area
      const lpTarget = target || content;

      // Long-press
      let lpTimer = 0;
      let lpFired = false;

      // Double-tap
      const DT_GAP_MS = 300;
      const MOVE_TOL_PX = 24;
      let tap1Time = 0;
      let tap1X = 0, tap1Y = 0;
      let downX = 0, downY = 0;
      let moved = false;

      const ignoreInteractive = (el) => !!el.closest(".actions, button, a");

      const onDown = (e) => {
        if ((typeof e.button === "number" && e.button !== 0) || e.isPrimary === false) return;
        if (ignoreInteractive(e.target)) return;
        try { e.preventDefault(); } catch {}
        // track movement
        downX = Number(e.clientX || 0);
        downY = Number(e.clientY || 0);
        moved = false;

        // schedule long-press
        lpFired = false;
        clearTimeout(lpTimer);
        lpTimer = setTimeout(() => {
          lpFired = true;
          openApprovePopup(r);
        }, 600);
      };

      const onMove = (e) => {
        if (lpTimer) {
          const dx = Number(e.clientX || 0) - downX;
          const dy = Number(e.clientY || 0) - downY;
          if (Math.hypot(dx, dy) > MOVE_TOL_PX) {
            moved = true;
            clearTimeout(lpTimer);
          }
        }
      };

      const onUp = (e) => {
        clearTimeout(lpTimer);

        // If long-press fired, swallow the tap
        if (lpFired) {
          try { e.preventDefault(); e.stopPropagation(); } catch {}
          return;
        }

        // Double-tap detection
        if (ignoreInteractive(e.target) || moved) return;
        const now = e.timeStamp || Date.now();
        const x = Number(e.clientX || 0), y = Number(e.clientY || 0);
        const near = Math.hypot(x - tap1X, y - tap1Y) <= MOVE_TOL_PX;
        const within = now - tap1Time <= DT_GAP_MS;

        if (tap1Time && within && near) {
          // Second tap → open Cook Mode at stored step (open() decides reset rule)
          tap1Time = 0;
          try { e.preventDefault(); e.stopPropagation(); } catch {}
          try { window.cookMode?.open(r); } catch {}
        } else {
          // First tap
          tap1Time = now;
          tap1X = x; tap1Y = y;
        }
      };

      lpTarget.addEventListener("pointerdown", onDown);
      lpTarget.addEventListener("pointermove", onMove);
      lpTarget.addEventListener("pointerup", onUp);
      lpTarget.addEventListener("pointerleave", () => { clearTimeout(lpTimer); });
      lpTarget.addEventListener("pointercancel", () => { clearTimeout(lpTimer); });

      // Desktop fallbacks
      lpTarget.addEventListener("dblclick", (e) => {
        if (ignoreInteractive(e.target)) return;
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        try { window.cookMode?.open(r); } catch {}
      });
      lpTarget.addEventListener("contextmenu", (e) => {
        if (ignoreInteractive(e.target)) return;
        e.preventDefault();
        openApprovePopup(r);
      });

    })(content);

    return row;
  }

  // Sync widths on resize for all rows
  function syncActionWidths() {
    // Buttons now sit inside the card and size naturally.
  }



  // ---------- Render ----------

  // ==== Recipes search state (multi-select tags + name contains + single recipe) ====
  let rcQuery = (function () {
    const base = { tagsMode: "AND", tags: [], name: "", recipeId: "" };
    try {
      const saved = JSON.parse(localStorage.getItem("recipes_query") || "{}");
      if (saved && Array.isArray(saved.tags)) base.tags = saved.tags.map((s) => String(s || "").trim().toLowerCase());
      if (saved && typeof saved.name === "string") base.name = String(saved.name || "").trim().toLowerCase();
      if (saved && typeof saved.recipeId === "string") base.recipeId = String(saved.recipeId || "").trim();
    } catch {}
    return base;
  })();

  function rcSaveQuery() {
    try {
      localStorage.setItem("recipes_query", JSON.stringify({
        tagsMode: rcQuery.tagsMode,
        tags: rcQuery.tags,
        name: rcQuery.name || "",
        recipeId: rcQuery.recipeId || ""
      }));
    } catch {}
  }

  function rcNormTag(s) { return String(s || "").trim().toLowerCase(); }

  function rcBuildTagIndex(arr) {
    const counts = {};
    for (const r of (arr || [])) {
      const tags = getTags(r);
      for (const t of tags) {
        const k = rcNormTag(t);
        if (!k) continue;
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag));
  }

  let rcTagIndex = [];
  let rcAllRecipes = [];


  function rcRenderSearchUI() {
    const $ = (id) => document.getElementById(id);
    const selectedRow = $("rcSelected");
    const topRow = $("rcTopTags");
    const input = $("rcTagInput");
    const ac = $("rcTagAC");
    const clear = $("rcClearBtn");
    if (!selectedRow || !topRow || !input || !ac || !clear) return;

    // Selected chips: recipe (if any), then tags
    selectedRow.innerHTML = "";
    const rid = String(rcQuery.recipeId || "").trim();
    if (rid) {
      const r = (rcAllRecipes || []).find(x => String(x?.id || "") === rid);
      const chip = document.createElement("div");
      chip.className = "tagchip active";
      chip.textContent = r ? getTitle(r) : "Selected recipe";
      chip.title = "Clear recipe selection";
      chip.onclick = () => {
        rcQuery.recipeId = "";
        rcSaveQuery();
        rcRenderSearchUI();
        try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
      };
      selectedRow.appendChild(chip);
    }
    for (const t of rcQuery.tags) {
      const chip = document.createElement("div");
      chip.className = "tagchip active";
      chip.textContent = t;
      chip.title = "Remove";
      chip.onclick = () => {
        rcQuery.tags = rcQuery.tags.filter((x) => x !== t);
        rcSaveQuery();
        rcRenderSearchUI();
        try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
      };
      selectedRow.appendChild(chip);
    }

    // Top 10 common tags with counts
    topRow.innerHTML = "";
    for (const { tag, count } of rcTagIndex.slice(0, 10)) {
      const chip = document.createElement("div");
      chip.className = "preset" + (rcQuery.tags.includes(tag) ? " active" : "");
      chip.textContent = `${tag} (${count})`;
      chip.title = "Add filter";
      chip.onclick = () => {
        const i = rcQuery.tags.indexOf(tag);
        if (i >= 0) rcQuery.tags.splice(i, 1);
        else rcQuery.tags.push(tag);
        rcSaveQuery();
        rcRenderSearchUI();
        try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
      };
      topRow.appendChild(chip);
    }

    // Wire once
    if (!input._wired) {
      input._wired = true;

      input.addEventListener("input", () => {
        const q = String(input.value || "").trim().toLowerCase();
        rcQuery.name = q;
        rcQuery.recipeId = ""; // typing exits single-recipe mode
        rcSaveQuery();

        // Tag suggestions
        const tagSugs = q ? rcTagIndex.map((x) => x.tag).filter((t) => t.startsWith(q) && !rcQuery.tags.includes(t)).slice(0, 8) : [];

        // Recipe suggestions from full cache, by title/name
        const base = Array.isArray(rcAllRecipes) ? rcAllRecipes : [];
        const seen = new Set();
        const nameSugs = q
          ? base
              .map((r) => ({ id: String(r?.id || ""), title: getTitle(r) }))
              .filter((x) => x.id && x.title && x.title.toLowerCase().startsWith(q))
              .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
              .slice(0, 8)
          : [];

        const parts = [];
        // Order: tags first, then recipes
        tagSugs.forEach((s) => parts.push(`<div class="ac-item" role="option" data-tag="${s}"><div>${s}</div></div>`));
        nameSugs.forEach((n) => parts.push(`<div class="ac-item" role="option" data-id="${n.id}"><div>🔎 ${n.title}</div></div>`));

        ac.innerHTML = parts.join("");
        ac.style.display = parts.length ? "block" : "none";

        try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
      });


      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = rcNormTag(input.value);
          if (!v) return;
          if (!rcQuery.tags.includes(v)) rcQuery.tags.push(v);
          rcSaveQuery();
          input.value = "";
          rcQuery.name = "";
          rcQuery.recipeId = "";
          rcSaveQuery();
          ac.style.display = "none";
          ac.innerHTML = "";
          rcRenderSearchUI();
          try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
        }
        if (e.key === "Escape") {
          input.value = "";
          rcQuery.name = "";
          rcQuery.recipeId = "";
          rcSaveQuery();
          ac.style.display = "none";
          ac.innerHTML = "";
          try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
        }
      });

      ac.addEventListener("click", (e) => {
        const el = e.target.closest(".ac-item");
        if (!el) return;
        const t = el.getAttribute("data-tag");
        const id = el.getAttribute("data-id");
        if (t) {
          if (!rcQuery.tags.includes(t)) rcQuery.tags.push(t);
          rcSaveQuery();
          input.value = "";
          rcQuery.name = "";
          rcQuery.recipeId = "";
          rcSaveQuery();
          ac.innerHTML = "";
          ac.style.display = "none";
          rcRenderSearchUI();
          try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
          return;
        }
        if (id) {
          rcQuery.recipeId = String(id);
          input.value = "";
          rcQuery.name = "";
          rcSaveQuery();
          ac.innerHTML = "";
          ac.style.display = "none";
          rcRenderSearchUI();
          try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
        }
      });

      clear.addEventListener("click", () => {
        rcQuery.tags = [];
        rcQuery.name = "";
        rcQuery.recipeId = "";
        rcSaveQuery();
        input.value = "";
        ac.style.display = "none";
        ac.innerHTML = "";
        rcRenderSearchUI();
        try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
      });
    }
  }


  function rcApplyFilters(source) {
    const tags = rcQuery.tags || [];
    const nameQ = rcQuery.name || "";
    const rid = String(rcQuery.recipeId || "").trim();
    let out = Array.isArray(source) ? source : [];

    // single recipe selection overrides other filters
    if (rid) return out.filter((r) => String(r?.id || "") === rid);

    // tag filter (AND)
    if (tags.length) {
      out = out.filter((r) => {
        const rt = getTags(r).map(rcNormTag);
        return tags.every((t) => rt.includes(t));
      });
    }

    // name prefix filter (title||name only)
    if (nameQ) {
      out = out.filter((r) => {
        const nl = getTitle(r).toLowerCase();
        return nl.startsWith(nameQ);
      });
    }

    return out;
  }


  function renderList(recipes) {
    const ctx = ensureScaffold();
    if (!ctx) return;
    const { list, empty } = ctx;

    const filtered = Array.isArray(recipes) ? recipes : [];

    list.innerHTML = "";
    if (!filtered.length) {
      empty.style.display = "";
      return;
    }
    empty.style.display = "none";

    for (const r of filtered) list.appendChild(makeRow(r));

    requestAnimationFrame(syncActionWidths);
  }


  function renderRecipes(recipes) {
    const arr = Array.isArray(recipes) ? recipes : [];
    rcAllRecipes = arr;

    // Update rc tag index and UI, then apply rc filters
    rcTagIndex = rcBuildTagIndex(arr);
    rcRenderSearchUI();
    const rcFiltered = rcApplyFilters(arr);

    // Render list with rc filters
    renderList(rcFiltered);
  }



  let _raf = 0, _pending = null;
  function scheduleRenderRecipes(recipes) {
    _pending = Array.isArray(recipes) ? recipes : [];
    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(() => {
      _raf = 0;
      try { renderRecipes(_pending || []); } catch (e) { console.warn("renderRecipes failed", e); }
    });
  }

  window.renderRecipes = renderRecipes;
  window.scheduleRenderRecipes = scheduleRenderRecipes;

  // First paint from cache if available
  try {
    const cached = JSON.parse(localStorage.getItem("cache_recipes") || "[]");
    if (Array.isArray(cached) && cached.length) scheduleRenderRecipes(cached);
  } catch {}

  // Repaint on tab switch to Recipes
  document.addEventListener("ui:tab-changed", (e) => {
    if ((e?.detail || "") === "recipes") {
      try { scheduleRenderRecipes(rcAllRecipes || []); } catch {}
    }
  });

  // Keep button width cap in sync
  window.addEventListener("resize", () => requestAnimationFrame(syncActionWidths));
  window.addEventListener("load", () => requestAnimationFrame(syncActionWidths));
})();
