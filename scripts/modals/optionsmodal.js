// scripts/modals/optionsModal.js
import { lockBody, unlockBody, bindOverlayClose, bindEscClose } from "./manager.js";

let injected = false;
let modal, closeBtn, householdBtn, themeBtn;

function ensureModal() {
  if (injected) return;
  injected = true;

  modal = document.createElement("div");
  modal.id = "optionsModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="backdrop" data-close="1"></div>
    <div class="sheet" role="document">
      <header class="sheet-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <h3 style="margin:0">Options</h3>
        <button id="optClose" type="button" aria-label="Close">✕</button>
      </header>
      <section class="sheet-body" style="display:grid;gap:12px;">
        <button id="optHouseholdBtn" class="primary" type="button">Household & Sync…</button>
        <button id="optThemeBtn"      class="secondary" type="button">Theme…</button>
      </section>
    </div>
  `;
  document.body.appendChild(modal);

  closeBtn     = modal.querySelector("#optClose");
  householdBtn = modal.querySelector("#optHouseholdBtn");
  themeBtn     = modal.querySelector("#optThemeBtn");

  const close = () => { modal.classList.remove("show"); modal.setAttribute("aria-hidden","true"); unlockBody?.(); };
  closeBtn?.addEventListener("click", close);
  bindOverlayClose?.(modal, close);
  bindEscClose?.(modal, close);

  modal.__open  = () => { modal.classList.add("show"); modal.setAttribute("aria-hidden","false"); lockBody?.(); closeBtn?.focus(); };
  modal.__close = close;

  // Wire actions (adjust targets if you have dedicated modals)
  householdBtn?.addEventListener("click", () => { close(); window.openModal?.("household"); });
  themeBtn?.addEventListener("click", () => { close(); window.openModal?.("theme"); });
}

export function openOptionsModal() {
  ensureModal();
  modal.__open?.();
}

export function closeOptionsModal() {
  if (!injected) return;
  modal.__close?.();
}

// Bottom nav module handles #optionsBtn click.
// Removed duplicate self-wiring to avoid double-open.

