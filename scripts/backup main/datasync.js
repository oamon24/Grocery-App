/*
  Kaufland PWA — Data Sync (Firestore)
  Provides:
    - ensureHouseholdDoc(hh?)
    - subscribeList()
    - subscribeRecipes()
    - updateItem(id, patch)
    - updateItemAndCatalog(id, patch)
    - removeItem(id)
    - unsubscribeAll()

  Side effects:
    - Updates window.lastSnapshotItems
    - Calls window.scheduleRenderItems(items) on list changes
*/

let _unsubs = [];
let _unsubList = null;
let _unsubRecipes = null;
// Prevent redundant re-subscribe for same (uid, household)
let _subKey = "";


/* ---------- Helpers ---------- */

function ts() {
  const fv = window.firebase?.firestore?.FieldValue;
  return fv?.serverTimestamp ? fv.serverTimestamp() : null;
}

function colItems(hh) {
  const db = window.db;
  const id = String(hh || window.household || "").trim();
  if (!db || !id) throw new Error("Firestore or household not ready");
  return db.collection("lists").doc(id).collection("items");
}

function docHousehold(hh) {
  const db = window.db;
  const id = String(hh || window.household || "").trim();
  if (!db || !id) throw new Error("Firestore or household not ready");
  return db.collection("lists").doc(id);
}

/* ---------- Household ---------- */

export async function ensureHouseholdDoc(hh) {
  const d = docHousehold(hh);
  const snap = await d.get();

  if (!snap.exists) {
    await d.set(
      {
        createdAt: ts(),
        updatedAt: ts(),
      },
      { merge: true }
    );
  }

  try {
    const id = String(hh || window.household || "").trim();
    if (id) localStorage.setItem("household", id);
  } catch {}
}

/* ---------- List Subscription ---------- */

export function subscribeList() {
  try {
    const uid = window.auth?.currentUser?.uid || "anon";
    const hh  = String(window.household || "").trim();
    const key = uid + ":" + hh;

    // If already subscribed to the same (uid, household), no-op
    if (_subKey === key && _unsubList) return;

    // Switch target: always tear down previous listener first
    if (_unsubList) {
      try { _unsubList(); } catch {}
      _unsubList = null;
    }
    _subKey = key;

    const col = colItems();
    _unsubList = col.onSnapshot(
      (snap) => {
        const items = [];
        snap.forEach((doc) => {
          const it = doc.data() || {};
          it.id = doc.id;
          items.push(it);
        });

        window.lastSnapshotItems = items;
        if (typeof window.scheduleRenderItems === "function") {
          window.scheduleRenderItems(items);
        }
      },
      (err) => console.error("subscribeList failed", err)
    );

    _unsubs.push(() => {
      try { _unsubList && _unsubList(); } catch {}
      _unsubList = null;
    });
  } catch (e) {
    console.warn("subscribeList: not started", e);
  }
}


/* ---------- Recipes Subscription ---------- */

export function subscribeRecipes() {
  try {
    if (!window.db) return;

    // Global shared library: /recipes/_shared/recipes
    const d = window.db
      .collection("recipes")
      .doc("_shared")
      .collection("recipes");

    if (_unsubRecipes) {
      try { _unsubRecipes(); } catch {}
      _unsubRecipes = null;
    }

    _unsubRecipes = d.onSnapshot(
      (snap) => {
        const arr = [];
        snap.forEach((doc) => {
          arr.push({ id: doc.id, ...(doc.data() || {}) });
        });

        // Store latest snapshot
        window.lastSnapshotRecipes = arr;

        // Paint now if the renderer bridge exists, else queue for initRecipes()
        try {
          if (typeof window.setRecipesAndRepaint === "function") {
            window.setRecipesAndRepaint(arr);
          } else {
            window.__recipesPending = arr;
          }
        } catch {}
      },
      (err) => console.error("subscribeRecipes failed", err)
    );

    _unsubs.push(() => {
      try { _unsubRecipes && _unsubRecipes(); } catch {}
      _unsubRecipes = null;
    });
  } catch (e) {
    console.warn("subscribeRecipes: not started", e);
  }
}




/* ---------- Item Operations ---------- */

export async function updateItem(id, patch) {
  const rid = String(id || "").trim();
  if (!rid) throw new Error("updateItem requires id");

  const ref = colItems().doc(rid);

  // ---- Optimistic merge into local list ----
  const prev = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems.slice() : [];
  const next = prev.slice();
  const i = next.findIndex(it => String(it?.id || "") === rid);

  const optimistic = { ...(i >= 0 ? next[i] : { id: rid }), ...(patch || {}), id: rid, _syncing: true };
  if (i >= 0) next[i] = optimistic; else next.unshift(optimistic);

  try {
    window.lastSnapshotItems = next;
    if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(next);
  } catch {}

  try { window.showToast?.("Saving…"); } catch {}

  // ---- Firestore write in background ----
  try {
    const data = { ...(patch || {}), updatedAt: ts() };
    await ref.set(data, { merge: true });

    // Clear syncing flag
    const cur = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems.slice() : [];
    const j = cur.findIndex(it => String(it?.id || "") === rid);
    if (j >= 0) {
      const cleaned = { ...cur[j] };
      try { delete cleaned._syncing; } catch {}
      cur[j] = cleaned;
      window.lastSnapshotItems = cur;
      if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(cur);
    }
    try { window.showToast?.("Saved"); } catch {}
  } catch (e) {
    console.warn("updateItem failed", e);
    // Roll back
    try {
      window.lastSnapshotItems = prev;
      if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(prev);
    } catch {}
    try { window.showToast?.("Save failed. Reverted."); } catch {}
  }
}

export async function updateItemAndCatalog(id, patch) {
  // Catalog write can be added later; keep single source of truth
  await updateItem(id, patch);
}

export async function removeItem(id) {
  const rid = String(id || "").trim();
  if (!rid) return;

  // ---- Optimistic remove ----
  const prev = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems.slice() : [];
  const next = prev.filter(it => String(it?.id || "") !== rid);
  try {
    window.lastSnapshotItems = next;
    if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(next);
  } catch {}

  try { window.showToast?.("Deleting…"); } catch {}

  // ---- Firestore delete ----
  try {
    await colItems().doc(rid).delete();
    try { window.showToast?.("Deleted"); } catch {}
  } catch (e) {
    console.error("removeItem failed", e);
    // Roll back
    try {
      window.lastSnapshotItems = prev;
      if (typeof window.scheduleRenderItems === "function") window.scheduleRenderItems(prev);
    } catch {}
    try { window.showToast?.("Delete failed. Restored."); } catch {}
  }
}


/* ---------- Cleanup ---------- */

export function unsubscribeAll() {
  try {
    if (_unsubList) {
      try { _unsubList(); } catch {}
      _unsubList = null;
    }

    if (_unsubRecipes) {
      try { _unsubRecipes(); } catch {}
      _unsubRecipes = null;
    }

    _unsubs.forEach((fn) => {
      try { fn(); } catch {}
    });
  } finally {
    _unsubs = [];
  }
}
