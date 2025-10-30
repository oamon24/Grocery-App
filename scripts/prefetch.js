/* Data prefetch — Firestore only, no photos.
   Goal: read all user-visible docs once to hydrate the local cache.
   Safe to run multiple times. Chunked to keep the UI responsive. */

export async function prefetchAllData({ household, onProgress } = {}) {
  const fs = window?.db;
  if (!fs) return;

  const hh = household || window?.household;
  if (!hh) return;

  // Progress helper
  const progress = (step, info) => {
    try { onProgress && onProgress(step, info); } catch {}
  };

  // Idle-yield helper
  const idle = () => new Promise((r) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => r(), { timeout: 100 });
    } else {
      setTimeout(() => r(), 0);
    }
  });

  // Reader that touches each doc's data() to ensure it lands in the local cache
  const readAll = async (query, label) => {
    const snap = await query.get();                 // goes to network once, then cache
    let n = 0;
    snap.forEach(d => { d.data(); n += 1; });
    progress(label, { count: n });
    await idle();
    return n;
  };

  // Collections to hydrate
  // lists/<hh>                — list meta
  // lists/<hh>/items          — shopping items
  // recipes/_shared/recipes   — shared recipe library
  // recipes/<hh>/recipes      — user recipes
  // Add more here if you add new user-visible collections.

  // lists/<hh>
  await readAll(fs.collection("lists").doc(hh), "lists.doc"); // doc read
  // lists/<hh>/items
  await readAll(fs.collection("lists").doc(hh).collection("items"), "items");

  // recipes/_shared/recipes
  await readAll(fs.collection("recipes").doc("_shared").collection("recipes"), "recipes.shared");

  // recipes/<hh>/recipes
  await readAll(fs.collection("recipes").doc(hh).collection("recipes"), "recipes.user");

  // Optional: pre-read any per-recipe nested subcollections if you add them later.
  // This module intentionally avoids photos. Images from Firebase Storage are not fetched here.
}
