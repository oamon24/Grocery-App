// scripts/modals/theme.js
import { registerModal, openModal as openAnyModal } from "../ui/loadModal.js";
import { showToast } from "../ui/ui.js";

// Register lazy-loaded partial with the central modal loader
registerModal("theme", { id: "themeModal", url: "/partials/modals/household.html".replace("household","theme") });

// Optional convenience opener
if (typeof window.openTheme !== "function") {
  window.openTheme = () => { try { openAnyModal("theme"); } catch {} };
}

// ---- Color helpers ----
function clamp255(n){ n = Number(n); return Number.isFinite(n) ? Math.min(255, Math.max(0, Math.round(n))) : 0; }
function toHex2(n){ const s = clamp255(n).toString(16).padStart(2,"0"); return s; }
function rgbToHex(r,g,b){ return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`; }
function hexToRgb(hex){
  if (typeof hex !== "string") return { r:255,g:42,b:127 };
  const m = hex.trim().toLowerCase().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r:255,g:42,b:127 };
  const n = parseInt(m[1], 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}

// Apply theme to <html>
function applyTheme(mode, color, { quiet=false } = {}) {
  const root = document.documentElement;

  // Reset explicit theme, then apply if light/dark
  root.removeAttribute("data-theme");
  if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);

  // Accent only in custom mode
  if (mode === "custom" && color) {
    root.style.setProperty("--accent", color);
    // Back-compat: many styles use --primary
    root.style.setProperty("--primary", color);
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--primary");
  }

  try {
    localStorage.setItem("theme.mode", mode);
    if (color) localStorage.setItem("theme.color", color);
    if (!quiet && typeof showToast === "function") showToast("Theme updated");
  } catch {}
}


function updateRgbUI(modal, {r,g,b}){
  const rIn = modal.querySelector("#rgbR");
  const gIn = modal.querySelector("#rgbG");
  const bIn = modal.querySelector("#rgbB");
  const rVal = modal.querySelector("#rgbRVal");
  const gVal = modal.querySelector("#rgbGVal");
  const bVal = modal.querySelector("#rgbBVal");
  const hexEl = modal.querySelector("#rgbHex");
  const swatch = modal.querySelector("#rgbSwatch");

  if (rIn) rIn.value = clamp255(r);
  if (gIn) gIn.value = clamp255(g);
  if (bIn) bIn.value = clamp255(b);
  if (rVal) rVal.textContent = clamp255(r);
  if (gVal) gVal.textContent = clamp255(g);
  if (bVal) bVal.textContent = clamp255(b);

  const hex = rgbToHex(r,g,b);
  if (hexEl) hexEl.textContent = hex;
  if (swatch) swatch.style.background = hex;

  return hex;
}

function currentRgb(modal){
  const r = clamp255((modal.querySelector("#rgbR")?.value) ?? 255);
  const g = clamp255((modal.querySelector("#rgbG")?.value) ?? 42);
  const b = clamp255((modal.querySelector("#rgbB")?.value) ?? 127);
  return { r:Number(r), g:Number(g), b:Number(b) };
}

function prefill(modal) {
  const sel = modal.querySelector("#themeModeSelect");
  const rIn = modal.querySelector("#rgbR");
  const gIn = modal.querySelector("#rgbG");
  const bIn = modal.querySelector("#rgbB");
  try {
    const savedMode = localStorage.getItem("theme.mode") || "system";
    const savedCol  = localStorage.getItem("theme.color") || "#ff2a7f";
    const { r, g, b } = hexToRgb(savedCol);

    if (sel) sel.value = savedMode;
    const hex = updateRgbUI(modal, { r, g, b });

    // Apply current theme quietly on open
    applyTheme(savedMode, hex, { quiet:true });

    // Enable sliders only when custom
    const enable = (savedMode === "custom");
    if (rIn) rIn.disabled = !enable;
    if (gIn) gIn.disabled = !enable;
    if (bIn) bIn.disabled = !enable;

    (sel || rIn || modal.querySelector("[role='dialog']") || modal).focus?.();
  } catch {}
}

function wireModal(modal) {
  if (!modal || modal.__wired) return;
  modal.__wired = true;

  const sel   = modal.querySelector("#themeModeSelect");
  const rIn   = modal.querySelector("#rgbR");
  const gIn   = modal.querySelector("#rgbG");
  const bIn   = modal.querySelector("#rgbB");
  const reset = modal.querySelector("#themeReset");

  const onSliderInput = () => {
    const { r, g, b } = currentRgb(modal);
    const hex = updateRgbUI(modal, { r, g, b });
    if ((sel?.value || "system") === "custom") {
      applyTheme("custom", hex, { quiet:true });
    }
  };

  rIn?.addEventListener("input", onSliderInput);
  gIn?.addEventListener("input", onSliderInput);
  bIn?.addEventListener("input", onSliderInput);

  if (sel) {
    sel.addEventListener("change", () => {
      const mode = sel.value;
      const { r, g, b } = currentRgb(modal);
      const hex = updateRgbUI(modal, { r, g, b });
      const enable = (mode === "custom");
      if (rIn) rIn.disabled = !enable;
      if (gIn) gIn.disabled = !enable;
      if (bIn) bIn.disabled = !enable;
      applyTheme(mode, hex, { quiet:false });
    });
  }

  if (reset) {
    reset.addAction = reset.addEventListener || reset.addAction; // legacy guard
    reset.addEventListener("click", () => {
      if (sel) sel.value = "system";
      const hex = updateRgbUI(modal, { r:255, g:42, b:127 });
      if (rIn) rIn.disabled = true;
      if (gIn) gIn.disabled = true;
      if (bIn) bIn.disabled = true;
      applyTheme("system", hex, { quiet:false });
    });
  }

  // Refresh on open to pick up persisted values
  const observer = new MutationObserver(() => {
    if (modal.classList.contains("show")) prefill(modal);
  });
  observer.observe(modal, { attributes: true, attributeFilter: ["class"] });

  // Initial fill
  prefill(modal);
}

// Observe DOM for injected partial
(function observeThemeModal() {
  const tryWire = () => {
    const el = document.getElementById("themeModal");
    if (el) wireModal(el);
  };
  tryWire();

  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === "childList") {
        if ([...m.addedNodes].some(n => n instanceof HTMLElement && n.id === "themeModal")) {
          tryWire();
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();

// Apply saved theme as early as possible on module load
(function earlyApply() {
  try {
    const mode  = localStorage.getItem("theme.mode") || "system";
    const color = localStorage.getItem("theme.color") || "#ff2a7f";
    applyTheme(mode, color, { quiet:true });
  } catch {}
})();
