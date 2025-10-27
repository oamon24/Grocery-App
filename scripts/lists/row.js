/*
  renderRow(it) — extracted from index.html
  Exact behavior preserved. Depends on existing globals:
  auth, db, storage, household, showToast, openItemDialog,
  openLightbox, openPhotoPicker, uploadItemPhoto, removeItemPhoto,
  updateItem, scheduleRenderItems, lastSnapshotItems, catalogCache,
  ensureHouseholdDoc, parseNum, autoSize, activeTab, lastAddedId.
*/

(function () {
  if (typeof window.renderRow === "function") return;

  // optional editing flag set elsewhere
  window.editDirty = window.editDirty || new Set();

function renderRow(it){
  const row = document.createElement("div");
  row.className = "item";
  row.dataset.id = it.id; // parity with Weekly Items
  row.dataset.cat = ((it.category || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"));

  // 1) Left column: checkbox + gear (match Weekly Items)
  const left = document.createElement("div");
  left.className = "left";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!it.checked;
  cb.setAttribute("aria-label", "Mark checked"); // parity
  cb.onchange = () => {
    const isChecked = !!cb.checked;
    const patch = {
      checked: isChecked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (isChecked) {
      patch.qtyBeforeCheck = it.qty || "";
      patch.qty = "0";
      patch.checkedAt = firebase.firestore.FieldValue.serverTimestamp();

      // Clear suppression so item shows in Shopping → Checked
      try {
        const arr = JSON.parse(localStorage.getItem("clearedCheckedKeys") || "[]");
        const set = new Set(Array.isArray(arr) ? arr : []);
        const key = String(
          (it && (it.id || it.docId || it.uid || it.key || it.name || it.title)) ||
          JSON.stringify({
            n: it && (it.name || it.title || ""),
            u: it && (it.unit || ""),
            s: it && (it.sku || "")
          })
        );
        if (set.has(key)) {
          set.delete(key);
          localStorage.setItem("clearedCheckedKeys", JSON.stringify([...set]));
        }
      } catch (_) {}
    } else {
      const restoreQty = (it.qtyBeforeCheck && String(it.qtyBeforeCheck).trim() !== "")
        ? String(it.qtyBeforeCheck).trim()
        : String(it.qty || "");
      patch.qty = restoreQty;
      patch.checkedAt = null;

      if (firebase.firestore && firebase.firestore.FieldValue && firebase.firestore.FieldValue.delete) {
        patch.qtyBeforeCheck = firebase.firestore.FieldValue.delete();
      } else {
        patch.qtyBeforeCheck = "";
      }
    }

    const prevChecked = !!it.checked;
    const prevQty = it.qty;

    it.checked = isChecked;
    if (isChecked) {
      it.qtyBeforeCheck = it.qty || "";
      it.qty = "0";
    } else {
      const restoreQty = (it.qtyBeforeCheck && String(it.qtyBeforeCheck).trim() !== "")
        ? String(it.qtyBeforeCheck).trim()
        : String(it.qty || "");
      it.qty = restoreQty;
      it.checkedAt = null;
      try { delete it.qtyBeforeCheck; } catch(_) { it.qtyBeforeCheck = ""; }
    }

    Promise.resolve().then(async () => {
      try {
        const ref = db.collection("lists").doc(household).collection("items").doc(it.id);
        await ref.set(patch, { merge: true });
      } catch (e) {
        console.error("Checkbox update failed:", e);
        showToast && showToast("Failed to update item");
        it.checked = prevChecked;
        it.qty = prevQty;
        cb.checked = prevChecked;
      }
    });

    try {
      if (window.shoppingViewMode === "checked" && (localStorage.getItem("activeTab") || "list") === "shopping") {
        const cnt = (typeof window.lastSnapshotItems !== "undefined" && Array.isArray(window.lastSnapshotItems))
          ? (window.lastSnapshotItems.filter(window.isRecentChecked || (()=>false)).length)
          : 0;
        if (cnt === 0) {
          window.shoppingViewMode = "unchecked";
          if (typeof scheduleRenderItems === "function") scheduleRenderItems(window.lastSnapshotItems || []);
        }
      }
    } catch(_){}
  };
  left.appendChild(cb);


  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "gearbtn";
  gear.setAttribute("aria-label", "Item settings");
  gear.textContent = "⚙️";
  gear.onclick = () => { try { openItemDialog(it); } catch(e){ console.error(e); } };
  left.appendChild(gear);

  // ---- Add-to-list button (List tab only) ----
  try {
    const active = (window.activeTab || localStorage.getItem("activeTab") || "list");
    if (active === "list") {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "addlistbtn";

      const toNum = (x) => {
        try { return typeof parseNum === "function" ? parseNum(String(x || "")) : parseFloat(String(x || "").replace(",", ".")); }
        catch(_) { return parseFloat(String(x || "").replace(",", ".")); }
      };
      const curNum = toNum(it.qty);
      addBtn.textContent = (isFinite(curNum) && curNum > 0) ? "Add more to list" : "Add to list";
      addBtn.setAttribute("aria-label", addBtn.textContent);

       addBtn.onclick = async () => {
        try {
          const { showQtyPrompt } = await import("./modals/qtyPrompt.js");
          await showQtyPrompt(it);
        } catch (e) {
          console.error("qtyPrompt failed, falling back:", e);
        }
      };


      left.appendChild(addBtn);
    }
  } catch(_){}



  // 2) Title line + meta chips
  const line1 = document.createElement("div");
  line1.className = "line1";

  const catdot = document.createElement("span"); catdot.className = "catdot";
  const title  = document.createElement("span"); title.className  = "title";
  title.textContent = it.name || "";
  line1.appendChild(catdot);
  line1.appendChild(title);

  // Keep route flag if routeOrder missing
  const routeMissing =
    it.routeOrder === undefined ||
    it.routeOrder === null ||
    it.routeOrder === "" ||
    isNaN(parseFloat(it.routeOrder));
  if (routeMissing) {
    const flag = document.createElement("span");
    flag.textContent = " 🚩";
    flag.title = "No route number set";
    flag.style.color = "red";
    title.appendChild(flag);
  }

  // Inline editable qty + size
  const meta = document.createElement("div");
  meta.className = "meta";
   function makeEditableSpan(field, initial, aria){
    const span = document.createElement("span");
    span.className = "editable-text";
    span.contentEditable = "true";
    span.setAttribute("role","textbox");
    span.setAttribute("aria-label", aria);
    span.textContent = String(initial || "");
    let original = span.textContent;

    span.addEventListener("keydown",(e)=>{
      if (e.key === "Enter"){ e.preventDefault(); span.blur(); }
      if (e.key === "Escape"){ span.textContent = original; e.preventDefault(); span.blur(); }
    });

    // GUARD: do not write for staged rows or tmp ids
    span.addEventListener("blur", async ()=>{
      const val = String(span.textContent || "").trim();
      if (val === original) return;
      const prev = original;
      original = val;

      // update local model so staged commit picks up edits
      it[field] = val;

      const isStaged = row.classList.contains("staged");
      const isTmpId  = String(it.id || "").startsWith("tmp-");
      if (isStaged || isTmpId) {
        // skip Firestore write while staged
        return;
      }

      // Detect qty transition: 0 -> >0, then uncheck and send to Shopping
      const toNum = (x) => {
        try { return typeof parseNum === "function" ? parseNum(String(x || "")) : parseFloat(String(x || "").replace(",", ".")); }
        catch(_) { return parseFloat(String(x || "").replace(",", ".")); }
      };
      const prevNum = toNum(prev);
      const newNum  = toNum(val);
      const becamePositiveQty = (field === "qty") && (isFinite(prevNum) ? prevNum === 0 : (String(prev).trim() === "" || String(prev).trim() === "0")) && (isFinite(newNum) && newNum > 0);

      const patch = {
        [field]: val,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (becamePositiveQty) {
        patch.checked = false;
        patch.checkedAt = null;
        // remove qtyBeforeCheck if present
        if (firebase.firestore && firebase.firestore.FieldValue && firebase.firestore.FieldValue.delete) {
          patch.qtyBeforeCheck = firebase.firestore.FieldValue.delete();
        } else {
          patch.qtyBeforeCheck = "";
        }
        // optional marker for analytics/order
        patch.addedToShoppingAt = firebase.firestore.FieldValue.serverTimestamp();

        // local model updates to reflect immediately
        it.checked = false;
        try { delete it.qtyBeforeCheck; } catch(_) { it.qtyBeforeCheck = ""; }
        it.checkedAt = null;

        // reflect checkbox UI instantly if present
        try {
          const cbEl = row.querySelector('input[type="checkbox"]');
          if (cbEl) cbEl.checked = false;
        } catch(_) {}
      }

      try{
        const ref = db.collection("lists").doc(household).collection("items").doc(it.id);
        await ref.set(patch, { merge:true });
        showToast && showToast(becamePositiveQty ? "Moved to shopping" : ("Saved " + field));

        // trigger re-render if available so item appears under Shopping
        if (becamePositiveQty && typeof scheduleRenderItems === "function") {
          scheduleRenderItems(window.lastSnapshotItems || []);
        }
      }catch(err){
        console.error(err);
        showToast && showToast("Save failed");
        original = prev;
        span.textContent = prev;
        // revert local model on failure
        it[field] = prev;
      }
    });
    return span;
  }

  meta.appendChild(makeEditableSpan("qty",  it.qty,  "qty"));
  meta.appendChild(makeEditableSpan("size", it.size, "size"));
  line1.appendChild(meta);

  // 3) Actions column kept for grid alignment, empty by design
  const actions = document.createElement("div");
  actions.className = "actions";

  // 4) Below: photo/camera + notes
  const below = document.createElement("div");
  below.className = "below";

  let mediaEl = null;
  const mountThumb = (src) => {
    if (mediaEl && mediaEl.parentNode) mediaEl.remove();
    const img = document.createElement("img");
    img.className = "thumb";
    img.alt = (it.name || "Item photo");
    img.src = src;
    img.dataset.full = src;
    mediaEl = img;
    below.prepend(mediaEl);
  };
  const mountCameraBtn = () => {
    if (mediaEl && mediaEl.parentNode) mediaEl.remove();
    const camBtn = document.createElement("button");
    camBtn.type = "button";
    camBtn.className = "camera-btn";
    camBtn.setAttribute("aria-label", "Add photo");
    camBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-camera"></use></svg>';
    camBtn.onclick = () => {
      openPhotoPicker({
        onFile: (file) => {
          if (!file) return;
          const prevUrl  = it.photoUrl || "";
          const prevPath = it.photoPath || "";
          const localUrl = URL.createObjectURL(file);
          it.photoUrl = localUrl;
          mountThumb(localUrl);
          below.classList.remove("hidden");
          showToast && showToast("Uploading photo in background…");

          Promise.resolve().then(async () => {
            try {
              const { url, path } = await uploadItemPhoto(file, it.id, prevPath || null);
              it.photoUrl = url; it.photoPath = path;
              mountThumb(url);
              showToast && showToast("Photo uploaded");
            } catch (e) {
              console.error(e);
              showToast && showToast("Photo upload failed");
              it.photoUrl = prevUrl; it.photoPath = prevPath;
              if (prevUrl) { mountThumb(prevUrl); }
              else { mountCameraBtn(); }
            } finally {
              try { URL.revokeObjectURL(localUrl); } catch(_) {}
            }
          });
        }
      });
    };
    mediaEl = camBtn;
    below.prepend(mediaEl);
  };
  if (it.photoUrl) mountThumb(it.photoUrl); else mountCameraBtn();

  // Notes editable div (match Weekly Items)
  const notesCell = document.createElement("div");
  notesCell.className = "line2 editable-text";
  notesCell.contentEditable = "true";
  notesCell.setAttribute("role","textbox");
  notesCell.setAttribute("aria-label","notes");
  notesCell.textContent = String(it.notes || "");
  {
    let original = notesCell.textContent;
    notesCell.addEventListener("keydown",(e)=>{
      if (e.key === "Enter"){ e.preventDefault(); notesCell.blur(); }
      if (e.key === "Escape"){ notesCell.textContent = original; e.preventDefault(); notesCell.blur(); }
    });
    // GUARD: do not write for staged rows or tmp ids
    notesCell.addEventListener("blur", async ()=>{
      const val = String(notesCell.textContent || "").trim();
      if (val === original) return;
      const prev = original;
      original = val;

      // update local model so staged commit picks up edits
      it.notes = val;

      const isStaged = row.classList.contains("staged");
      const isTmpId  = String(it.id || "").startsWith("tmp-");
      if (isStaged || isTmpId) {
        // skip Firestore write while staged
        return;
      }

      try{
        const ref = db.collection("lists").doc(household).collection("items").doc(it.id);
        await ref.set({ notes: val, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
        showToast && showToast("Saved notes");
      }catch(err){
        console.error(err);
        showToast && showToast("Save failed");
        original = prev;
        notesCell.textContent = prev;
      }
    });
  }

  below.appendChild(notesCell);

  // 5) Assemble
  row.appendChild(left);
  row.appendChild(line1);
  row.appendChild(actions);
  row.appendChild(below);

  // 6) Flash if just added
  if (it.id === lastAddedId) {
    requestAnimationFrame(() => {
      row.classList.add("flash");
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setTimeout(() => row.classList.remove("flash"), 900);
      lastAddedId = null;
    });
  }

  return row;
}


  window.renderRow = renderRow;
})();

// ==== Lightbox wiring for item thumbnails (scoped to list containers + staged card) ====
(function wireThumbLightbox(){
  if (window.__wireThumbLightbox) return; // ensure single attach
  window.__wireThumbLightbox = true;

  const containers = [
    document.getElementById("list_list"),
    document.getElementById("list_shopping"),
    document.getElementById("listSection") // staged card lives here
  ].filter(Boolean);

  if (!containers.length) return;

  function onContainerClick(e){
    const thumb = e.target.closest(".item .thumb");
    if (!thumb) return;
    // Only react if the thumb is inside one of our containers
    if (!containers.some(c => c.contains(thumb))) return;

    const src =
      (thumb.dataset && (thumb.dataset.full || thumb.dataset.src)) ||
      thumb.currentSrc ||
      thumb.src ||
      "";

     // Always expose camera action via global photo picker
    const row = thumb.closest(".item");
    const itemId = row && row.dataset ? row.dataset.id : null;
    const onCamera = () => {
      try { openPhotoPicker({ itemId }); } catch (e) { console.warn(e); }
    };

    if (typeof window.openLightbox === "function") {
      window.openLightbox(src, { onCamera });
    }

  }

  containers.forEach(c => c.addEventListener("click", onContainerClick));
})();
