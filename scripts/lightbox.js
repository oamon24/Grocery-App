/*
  lightbox.js — fullscreen viewer for list thumbnails
  - Builds DOM on first use
  - Keeps aspect ratio (CSS contain rules)
  - Close on backdrop, X, or Escape
  - Shows cam button when onCamera is provided
*/

function ensureDom() {
  let lb = document.querySelector(".lightbox");
  if (lb) return lb;

  lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = `
    <div class="lb-inner">
      <button class="cam" aria-label="Change photo">📷</button>
      <button class="close" aria-label="Close">✕</button>
      <img alt="photo view">
    </div>`;
  document.body.appendChild(lb);
  return lb;
}

export function openLightbox(src, opts = {}) {
  const { onCamera } = opts || {};
  const lb = ensureDom();
  const img = lb.querySelector("img");
  const btnCam = lb.querySelector(".cam");
  const btnClose = lb.querySelector(".close");

  img.src = src || "";

  // Show cam button only when handler present
  btnCam.style.display = typeof onCamera === "function" ? "inline-flex" : "none";

  // Open
  lb.classList.add("show");
  lb.setAttribute("aria-hidden", "false");
  try { document.body.classList.add("modal-open"); } catch {}

  const close = () => {
    lb.classList.remove("show");
    lb.setAttribute("aria-hidden", "true");
    try { document.body.classList.remove("modal-open"); } catch {}
    // cleanup listeners
    lb.removeEventListener("click", onBackdrop);
    btnClose.removeEventListener("click", onX);
    btnCam.removeEventListener("click", onCam);
    document.removeEventListener("keydown", onEsc);
  };

  const onBackdrop = (e) => {
    if (e.target === lb) close();
  };
  const onX = () => close();
  const onCam = () => { if (typeof onCamera === "function") onCamera(); };
  const onEsc = (e) => { if (e.key === "Escape") close(); };

  lb.addEventListener("click", onBackdrop);
  btnClose.addEventListener("click", onX);
  btnCam.addEventListener("click", onCam);
  document.addEventListener("keydown", onEsc, { once: true });
}
// Listen for photo updates from uploads
document.addEventListener("item:photo-updated", (e) => {
  const { itemId, url } = e.detail || {};
  const lb = document.querySelector(".lightbox.show");
  if (!lb || !url) return;
  const img = lb.querySelector("img");
  if (!img) return;
  const nextSrc = url.includes("?") ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
  img.src = nextSrc;
});
