/*
  Modal Manager — unified helpers for overlays
  Exports:
    - lockBody(), unlockBody()
    - bindOverlayClose(modalEl, closeFn)  // closes when clicking backdrop (modal root or .backdrop)
    - bindEscClose(modalEl, closeFn)      // closes on Escape while modal has .show
*/

// Reference-counted body lock so multiple modals do not fight
if (typeof window.__modalLockCount !== "number") window.__modalLockCount = 0;

export function lockBody() {
  try {
    window.__modalLockCount += 1;
    if (window.__modalLockCount === 1) document.body.classList.add("modal-open");
  } catch {}
}

export function unlockBody() {
  try {
    window.__modalLockCount = Math.max(0, (window.__modalLockCount || 0) - 1);
    if (window.__modalLockCount === 0) document.body.classList.remove("modal-open");
  } catch {}
}

export function bindOverlayClose(modalEl, closeFn) {
  if (!modalEl || typeof closeFn !== "function") return () => {};
  const onClick = (e) => {
    const t = e.target;
    if (t === modalEl || (t && t.classList && t.classList.contains("backdrop"))) closeFn();
  };
  modalEl.addEventListener("click", onClick);
  return () => modalEl.removeEventListener("click", onClick);
}

export function bindEscClose(modalEl, closeFn) {
  if (!modalEl || typeof closeFn !== "function") return () => {};
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (!modalEl.classList.contains("show")) return;
    closeFn();
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}
