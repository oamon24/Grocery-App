/*
  Bottom navigation wiring
  - Keeps active pill state
  - Opens Options via centralized modal loader
*/
import { openOptionsModal } from "../modals/optionsModal.js";

export function initBottomNav(){
  const idToTab = { tabList: "list", tabShopping: "shopping", tabRecipes: "recipes" };
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("#tabList, #tabShopping, #tabRecipes, #optionsBtn");
    if (!btn) return;
    if (btn.id === "optionsBtn") { openOptionsModal(); return; }
    const tab = idToTab[btn.id];
    if (!tab) return;
    try { localStorage.setItem("activeTab", tab); } catch {}
    if (typeof window.setActiveTab === "function") window.setActiveTab(tab);
  });
}
