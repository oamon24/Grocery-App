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

    // Clean up any existing recipe subscriptions
    if (_unsubRecipes) {
      try { _unsubRecipes(); } catch {}
      _unsubRecipes = null;
    }

    const db = window.db;
    const colShared = db.collection("recipes").doc("_shared").collection("recipes");
    const householdId = (window.household || "").trim();
    const colHousehold = householdId
      ? db.collection("recipes").doc(householdId).collection("recipes")
      : null;

    // Local caches for merge
    let sharedArr = [];
    let hhArr = [];

    const emitMerged = () => {
      // Deduplicate by id. Household wins if ids collide.
      const map = new Map();
      sharedArr.forEach((r) => map.set(r.id, r));
      hhArr.forEach((r) => map.set(r.id, r));
      const merged = Array.from(map.values());

      window.lastSnapshotRecipes = merged;

      try {
        if (typeof window.setRecipesAndRepaint === "function") {
          window.setRecipesAndRepaint(merged);
        } else {
          window.__recipesPending = merged;
        }
      } catch {}
    };

    // Start listeners
    const unsubShared = colShared.onSnapshot(
      (snap) => {
        const arr = [];
        snap.forEach((doc) => arr.push({ id: doc.id, ...(doc.data() || {}) }));
        sharedArr = arr;
        emitMerged();
      },
      (err) => console.error("subscribeRecipes shared failed", err)
    );

    const unsubHousehold = colHousehold
      ? colHousehold.onSnapshot(
          (snap) => {
            const arr = [];
            snap.forEach((doc) => arr.push({ id: doc.id, ...(doc.data() || {}) }));
            hhArr = arr;
            emitMerged();
          },
          (err) => console.error("subscribeRecipes household failed", err)
        )
      : null;

    // Unified unsubscribe
    _unsubRecipes = () => {
      try { unsubShared && unsubShared(); } catch {}
      try { unsubHousehold && unsubHousehold(); } catch {}
    };

    _unsubs.push(() => {
      try { _unsubRecipes && _unsubRecipes(); } catch {}
      _unsubRecipes = null;
    });
  } catch (e) {
    console.warn("subscribeRecipes: not started", e);
  }
}


/**
 * Delete a recipe from the shared library.
 * Path: /recipes/_shared/recipes/{id}
 * Optimistic: remove from cache immediately, rollback on failure.
 */
export async function deleteSharedRecipe(id) {
  const rid = String(id || "").trim();
  if (!rid) return;
  const db = window.db;
  if (!db) throw new Error("Firestore not initialized");

  // ---- Optimistic remove from merged cache ----
  const prev = Array.isArray(window.lastSnapshotRecipes) ? window.lastSnapshotRecipes.slice() : [];
  const next = prev.filter(r => String(r?.id || "") !== rid);
  try {
    window.lastSnapshotRecipes = next;
    try { localStorage.setItem("cache_recipes", JSON.stringify(next)); } catch {}
    try {
      if (typeof window.setRecipesAndRepaint === "function") window.setRecipesAndRepaint(next);
      else if (typeof window.scheduleRenderRecipes === "function") window.scheduleRenderRecipes(next);
      else window.__recipesPending = next;
    } catch {}
  } catch {}

  try { window.showToast?.("Deleting…"); } catch {}

  // ---- Firestore delete in background ----
  try {
    await db
      .collection("recipes")
      .doc("_shared")
      .collection("recipes")
      .doc(rid)
      .delete();

    try { window.showToast?.("Deleted"); } catch {}
  } catch (e) {
    console.error("deleteSharedRecipe failed", e);

    // ---- Roll back on failure ----
    try {
      window.lastSnapshotRecipes = prev;
      try { localStorage.setItem("cache_recipes", JSON.stringify(prev)); } catch {}
      try {
        if (typeof window.setRecipesAndRepaint === "function") window.setRecipesAndRepaint(prev);
        else if (typeof window.scheduleRenderRecipes === "function") window.scheduleRenderRecipes(prev);
        else window.__recipesPending = prev;
      } catch {}
    } catch {}

    try { window.showToast?.("Delete failed. Restored."); } catch {}
    throw e;
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


/**
 * One-time migration: copy all recipes from /recipes/{household}/recipes
 * to /recipes/_shared/recipes, preserving doc IDs.
 * Usage: await window.migrateHouseholdRecipesToShared("yourHouseholdId")
 * or omit param to use window.household.
 */
export async function migrateHouseholdRecipesToShared(hh) {
  const db = window.db;
  const household = String(hh || window.household || "").trim();
  if (!db) throw new Error("Firestore not initialized");
  if (!household) throw new Error("Household id required");

  const src = db.collection("recipes").doc(household).collection("recipes");
  const dst = db.collection("recipes").doc("_shared").collection("recipes");

  const snap = await src.get();
  const total = snap.size;
  if (!total) return { total: 0, copied: 0 };

  let copied = 0;
  let batch = db.batch();
  let n = 0;

  const nowTs = ts();

  snap.forEach((doc) => {
    const data = doc.data() || {};
    const ref = dst.doc(doc.id);
    batch.set(
      ref,
      {
        ...data,
        // annotate origin and make it clearly public
        originHousehold: household,
        originRecipeId: doc.id,
        migratedAt: nowTs,
        visibility: "public",
        updatedAt: nowTs,
      },
      { merge: true }
    );
    n += 1;

    if (n === 500) {
      // commit current batch and start a new one
      batch.commit();
      copied += n;
      n = 0;
      batch = db.batch();
    }
  });

  if (n > 0) {
    await batch.commit();
    copied += n;
  }

  return { total, copied };
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
