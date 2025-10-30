// Shared quantity prompts
// - showQtyPrompt(item): prompts and WRITES qty to Firestore for an existing item
// - showQtyPromptValue(): prompts and RETURNS a number, no writes (use for new items)
import { showToast } from "../ui/ui.js";
import { db } from "../firebase.js";

export async function showQtyPrompt(it) {
  const qtyNum = await showQtyPromptValueInternal("How many?", "Add to list");
  if (!isFinite(qtyNum) || qtyNum <= 0) return;

  try {
    const household = window.household || localStorage.getItem("household") || "";
    const ref = db.collection("lists").doc(household).collection("items").doc(it.id);

    // Merge logic with existing qty
    const toNum = (x) => {
      try { return typeof parseNum === "function" ? parseNum(String(x || "")) : parseFloat(String(x || "").replace(",", ".")); }
      catch(_) { return parseFloat(String(x || "").replace(",", ".")); }
    };
    const current = toNum(it.qty);
    const firstPositive = !(isFinite(current) && current > 0);

    const nextQtyStr = isFinite(current)
      ? String(firstPositive ? qtyNum : current + qtyNum)
      : (firstPositive ? String(qtyNum)
         : (typeof window.addQtyStr === "function" ? window.addQtyStr(it.qty, String(qtyNum)) : (String(it.qty || "") + " + " + String(qtyNum))));

    const patch = {
      qty: nextQtyStr,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    if (firstPositive) {
      patch.checked = false;
      patch.checkedAt = null;
      if (firebase.firestore?.FieldValue?.delete) {
        patch.qtyBeforeCheck = firebase.firestore.FieldValue.delete();
      } else {
        patch.qtyBeforeCheck = "";
      }
      patch.addedToShoppingAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    // Optimistic UI first with rollback
    const backup = {
      qty: it.qty,
      checked: !!it.checked,
      checkedAt: it.checkedAt || null,
      qtyBeforeCheck: it.qtyBeforeCheck
    };

    // Apply optimistic local changes
    it.qty = nextQtyStr;
    if (firstPositive) {
      it.checked = false;
      try { delete it.qtyBeforeCheck; } catch(_) { it.qtyBeforeCheck = ""; }
      it.checkedAt = null;
      try {
        const cbEl = document.querySelector(`.item[data-id="${it.id}"] input[type="checkbox"]`);
        if (cbEl) cbEl.checked = false;
      } catch(_) {}
      if (typeof window.scheduleRenderItems === "function") {
        window.scheduleRenderItems(window.lastSnapshotItems || []);
      }
    }

    try {
      await ref.set(patch, { merge:true });
      showToast?.(firstPositive ? "Moved to shopping" : "Saved qty");
    } catch (e) {
      console.error(e);
      showToast?.("Save failed");
      // Roll back local model and UI
      try {
        it.qty = backup.qty;
        it.checked = backup.checked;
        it.checkedAt = backup.checkedAt;
        if (typeof backup.qtyBeforeCheck !== "undefined") it.qtyBeforeCheck = backup.qtyBeforeCheck;
        try {
          const cbEl = document.querySelector(`.item[data-id="${it.id}"] input[type="checkbox"]`);
          if (cbEl) cbEl.checked = !!backup.checked;
        } catch(_) {}
        if (firstPositive && typeof window.scheduleRenderItems === "function") {
          window.scheduleRenderItems(window.lastSnapshotItems || []);
        }
      } catch(_){}
      throw e;
    }
  } catch (err) {
    console.error(err);
    showToast?.("Save failed");
  }
}

// Value-only prompt for new items or custom flows. Returns number or NaN if cancelled/invalid.
export async function showQtyPromptValue() {
  return await showQtyPromptValueInternal("How many?", "OK");
}

/* ---------------- internal UI factory ---------------- */

async function showQtyPromptValueInternal(title, okLabel) {
  return new Promise(async (resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal show";
     modal.style.zIndex = "20000";
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.innerHTML = `
  <div class="backdrop" style="position:fixed;inset:0;z-index:1000;"></div>
  <div class="dialog"
       style="position:fixed;inset:0;z-index:1001;display:flex;align-items:center;justify-content:center;box-sizing:border-box;
              padding:max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));">
    <div class="content"
         style="width:min(420px, 92vw);max-height:90vh;overflow:auto;background:var(--surface);border:1px solid var(--border);
                border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:16px;">
      <h3 style="margin:0 0 12px 0">${escapeHtml(title)}</h3>
      <form>
        <input id="qtyInput" type="number" inputmode="decimal" pattern="[0-9]*" aria-label="Quantity"
               style="width:100%;padding:10px;border:1px solid var(--border);border-radius:10px;font-size:16px" />
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">
          <button type="button" id="cancelBtn" class="btn"
                  style="padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:var(--surface)">Cancel</button>
          <button type="submit" id="okBtn" class="btn primary"
                  style="padding:10px 14px;border-radius:12px;border:1px solid transparent;background:var(--primary);color:#fff">${escapeHtml(okLabel)}</button>
        </div>
      </form>
    </div>
  </div>`;

    document.body.appendChild(modal);

    // Modal manager integration
    let close, lockBody = ()=>{}, unlockBody = ()=>{};
    try {
      const mgr = await import("./manager.js");
      lockBody   = mgr.lockBody   || lockBody;
      unlockBody = mgr.unlockBody || unlockBody;
      const { bindOverlayClose, bindEscClose } = mgr;
      close = (value) => { modal.classList.remove("show"); modal.setAttribute("aria-hidden","true"); unlockBody(); modal.remove(); resolve(value); };
      modal.querySelector("#cancelBtn")?.addEventListener("click", ()=> close(NaN));
      bindOverlayClose?.(modal, ()=> close(NaN));
      bindEscClose?.(modal, ()=> close(NaN));
    } catch {
      close = (value) => { modal.classList.remove("show"); modal.remove(); resolve(value); };
      modal.querySelector(".backdrop")?.addEventListener("click", ()=> close(NaN));
      modal.querySelector("#cancelBtn")?.addEventListener("click", ()=> close(NaN));
      modal.addEventListener("keydown", (e)=>{ if (e.key === "Escape") close(NaN); });
    }

    try { lockBody(); } catch {}
    const inp = modal.querySelector("#qtyInput");
    inp?.focus();

    modal.querySelector("form")?.addEventListener("submit", (e)=>{
      e.preventDefault();
      const raw = String(inp?.value || "").trim();
      const num = parseFloat(raw.replace(",", "."));
      if (!isFinite(num) || num <= 0) { showToast?.("Enter a number greater than 0"); inp?.focus(); return; }
      close(num);
    });
  });
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }
