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
    if (!window.db || !window.household) return;

    // Correct root: /recipes/{household}/recipes
    const d = window.db
      .collection("recipes")
      .doc(window.household)
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
  if (!id) throw new Error("updateItem requires id");
  const ref = colItems().doc(String(id));
  const data = { ...(patch || {}), updatedAt: ts() };
  await ref.set(data, { merge: true });
}

export async function updateItemAndCatalog(id, patch) {
  await updateItem(id, patch);
}

export async function removeItem(id) {
  if (!id) return;
  try {
    await colItems().doc(String(id)).delete();
  } catch (e) {
    console.error("removeItem failed", e);
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
