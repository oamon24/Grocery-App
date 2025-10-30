/*
  Kaufland PWA — Firebase starter (compat SDK friendly)
  Exports: initFirebase(), auth, db, storage
  Safe: if Firebase SDK or config is missing, logs a warning and keeps going.
*/

export let auth = null;
export let db = null;
export let storage = null;

let _inited = false;

export async function initFirebase() {
  if (_inited) return { auth, db, storage };

  // Require compat SDK already loaded in the page <head> (as in your current app)
  const hasCompat =
    typeof window !== "undefined" &&
    window.firebase &&
    typeof firebase === "object" &&
    Array.isArray(firebase.apps);

  if (!hasCompat) {
    console.warn("[firebase] SDK not found on page. Skipping init.");
    return { auth: null, db: null, storage: null };
  }

  try {
    // Use existing app if present, else init with global config if provided
    const app =
      firebase.apps.length
        ? firebase.apps[0]
        : firebase.initializeApp(window.firebaseConfig || {});

    // Core services
    auth = firebase.auth();
    db = firebase.firestore();
    storage = (firebase.storage && firebase.storage()) || null;

    // Enable offline persistence when possible (ignore failures silently)
    try {
      if (db && typeof db.enablePersistence === "function") {
        await db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      }
    } catch { /* ignore */ }

    _inited = true;
    return { auth, db, storage };
  } catch (e) {
    console.error("[firebase] init failed:", e);
    return { auth: null, db: null, storage: null };
  }
}
// Expose globals for legacy modules
if (typeof window !== "undefined") {
  window.db = db;
  window.auth = auth;
  window.storage = storage;
}
