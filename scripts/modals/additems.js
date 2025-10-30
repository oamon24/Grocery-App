// Minimal Add Items modal with fast entry and ranked autocomplete
// - Prefix-first matching, then token-prefix, then contains
// - Up to 50 results, keyboard nav, no cards
import { showToast } from "../ui/ui.js";
import { db } from "../firebase.js";
import { showQtyPrompt, showQtyPromptValue } from "./qtyPrompt.js";

let injected = false;
let modal, input, list, addBtn;
let activeIndex = -1;
let debTimer = 0;

function ensureModal() {
  if (injected) return;
  injected = true;

  modal = document.createElement("div");
  modal.id = "addItemsModal";
  modal.className = "modal";
  modal.style.zIndex = "16000"; // above #weeklyItemsFab (15000)

  modal.setAttribute("role","dialog");
  modal.setAttribute("aria-modal","true");
  modal.innerHTML = `
   <div class="backdrop" data-close="1"></div>
<div class="sheet" role="document"
     style="
       height:50vh;
       width:95%;
       display:flex; flex-direction:column;
       border-bottom-left-radius:16px;
       border-bottom-right-radius:16px;
       box-shadow:0 8px 24px rgba(0,0,0,0.3);
     ">

  <header class="sheet-header"
          style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
    <h3 style="margin:0">Add Items</h3>
    <button id="aiClose" type="button" aria-label="Close">✕</button>
  </header>

  <section class="sheet-body"
           style="display:flex;flex-direction:column;gap:12px;flex:1;overflow:auto;">
    <label>
      <div>Item</div>
      <div style="display:flex; align-items:center; gap:10px; position:relative; margin-left:10px; margin-top:10px;">
        <input id="aiName" type="text" autocomplete="off" placeholder="e.g., Milch, Bananen"
               style="flex:1;" />
        <button id="aiAdd" class="primary" type="button" style="flex-shrink:0;">Add</button>
        <div id="aiAutoList" class="ac-list" role="listbox" aria-label="Suggestions"
             style="display:none; max-height:280px; overflow:auto; position:absolute; top:100%; left:0; right:0;"></div>
      </div>
    </label>
  </section>
</div>

  `;
  document.body.appendChild(modal);

  input  = modal.querySelector("#aiName");
  list   = modal.querySelector("#aiAutoList");
  addBtn = modal.querySelector("#aiAdd");

  // Modal manager integration
  import("./manager.js").then(({ lockBody, unlockBody, bindOverlayClose, bindEscClose })=>{
    const close = () => { modal.classList.remove("show"); modal.setAttribute("aria-hidden","true"); unlockBody?.(); hideList(); };
    modal.querySelector("#aiClose")?.addEventListener("click", close);
    bindOverlayClose?.(modal, close);
    bindEscClose?.(modal, close);
    modal.__open = () => { modal.classList.add("show"); modal.setAttribute("aria-hidden","false"); lockBody?.(); input?.focus(); scheduleSuggest(); };
    modal.__close = close;
  }).catch(()=>{
    const close = () => { modal.classList.remove("show"); hideList(); };
    modal.querySelector("#aiClose")?.addEventListener("click", close);
    modal.addEventListener("keydown",(e)=>{ if (e.key === "Escape") close(); });
    modal.__open = () => { modal.classList.add("show"); input?.focus(); scheduleSuggest(); };
    modal.__close = close;
  });

  // Input events to drive suggestions
  input.addEventListener("input", scheduleSuggest);
  input.addEventListener("focus", scheduleSuggest);
  input.addEventListener("blur", () => setTimeout(hideList, 100)); // allow click

  input.addEventListener("keydown", (e)=>{
    const items = Array.from(list.querySelectorAll(".ac-item"));
    const hasList = items.length > 0;

    const move = (delta) => {
      if (!hasList) return;
      e.preventDefault();
      const len = items.length;
      if (activeIndex < 0) {
        // first navigation selects a real row; no auto-select on open
        activeIndex = delta > 0 ? 0 : len - 1;
      } else {
        activeIndex = (activeIndex + delta + len) % len; // wrap-around
      }
      paintActive(items);
      if (activeIndex >= 0) ensureVisible(items[activeIndex]);
    };

    switch (e.key) {
      case "ArrowDown": return move(1);
      case "ArrowUp":   return move(-1);
      case "PageDown":  return move(+5);
      case "PageUp":    return move(-5);
      case "Home":
        if (!hasList) return;
        e.preventDefault();
        activeIndex = 0;
        paintActive(items);
        ensureVisible(items[activeIndex]);
        return;
      case "End":
        if (!hasList) return;
        e.preventDefault();
        activeIndex = items.length - 1;
        paintActive(items);
        ensureVisible(items[activeIndex]);
        return;
      case "Escape":
        if (hasList) { e.preventDefault(); hideList(); input.removeAttribute("aria-activedescendant"); }
        return;
      case "Tab":
        if (hasList && activeIndex >= 0) {
          e.preventDefault();
          items[activeIndex].dispatchEvent(new Event("mousedown", { bubbles:true }));
        }
        return;
      case "Enter":
        e.preventDefault();
        if (hasList && activeIndex >= 0) {
          items[activeIndex].dispatchEvent(new Event("mousedown", { bubbles:true }));
        } else {
          onAdd(); // no selection → don't pick top suggestion
        }
        return;
      default:
        return;
    }
  });



  // Add button
  addBtn.addEventListener("click", onAdd);
}

function scheduleSuggest(){
  clearTimeout(debTimer);
  debTimer = setTimeout(showSuggestions, 80);
}

function normalizeKey(s){
  return String(s || "")
    .normalize?.("NFD").replace(/\p{Diacritic}/gu,"") // strip accents
    .toLowerCase().trim();
}

function getItemsIndex(){
  const arr = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
  const byKey = new Map();
  for (const it of arr) {
    const key = normalizeKey(it.name || it.nameKey || "");
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, it); // dedupe by nameKey
  }
  return Array.from(byKey.values());
}

function rankMatches(q, items){
  const qk = normalizeKey(q);
  if (!qk) return [];

  const matches = [];
  for (const it of items) {
    const key = normalizeKey(it.name || it.nameKey || "");
    if (!key) continue;
    // Match only if query starts any word (prefix match)
    const words = key.split(/\s+/);
    const hasPrefix = words.some(w => w.startsWith(qk));
    if (hasPrefix) matches.push(it);
  }

  // Alphabetical A→Z
  matches.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  return matches.slice(0, 50);
}


function showSuggestions() {
  const q = String(input.value || "");
  const matches = rankMatches(q, getItemsIndex());

  if (!matches.length) { hideList(); activeIndex = -1; input.removeAttribute("aria-activedescendant"); return; }

  // No default selection; user must move or click to select
  list.innerHTML = matches.map((it) => `
    <div id="aiOpt-${it.id}" class="ac-item" data-id="${it.id}" role="option" aria-selected="false">
      <div class="ac-title">${escapeHtml(it.name || "")}</div>
      <div class="ac-meta">${escapeHtml(it.qty || "")}</div>
    </div>
  `).join("");
  list.style.display = "block";
  activeIndex = -1;
  input.removeAttribute("aria-activedescendant");

  const rows = list.querySelectorAll(".ac-item");
  rows.forEach((el, idx)=>{
    el.addEventListener("mousemove", ()=>{
      activeIndex = idx;
      paintActive(rows);
    });
    el.addEventListener("mousedown", async (e)=>{
      e.preventDefault();
      const id = el.getAttribute("data-id");
      const all = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
      const it = all.find(x => x.id === id);
      if (!it) return;
      await showQtyPrompt(it);
      input.value = "";
      hideList();
      scheduleSuggest();
      input.focus();
    });
  });
}



function paintActive(nodes){
  let activeEl = null;
  nodes.forEach((n,i)=>{
    const on = i === activeIndex;
    n.classList.toggle("active", on);
    n.setAttribute("aria-selected", on ? "true" : "false");
    if (on) activeEl = n;
  });
  if (activeEl && activeEl.id) {
    input.setAttribute("aria-activedescendant", activeEl.id);
  } else {
    input.removeAttribute("aria-activedescendant");
  }
}


function ensureVisible(el){
  if (!el) return;
  const p = list;
  const eb = el.getBoundingClientRect();
  const pb = p.getBoundingClientRect();
  if (eb.top < pb.top) p.scrollTop -= (pb.top - eb.top);
  else if (eb.bottom > pb.bottom) p.scrollTop += (eb.bottom - pb.bottom);
}

function hideList(){ list.style.display = "none"; list.innerHTML = ""; activeIndex = -1; }

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

async function onAdd() {
  const name = String(input.value || "").trim();
  if (!name) { showToast?.("Enter an item name"); input.focus(); return; }

  // Existing item?
  const existing = typeof window.findExistingItem === "function" ? window.findExistingItem(name) : null;
  if (existing) {
    await showQtyPrompt(existing);
    input.value = "";
    hideList();
    scheduleSuggest();
    return;
  }

  // New item: prompt for qty then create and add
  await showQtyPromptForNew(name);
input.value = "";
hideList();
scheduleSuggest();
input.focus(); // refocus after adding

}

async function showQtyPromptForNew(name) {
  // Ask for quantity, then optimistically insert and write in background
  const qtyNum = await showQtyPromptValue();
  if (!isFinite(qtyNum) || qtyNum <= 0) return;

  const household = window.household || localStorage.getItem("household") || "";
  const ref = db.collection("lists").doc(household).collection("items").doc();
  const nameKey = normalizeKey(name);
  const now = Date.now();

  // Optimistic object uses client clocks for immediate render
  const optimistic = {
    id: ref.id,
    name,
    nameKey,
    qty: String(qtyNum),
    size: "",
    notes: "",
    category: "",
    routeOrder: "",
    checked: false,
    checkedAt: null,
    addedToShoppingAt: { _client: now },
    updatedAt: { _client: now }
  };

  // Optimistic insert
  let arr = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
  const didClone = arr === window.lastSnapshotItems ? false : true;
  if (didClone) window.lastSnapshotItems = arr; // keep same reference if possible
  arr.push(optimistic);
  try { if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(arr); } catch {}
  showToast?.("Adding…");

  // Server write uses server timestamps
  const writePatch = {
    id: optimistic.id,
    name: optimistic.name,
    nameKey: optimistic.nameKey,
    qty: optimistic.qty,
    size: optimistic.size,
    notes: optimistic.notes,
    category: optimistic.category,
    routeOrder: optimistic.routeOrder,
    checked: optimistic.checked,
    checkedAt: null,
    addedToShoppingAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  // Background write
  ref.set(writePatch, { merge: true }).then(()=>{
    showToast?.("Added to list");
  }).catch((e)=>{
    console.error(e);
    // Revert optimistic insert
    try{
      const cur = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
      window.lastSnapshotItems = cur.filter(it => it && it.id !== optimistic.id);
      if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(window.lastSnapshotItems);
    }catch{}
    showToast?.("Save failed");
  });
}



// Public API
export async function openAddItemsModal() {
  ensureModal();

  // Wait for manager.js to attach __open on first click
  if (!modal || typeof modal.__open !== "function") {
    await new Promise((resolve) => {
      let ticks = 0;
      const spin = () => {
        if (modal && typeof modal.__open === "function") return resolve();
        if (ticks++ > 40) return resolve(); // ~400ms cap
        requestAnimationFrame(spin);
      };
      spin();
    });
  }

  // Open via manager if ready, else minimal fallback
  if (modal && typeof modal.__open === "function") {
    modal.__open();
  } else if (modal) {
    modal.classList.add("show");
    modal.setAttribute?.("aria-hidden", "false");
    input?.focus();
  }
}

export function closeAddItemsModal() {
  if (!injected) return;
  modal.__close?.();
}

// Wire FAB click on first import
document.addEventListener("click", (e)=>{
  const btn = e.target.closest("#addItemsFab");
  if (!btn) return;
  openAddItemsModal();
});
