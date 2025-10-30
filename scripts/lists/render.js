/*
  List renderers — Phase 3
  Extracted from index.html (no behavior changes).
  Provides:
    - window.render(items)
    - window.renderBoth(items)
    - renderFlatByRoute(items)
    - renderGroupedByCategory(items)
  Depends on existing globals: activeTab, filterModeEl, liveListQuery, renderRow(...)
*/

(function(){
  // Local DOM helper (matches inline code)
  const $ = (id) => document.getElementById(id);

  // Dynamic targets; reassigned by renderer (matches inline code)
  let listEl  = $('list_list');
  let emptyEl = $('empty_list');

  function getTargets(tab){
    return (tab === 'shopping')
      ? { listEl: $('list_shopping'), emptyEl: $('empty_shopping') }
      : { listEl: $('list_list'),    emptyEl: $('empty_list') };
  }

  // Skeleton helpers already exist inline; define safe no-ops if missing
  if (typeof window.showListSkeleton !== 'function') window.showListSkeleton = function(){};
  if (typeof window.hideListSkeleton  !== 'function') window.hideListSkeleton  = function(){};

  // === Utility: Capitalize at start of string or after spaces only (kept local) ===
  function capitalizeWords(str){
    if (!str) return '';
    return String(str).replace(/(^|\s)([a-z\u00C0-\u024F])/g, function(_, pre, ch){
      return pre + ch.toUpperCase();
    });
  }
  // Expose only if not present globally (preserve legacy callers)
  if (typeof window.capitalizeWords !== 'function') window.capitalizeWords = capitalizeWords;

  // Public render entry (unchanged)
  function render(items){
    // Start from all items
    let filtered = items;

    // Cache latest full items snapshot for instant startup
    const _ric = window.requestIdleCallback || function(cb){ return setTimeout(cb, 0); };
    _ric(() => {
      try { localStorage.setItem('cache_items', JSON.stringify(items || [])); } catch {}
    });

if (window.activeTab === 'shopping') {
  // Shopping tab view toggles between recent-checked (last 12h) and active (unchecked + qty>0)
  const mode = (window.shoppingViewMode === 'checked') ? 'checked' : 'unchecked';
  if (mode === 'checked') {
    // Show only items checked within last 12 hours
    const pred = (typeof window.isRecentChecked === 'function')
      ? window.isRecentChecked
      : (it => !!it.checked);
    filtered = items.filter(pred);
  } else {
    // Default: show items that are not checked and have quantity > 0
    filtered = items.filter(i => !i.checked && parseFloat(i.qty || '0') > 0);
  }
} else {
  // List tab: obey the dropdown filter (all / checked / unchecked)
  const fm = (window.filterModeEl && window.filterModeEl.value) || 'all';
  if (fm === 'unchecked') {
    filtered = items.filter(i => !i.checked);
  } else if (fm === 'checked') {
    filtered = items.filter(i => !!i.checked);
  }
  // Apply live query from the Item input (case-insensitive STARTS-WITH match)
  const q = (window.liveListQuery || '').trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(i => (i.name || '').toLowerCase().startsWith(q));
  }
}

    // Render by chosen sort mode (accept both old and new keys)
    const raw = (window.activeTab === 'shopping')
      ? (localStorage.getItem('sort.shopping') || localStorage.getItem('sortMode_shopping') || 'route')
      : (localStorage.getItem('sort.list')     || localStorage.getItem('sortMode_list')     || 'route');

    // Normalize option labels: drawer uses "alpha", renderer uses "name"
    const mode = (raw === 'alpha') ? 'name' : raw;

    if (mode === 'category') {

      renderGroupedByCategory(filtered);
    } else if (mode === 'name') {
      // Flat list sorted by name (A→Z)
      const byName = [...filtered].sort((a,b)=> (a.name||'').localeCompare(b.name||''));
      listEl.innerHTML = '';
      if (!byName.length){ emptyEl.style.display = 'block'; return; }
      emptyEl.style.display = 'none';
      for (const it of byName) listEl.appendChild(window.renderRow(it));
    } else {
      renderFlatByRoute(filtered);
    }
  }

  /* === Dual renderer for preloading both tabs (unchanged) === */
  function renderBoth(items){
    const prevTab = window.activeTab;

    // Paint List tab DOM
    ({ listEl, emptyEl } = getTargets('list'));
    window.activeTab = 'list';
    render(items);

    // Paint Shopping tab DOM
    ({ listEl, emptyEl } = getTargets('shopping'));
    window.activeTab = 'shopping';
    render(items);

    // Restore current tab and show only its DOM
    window.activeTab = prevTab;
    const isShopping = (window.activeTab === 'shopping');
    $('list_list').style.display       = isShopping ? 'none' : '';
    $('empty_list').style.display      = isShopping ? 'none' : ( $('list_list').children.length ? 'none' : '' );
    $('list_shopping').style.display   = isShopping ? '' : 'none';
    $('empty_shopping').style.display  = isShopping ? ( $('list_shopping').children.length ? 'none' : '' ) : 'none';
  }

  function renderFlatByRoute(items){
    const sorted = [...items].sort((a,b)=>{
      const ra = isNaN(parseFloat(a.routeOrder)) ? -1 : parseFloat(a.routeOrder);
      const rb = isNaN(parseFloat(b.routeOrder)) ? -1 : parseFloat(b.routeOrder);
      if (ra !== rb) return ra - rb;
      return (a.name||'').localeCompare(b.name||'');
    });

    listEl.innerHTML = '';
    if (!sorted.length){ emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    for (const it of sorted) listEl.appendChild(window.renderRow(it));
  }

  function renderGroupedByCategory(items){
    const groups = new Map();
    for (const it of items){
      const key = (it.category || '').trim() || 'Uncategorized';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    const catNames = [...groups.keys()].sort((a,b)=>a.localeCompare(b));
    listEl.innerHTML = '';
    if (!catNames.length){ emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';

    for (const cat of catNames){
      const header = document.createElement('div');
      header.className = 'groupHeader';
      const dot = document.createElement('div'); dot.className='dot';
      const label = document.createElement('div'); label.textContent = cat;
      header.append(dot,label);
      listEl.appendChild(header);

      const box = document.createElement('div'); box.className = 'groupBox';
      const rows = groups.get(cat).sort((a,b)=>{
        const an = (a.name||''), bn = (b.name||'');
        const cmp = an.localeCompare(bn); if (cmp !== 0) return cmp;
        const ra = isNaN(parseFloat(a.routeOrder)) ? -1 : parseFloat(a.routeOrder);
        const rb = isNaN(parseFloat(b.routeOrder)) ? -1 : parseFloat(b.routeOrder);
        return ra - rb;
      });
      for (const it of rows) box.appendChild(window.renderRow(it));
      listEl.appendChild(box);
    }
  }

  // Public API
  window.render = render;
  window.renderBoth = renderBoth;
  window.renderFlatByRoute = renderFlatByRoute;
  window.renderGroupedByCategory = renderGroupedByCategory;

  // Debounced scheduler (keep behavior if not already defined)
  if (typeof window.scheduleRenderItems !== 'function') {
    let raf = 0, last = null;
    window.scheduleRenderItems = function scheduleRenderItems(items) {
      last = Array.isArray(items) ? items : [];
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        try { window.render && window.render(last); } catch(e){ console.warn('scheduleRenderItems: render failed', e); }
      });
    };
  }
})();
