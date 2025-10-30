/*
  Cook step timers — bridge
  Delegates to existing inline functions if present.
*/
function bind(name) {
  const fn = window[name];
  return typeof fn === "function" ? fn : (...a) => console.warn(`[cook/timers] ${name} not migrated`, a);
}
export const createStepTimer = bind("createStepTimer");
export const updateTimerUI   = bind("updateTimerUI");
export const resetStepTimer  = bind("resetStepTimer");
