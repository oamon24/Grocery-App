/*
  Weekly Items — migrated intact
  Uses Firebase module imports. Keeps DOM IDs and behavior identical.
*/
import { auth, db } from "../firebase.js";
import { showToast } from "../ui/ui.js";
import { lockBody, unlockBody } from "./manager.js";
import * as photo from "../photo.js";
import { showQtyPrompt, showQtyPromptValue } from "./qtyPrompt.js";





// Guard module
if (!window.__weeklyItemsModule) {
  window.__weeklyItemsModule = true;

  // ======= Core modal wiring (DOMContentLoaded) =======
  document.addEventListener("DOMContentLoaded", () => {

function initWeeklyItems() {
if (window.__wiInit) return true;
const wrap = document.getElementById("wiSection");
if (!wrap) return false;
window.__wiInit = true;
    const statusEl = document.getElementById("wiStatus");
  const listEl   = document.getElementById("wiList");
  const emptyEl  = document.getElementById("wiEmpty");

  const nameEl  = document.getElementById("wiItemName");
  const qtyEl   = document.getElementById("wiItemQty");
  const sizeEl  = document.getElementById("wiItemSize");
  const catEl   = document.getElementById("wiItemCategory");
  const routeEl = document.getElementById("wiItemRoute");
  const notesEl = document.getElementById("wiItemNotes");

  const addBtn   = document.getElementById("wiAdd");
  const clearBtn = document.getElementById("wiClearChecked");

   // Floating pink "Add to Shopping List" button over the modal (bottom-right)
  let addToListBtn = null;
  {
    const modalEl = document.getElementById("weeklyItemsModal");
    const sheetEl = modalEl ? modalEl.querySelector(".sheet") : null;
    if (modalEl && sheetEl) {
      addToListBtn = document.createElement("button");
      addToListBtn.id = "wiAddCheckedToShopping";
      addToListBtn.type = "button";
      addToListBtn.textContent = "Add to Shopping List";

      // Visuals: float inside the sheet above its content
      addToListBtn.style.position = "absolute";
      addToListBtn.style.right = "16px";
      addToListBtn.style.bottom = "75px";
      addToListBtn.style.zIndex = "100000"; // above sheet content
      addToListBtn.style.background = "var(--primary)";
      addToListBtn.style.color = "#fff";
      addToListBtn.style.border = "none";
      addToListBtn.style.borderRadius = "14px";
      addToListBtn.style.padding = "10px 14px";
      addToListBtn.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
      addToListBtn.style.display = "none"; // hidden until any checkbox is checked

      sheetEl.appendChild(addToListBtn);

      addToListBtn.addEventListener("click", () => {
        if (typeof window.addWeeklyCheckedToShopping === "function") {
          window.addWeeklyCheckedToShopping();
        } else {
          try { showToast && showToast("Add action not ready"); } catch {}
        }
      });
    }
  }



  // Household detection (same as inline)
  const household =
    (typeof window.household !== "undefined" && window.household) ||
    (typeof window.activeHousehold !== "undefined" && window.activeHousehold) ||
    (typeof window.currentHousehold !== "undefined" && window.currentHousehold) ||
    localStorage.getItem("household") ||
    localStorage.getItem("activeHousehold") ||
    (document.body?.dataset?.household || "");

  // Local state
  let weeklyItems = [];
  let unsubWeekly = null;
  let liveQuery = "";
  const autoListEl = document.getElementById("wiAutoList");

  // Helper to toggle Add-to-List button
  function updateAddToListButtonVisibility(){
    if (!addToListBtn) return;
    const anyChecked = Array.isArray(weeklyItems) && weeklyItems.some(it => !!it.checked);
    addToListBtn.style.display = anyChecked ? "" : "none";
  }

  // Helpers
  function setWiControlsEnabled(enabled){
    [addBtn, clearBtn, nameEl, qtyEl, sizeEl, catEl, routeEl, notesEl].forEach(n=>{
      if (!n) return; n.disabled = !enabled; n.classList.toggle('disabled', !enabled);
    });
  }
  function updateWiStatus(){
    if (!statusEl) return;
    const bits = [];
    bits.push((auth && auth.currentUser) ? "Signed in" : "Not signed in");
    bits.push("household: " + (household || "—"));
    statusEl.textContent = bits.join(" • ");
    setWiControlsEnabled(!!(auth && auth.currentUser && household));
  }
  function wiDocRef(id){ return db.collection("lists").doc(String(household)).collection("weekly").doc(String(id)); }
  function wiColRef(){   return db.collection("lists").doc(String(household)).collection("weekly"); }

  // Render functions (unchanged)
  function renderWi(items){
    const q = (liveQuery || "").trim().toLowerCase();
    const filtered = q ? items.filter(i => (i.name||"").toLowerCase().includes(q)) : items;
    const sorted = [...filtered].sort((a,b)=>(a.name||"").localeCompare(b.name||"", undefined, { sensitivity: "base" }));
    listEl.innerHTML = "";
    if (!sorted.length){ emptyEl.style.display="block"; updateAddToListButtonVisibility(); return; }
    emptyEl.style.display="none";
    for (const it of sorted) listEl.appendChild(renderWiRow(it));
    updateAddToListButtonVisibility();
  }
  function renderWiRow(it){
    const row = document.createElement("div");
    row.className = "item";
    row.dataset.id = it.id;
    row.dataset.cat = ((it.category || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"));

    // Left column: checkbox + delete
    const left = document.createElement("div");
    left.className = "left";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!it.checked;
    cb.setAttribute("aria-label", "Mark checked");
    cb.onchange = () => {
      const prev = !!it.checked;
      const isChecked = !!cb.checked;
      it.checked = isChecked;
      updateAddToListButtonVisibility();
      Promise.resolve().then(async () => {
        try {
          await wiDocRef(it.id).set({ checked: isChecked, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
        } catch(e){
          console.error(e);
          showToast && showToast("Failed to update");
          it.checked = prev;
          cb.checked = prev;
          updateAddToListButtonVisibility();
        }
      });
    };
    left.appendChild(cb);

    // Text delete button (Weekly-only)
    const del = document.createElement("button");
    del.type = "button";
    del.className = "wi-del";
    del.setAttribute("aria-label", "Delete from Weekly Items");
    del.textContent = "Delete";
    del.addEventListener("click", async (ev) => {
      try { ev.preventDefault(); ev.stopPropagation(); } catch {}
      const ok = window.confirm ? window.confirm("Delete this from Weekly Items?") : true;
      if (!ok) return;

      // Optimistic remove
      let backup = null;
      try {
        if (Array.isArray(weeklyItems)) {
          backup = [...weeklyItems];
          weeklyItems = weeklyItems.filter(x => x && x.id !== it.id);
          renderWi(weeklyItems);
        }
      } catch {}

      try {
        await wiDocRef(it.id).delete();
        try { showToast && showToast("Deleted from Weekly"); } catch {}
      } catch (e) {
        console.error(e);
        try { showToast && showToast("Delete failed"); } catch {}
        // Restore on failure
        if (backup) {
          weeklyItems = backup;
          renderWi(weeklyItems);
        }
      }
    });
    left.appendChild(del);



    // Title row with meta chips inline (matches old layout)
    const line1 = document.createElement("div");
    line1.className = "line1";
    const catdot = document.createElement("span"); catdot.className = "catdot";
    const title  = document.createElement("span"); title.className = "title"; title.textContent = it.name || "";
    line1.appendChild(catdot);
    line1.appendChild(title);

    // Meta inline editable spans (qty, size, notes)
    const meta = document.createElement("div"); 
    meta.className = "meta";

    // helper to make a plain-text, single-line, inline editor
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

      span.addEventListener("blur", async ()=>{
        const val = String(span.textContent || "").trim();
        if (val === original) return;
        const prev = original;
        original = val;
        try{
          it[field] = val;
          await wiDocRef(it.id).set(
            { [field]: val, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
            { merge:true }
          );
          if (typeof showToast === "function") showToast("Saved " + field);
        }catch(err){
          console.error(err);
          if (typeof showToast === "function") showToast("Save failed");
          original = prev;
          span.textContent = prev;
        }
      });

      return span;
    }

    meta.appendChild(makeEditableSpan("qty",   it.qty,   "qty"));
    meta.appendChild(makeEditableSpan("size",  it.size,  "size"));
   

    line1.appendChild(meta);


    // Right column actions container (kept for grid alignment; can be populated later)
    const actions = document.createElement("div");
    actions.className = "actions";

    // Bottom row: photo control + long notes (always present to allow camera button)
    let below = document.createElement("div");
    below.className = "below";

    // Photo slot
    let photoCell;

    // Unified handler: require a real items doc id, mirror to weekly, update UI (optimistic)
    const onPicked = async (file) => {
      // Enforce single source of truth: items/{itemId}
      const itemId = String(it.itemId || "").trim();
      if (!itemId) {
        try { showToast && showToast("Cannot update photo: missing item link"); } catch {}
        throw new Error("[weeklyItems] missing itemId mapping for weekly doc " + it.id);
      }

      // Optimistic preview first
      const prevUrl  = String(it.photoUrl || "");
      const prevPath = String(it.photoPath || "");
      const tempUrl  = URL.createObjectURL(file);
      try {
        // Show temp image immediately
        it.photoUrl = tempUrl;
        if (photoCell && photoCell.tagName === "BUTTON") {
          const img = document.createElement("img");
          img.className = "thumb uploading";
          img.src = tempUrl;
          img.alt = it.name || "photo";
          img.onclick = () => {
            try {
              if (typeof window.openLightbox === "function") {
                window.openLightbox(tempUrl);
              }
            } catch (e) { console.error(e); }
          };
          photoCell.replaceWith(img);
          photoCell = img;
        } else if (photoCell && photoCell.tagName === "IMG") {
          photoCell.classList.add("uploading");
          photoCell.src = tempUrl;
        }

        // Resolve current item photoPath from the items doc to avoid overwriting via stale weekly copy
        let latestServerPath = null;
        try {
          const hh = String(window.household || "").trim();
          if (window.db && hh) {
            const snap = await window.db
              .collection("lists").doc(hh)
              .collection("items").doc(itemId)
              .get();
            if (snap && snap.exists) latestServerPath = (snap.data() || {}).photoPath || null;
          }
        } catch (e) { console.warn("[weeklyItems] prevPath lookup failed", e); }

        // Upload and then swap temp → real
        const { url, path } = await photo.uploadItemPhoto(file, itemId, latestServerPath || null);

        // Persist to weekly doc
        wiDocRef(it.id).set({
          itemId,
          photoUrl: url,
          photoPath: path,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(()=>{});

        // Finalize UI
        it.itemId   = itemId;
        it.photoUrl = url;
        it.photoPath= path;

        if (photoCell && photoCell.tagName === "IMG") {
          photoCell.classList.remove("uploading");
          photoCell.src = url.includes("?") ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
          photoCell.onclick = () => {
            try {
              if (typeof window.openLightbox === "function") {
                window.openLightbox(url, {
                  onCamera: () => {
                    try {
                      photo.openPhotoPicker({ itemId, onFile: async (f) => { await onPicked(f); } });
                    } catch (e) { console.error(e); }
                  }
                });
              }
            } catch (e) { console.error(e); }
          };
        }
        try { showToast && showToast("Photo updated"); } catch {}
      } catch (e) {
        console.error(e);
        // Roll back UI
        it.photoUrl = prevUrl;
        it.photoPath= prevPath;
        if (photoCell && photoCell.tagName === "IMG") {
          photoCell.classList.remove("uploading");
          photoCell.src = prevUrl || photoCell.src;
        }
        try { showToast && showToast("Photo update failed"); } catch {}
      } finally {
        try { URL.revokeObjectURL(tempUrl); } catch {}
      }
    };


    if (it.photoUrl) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.src = it.photoUrl;
      img.alt = it.name || "photo";

      // Open fullscreen lightbox on click with camera action
      img.onclick = () => {
        try {
          if (typeof window.openLightbox === "function") {
            window.openLightbox(it.photoUrl, {
              onCamera: async () => {
                try {
                  let itemId = String(it.itemId || "").trim();
                  if (!itemId) {
                    const existing = (typeof window.findExistingItem === "function") ? window.findExistingItem(it.name) : null;
                    if (existing && existing.id) {
                      itemId = String(existing.id);
                      await wiDocRef(it.id).set(
                        { itemId, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                        { merge: true }
                      );
                      it.itemId = itemId;
                    } else {
                      showToast && showToast("Missing item link");
                      return;
                    }
                  }
                  photo.openPhotoPicker({
                    itemId,
                    onFile: async (file) => { await onPicked(file); }
                  });
                } catch (e) { console.error(e); }
              }
            });
          }
        } catch (e) { console.error(e); }
      };

      photoCell = img;

    } else {
      // Visible camera button when no photo
      const btn = document.createElement("button");
      btn.className = "camera-btn";
      btn.type = "button";
      btn.setAttribute("aria-label", "Add photo");
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      `;
      btn.onclick = async () => {
        try {
          let itemId = String(it.itemId || "").trim();
          if (!itemId) {
            const existing = (typeof window.findExistingItem === "function") ? window.findExistingItem(it.name) : null;
            if (existing && existing.id) {
              itemId = String(existing.id);
              await wiDocRef(it.id).set(
                { itemId, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
                { merge: true }
              );
              it.itemId = itemId;
            } else {
              showToast && showToast("Missing item link");
              return;
            }
          }
          photo.openPhotoPicker({
            itemId,
            onFile: async (file) => { await onPicked(file); }
          });
        } catch (e) { console.error(e); }
      };

      photoCell = btn;

    }

    // Notes cell (inline editable)
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
      notesCell.addEventListener("blur", async ()=>{
        const val = String(notesCell.textContent || "").trim();
        if (val === original) return;
        const prev = original;
        original = val;
        try{
          it.notes = val;
          await wiDocRef(it.id).set(
            { notes: val, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
            { merge:true }
          );
          if (typeof showToast === "function") showToast("Saved notes");
        }catch(err){
          console.error(err);
          if (typeof showToast === "function") showToast("Save failed");
          original = prev;
          notesCell.textContent = prev;
        }
      });
    }

    below.appendChild(photoCell);
    below.appendChild(notesCell);

    row.appendChild(left);
    row.appendChild(line1);
    row.appendChild(actions);
    if (below) row.appendChild(below);
    return row;
  } // <-- closes renderWiRow properly

  // Autocomplete keyboard helper (kept minimal)
  function enableAutoListKeyboard(inputEl, listEl, onSelect) {
    let activeIndex = -1;
    inputEl.addEventListener("keydown", (e) => {
      const items = listEl.querySelectorAll(".ac-item");
      if (!items.length) return;
      if (e.key === "ArrowDown") { activeIndex = Math.min(items.length-1, activeIndex+1); e.preventDefault(); }
      else if (e.key === "ArrowUp") { activeIndex = Math.max(0, activeIndex-1); e.preventDefault(); }
      else if (e.key === "Enter") { if (activeIndex >= 0) { const el = items[activeIndex]; el && el.click(); e.preventDefault(); } }
      items.forEach((it,i)=>it.classList.toggle("active", i===activeIndex));
    });
  }

  // Status + enable
  updateWiStatus();

  // Add item
  if (addBtn) addBtn.addEventListener("click", () => {
    const name = String(nameEl?.value || "").trim();
    if (!auth || !auth.currentUser || !household) { alert("Sign in and set household first."); return; }
    if (!name) { showToast && showToast("Enter a name"); nameEl && nameEl.focus(); return; }
    const qty  = String(qtyEl?.value || "").trim();
    const size = String(sizeEl?.value || "").trim();
    const notes= String(notesEl?.value || "").trim();
    const category = String(catEl?.value || "");
    const routeOrder = (routeEl && routeEl.value === "") ? "" : Number(routeEl?.value || "");
    const now = Date.now();
    const ref = wiColRef().doc();
    const doc = {
      id: ref.id, name, nameKey: name.toLowerCase(), qty, size, notes, category,
      routeOrder, checked: false, createdAt: { _client: now }, updatedAt: { _client: now }, photoUrl: "", photoPath: ""
    };
    try { weeklyItems = [doc, ...(weeklyItems || [])]; renderWi(weeklyItems); } catch {}
    ref.set({
      name: doc.name, nameKey: doc.nameKey, qty: doc.qty, size: doc.size, notes: doc.notes,
      category: doc.category, routeOrder: doc.routeOrder, checked: doc.checked,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true }).catch(e => { console.error(e); showToast && showToast("Add failed"); });
  });

  // Clear checked
  if (clearBtn) clearBtn.addEventListener("click", () => {
    if (!auth || !auth.currentUser || !household) return alert("Sign in and set household first.");
    try{
      if (Array.isArray(weeklyItems)) {
        let any = false;
        weeklyItems = weeklyItems.map(it => { if (it && it.checked) { any = true; return { ...it, checked:false }; } return it; });
        if (!any) { showToast && showToast("Nothing to clear"); return; }
        renderWi(weeklyItems);
      }
    }catch{}
    showToast && showToast("Unchecking items…");
    Promise.resolve().then(async () => {
      try{
        const qs = await wiColRef().where("checked","==",true).get();
        if (!qs.empty) {
          const batch = db.batch();
          qs.forEach(doc => batch.set(doc.ref, { checked:false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true }));
          await batch.commit();
        }
        showToast && showToast("Unchecked all weekly items");
      }catch(e){
        console.error(e);
        showToast && showToast("Uncheck failed");
        try { window.subscribeWeekly && window.subscribeWeekly(); } catch{}
      }
    });
  });

  // Subscribe
  async function subscribeWeekly(){
    if (window.unsubWeekly) { try { window.unsubWeekly(); } catch{} window.unsubWeekly = null; }
    if (!auth || !auth.currentUser || !household) { renderWi([]); updateAddToListButtonVisibility(); return; }
    try {
      if (typeof window.ensureHouseholdDoc === "function") await window.ensureHouseholdDoc();
      window.unsubWeekly = wiColRef().onSnapshot((snap) => {
        const arr = [];
        snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
        weeklyItems = arr;
        renderWi(weeklyItems);
      }, (err) => {
        console.error(err);
        alert("Cannot read weekly items. Check Firestore rules and that Firestore is enabled.");
      });
    } catch (e) {
      console.error("subscribeWeekly bootstrap failed", e);
      alert("Cannot read weekly items. Check Firestore rules and that Firestore is enabled.");
    }
  }

  // Auth reactions
  updateWiStatus();
  auth && auth.onAuthStateChanged(() => { updateWiStatus(); subscribeWeekly(); });
  if (auth && auth.currentUser) subscribeWeekly();

  // API for other code
  window.weeklyItemsAPI = window.weeklyItemsAPI || {};
  window.weeklyItemsAPI.getChecked = function () {
    return Array.isArray(weeklyItems) ? weeklyItems.filter(it => !!it.checked) : [];
  };

  // Expose for globals
  window.renderWi = renderWi;
  window.renderWiRow = renderWiRow; // expose row renderer for staged preview in weekly autocomplete
  window.subscribeWeekly = subscribeWeekly;

  // Sync weekly rows when an item's photo changes elsewhere (optimistic UI first)
  document.addEventListener("item:photo-updated", async (ev) => {
    try {
      const d = (ev && ev.detail) || {};
      const itemId = String(d.itemId || "").trim();
      const url = String(d.url || "");
      const path = String(d.path || "");
      if (!itemId || (!url && !path)) return;

      // Helper: normalize to nameKey shape used in /weekly
      const normalizeKey = (s) => String(s || "")
        .normalize?.("NFD").replace(/\p{Diacritic}/gu, "")
        .toLowerCase().trim();

      // 1) Fast path: weekly docs already linked by itemId
      let targets = Array.isArray(weeklyItems)
        ? weeklyItems.filter(w => String(w.itemId || "") === itemId)
        : [];

      // 2) If none linked, try to match by nameKey and attach missing itemId
      let attachable = [];
      if (!targets.length) {
        try {
          const hh = String(window.household || "").trim();
          if (window.db && hh) {
            const snap = await window.db
              .collection("lists").doc(hh)
              .collection("items").doc(itemId)
              .get();
            if (snap && snap.exists) {
              const data = snap.data() || {};
              const key = normalizeKey(data.nameKey || data.name || "");
              if (key) {
                attachable = Array.isArray(weeklyItems)
                  ? weeklyItems.filter(w =>
                      !String(w.itemId || "").trim() &&
                      String(w.nameKey || normalizeKey(w.name || "")) === key
                    )
                  : [];
              }
            }
          }
        } catch (e) { console.warn("[weeklyItems] item lookup for nameKey failed", e); }
      }

      // Combine and proceed
      const all = [...targets, ...attachable];
      if (!all.length) return;

      // Optimistically update models and DOM first
      for (const w of all) {
        if (!String(w.itemId || "").trim()) w.itemId = itemId;
        w.photoUrl = url;
        w.photoPath = path;

        if (listEl) {
          const rowEl = listEl.querySelector(`.item[data-id="${w.id}"]`);
          if (rowEl && rowEl.parentNode) {
            const updated = renderWiRow(w);
            rowEl.replaceWith(updated);
          }
        }
      }

      // Fire-and-forget persistence
      for (const w of all) {
        // link missing itemId if needed
        if (!String(w.itemId || "").trim()) {
          wiDocRef(w.id).set(
            { itemId, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          ).catch(()=>{});
        }
        wiDocRef(w.id).set(
          { photoUrl: url, photoPath: path, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        ).catch(()=>{});
      }
    } catch (e) {
      console.warn("[weeklyItems] photo sync failed", e);
    }
  });


  // Wire Weekly autocomplete (uses autocomplete.js but commits to /weekly)
  try {
    if (typeof window.initWeeklyAutocomplete === "function") {
      window.initWeeklyAutocomplete();
    }
  } catch (e) { console.error("initWeeklyAutocomplete failed", e); }

  // Initial visibility sync
  updateAddToListButtonVisibility();

  return true;
}




    // Try now. If not present, wait and init when #wiSection arrives.
    if (!initWeeklyItems()) {
      const mo = new MutationObserver(() => { if (initWeeklyItems()) mo.disconnect(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  });


  // ======= FAB + merge wiring (DOMContentLoaded) =======
  document.addEventListener("DOMContentLoaded", () => {
    if (window.__wiFabInit) return;
    window.__wiFabInit = true;

    const modal    = document.getElementById("weeklyItemsModal");
    const closeBtn = document.getElementById("weeklyItemsClose");
    const backdrop = modal ? modal.querySelector(".backdrop") : null;
    const checkedFab = document.getElementById("checkedToggleFab");

const WI_STATE_KEY = "weeklyItemsOpen";



    function hideCheckedFabForWeekly(){
      if (!checkedFab) return;
      checkedFab.dataset.prevDisplay = checkedFab.style.display || "";
      checkedFab.style.display = "none";
    }
    function restoreCheckedFabAfterWeekly(){
      if (typeof window.syncToggleVisibility === "function") { try { window.syncToggleVisibility(); return; } catch{} }
      if (checkedFab) checkedFab.style.display = checkedFab.dataset.prevDisplay || "";
    }

    // Weekly Items FAB handling removed intentionally.



function openWeeklyItems(){
  // Ensure modal exists; if not, ask centralized loader, then re-query
  let m = document.getElementById("weeklyItemsModal");
  if (!m) {
    try { window.openModal && window.openModal("weeklyItems"); } catch(_) {}
    m = document.getElementById("weeklyItemsModal");
    if (!m) return;
  }

  // Idempotent listener binding for late-inserted modal
  if (!m.dataset.wiBound) {
    const closeBtnLive = document.getElementById("weeklyItemsClose");
    const backdropLive = m.querySelector(".backdrop");
    if (closeBtnLive) closeBtnLive.addEventListener("click", closeWeeklyItems);
    if (backdropLive)  backdropLive.addEventListener("click", closeWeeklyItems);
    m.dataset.wiBound = "1";
  }

  m.classList.add("show");
  lockBody();

  try { if (typeof window.subscribeWeekly === "function") window.subscribeWeekly(); } catch {}

  hideCheckedFabForWeekly();
  try { history.pushState({ [WI_STATE_KEY]: true }, ""); } catch(e){}
}







    function closeWeeklyItems(){
  const m = document.getElementById("weeklyItemsModal");
  if (m) m.classList.remove("show");
  unlockBody();

  restoreCheckedFabAfterWeekly();
  try { if (history.state && history.state[WI_STATE_KEY]) history.back(); } catch(e){}
}



   function onWeeklyItemsPopState(){
  try {
    const m = document.getElementById("weeklyItemsModal");
    if (m && m.classList.contains("show")) {
      m.classList.remove("show");
      unlockBody();
      restoreCheckedFabAfterWeekly();
    }
  } catch(e){}
}


    window.addEventListener("popstate", onWeeklyItemsPopState);

// Weekly Items FAB setup removed.



    async function addWeeklyCheckedToShopping(){
      // Same add flow, but skip prompts. Use each weekly item's qty. Close modal after.
      if (window.__wiMergeAt && (Date.now() - window.__wiMergeAt) < 800) return;
      window.__wiMergeAt = Date.now();

      const household = (window.household || localStorage.getItem("household") || "").trim();
      if (!auth || !auth.currentUser || !household) { alert("Sign in and set the household first."); return; }

      const getChecked = (window.weeklyItemsAPI && typeof window.weeklyItemsAPI.getChecked === "function")
        ? window.weeklyItemsAPI.getChecked : null;
      const picked = getChecked ? getChecked() : [];
      if (!picked.length){ showToast?.("Nothing selected"); return; }
      try { closeWeeklyItems(); } catch {}
      try { showToast?.("Adding to list…"); } catch {}

      const normalizeKey = (s) => String(s || "")
        .normalize?.("NFD").replace(/\p{Diacritic}/gu,"")
        .toLowerCase().trim();

      try {
        const col = db.collection("lists").doc(String(household)).collection("items");
        let anyAdded = false;

        for (const src of picked) {
          const name = String(src?.name || "").trim();
          if (!name) continue;

          const q = Number(src?.qty) > 0 ? Number(src.qty) : 1;

          // Find an existing shopping item by name
          const existing = (typeof window.findExistingItem === "function") ? window.findExistingItem(name) : null;

          if (existing && existing.id) {
            const ref = col.doc(String(existing.id));
            const wasChecked = !!existing.checked;

            try {
              if (wasChecked) {
                // Option A: if it was checked, uncheck and set qty = weekly qty (no increment)
                const patch = {
                  qty: String(q),
                  checked: false,
                  checkedAt: null,
                  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Optimistic UI first with rollback
                let backup = null;
                try {
                  const arr = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
                  const idx = arr.findIndex(it => it && it.id === existing.id);
                  if (idx >= 0) {
                    backup = { ...arr[idx] };
                    const uiPatch = { qty: String(q), checked: false, checkedAt: null };
                    arr[idx] = { ...arr[idx], ...uiPatch };
                    window.lastSnapshotItems = arr;
                    if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(arr);
                  }
                } catch {}

                try {
                  await ref.set(patch, { merge: true });
                } catch (e) {
                  // rollback on failure
                  try {
                    const arr = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
                    const idx = arr.findIndex(it => it && it.id === existing.id);
                    if (idx >= 0 && backup) {
                      arr[idx] = backup;
                      window.lastSnapshotItems = arr;
                      if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(arr);
                    }
                  } catch {}
                  throw e;
                }
              } else {
                // If it was unchecked, increment qty by q
                const prevQty = Number(existing.qty || 0) || 0;
                const newQty = String(prevQty + q);
                const patch = {
                  qty: newQty,
                  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };

                // Optimistic UI first with rollback
                let backup = null;
                try {
                  const arr = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
                  const idx = arr.findIndex(it => it && it.id === existing.id);
                  if (idx >= 0) {
                    backup = { ...arr[idx] };
                    const uiPatch = { qty: newQty };
                    arr[idx] = { ...arr[idx], ...uiPatch };
                    window.lastSnapshotItems = arr;
                    if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(arr);
                  }
                } catch {}

                try {
                  await ref.set(patch, { merge: true });
                } catch (e) {
                  // rollback on failure
                  try {
                    const arr = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
                    const idx = arr.findIndex(it => it && it.id === existing.id);
                    if (idx >= 0 && backup) {
                      arr[idx] = backup;
                      window.lastSnapshotItems = arr;
                      if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(arr);
                    }
                  } catch {}
                  throw e;
                }
              }

              anyAdded = true;
            } catch (e) {
              console.error(e);
              showToast?.("Update failed");
            }
            continue;
          }

          // Create a new unchecked item using weekly qty
          const ref = col.doc();
          const patch = {
            id: ref.id,
            name,
            nameKey: normalizeKey(name),
            qty: String(q),
            size: "",
            notes: "",
            category: "",
            routeOrder: "",
            checked: false,
            checkedAt: null,
            addedToShoppingAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          };

          try {
            // Optimistic UI first with rollback
            let appended = false;
            try {
              const arr = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
              const uiDoc = {
                id: patch.id,
                name: patch.name,
                nameKey: patch.nameKey,
                qty: patch.qty,
                size: patch.size,
                notes: patch.notes,
                category: patch.category,
                routeOrder: patch.routeOrder,
                checked: false,
                checkedAt: null
              };
              arr.push(uiDoc);
              window.lastSnapshotItems = arr;
              if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(arr);
              appended = true;
            } catch {}

            await ref.set(patch, { merge: true });
            anyAdded = true;
          } catch (e) {
            console.error(e);
            showToast?.("Save failed");
            // rollback on failure
            try {
              const arr = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
              window.lastSnapshotItems = arr.filter(it => it && it.id !== patch.id);
              if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(window.lastSnapshotItems);
            } catch {}
          }
        }

        if (anyAdded) {
          showToast?.("Added to list");
          try { closeWeeklyItems(); } catch {}
        }
      } catch (e) {
        console.error(e);
        alert("Add failed: " + (e.message || e));
      }
    }





// Weekly Items FAB setup removed.




    // FAB visibility logic removed.


// Defer static listeners if elements exist at load; late-binding happens in openWeeklyItems()
if (closeBtn) closeBtn.addEventListener("click", closeWeeklyItems);
if (backdrop) backdrop.addEventListener("click", closeWeeklyItems);

// expose for globals
window.openWeeklyItems = openWeeklyItems;
window.closeWeeklyItems = closeWeeklyItems;
window.addWeeklyCheckedToShopping = addWeeklyCheckedToShopping;


  });
}

// ===== Weekly Items Autocomplete =====
// Reuses the same items feed but stages and commits into lists/{household}/weekly
export function initWeeklyAutocomplete(){
  const nameInput   = document.getElementById("wiItemName");
  const acList      = document.getElementById("wiAutoList");
  const listSection = document.getElementById("wiSection");

  if (!nameInput || !acList || !listSection) return;

  // ------ Live cache (onSnapshot of shopping items) ------
  const cacheKey = "weeklyAutocomplete:itemCache:v1";
  let cache = loadCache();
  let unsubscribe = null;
  let firstResolve = null;
  const firstSnapshotReady = new Promise((r)=>{ firstResolve = r; });

  function loadCache(){
    try { return JSON.parse(localStorage.getItem(cacheKey)) || { ts:0, items:[] }; }
    catch { return { ts:0, items:[] }; }
  }
  function saveCache(next){
    try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch {}
  }
  function subscribeLive(){
    if (unsubscribe || !window.db || !window.household) return;
    const col = window.db.collection("lists").doc(String(window.household)).collection("items");
    unsubscribe = col.onSnapshot(
      (snap)=>{
        const items = [];
        snap.forEach((d)=>{
          const it = d.data() || {};
          items.push({
            id: d.id,
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
      (err)=> console.error("[weekly autocomplete] subscribeLive", err)
    );
  }
  subscribeLive();

  // ------ Matching (word-start) ------
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
    const words = tokenize(it.name);
    const ql = q.toLowerCase();
    const pos = words.findIndex(w => w.startsWith(ql));
    return pos < 0 ? 999 : pos;
  }
  function filterItems(all, q){
    const qtrim = String(q||"").trim();
    if (!qtrim) return [];
    const matches = all.filter(it => wordsStartWith(it.name, qtrim));
    matches.sort((a,b)=> rankItem(a,qtrim) - rankItem(b,qtrim) || a.name.localeCompare(b.name));
    return matches.slice(0, 8);
  }

  // ------ UI helpers ------
  function clearAC(){ acList.innerHTML = ""; acList.style.display = "none"; acActive = -1; }
  function showAC(){ acList.style.display = "block"; }
  function renderPreview(it){
    // match styling of main autocomplete
    const row = document.createElement("div");
    row.className = "ac-item";
    const wrap = document.createElement("div");
    wrap.className = "item-preview";
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "36px 1fr";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "center";

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

  // ------ Staged card for Weekly ------
  function removeStaged(){
    const old = listSection.querySelector(".staged-card");
    if (old) old.remove();
    try {
      if (typeof listSection._stagedCleanup === "function") {
        listSection._stagedCleanup();
        listSection._stagedCleanup = null;
      }
    } catch {}
  }

  function createStagedWeekly(src){
    removeStaged();

    // Map suggestion -> weekly shape
    const it = {
      id: String(src.id || ("tmp-"+Date.now())),
      name: src.name || "",
      qty: src.qty || "",
      size: src.size || "",
      notes: src.notes || "",
      category: src.category || "",
      routeOrder: src.routeOrder ?? "",
      checked: false,
      photoUrl: src.photoUrl || "",
      itemId: src.id && !String(src.id).startsWith("tmp-") ? src.id : ""
    };

    // Render with Weekly row renderer
    let rowEl = null;
    try {
      if (typeof window.renderWiRow === "function") rowEl = window.renderWiRow(it);
    } catch(e){ console.error(e); }

    const card = document.createElement("div");
    card.className = "staged-card";
    card.setAttribute("data-item-id", String(it.id));
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

    // Hide checkbox for staged preview
    if (rowEl){
      rowEl.classList.add("staged");
      const cb = rowEl.querySelector('.left input[type="checkbox"]');
      if (cb) cb.style.display = "none";
      card.appendChild(rowEl);
    } else {
      const fallback = document.createElement("div");
      fallback.textContent = it.name || "";
      card.appendChild(fallback);
    }

    // Commit button
    const commitBtn = document.createElement("button");
    commitBtn.type = "button";
    commitBtn.textContent = it.itemId ? "Add" : "Add";
    commitBtn.title = "Add to Weekly Items";
    commitBtn.style.position = "absolute";
    commitBtn.style.top = "8px";
    commitBtn.style.right = "8px";
    commitBtn.className = "primary";

    commitBtn.addEventListener("click", async (e)=>{
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      try {
        const h = (window.household || "").trim();
        if (!window.db || !h) { alert("Sign in and set household first."); return; }
        const col = window.db.collection("lists").doc(String(h)).collection("weekly");
        const ref = col.doc();
        const normalizeKey = (s)=> String(s||"")
          .normalize?.("NFD").replace(/\p{Diacritic}/gu,"")
          .toLowerCase().trim();

        const patch = {
          id: ref.id,
          name: String(it.name || ""),
          nameKey: normalizeKey(it.name || ""),
          qty: String(it.qty || ""),
          size: String(it.size || ""),
          notes: String(it.notes || ""),
          category: String(it.category || ""),
          routeOrder: (it.routeOrder === "" ? "" : Number(it.routeOrder || 0)),
          checked: false,
          itemId: String(it.itemId || ""),
          photoUrl: String(it.photoUrl || ""),
          photoPath: String(it.photoPath || ""),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await ref.set(patch, { merge: true });

        try { if (typeof window.showToast === "function") window.showToast("Added to Weekly"); } catch {}
        removeStaged();
        try { nameInput.value = ""; } catch {}
        clearAC();
      } catch (err){
        console.error("[weekly autocomplete] commit failed", err);
        try { if (typeof window.showToast === "function") window.showToast("Add failed"); } catch {}
      }
    });

    card.appendChild(commitBtn);

    // Anchor at top of weekly section
    listSection.prepend(card);

    // Close on Escape
    const onKey = (ev)=>{ if (ev.key === "Escape") removeStaged(); };
    document.addEventListener("keydown", onKey);
    listSection._stagedCleanup = ()=> document.removeEventListener("keydown", onKey);

    // Focus the first editable in the staged row
    setTimeout(()=>{
      const et = card.querySelector(".editable-text[contenteditable], input, textarea");
      if (et && typeof et.focus === "function") et.focus();
    }, 0);
  }

  // ------ Suggestion list wiring ------
  let acActive = -1;
  function renderSuggestions(list, q){
    acList.innerHTML = "";
    list.forEach((it, idx)=>{
      const row = renderPreview(it);
      row.dataset.index = String(idx);
      row.addEventListener("mousedown", (e)=>{ e.preventDefault(); });
      row.addEventListener("click", ()=>{
        clearAC();
        createStagedWeekly({ ...it });
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

  // ------ Input events ------
  let t = 0;
  nameInput.addEventListener("input", async ()=>{
    const q = nameInput.value;
    clearTimeout(t);
    t = setTimeout(async ()=>{
      subscribeLive();
      if (!cache.items.length){
        try { await Promise.race([firstSnapshotReady, new Promise(r=>setTimeout(r, 500))]); } catch {}
      }
      const all = cache.items || [];
      renderSuggestions(filterItems(all, q), q);
    }, 120);
  });

  nameInput.addEventListener("keydown", (e)=>{
    const items = [...acList.querySelectorAll(".ac-item")];
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
        // Create staged from typed text
        const name = String(nameInput.value||"").trim();
        if (!name) return;
        e.preventDefault();
        createStagedWeekly({ id:"tmp-"+Date.now(), name, qty:"", size:"", notes:"", category:"", routeOrder:"", photoUrl:"" });
        clearAC();
      }
    } else if (e.key === "Escape"){
      clearAC();
    }
  });

  // Close suggestions on blur
  nameInput.addEventListener("blur", ()=> setTimeout(clearAC, 100));

  // Expose on window for non-module usage
  try { window.initWeeklyAutocomplete = initWeeklyAutocomplete; } catch {}
}
try { window.initWeeklyAutocomplete = initWeeklyAutocomplete; } catch {}
