/*
  Kaufland PWA — Add-Item Autocomplete + Staged Card
  - Data: lists/{household}/items
  - Match: word-start only (token startsWith), case-insensitive
  - UI: suggestions render compact item previews (no checkbox, no gear)
  - Select: creates a staged item card above the "Show items" row
  - Staged card: behaves like list rows, checkbox hidden, gear kept, "Add" button commits
*/

export function initAddItemAutocomplete(){
  const nameInput   = document.getElementById("itemName");
  const acList      = document.getElementById("autoList");
  const listSection = document.getElementById("listSection");
  const anchorRow   = document.getElementById("toggleListItemsRow");
  const addBtn      = document.getElementById("add");

  if (!nameInput || !acList || !listSection || !anchorRow || !addBtn) return;

  // ------ Live cache (onSnapshot) ------
  const cacheKey = "itemNameCache:v1";
  let cache = loadCache();
   let unsubscribe = null;
  let firstResolve = null;
  const firstSnapshotReady = new Promise((resolve)=> { firstResolve = resolve; });

  // Local cache for NEW staged item photos (tmp-* only)
  const stagedPhotoCache = new Map();
  function _revokeAndDeleteTmpPhoto(tmpId){
    try{
      const entry = stagedPhotoCache.get(tmpId);
      if (entry && entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    }catch(_){}
    stagedPhotoCache.delete(tmpId);
  }

  function loadCache(){
    try { return JSON.parse(localStorage.getItem(cacheKey)) || { ts:0, items:[] }; }
    catch{ return { ts:0, items:[] }; }
  }
  function saveCache(next){
    try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch {}
  }

  function subscribeLive(){
    if (unsubscribe || !window.db || !window.household) return;
    const col = window.db.collection("lists").doc(window.household).collection("items");
    unsubscribe = col.onSnapshot(
      (snap)=>{
        const items = [];
        snap.forEach((d)=>{
          const it = d.data() || {};
          it.id = d.id;
          items.push({
            id: it.id,
            name: it.name || "",
            qty: it.qty || "",
            size: it.size || "",
            notes: it.notes || "",
            category: it.category || "",
            routeOrder: it.routeOrder,
            photoUrl: it.photoUrl || "",
            checked: !!it.checked
          });
        });
        cache = { ts: Date.now(), items };
        saveCache(cache);
        if (firstResolve){ firstResolve(true); firstResolve = null; }
      },
      (err)=>{
        console.error("subscribeLive", err);
      }
    );
  }

  // Start live subscription immediately
  subscribeLive();


  // ------ Matching ------
  function tokenize(s){
    return String(s||"").toLowerCase().split(/[^a-z0-9äöüß]+/i).filter(Boolean);
  }
  function wordsStartWith(text, query){
    if (!query) return false;
    const q = query.toLowerCase();
    const words = tokenize(text);
    for (let w of words){ if (w.startsWith(q)) return true; }
    return false;
  }
  function rankItem(it, q){
    // Boost exact prefix on first word
    const words = tokenize(it.name);
    const ql = q.toLowerCase();
    const pos = words.findIndex(w => w.startsWith(ql));
    return pos < 0 ? 999 : pos; // lower is better
  }
  function filterItems(all, q){
    const qtrim = String(q||"").trim();
    if (!qtrim) return [];
    const matches = all.filter(it => wordsStartWith(it.name, qtrim));
    matches.sort((a,b)=> rankItem(a,qtrim)-rankItem(b,qtrim) || a.name.localeCompare(b.name));
    return matches.slice(0, 8);
  }

  // ------ Suggestion rendering ------
  function clearAC(){ acList.innerHTML = ""; acList.style.display = "none"; acActive = -1; }
  function showAC(){ acList.style.display = "block"; }
  function renderPreview(it){
    const row = document.createElement("div");
    row.className = "ac-item";
    // Compact item preview layout
    const wrap = document.createElement("div");
    wrap.className = "item-preview";
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "36px 1fr";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "center";

    // thumb or camera icon placeholder
    const imgWrap = document.createElement("div");
    imgWrap.style.width = "36px";
    imgWrap.style.height = "36px";
    imgWrap.style.borderRadius = "8px";
    imgWrap.style.overflow = "hidden";
    imgWrap.style.border = "1px solid var(--border)";
    if (it.photoUrl){
      const img = document.createElement("img");
      img.src = it.photoUrl;
      img.alt = it.name || "photo";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      imgWrap.appendChild(img);
    } else {
      imgWrap.style.display = "grid";
      imgWrap.style.placeItems = "center";
      imgWrap.textContent = "📷";
      imgWrap.style.fontSize = "16px";
    }

    const right = document.createElement("div");
    right.style.display = "grid";
    right.style.gap = "2px";

    const line1 = document.createElement("div");
    line1.style.display = "flex";
    line1.style.alignItems = "center";
    line1.style.gap = "6px";

    const catdot = document.createElement("span");
    catdot.className = "catdot";
    catdot.style.width = "8px";
    catdot.style.height = "8px";
    catdot.style.borderRadius = "999px";
    catdot.style.display = "inline-block";
    catdot.style.background = "currentColor";
    catdot.style.opacity = "0.5";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = it.name || "";

    // route flag if missing
    const missing = (it.routeOrder === undefined || it.routeOrder === null || it.routeOrder === "" || isNaN(parseFloat(it.routeOrder)));
    if (missing){
      const flag = document.createElement("span");
      flag.textContent = " 🚩";
      flag.title = "No route number set";
      flag.style.color = "red";
      title.appendChild(flag);
    }

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.style.fontSize = "12px";
    meta.style.opacity = "0.9";
    meta.textContent = [it.qty||"", it.size||""].filter(Boolean).join(" · ");

    const line2 = document.createElement("div");
    line2.className = "line2";
    line2.style.fontSize = "12px";
    line2.style.opacity = "0.8";
    line2.textContent = it.notes || "";

    line1.append(catdot, title, meta);
    right.append(line1, line2);

    wrap.append(imgWrap, right);
    row.appendChild(wrap);
    return row;
  }

  // ------ Staged card handling ------
   function removeStaged(){
    // Remove the overlay card
    const old = listSection.querySelector(".staged-card");
    // capture tmp id before removal for cache cleanup
    const tmpId = old ? String(old.getAttribute("data-item-id") || "") : "";
    if (old) old.remove();

    // Teardown listeners and restore container positioning
    try {
      if (typeof listSection._stagedCleanup === "function") {
        listSection._stagedCleanup();
        listSection._stagedCleanup = null;
      }
      const prev = listSection.getAttribute("data-prev-position");
      if (prev !== null) {
        if (prev) listSection.style.position = prev;
        else listSection.style.removeProperty("position");
        listSection.removeAttribute("data-prev-position");
      }
    } catch {}

    // Cleanup staged photo cache for NEW items only
    try {
      if (tmpId && tmpId.startsWith("tmp-")) _revokeAndDeleteTmpPhoto(tmpId);
    } catch {}
  }


   function createStaged(it){
    removeStaged();

    // Render with existing row renderer for full behavior
    let itemRow;
    try {
      if (typeof window.renderRow === "function"){
        itemRow = window.renderRow(it);
      }
    } catch(e){ console.error(e); }

    const card = document.createElement("div");
    card.className = "staged-card";
    card.setAttribute("data-item-id", String(it.id || ""));
    // Overlay styling: anchor under the input area wrapper
    card.style.position = "fixed";
    card.style.left = "0";
    card.style.right = "0";
    card.style.width = "100%";
    card.style.maxWidth = "100%";
    card.style.zIndex = "1000";
    card.style.border = "1px solid var(--border)";
    card.style.borderRadius = "0";
    card.style.padding = "12px";
    card.style.background = "var(--surface)";
    card.style.boxShadow = "var(--shadow-md)";



    // Hide checkbox in staged row
    if (itemRow){
      itemRow.classList.add("staged");
      const cb = itemRow.querySelector('.left input[type="checkbox"]');
      if (cb) cb.style.display = "none";
      card.appendChild(itemRow);
    } else {
      const fallback = document.createElement("div");
      fallback.textContent = it.name || "";
      card.appendChild(fallback);
    }

    // Add button (top-right)
    const commitBtn = document.createElement("button");
    commitBtn.type = "button";

    const isExisting = it.id && !String(it.id).startsWith("tmp-");
    commitBtn.textContent = isExisting ? "Update" : "Add";
    commitBtn.title = isExisting ? "Save changes" : "Add to list";

    commitBtn.style.position = "absolute";
    commitBtn.style.top = "8px";
    commitBtn.style.right = "8px";
    commitBtn.className = "primary";

    commitBtn.addEventListener("click", async (e) => {
      try { e.preventDefault(); e.stopPropagation(); } catch {}

      try {
        const col = window.db.collection("lists").doc(window.household).collection("items");

        // Collect current field values from staged card
        const cardEl = commitBtn.closest(".staged-card");
        // Do not fall back to .editable-text, it matches qty/size editors
        const nameEl = cardEl?.querySelector('[data-field="name"]') || null;
        const qtyEl = cardEl?.querySelector('[data-field="qty"]') || null;
        const sizeEl = cardEl?.querySelector('[data-field="size"]') || null;

        const notesEl = cardEl?.querySelector('[data-field="notes"]') || null;
        const catEl = cardEl?.querySelector('[data-field="category"]') || null;
        const routeEl = cardEl?.querySelector('[data-field="routeOrder"]') || null;

        const name = String(nameEl?.textContent || nameEl?.value || it.name || "").trim();
        const qty = String(qtyEl?.textContent || qtyEl?.value || it.qty || "").trim();
        const size = String(sizeEl?.textContent || sizeEl?.value || it.size || "").trim();
        const notes = String(notesEl?.textContent || notesEl?.value || it.notes || "").trim();
        const category = String(catEl?.textContent || catEl?.value || it.category || "").trim();
        const routeOrder = routeEl
          ? parseFloat(routeEl.textContent || routeEl.value)
          : it.routeOrder ?? null;

        const data = {
          name,
          qty,
          size,
          notes,
          category,
          routeOrder: isNaN(routeOrder) ? null : routeOrder,
          checked: false,
          // carry staged photo fields if user added one before commit
          photoUrl: it.photoUrl || "",
          photoPath: it.photoPath || "",
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        };

        let ref;
        let isNew = false;

        if (it.id && !String(it.id).startsWith("tmp-")) {
          // Existing item path unchanged
          ref = col.doc(String(it.id));
          await ref.set(data, { merge: true });
        } else {
          // New item: create doc id first so Storage path can include it
          ref = col.doc();
          isNew = true;

          // If a staged photo was cached for this tmp id, upload now
          const cacheEntry = stagedPhotoCache.get(String(it.id || ""));
          if (cacheEntry && cacheEntry.blob && window.firebase?.storage) {
            try {
              const fileExt = (cacheEntry.filename || "").split(".").pop() || "jpg";
              const path = `lists/${window.household}/items/${ref.id}/photo.${fileExt}`;
              const storageRef = window.firebase.storage().ref().child(path);
              await storageRef.put(cacheEntry.blob);
              const url = await storageRef.getDownloadURL();
              data.photoUrl = url || "";
              data.photoPath = path || "";
            } catch (upErr) {
              console.error("photo upload failed", upErr);
            }
          }

          data.createdAt = window.firebase.firestore.FieldValue.serverTimestamp();
          await ref.set(data, { merge: true });

          // Cleanup preview URL and cache for this tmp id after successful commit
          try { _revokeAndDeleteTmpPhoto(String(it.id || "")); } catch(_){}
        }

        // Optimistic UI update
        try {
          window.lastAddedId = ref.id;
          if (typeof window.renderRow === "function") {
            const newRow = window.renderRow({ id: ref.id, ...data });
            if (newRow) {
              newRow.classList.add("flash");
              const existing = document.querySelector(`.item[data-id="${ref.id}"]`);
              if (existing) {
                existing.replaceWith(newRow);
              } else {
                const container =
                  document.querySelector("#list_list") ||
                  document.querySelector("#list_shopping");
                if (container && isNew) container.prepend(newRow);
              }
              setTimeout(() => newRow.classList.remove("flash"), 900);
            }
          }
        } catch (_) {}

        if (typeof window.showToast === "function") {
          window.showToast(isNew ? "Added to list" : "Saved changes");
        }

        // Cleanup staged overlay and input
        removeStaged();
        nameInput.value = "";
        clearAC();
      } catch (err) {
        console.error("commit staged failed", err);
        if (typeof window.showToast === "function") window.showToast("Save failed");
      }
    });


    card.appendChild(commitBtn);




    // Anchor under the input wrapper (the immediate parent of #itemName)
    const inputWrap = nameInput.parentElement; // <div style="...position:relative;">
    if (getComputedStyle(inputWrap).position === "static") {
      inputWrap.style.position = "relative";
      inputWrap.setAttribute("data-staged-made-relative", "1");
    }

    // Compute and apply anchored position relative to inputWrap
    const position = ()=>{
      try {
        const wrapRect  = inputWrap.getBoundingClientRect();
        const inputRect = nameInput.getBoundingClientRect();
        const top = (inputRect.bottom - wrapRect.top) + inputWrap.scrollTop + 8; // 8px gap under input
        card.style.top = `${Math.max(0, top)}px`;
      } catch {}
    };

    // Mount overlay inside inputWrap so it appears just below the input
    inputWrap.appendChild(card);
    position();
    try { requestAnimationFrame(position); } catch(_){}

    // Wire teardown and reactive reposition
    const onResize = ()=> position();
    const onScroll = ()=> position();
    const onKey = (e)=> { if (e.key === "Escape") removeStaged(); };

    // Track photo changes for this staged item
    const idStr = String(it.id || "");
    let photoDirty = false;
    const onPhotoSelected = (ev)=>{
      try {
        const d = ev && ev.detail;
        if (!d || String(d.itemId||"") !== idStr) return;

        // Mark dirty to mirror existing-item UX
        photoDirty = true;
        card.dataset.photoDirty = "1";

        if (idStr.startsWith("tmp-")) {
          // NEW items: cache locally and update preview
          let objectUrl = d.objectUrl || "";
          const blob = d.blob || d.file || null;
          if (!objectUrl && blob) {
            try { objectUrl = URL.createObjectURL(blob); } catch(_){}
          }
          if (blob && objectUrl) {
            stagedPhotoCache.set(idStr, {
              blob,
              objectUrl,
              filename: d.filename || d.name || "photo.jpg"
            });
            try {
              it.photoUrl = objectUrl; // safe for tmp only
              const img = card.querySelector("img");
              if (img) img.src = objectUrl;
            } catch(_){}
          }
        } else {
          // EXISTING items: do NOT touch it.photoUrl; just update the visible img
          try {
            const src = d.objectUrl || d.url || "";
            if (src) {
              const img = card.querySelector("img");
              if (img) img.src = src;
            }
          } catch(_){}
        }
      } catch {}
    };

    const onPhotoUpdated = (ev)=>{
      try {
        const d = ev && ev.detail;
        if (!d || String(d.itemId||"") !== idStr) return;

        // Mark dirty
        photoDirty = true;
        card.dataset.photoDirty = "1";

        if (idStr.startsWith("tmp-")) {
          // NEW items: cache latest blob and refresh preview
          let objectUrl = d.objectUrl || "";
          const blob = d.blob || d.file || null;
          if (!objectUrl && blob) {
            try { objectUrl = URL.createObjectURL(blob); } catch(_){}
          }
          if (blob && objectUrl) {
            // Revoke older preview if any
            try {
              const prev = stagedPhotoCache.get(idStr);
              if (prev && prev.objectUrl && prev.objectUrl !== objectUrl) URL.revokeObjectURL(prev.objectUrl);
            } catch(_){}
            stagedPhotoCache.set(idStr, {
              blob,
              objectUrl,
              filename: d.filename || d.name || "photo.jpg"
            });
            try {
              it.photoUrl = objectUrl; // safe for tmp only
              const img = card.querySelector("img");
              if (img) img.src = objectUrl;
            } catch(_){}
          }
        } else {
          // EXISTING items: update the visible img only
          try {
            const src = d.objectUrl || d.url || "";
            if (src) {
              const img = card.querySelector("img");
              if (img) img.src = src;
            }
          } catch(_){}
        }
      } catch {}
    };


    document.addEventListener("item:photo-selected", onPhotoSelected);
    document.addEventListener("item:photo-updated", onPhotoUpdated);

    const onClickOutside = (e)=>{
      // Pause outside-close while photo UI or busy toast is active
      const popup = document.getElementById("photoPopup");
      const busy  = document.getElementById("busyToast");
      const modalOpen =
        document.body.classList.contains("modal-open") ||
        (popup && popup.classList.contains("show")) ||
        (busy && busy.classList.contains("show"));

      // Ignore the first click right after photo popup closes
      let guardOk = true;
      try {
        const t = parseInt(document.body.getAttribute("data-photo-click-guard") || "0", 10);
        if (t && (Date.now() - t) < 500) guardOk = false;
      } catch {}

      // Never close if photo was changed; require explicit Update/Add
      if (modalOpen || !guardOk || photoDirty) return;

      if (!card.contains(e.target)) removeStaged();
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClickOutside, true);

    // Store cleanup on the container so removeStaged can call it
    inputWrap._stagedCleanup = function(){
      window.removeEventListener("resize", onResize, { passive: true });
      window.removeEventListener("scroll", onScroll, { passive: true });
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClickOutside, true);
      document.removeEventListener("item:photo-selected", onPhotoSelected);
      document.removeEventListener("item:photo-updated", onPhotoUpdated);
      if (inputWrap.getAttribute("data-staged-made-relative") === "1") {
        inputWrap.style.removeProperty("position");
        inputWrap.removeAttribute("data-staged-made-relative");
      }
    };
    // Also reference on listSection for compatibility with removeStaged()
    listSection._stagedCleanup = inputWrap._stagedCleanup;


    // Focus first editable if any
    setTimeout(()=>{
      const et = card.querySelector(".editable-text[contenteditable], input, textarea");
      if (et && typeof et.focus === "function") et.focus();
    }, 0);
  }



  // ------ Selection handling ------
  let acActive = -1;
  function renderSuggestions(list, q){
    acList.innerHTML = "";
    list.forEach((it, idx)=>{
      const row = renderPreview(it);
      row.dataset.index = String(idx);
      row.addEventListener("mousedown", (e)=>{ e.preventDefault(); }); // prevent blur
      row.addEventListener("click", ()=>{
        clearAC();
        const active = (window.activeTab || localStorage.getItem("activeTab") || "list");
        if (active === "list") {
          // No staged card on List tab. Filter the list instead.
          nameInput.value = it.name || "";
          try { window.liveListQuery = String(nameInput.value || "").toLowerCase(); } catch {}
          try { window.scheduleRenderItems?.(window.lastSnapshotItems || []); } catch {}
        } else {
          // Keep existing staged-card behavior elsewhere
          createStaged({ ...it });
        }
      });
      acList.appendChild(row);
    });
    if (list.length) showAC(); else clearAC();
    acActive = -1;
  }

  function highlightActive(){
    const items = [...acList.querySelectorAll(".ac-item")];
    items.forEach((el,i)=> el.classList.toggle("active", i===acActive));
  }

   // ------ Input wiring ------
  let t = 0;
  nameInput.addEventListener("input", async ()=>{
    const q = nameInput.value;
    // Live filter on List tab
    try {
      const active = (window.activeTab || localStorage.getItem("activeTab") || "list");
      if (active === "list") {
        window.liveListQuery = String(q || "").toLowerCase();
        window.scheduleRenderItems?.(window.lastSnapshotItems || []);
      }
    } catch {}
    clearTimeout(t);
    t = setTimeout(async ()=>{
      // Ensure live subscription started
      subscribeLive();
      // If no items yet, wait once for the initial snapshot; otherwise use cache immediately
      if (!cache.items.length){
        try { await Promise.race([firstSnapshotReady, new Promise(r=>setTimeout(r, 500))]); } catch(_){}
      }
      const all = cache.items || [];
      renderSuggestions(filterItems(all, q), q);
    }, 120);
  });





  nameInput.addEventListener("keydown", (e)=>{
    const items = [...acList.querySelectorAll(".ac-item")];
    const activeTab = (window.activeTab || localStorage.getItem("activeTab") || "list");
    if (e.key === "ArrowDown"){
      if (!items.length) return;
      e.preventDefault();
      acActive = Math.min(items.length-1, acActive+1);
      highlightActive();
    } else if (e.key === "ArrowUp"){
      if (!items.length) return;
      e.preventDefault();
      acActive = Math.max(0, acActive-1);
      highlightActive();
    } else if (e.key === "Enter"){
      const target = (acActive>=0 && items[acActive]) ? items[acActive] : null;
      if (target){
        e.preventDefault();
        target.click();
      } else {
        const name = String(nameInput.value||"").trim();
        if (!name) return;
        e.preventDefault();
        if (activeTab === "list") {
          // Filter instead of staging
          try { window.liveListQuery = name.toLowerCase(); } catch {}
          try { window.scheduleRenderItems?.(window.lastSnapshotItems || []); } catch {}
          clearAC();
        } else {
          // Keep staged-card flow on non-List tabs
          createStaged({ id:"tmp-"+Date.now(), name, qty:"", size:"", notes:"", category:"", routeOrder:null, checked:false });
          clearAC();
        }
      }
    } else if (e.key === "Escape"){
      // Clear suggestions and filter on List tab
      clearAC();
      if (activeTab === "list") {
        try { window.liveListQuery = ""; } catch {}
        try { window.scheduleRenderItems?.(window.lastSnapshotItems || []); } catch {}
      }
    }
  });


  nameInput.addEventListener("blur", ()=>{
    // close after click handlers run
    setTimeout(clearAC, 120);
  });

  // Global Add button
  addBtn.addEventListener("click", async ()=>{
    const name = String(nameInput.value||"").trim();
    if (!name) return;
    const active = (window.activeTab || localStorage.getItem("activeTab") || "list");

    // Non-List tabs keep staged-card flow
    if (active !== "list") {
      createStaged({ id:"tmp-"+Date.now(), name, qty:"", size:"", notes:"", category:"", routeOrder:null, checked:false });
      clearAC();
      return;
    }

    // List tab: add/update directly in Firestore
    try {
      const qtyEl  = document.getElementById("itemQty");
      const sizeEl = document.getElementById("itemSize");
      const catEl  = document.getElementById("itemCategory");
      const routeEl= document.getElementById("itemRoute");
      const notesEl= document.getElementById("itemNotes");

      const qty  = String(qtyEl?.value  || "").trim();
      const size = String(sizeEl?.value || "").trim();
      const category = String(catEl?.value || "").trim();
      const notes = String(notesEl?.value || "").trim();
      const routeVal = parseFloat(routeEl?.value);
      const routeOrder = Number.isFinite(routeVal) ? routeVal : null;

      const col = window.db.collection("lists").doc(window.household).collection("items");

      // Merge with existing if same name exists
      const existing = typeof window.findExistingItem === "function" ? window.findExistingItem(name) : null;

      if (existing && existing.id) {
        const ref = col.doc(String(existing.id));
        const mergedQty = (typeof window.addQtyStr === "function")
          ? window.addQtyStr(existing.qty || "", qty)
          : (qty || existing.qty || "");

        const data = {
          name,
          qty: mergedQty,
          size: size || existing.size || "",
          notes: notes || existing.notes || "",
          category: category || existing.category || "",
          routeOrder: Number.isFinite(routeVal) ? routeVal : (existing.routeOrder ?? null),
          checked: false,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        };
        await ref.set(data, { merge: true });
        window.showToast?.("Updated item");
      } else {
        const ref = col.doc();
        const data = {
          name,
          qty,
          size,
          notes,
          category,
          routeOrder,
          checked: false,
          createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        };
        await ref.set(data, { merge: true });
        window.showToast?.("Added to list");
      }

      // Reset input, clear suggestions and filter
      nameInput.value = "";
      clearAC();
      try { window.liveListQuery = ""; } catch {}
      try { window.scheduleRenderItems?.(window.lastSnapshotItems || []); } catch {}
    } catch (err) {
      console.error("add-from-list failed", err);
      window.showToast?.("Save failed");
    }
  });
}

