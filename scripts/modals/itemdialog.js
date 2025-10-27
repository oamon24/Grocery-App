import { lockBody, unlockBody, bindOverlayClose, bindEscClose } from "./manager.js";
/*
  Item Settings Dialog — migrated from inline <script id="item-dialog-js">
  Keeps IDs and behavior identical. Exposes window.openItemDialog and window.openCreateItemDialog.
*/


(function initItemDialogModule(){
  if (window.__itemDialogInit) return;
  window.__itemDialogInit = true;

  const $ = (id) => document.getElementById(id);

  // Lazy DOM references + on-demand HTML injection
  const MODAL_ID = 'itemDialog';
  const MODAL_URL = '/partials/modals/itemDialog.html';

  let dlg, btnX, btnSave, btnDel, btnAdd;
  let fName, fQty, fSize, fCat, fRoute, fNotes;

  async function ensureHtmlMounted() {
    if (document.getElementById(MODAL_ID)) return;
    const res = await fetch(MODAL_URL, { credentials: 'same-origin' });
    const html = await res.text();
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function ensureRefs() {
    // Re-query every time so late-mounted markup is supported
    dlg      = document.getElementById('itemDialog');
    btnX     = document.getElementById('itemDlgClose');
    btnSave  = document.getElementById('itemDlgSave');
    btnDel   = document.getElementById('itemDlgDelete');
    btnAdd   = document.getElementById('itemDlgAdd');

    fName = document.getElementById('dlgName');
    fQty  = document.getElementById('dlgQty');
    fSize = document.getElementById('dlgSize');
    fCat  = document.getElementById('dlgCategory');
    fRoute= document.getElementById('dlgRoute');
    fNotes= document.getElementById('dlgNotes');

    // One-time wiring after first successful resolve
    if (dlg && !dlg.__wired) {
      dlg.__wired = true;
      bindOverlayClose(dlg, close);
      if (btnX)   btnX.addEventListener('click', close);
      if (btnDel) btnDel.addEventListener('click', onDelete);
      if (btnAdd) btnAdd.addEventListener('click', onAdd);
      if (btnSave) btnSave.addEventListener('click', () => { try { onSave(); } catch(e){ console.error(e); } });
      bindEscClose(dlg, close);
    }
  }


  let current = null;    // { id, ...fields } when editing
  let baseline = null;   // snapshot for dirty-state
  let createMode = false;

  function getSnapshot(){
    return {
      name: (fName.value || ''),
      qty: (fQty.value || ''),
      size: (fSize.value || ''),
      category: (fCat.value || ''),
      route: (fRoute.value === '' ? '' : String(fRoute.value)),
      notes: (fNotes.value || '')
    };
  }

  function equal(a, b){
    return a.name === b.name &&
           a.qty === b.qty &&
           a.size === b.size &&
           a.category === b.category &&
           a.route === b.route &&
           a.notes === b.notes;
  }

  function updatePrimaryButton(){
    if (!btnSave) return;
    const dirty = !equal(getSnapshot(), baseline || {});
    btnSave.textContent = dirty ? 'Save' : 'Close';
    btnSave.classList.toggle('primary', dirty);
  }

  function wireDirtyTrackingOnce(){
    if (!dlg || dlg._dirtyWired) return;
    dlg._dirtyWired = true;
    [fName, fQty, fSize, fCat, fRoute, fNotes].forEach(el => {
      if (!el) return;
      el.addEventListener('input', updatePrimaryButton);
      el.addEventListener('change', updatePrimaryButton);
    });
  }

  function fill(it){
    fName.value  = (it.name  || '');
    fQty.value   = (it.qty   || '');
    fSize.value  = (it.size  || '');
    fCat.value   = (it.category || '');
    fRoute.value = (it.routeOrder === 0 || it.routeOrder) ? it.routeOrder : '';
    fNotes.value = (it.notes || '');
  }

  function open(it){
    createMode = false;
    current = it;
    $('itemDlgTitle').textContent = 'Item Settings';
    fill(it);

    if (btnDel) btnDel.style.display = '';
    if (btnAdd) { btnAdd.style.display = 'none'; btnAdd.classList.remove('primary'); }
    if (btnSave) btnSave.style.display = '';

    baseline = getSnapshot();
    wireDirtyTrackingOnce();
    updatePrimaryButton();

    dlg.classList.add('show');
    lockBody();


    if (document.activeElement && document.activeElement.classList.contains('gearbtn')) {
      document.activeElement.blur();
    } else {
      try { fName.focus(); } catch(e){}
    }
  }

  function close(){
    dlg.classList.remove('show');
    unlockBody();

    current = null;
    baseline = null;
    createMode = false;
    if (btnDel) btnDel.style.display = '';
    if (btnAdd) { btnAdd.style.display = 'none'; btnAdd.classList.remove('primary'); }
    if (btnSave) { btnSave.style.display = ''; btnSave.classList.remove('primary'); btnSave.textContent = 'Save'; }
  }

  // Public API: edit existing (safe if dialog HTML not yet in DOM)
  async function openItemDialog(it){
    if (!it || !it.id) return;
    await ensureHtmlMounted();
    ensureRefs();

    const fromWeekly = !!document.getElementById('weeklyItemsModal')?.classList.contains('show');
    open(it);

    const delBtn = document.getElementById('itemDlgDelete');
    if (delBtn) delBtn.style.display = fromWeekly ? 'none' : '';
  }

  // Public API: create new (safe if dialog HTML not yet in DOM)
  async function openCreateItemDialog(prefill){
    await ensureHtmlMounted();
    ensureRefs();

    createMode = true;
    current = null;
    document.getElementById('itemDlgTitle').textContent = 'Add Item';
    fill(prefill || {});

    if (btnDel) btnDel.style.display = 'none';
    if (btnAdd) { btnAdd.style.display = ''; btnAdd.classList.add('primary'); }
    if (btnSave) btnSave.style.display = 'none';

    baseline = getSnapshot();
    wireDirtyTrackingOnce();
    updatePrimaryButton();

    dlg.classList.add('show');
    lockBody();
    try { fName?.focus(); } catch(e){}
  }

  function onSave(){
    if (!current) return;

    const patch = {
      name: (typeof window.capitalizeWords === 'function' ? window.capitalizeWords(fName.value.trim()) : fName.value.trim()),
      qty: fQty.value.trim(),
      size: fSize.value.trim(),
      notes: fNotes.value.trim(),
      category: fCat.value || '',
      routeOrder: (fRoute.value === '' ? '' : Number(fRoute.value)),
      checked: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (Array.isArray(window.lastSnapshotItems)) {
        const idx = lastSnapshotItems.findIndex(x => x && x.id === current.id);
        if (idx >= 0) {
          lastSnapshotItems[idx] = { ...lastSnapshotItems[idx], ...patch, updatedAt: { _client: Date.now() } };
          if (typeof window.scheduleRenderItems === 'function') window.scheduleRenderItems(lastSnapshotItems);
        }
      }
    } catch(_) {}

        try {
      if (typeof window.updateItemAndCatalog === 'function') {
        window.updateItemAndCatalog(current.id, patch);
      } else if (typeof window.updateItem === 'function') {
        window.updateItem(current.id, patch);
      }
    } catch(e){ console.error(e); }


    close();
    try { window.showToast && window.showToast("Updated '" + (patch.name || 'item') + "'."); } catch(_){}
  }

  function onDelete(){
    if (!current) return;
    const ok = confirm('Delete this item?');
    if (!ok) return;
    try {
      if (typeof window.removeItem === 'function') window.removeItem(current.id);
    } catch(e){ console.error(e); }
    close();
  }

  async function onAdd(){
    const name = (typeof window.capitalizeWords === 'function' ? window.capitalizeWords(fName.value.trim()) : fName.value.trim());
    if (!name){ try { window.showToast && window.showToast('Enter a name'); } catch(_){ } try { fName.focus(); } catch(_){ } return; }

    const auth = (window.auth) || (firebase && firebase.auth && firebase.auth()) || null;
    const db   = (window.db)   || (firebase && firebase.firestore && firebase.firestore()) || null;
    const household =
      (typeof window.household !== 'undefined' && window.household) ||
      localStorage.getItem('household') || '';

    if (!auth || !auth.currentUser || !db || !household){
      alert('Sign in and set household first.');
      return;
    }

    try {
      (window.lastSnapshotItems ||= []);
      const nameKey = name.toLowerCase();

      const existing = (typeof window.findExistingItem === 'function')
        ? window.findExistingItem(nameKey)
        : (window.lastSnapshotItems.find(it => (it.name||'').trim().toLowerCase() === nameKey) || null);

      const addQty   = fQty.value.trim();
      const size     = fSize.value.trim();
      const notes    = fNotes.value.trim();
      const category = fCat.value || '';
      const route    = (fRoute.value === '' ? '' : Number(fRoute.value));

      if (existing){
        const mergedQty = (typeof window.addQtyStr === 'function')
          ? window.addQtyStr(existing.qty || '', addQty || '')
          : ((addQty || existing.qty || ''));

        try {
          const idx = window.lastSnapshotItems.findIndex(x => x && x.id === existing.id);
          if (idx >= 0){
            window.lastSnapshotItems[idx] = {
              ...window.lastSnapshotItems[idx],
              name,
              qty: mergedQty,
              size,
              notes,
              category,
              routeOrder: route,
              checked: false,
              updatedAt: { _client: Date.now() }
            };
            if (typeof window.scheduleRenderItems === 'function') window.scheduleRenderItems(window.lastSnapshotItems);
          }
        } catch(_){}

        const ref = db.collection('lists').doc(String(household)).collection('items').doc(existing.id);
        await ref.set({
          name,
          nameKey,
          qty: mergedQty,
          size,
          notes,
          category,
          routeOrder: route,
          checked: false,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        try {
          if (typeof window.updateItemAndCatalog === 'function'){
            window.updateItemAndCatalog(existing.id, { category, routeOrder: route });
          }
        } catch(_){}


        try { window.showToast && window.showToast('Merged with existing'); } catch(_){}
        close();
        return;
      }

      const itemsCol = db.collection('lists').doc(String(household)).collection('items');
      const ref = itemsCol.doc();
      const now = Date.now();

      const doc = {
        id: ref.id,
        name,
        nameKey,
        qty: addQty,
        size,
        notes,
        category,
        routeOrder: route,
        checked: false,
        createdAt: { _client: now },
        updatedAt: { _client: now },
        photoUrl: '',
        photoPath: ''
      };

      try {
        window.lastSnapshotItems = [doc, ...window.lastSnapshotItems];
        if (typeof window.scheduleRenderItems === 'function') window.scheduleRenderItems(window.lastSnapshotItems);
      } catch(_){}

      await ref.set({
        name: doc.name,
        nameKey: doc.nameKey,
        qty: doc.qty,
        size: doc.size,
        notes: doc.notes,
        category: doc.category,
        routeOrder: doc.routeOrder,
        checked: doc.checked,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      try { window.showToast && window.showToast('Added'); } catch(_){}
      close();
    } catch(e){
      console.error(e);
      try { window.showToast && window.showToast('Add failed'); } catch(_){}
    }
  }

  // Wiring is deferred to ensureRefs() so late-mounted markup works.



  // Expose globals for existing callers
  window.openItemDialog = openItemDialog;
  window.openCreateItemDialog = openCreateItemDialog;

  // Named exports for module users
  try {
    // define on window for clarity; ESM importers can re-export if needed
  } catch(_){}
})();
