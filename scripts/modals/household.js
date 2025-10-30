// scripts/modals/household.js
import { auth } from "../firebase.js";
import { showToast } from "../ui/ui.js";
import { registerModal, openModal as openAnyModal } from "../ui/loadModal.js";

// Register HTML partial with centralized loader
registerModal("household", { id: "householdModal", url: "/partials/modals/household.html" });

// Expose a convenience opener if needed elsewhere
if (typeof window.openHousehold !== "function") {
  window.openHousehold = function openHousehold() { try { openAnyModal("household"); } catch {} };
}

function refreshStatus(modal) {
  try {
    const el = modal?.querySelector("#hhStatus");
    if (!el) return;
    const u = auth?.currentUser;
    const hh = localStorage.getItem("household") || "";
    el.textContent = u
      ? (u.email ? `Signed in as ${u.email}` : `Signed in (anonymous: ${u?.uid?.slice?.(0,6)}…)`) + (hh ? ` • household: ${hh}` : "")
      : "Not signed in";
  } catch {}
}

function prefill(modal) {
  try {
    const hhEl = modal?.querySelector("#hhInput");
    const emailEl = modal?.querySelector("#hhEmail");
    const passEl = modal?.querySelector("#hhPassword");
    const hh = localStorage.getItem("household") || "";
    if (hhEl && !hhEl.value) hhEl.value = hh;
    // focus preference: if email already typed then focus password, else email, else household
    const target = (emailEl?.value ? passEl : emailEl) || hhEl;
    target?.focus();
  } catch {}
}

function wireModal(modal) {
  if (!modal || modal.__wired) return;
  modal.__wired = true;

  // Elements
  const emailEl    = modal.querySelector("#hhEmail");
  const passEl     = modal.querySelector("#hhPassword");
  const signinBtn  = modal.querySelector("#hhSignin");
  const signoutBtn = modal.querySelector("#hhSignout");
  const hhEl       = modal.querySelector("#hhInput");
  const hhSave     = modal.querySelector("#hhSave");

  // Actions
  if (signinBtn) signinBtn.addEventListener("click", async () => {
    const email = String(emailEl?.value || "").trim();
    const pass  = String(passEl?.value || "");
    if (!email || !pass) { showToast("Enter email and password"); (email ? passEl : emailEl)?.focus(); return; }
    try {
      const api = (window.firebase?.auth ? window.firebase.auth() : auth);
      if (!api) { showToast("Auth not initialized"); return; }
      await api.signInWithEmailAndPassword(email, pass);
      await window.ensureHouseholdDoc?.();
      await window.subscribeList?.();
      await window.subscribeRecipes?.();
      showToast("Signed in");
      refreshStatus(modal);
    } catch (e) {
      console.error(e);
      showToast(e?.message || "Sign-in failed");
    }
  });

  if (signoutBtn) signoutBtn.addEventListener("click", async () => {
    try {
      await auth?.signOut?.();
      showToast("Signed out");
      refreshStatus(modal);
    } catch (e) {
      console.warn(e);
      showToast("Sign-out failed");
    }
  });

  if (hhSave) hhSave.addEventListener("click", async () => {
    const v = String(hhEl?.value || "").trim();
    if (!v) { showToast("Enter a household id"); hhEl?.focus(); return; }
    try {
      localStorage.setItem("household", v);
      window.household = v;
      await window.ensureHouseholdDoc?.(v);
      await window.subscribeList?.();
      await window.subscribeRecipes?.();
      showToast("Household set");
      refreshStatus(modal);
    } catch (e) {
      console.warn(e);
      showToast("Failed to set household");
    }
  });

  // Keep status in sync with auth changes
  try {
    auth?.onAuthStateChanged?.(() => refreshStatus(modal));
  } catch {}

  // First fill
  refreshStatus(modal);
  prefill(modal);
}

// Observe for modal insertion and show/hide to run hooks
(function observeHouseholdModal(){
  const tryWire = () => {
    const m = document.getElementById("householdModal");
    if (m) wireModal(m);
  };
  tryWire();

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        if ([...m.addedNodes].some(n => n instanceof HTMLElement && n.id === "householdModal")) {
          tryWire();
        }
      } else if (m.type === "attributes" && m.target && m.target.id === "householdModal" && m.attributeName === "class") {
        // When opened, refresh and prefill
        const el = m.target;
        if (el.classList.contains("show")) {
          refreshStatus(el);
          prefill(el);
        }
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
})();
