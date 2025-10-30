/*
  Photo picker + uploads (scoped)
  - Owns popup + hidden inputs defined in index.html:
      #photoPopup, #ppTake, #ppChoose, #ppCancel
      #fileChooser, #fileCamera
  - Exposes stable API used by the app:
      openPhotoPicker({ itemId, onFile })
      uploadItemPhoto(file, itemId)
      removeItemPhoto(itemId)
      uploadRecipeCover(file, recipeId)
      uploadStepPhoto(file, recipeId, stepIndex)
  - Keeps side effects minimal and self-cleaning.
*/
// ADD near the top with other module-scope code
import { updateItem } from "./dataSync.js";

const state = {
  els: null
};

function qs(id){ return document.getElementById(id); }

function initDomRefs(){
  if (state.els) return state.els;
  state.els = {
    popup: qs("photoPopup"),
    take: qs("ppTake"),
    choose: qs("ppChoose"),
    cancel: qs("ppCancel"),
    fileChooser: qs("fileChooser"),
    fileCamera: qs("fileCamera")
  };
  return state.els;
}

function showPopup(){
  const { popup } = initDomRefs();
  if (!popup) return;
  popup.classList.add("show");
  popup.setAttribute("aria-hidden", "false");
  try { document.body.classList.add("modal-open"); } catch {}
}
function hidePopup(){
  const { popup } = initDomRefs();
  if (!popup) return;
  popup.classList.remove("show");
  popup.setAttribute("aria-hidden", "true");
  try { document.body.classList.remove("modal-open"); } catch {}
}

/**
 * Await a single file selection from the provided <input type="file">.
 * Returns Promise<File|null>.
 */
function pickFrom(input){
  return new Promise((resolve) => {
    if (!input) { resolve(null); return; }
    const done = (file) => {
      // Reset the input so same file can be chosen again later
      try { input.value = ""; } catch {}
      resolve(file || null);
    };
    const onChange = () => {
      input.removeEventListener("change", onChange);
      const f = input.files && input.files[0];
      done(f || null);
    };
    input.addEventListener("change", onChange, { once: true });
    input.click();
  });
}

/**
 * Opens the photo picker popup. When user selects a file:
 * - If onFile is provided, calls it with (file, { itemId }).
 * - Else:
 *     • If itemId starts with "tmp-", defer upload and only stage+notify.
 *     • Otherwise, calls uploadItemPhoto(file, itemId).
 * Returns Promise<File|null> for optional chaining.
 */
export async function openPhotoPicker(opts = {}){
  const { itemId = null, onFile } = opts || {};

  // Ensure required DOM exists. If missing, lazy-load the modal and retry.
  async function ensureDomReady(){
    let { popup, take, choose, cancel, fileChooser, fileCamera } = initDomRefs();
    const haveAll = !!(popup && take && choose && cancel && fileChooser && fileCamera);
    if (haveAll) return true;

    // Try to load the modal partial without showing it
    try {
      const mod = await import("./ui/loadModal.js");
      // prewarm() does not await internals; call it then poll until injected
      mod.prewarm?.(["photoPopup"]);
    } catch {}

    // Poll up to ~1.2s for #photoPopup to appear, refreshing cached refs each tick
    const started = Date.now();
    while (Date.now() - started < 1200) {
      // clear cached nulls and requery
      try { state.els = null; } catch {}
      ({ popup, take, choose, cancel, fileChooser, fileCamera } = initDomRefs());
      if (popup && take && choose && cancel && fileChooser && fileCamera) return true;
      await new Promise(r => requestAnimationFrame(r));
    }
    return false;
  }

  const ok = await ensureDomReady();
  if (!ok) {
    console.warn("[photo] Required DOM not found");
    return null;
  }

  const { popup, take, choose, cancel, fileChooser, fileCamera } = initDomRefs();

  // Wire one-shot handlers for buttons using AbortController for cleanup
  const ac = new AbortController();
  const { signal } = ac;

  showPopup();

  const pick = (src) => {
    if (src === "camera") return pickFrom(fileCamera);
    return pickFrom(fileChooser);
  };

  const result = await new Promise((resolve) => {
    const finish = (fileOrNull) => {
      // Guard against the same click closing the staged card on ALL close paths
      try { document.body.setAttribute("data-photo-click-guard", String(Date.now())); } catch {}
      hidePopup();
      try { ac.abort(); } catch {}
      resolve(fileOrNull || null);
    };

    // Prevent native label->input activation from also opening the file dialog
    const stopDefaults = (e) => {
      try { e.preventDefault(); } catch {}
      try { e.stopPropagation(); } catch {}
      try { e.stopImmediatePropagation?.(); } catch {}
      return e;
    };

    take.addEventListener("click", async (e) => {
      stopDefaults(e);
      const file = await pick("camera");
      finish(file);
    }, { once: true, signal });

    choose.addEventListener("click", async (e) => {
      stopDefaults(e);
      const file = await pick("file");
      finish(file);
    }, { once: true, signal });

    cancel.addEventListener("click", (e) => {
      stopDefaults(e);
      finish(null);
    }, { once: true, signal });

    // Dismiss when backdrop clicked outside the dialog
    popup.addEventListener("click", (e) => {
      if (e.target === popup) {
        try { e.preventDefault(); } catch {}
        try { e.stopPropagation(); } catch {}
        try { e.stopImmediatePropagation?.(); } catch {}
        // Guard against the same click closing the staged card
        try { document.body.setAttribute("data-photo-click-guard", String(Date.now())); } catch {}
        finish(null);
      }
    }, { once: true, signal });

  });

  if (result) {
    if (typeof onFile === "function") {
      try { await onFile(result, { itemId }); } catch (e) { console.warn("[photo] onFile error", e); }
    } else if (itemId != null) {
      const idStr = String(itemId || "");
      if (idStr.startsWith("tmp-")) {
        try { if (!window.__stagedItemPhotos) window.__stagedItemPhotos = {}; window.__stagedItemPhotos[idStr] = result; } catch {}
        try {
          const ev = new CustomEvent("item:photo-selected", { bubbles: true, detail: { itemId: idStr, file: result } });
          document.dispatchEvent(ev);
        } catch {}
        try { window.showToast?.("Photo selected"); } catch {}
      } else {
        try { await uploadItemPhoto(result, idStr); } catch (e) { console.warn("[photo] uploadItemPhoto error", e); }
      }
    }
  }

  return result;
}




/**
 * Upload an item photo to Firebase Storage and persist fields on the item.
 * Returns: { url, path }
 */
export async function uploadItemPhoto(file, itemId, prevPath = null){
  if (!(file instanceof File)) throw new Error("[photo] uploadItemPhoto: invalid file");

  // Guard: never write for staged items. Defer via global map + event.
  const idStr = String(itemId || "");
  if (idStr.startsWith("tmp-")) {
    try { if (!window.__stagedItemPhotos) window.__stagedItemPhotos = {}; window.__stagedItemPhotos[idStr] = file; } catch {}
    try {
      const ev = new CustomEvent("item:photo-selected", { bubbles: true, detail: { itemId: idStr, file } });
      document.dispatchEvent(ev);
    } catch {}
    try { window.showToast?.("Photo selected"); } catch {}
    return { url: "", path: "" };
  }

  const hh = String(window.household || "").trim();
  if (!hh) throw new Error("[photo] uploadItemPhoto: household not set");

  const storageApi = (window.firebase?.storage ? window.firebase.storage() : window.storage);
  const db = window.db;
  if (!storageApi || !db) throw new Error("[photo] uploadItemPhoto: Firebase not initialized");

  // ===== Single, global busy toast (no auto-hide, no gaps) =====
  const getBusy = () => {
    let el = document.getElementById("busyToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "busyToast";
      el.className = "toast";
      el.style.zIndex = "400000";                              // above everything
      el.style.willChange = "opacity, transform";             // smoother
      document.body.appendChild(el);
    }
    return el;
  };
  const showBusy = (text) => {
    const el = getBusy();
    el.textContent = String(text || "");
    // ensure visible; never remove until we decide
    el.classList.add("show");
    return el;
  };
  const setBusy = (text) => {
    const el = getBusy();
    el.textContent = String(text || "");
    return el;
  };
  const hideBusy = (afterMs = 0) => {
    const el = document.getElementById("busyToast");
    if (!el) return;
    const doHide = () => {
      el.classList.remove("show");
      // remove node after the CSS fade to avoid “blink”
      setTimeout(() => { el.remove(); }, 260);
    };
    if (afterMs > 0) setTimeout(doHide, afterMs); else doHide();
  };

  // Start: show persistent uploading toast and signal start
  try {
    const evStart = new CustomEvent("photo:upload-start", {
      bubbles: true,
      detail: { scope: "item", itemId }
    });
    document.dispatchEvent(evStart);
  } catch {}
  showBusy("Uploading photo…");

  let url = null;
  let path = null;

  try {
    const safeName = String(file.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]+/g, "_");
    path = `lists/${hh}/items/${itemId}/${Date.now()}-${safeName}`;
    const ref  = storageApi.ref().child(path);

    const metadata = {
      contentType: file.type || "image/jpeg",
      cacheControl: "public,max-age=31536000,immutable"
    };

    await ref.put(file, metadata);
    url = await ref.getDownloadURL();

    if (prevPath && prevPath !== path) {
      try { await storageApi.ref().child(prevPath).delete(); } catch (e) { console.warn("[photo] delete old photo failed", e); }
    }

    // Persist to Firestore; fail hard on error
    const docRef = db.collection("lists").doc(hh).collection("items").doc(itemId);
    await docRef.set({
      photoUrl: url,
      photoPath: path,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Notify listeners immediately
    try {
      const ev = new CustomEvent("item:photo-updated", {
        bubbles: true,
        detail: { itemId, url, path }
      });
      document.dispatchEvent(ev);
    } catch (e) { console.warn("[photo] dispatch item:photo-updated failed", e); }

    // Success: update text in-place, then dismiss without removing first
    setBusy("Photo updated");
    hideBusy(900);

    try {
      const evOk = new CustomEvent("photo:upload-success", {
        bubbles: true,
        detail: { scope: "item", itemId, url, path }
      });
      document.dispatchEvent(evOk);
    } catch {}

    return { url, path };
  } catch (err) {
    console.warn("[photo] uploadItemPhoto failed", err);
    // Error: update text in-place, then dismiss
    setBusy("Upload failed");
    hideBusy(1100);
    try {
      const evErr = new CustomEvent("photo:upload-error", {
        bubbles: true,
        detail: { scope: "item", itemId, error: String(err && err.message || err) }
      });
      document.dispatchEvent(evErr);
    } catch {}
    throw err;
  }
}





/**
 * Request removal of an item's photo.
 * Also emits an event so the storage + data layer can respond.
 */
export async function removeItemPhoto(itemId){
  const ev = new CustomEvent("item:photo-remove", {
    bubbles: true,
    detail: { itemId }
  });
  document.dispatchEvent(ev);
  try { window.showToast?.("Photo removed"); } catch {}
  return true;
}

/**
 * Recipe cover upload hook.
 * Emits "recipe:cover-selected" for the recipes module to handle.
 */
export async function uploadRecipeCover(file, recipeId){
  if (!(file instanceof File)) { console.warn("[photo] uploadRecipeCover: invalid file"); return; }
  const ev = new CustomEvent("recipe:cover-selected", {
    bubbles: true,
    detail: { file, recipeId }
  });
  document.dispatchEvent(ev);
  try { window.showToast?.("Cover selected"); } catch {}
  return true;
}

/**
 * Step photo upload hook.
 * Emits "recipe:step-photo-selected".
 */
export async function uploadStepPhoto(file, recipeId, stepIndex){
  if (!(file instanceof File)) { console.warn("[photo] uploadStepPhoto: invalid file"); return; }
  const ev = new CustomEvent("recipe:step-photo-selected", {
    bubbles: true,
    detail: { file, recipeId, stepIndex }
  });
  document.dispatchEvent(ev);
  try { window.showToast?.("Step photo selected"); } catch {}
  return true;
}

// Optional: initialize refs after DOM ready so first call is fast.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDomRefs, { once: true });
} else {
  initDomRefs();
}
