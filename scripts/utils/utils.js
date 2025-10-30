/*
  Kaufland PWA — utils
  Small helpers used across modules.
*/

// Shorthand DOM getter by id
export function $(id) {
  return document.getElementById(id);
}

// Escape text for safe HTML insertion
export function escapeHtml(input) {
  const s = String(input ?? "");
  return s.replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Capitalize words like "green apples" → "Green Apples"
export function capitalizeWords(input) {
  const s = String(input || "").trim();
  return s.replace(/\b([a-z])/g, m => m.toUpperCase());
}

// DOM ready helper
export function onDomReady(fn) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  } else {
    fn();
  }
}
