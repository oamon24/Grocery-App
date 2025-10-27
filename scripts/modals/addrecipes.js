/* Utilities */
const $ = (id) => document.getElementById(id);
function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
}

/* ===== Modal wiring ===== */
const btnOpenAddRecipe = $('btnOpenAddRecipe');

const recipeModal = $('recipeModal');
const rmClose = $('rmClose');
const rmSave = $('rmSave');
const rmDelete = $('rmDelete');

let editingRecipeId = null;

/* Dirty state */
let recipeDirty = false;
function updateRecipeSaveButton(){
  if (!rmSave) return;
  rmSave.textContent = recipeDirty ? 'Save' : 'Close';
  if (recipeDirty) rmSave.classList.add('btn-pink'); else rmSave.classList.remove('btn-pink');
}
function markRecipeDirty(){
  if (!recipeDirty){
    recipeDirty = true;
    updateRecipeSaveButton();
  }
}
if (recipeModal){
  recipeModal.addEventListener('input', markRecipeDirty, true);
  recipeModal.addEventListener('change', markRecipeDirty, true);
}

/* Cover controls */
let rmCoverFile = null;
let rmRemoveCover = false;
let rmExistingCoverPath = null;

const rmCoverBtn       = $('rmCoverBtn');
const rmCoverName      = $('rmCoverName');
const rmCoverPreview   = $('rmCoverPreview');
const rmCoverRemoveBtn = $('rmCoverRemove');

if (rmCoverBtn){
  rmCoverBtn.onclick = () => {
    if (typeof openPhotoPicker !== 'function'){ alert('Photo picker not available.'); return; }
    openPhotoPicker({
      onFile: (file) => {
        if (!file) return;
        rmCoverFile = file;
        rmRemoveCover = false;
        if (rmCoverName) rmCoverName.textContent = file.name || '1 image selected';
        if (rmCoverPreview){
          rmCoverPreview.src = URL.createObjectURL(file);
          rmCoverPreview.style.display = 'block';
        }
        if (rmCoverRemoveBtn) rmCoverRemoveBtn.style.display = '';
        if (typeof showToast === 'function') showToast('Cover selected');
        markRecipeDirty();
      }
    });
  };
}
if (rmCoverRemoveBtn){
  rmCoverRemoveBtn.onclick = () => {
    rmCoverFile = null;
    rmRemoveCover = true;
    if (rmCoverPreview){ rmCoverPreview.removeAttribute('src'); rmCoverPreview.style.display = 'none'; }
    if (rmCoverName) rmCoverName.textContent = '';
    if (typeof showToast === 'function') showToast('Cover will be removed');
    markRecipeDirty();
  };
}

/* ===== Tags (top-10 + add with AC) ===== */
const rmTagsEl        = $('rmTags');
const rmAddTagBtn     = $('rmAddTag');
const rmTagAdderWrap  = $('rmTagAdderWrap');
const rmTagInput      = $('rmTagInput');
const rmTagAC         = $('rmTagAC');

const MAX_TAGS_PER_RECIPE = 10;
const TAG_OK = /^[A-Za-z0-9 \-&]{1,24}$/;
const DEFAULT_TAGS = ['vegan','vegetarian','gluten-free','dairy-free','quick','dessert','breakfast','dinner','spicy','kid-friendly'];

function getActiveTags(){
  return Array.from(rmTagsEl.querySelectorAll('.tagchip[data-active="1"]')).map(ch => ch.dataset.tag || ch.textContent || '').map(s => String(s).trim()).filter(Boolean);
}
function enforceTagLimit(){
  const chips = rmTagsEl.querySelectorAll('.tagchip');
  const active = getActiveTags().length;
  chips.forEach(ch => {
    if (active >= MAX_TAGS_PER_RECIPE && ch.dataset.active !== '1') ch.setAttribute('aria-disabled','true');
    else ch.removeAttribute('aria-disabled');
  });
}
function makeTagChip(label, active=false){
  const chip = document.createElement('div');
  chip.className = 'tagchip' + (active ? ' selected' : '');
  chip.dataset.tag = label;
  if (active) chip.dataset.active = '1';
  chip.innerHTML = `<span>${escapeHtml(label)}</span>` + (active ? ` <button type="button" title="Remove">✕</button>` : '');
  chip.onclick = (e) => {
    const isBtn = e.target && e.target.tagName === 'BUTTON';
    if (active && isBtn){
      chip.remove();
    } else if (!active && getActiveTags().length < MAX_TAGS_PER_RECIPE){
      chip.dataset.active = '1';
      chip.classList.add('selected');
      chip.innerHTML = `<span>${escapeHtml(label)}</span> <button type="button" title="Remove">✕</button>`;
    }
    enforceTagLimit();
    markRecipeDirty();
  };
  return chip;
}
function renderTopTagsRow(presetSelected){
  rmTagsEl.innerHTML = '';
  // Badge
  const badge = document.createElement('div');
  badge.className = 'tagchip';
  badge.textContent = 'tags';
  badge.style.opacity = '.7';
  rmTagsEl.appendChild(badge);

  // Selected first
  for (const t of (presetSelected || [])){
    rmTagsEl.appendChild(makeTagChip(t, true));
  }

  // Top-10 across recipes
  const stats = getAllTagStats();
  const pool = stats.length ? stats.map(x => x.tag) : DEFAULT_TAGS;
  for (const tag of pool.slice(0, 10)){
    if (!presetSelected || !presetSelected.includes(tag)){
      rmTagsEl.appendChild(makeTagChip(tag, false));
    }
  }
  enforceTagLimit();
}
function getAllTagStats(){
  const counts = {};
  const arr = Array.isArray(window.lastSnapshotRecipes) ? window.lastSnapshotRecipes : [];
  for (const r of arr){
    const tags = Array.isArray(r && r.tags) ? r.tags : [];
    for (const t of tags){
      const k = String(t||'').trim().toLowerCase();
      if (!k) continue;
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  return Object.entries(counts).map(([tag,count]) => ({ tag, count })).sort((a,b)=> (b.count - a.count) || a.tag.localeCompare(b.tag));
}
function renderTagsUI(preset){
  renderTopTagsRow(Array.isArray(preset) ? preset.map(s => String(s).trim().toLowerCase()).filter(Boolean) : []);
  // AC for entering new tags
  if (!rmTagInput || !rmTagAC || !rmAddTagBtn || !rmTagAdderWrap) return;

  const listFromIndex = () => getAllTagStats().map(x => x.tag);
  function showTagAC(q){
    const all = listFromIndex();
    const cand = (q ? all.filter(t => t.startsWith(q)) : []).slice(0,8);
    rmTagAC.innerHTML = '';
    if (!cand.length){ rmTagAC.style.display='none'; return; }
    for (const t of cand){
      const row = document.createElement('div');
      row.className = 'ac-item';
      row.textContent = t;
      row.onclick = () => { addTagToSelection(t); rmTagAC.style.display='none'; };
      rmTagAC.appendChild(row);
    }
    rmTagAC.style.display='block';
  }

  rmTagInput.addEventListener('input', () => {
    const v = (rmTagInput.value || '').trim().toLowerCase();
    showTagAC(v);
  });
  rmAddTagBtn.onclick = () => {
    const v = (rmTagInput.value || '').trim().toLowerCase();
    if (v) addTagToSelection(v);
    rmTagInput.value = '';
    rmTagAC.style.display='none';
  };
  document.addEventListener('click', (e) => {
    if (!rmTagAdderWrap.contains(e.target) && e.target !== rmAddTagBtn){
      rmTagAC.style.display = 'none';
    }
  });
}
function addTagToSelection(raw){
  let label = (raw || '').trim().toLowerCase();
  if (!label) return;
  if (!TAG_OK.test(label)){
    alert('Tag can only use lowercase letters, numbers, spaces, “-”, “&” and up to 24 characters.');
    return;
  }
  const current = getActiveTags();
  const lowSet = new Set(current.map(t => t.toLowerCase()));
  if (lowSet.has(label)) return;

  rmTagsEl.insertBefore(
    makeTagChip(label, true),
    rmTagsEl.firstChild ? rmTagsEl.firstChild.nextSibling : null
  );
  enforceTagLimit();
  markRecipeDirty();
}

/* ===== Ingredients ===== */
const rmAddIngredientBtn = $('rmAddIngredient');
const rmIngredients = $('rmIngredients');

function suggestionMeta(it){
  const parts = [];
  if (it.category) parts.push(it.category);
  if (it.size) parts.push(it.size);
  if (it.routeOrder !== '' && !isNaN(parseFloat(it.routeOrder))) parts.push('Route ' + it.routeOrder);
  return parts.join(' • ');
}
function buildIngMatches(q){
  q = (q||'').trim().toLowerCase();
  if (!q) return [];
  const list = Array.isArray(window.lastSnapshotItems) ? window.lastSnapshotItems : [];
  const matches = list
    .filter(it => (String(it.name||'').toLowerCase().includes(q)))
    .sort((a,b)=>{
      const an=(a.name||'').toLowerCase(), bn=(b.name||'').toLowerCase();
      const as = an.startsWith(q) ? 0 : 1;
      const bs = bn.startsWith(q) ? 0 : 1;
      if (as !== bs) return as - bs;
      return an.localeCompare(bn);
    })
    .slice(0,8);
  return matches;
}
function renderIngAC(listEl, matches, activeIndex = -1){
  listEl.innerHTML = '';
  if (!matches || !matches.length){
    listEl.style.display = 'none';
    return;
  }
  matches.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'ac-item' + (i === activeIndex ? ' active' : '');
    row.setAttribute('role','option');
    row.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
    row._item = it;
    row.innerHTML =
      '<div class="ac-title">'+escapeHtml(it.name||'')+'</div>' +
      '<div class="ac-meta">'+escapeHtml(suggestionMeta(it))+'</div>';
    listEl.appendChild(row);
  });
  listEl.style.display = 'block';
}
function applyIngSuggestion(row, it){
  const name  = row.querySelector('.ing-name');
  const size  = row.querySelector('.ing-size');
  if (name) name.value = it.name || '';
  if (size && !size.value) size.value = it.size || '';
}
function bindIngredientAC(row){
  const wrap   = row.querySelector('.ing-name-wrap');
  const input  = row.querySelector('.ing-name');
  const acList = row.querySelector('.ing-ac');
  if (!input || !acList || !wrap) return;

  let activeIndex = -1;
  let activeMatches = [];

  const closeAC = () => { acList.style.display = 'none'; acList.innerHTML = ''; activeIndex = -1; activeMatches = []; };
  const ensureVisible = () => {
    const items = acList.querySelectorAll('.ac-item');
    if (activeIndex < 0 || activeIndex >= items.length) return;
    const el = items[activeIndex];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  };

  input.addEventListener('input', () => {
    const q = input.value;
    activeMatches = buildIngMatches(q);
    activeIndex = activeMatches.length ? 0 : -1;
    renderIngAC(acList, activeMatches, activeIndex);
    ensureVisible();
  });

  acList.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.ac-item');
    if (!el || !el._item) return;
    applyIngSuggestion(row, el._item);
    closeAC();
    e.preventDefault();
  });

  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closeAC(); });

  input.addEventListener('keydown', (e) => {
    const open = acList.style.display === 'block';
    if (e.key === 'Escape'){ closeAC(); return; }
    if (!open || !activeMatches.length) return;
    if (e.key === 'ArrowDown'){
      e.preventDefault();
      activeIndex = (activeIndex + 1) % activeMatches.length;
      renderIngAC(acList, activeMatches, activeIndex);
      ensureVisible();
    } else if (e.key === 'ArrowUp'){
      e.preventDefault();
      activeIndex = (activeIndex - 1 + activeMatches.length) % activeMatches.length;
      renderIngAC(acList, activeMatches, activeIndex);
      ensureVisible();
    } else if (e.key === 'Enter'){
      if (activeIndex >= 0){
        e.preventDefault();
        applyIngSuggestion(row, activeMatches[activeIndex]);
        closeAC();
      }
    }
  });
}
function createIngRow(prefill=null){
  const row = document.createElement('div');
  row.className = 'ing-row';
  row.innerHTML = `
    <div class="ing-name-wrap">
      <textarea class="ing-name" placeholder="Ingredient name"></textarea>
      <div class="ac-list ing-ac" role="listbox" aria-label="Suggestions" style="display:none"></div>
    </div>
    <input class="ing-qty" type="text" placeholder="Qty" />
    <input class="ing-size" type="text" placeholder="Size" />
    <div></div>
    <textarea class="ing-notes" placeholder="Notes"></textarea>
    <button class="ing-del" type="button" title="Remove">✕</button>
  `;
  if (prefill){
    if (typeof prefill.name  === 'string') row.querySelector('.ing-name').value  = prefill.name;
    if (typeof prefill.qty   === 'string') row.querySelector('.ing-qty').value   = prefill.qty;
    if (typeof prefill.size  === 'string') row.querySelector('.ing-size').value  = prefill.size;
    if (typeof prefill.notes === 'string') row.querySelector('.ing-notes').value = prefill.notes;
  }
  row.querySelector('.ing-del').onclick = () => { row.remove(); markRecipeDirty(); };
  bindIngredientAC(row);
  return row;
}
if (rmAddIngredientBtn){
  rmAddIngredientBtn.onclick = () => {
    const row = createIngRow();
    rmIngredients.appendChild(row);
    markRecipeDirty();
    row.querySelector('.ing-name')?.focus();
  };
}
function readIngredientsFromEditor(){
  const rows = Array.from(document.querySelectorAll('#rmIngredients .ing-row'));
  return rows.map(row=>{
    const name  = (row.querySelector('.ing-name')?.value || '').trim();
    const qty   = (row.querySelector('.ing-qty')?.value || '').trim();
    const size  = (row.querySelector('.ing-size')?.value || '').trim();
    const notes = (row.querySelector('.ing-notes')?.value || '').trim();
    if (!name) return null;
    return { name, nameKey: name.toLowerCase(), qty, size, notes };
  }).filter(Boolean);
}

/* ===== Steps editor ===== */
function uid8(){
  try{
    const a = new Uint8Array(8); (self.crypto||window.crypto).getRandomValues(a);
    return Array.from(a, x => x.toString(16).padStart(2,'0')).join('');
  } catch(e){
    return (Date.now().toString(36) + Math.random().toString(36).slice(2,6)).toLowerCase();
  }
}
let rmSteps_draggingRow = null;
function rmSteps_renumber(){
  const list = $('rmStepsList'); if (!list) return;
  Array.from(list.children).forEach((row, idx) => {
    const t = row.querySelector('.step-title'); if (t) t.textContent = `Step ${idx + 1}`;
  });
}
function rmSteps_setupDnd(){
  const list = $('rmStepsList'); if (!list || list.dataset.dndInit === '1') return;

  list.addEventListener('dragover', (e) => {
    if (!rmSteps_draggingRow) return;
    e.preventDefault();
    const rows = [...list.querySelectorAll('.step-row')].filter(r => r !== rmSteps_draggingRow);
    let closest = null, closestOffset = Number.NEGATIVE_INFINITY;
    for (const r of rows){
      const rect = r.getBoundingClientRect();
      const offset = e.clientY - (rect.top + rect.height/2);
      if (offset < 0 && offset > closestOffset){ closestOffset = offset; closest = r; }
    }
    if (closest == null) list.appendChild(rmSteps_draggingRow);
    else list.insertBefore(rmSteps_draggingRow, closest);
  });

  list.addEventListener('drop', (e) => {
    if (!rmSteps_draggingRow) return;
    e.preventDefault();
    rmSteps_draggingRow.classList.remove('dragging');
    rmSteps_draggingRow = null;
    rmSteps_renumber();
  });

  list.dataset.dndInit = '1';
}
function createStepRow(prefill=null){
  const row = document.createElement('div');
  row.className = 'step-row';
  row.dataset.stepId = prefill?.id || uid8();
  row.innerHTML = `
    <div class="step-grid" style="display:grid; grid-template-rows:auto auto auto auto; gap:10px; align-items:start; margin-bottom:12px; padding:8px; border:1px solid var(--border); border-radius:10px;">
      <div class="step-header" style="display:flex; align-items:center;">
        <div class="step-title">Step ?</div>
        <div class="step-controls" style="margin-left:auto; display:flex; gap:8px;">
          <button type="button" class="step-up" title="Move up">▲</button>
          <button type="button" class="step-down" title="Move down">▼</button>
          <button type="button" class="step-del" title="Delete">✕</button>
        </div>
      </div>

      <div class="step-toolbar" style="display:flex; flex-wrap:wrap; gap:6px;">
        <button type="button" class="step-tool" data-act="task" title="Insert checkbox">Checkbox</button>
        <button type="button" class="step-tool" data-act="bullet" title="Insert bullet">• Bullet</button>
        <button type="button" class="step-tool" data-act="bold" title="Bold">Bold</button>
        <button type="button" class="step-tool" data-act="italic" title="Italic">Italic</button>
      </div>

      <textarea class="step-text" placeholder="Step instructions (Markdown supported with [ ] checkboxes)" rows="7" style="width:100%; resize:vertical; box-sizing:border-box;"></textarea>

      <div class="step-timer" style="display:flex; gap:8px; align-items:center;">
        <label>Timer:</label>
        <input class="step-mm" type="number" min="0" max="999" inputmode="numeric" placeholder="mm" style="width:68px;">
        <span>:</span>
        <input class="step-ss" type="number" min="0" max="59"  inputmode="numeric" placeholder="ss" style="width:68px;">
      </div>

      <div class="step-photo" style="display:flex; gap:10px; align-items:flex-start; flex-wrap:wrap;">
        <button type="button" class="step-photo-btn">Add photo</button>
        <img class="step-preview" alt="Step photo" style="max-width:120px; max-height:120px; display:none; border-radius:8px; border:1px solid var(--border);" />
      </div>
    </div>
  `;

  // Prefill
  if (prefill){
    if (typeof prefill.text === 'string') row.querySelector('.step-text').value = prefill.text;
    const mm = Math.max(0, Math.floor((prefill.timerSec || 0) / 60));
    const ss = Math.max(0, (prefill.timerSec || 0) % 60);
    row.querySelector('.step-mm').value = mm ? String(mm) : '';
    row.querySelector('.step-ss').value = ss ? String(ss) : '';
    if (prefill.photoUrl){
      const p = row.querySelector('.step-preview');
      p.src = prefill.photoUrl; p.style.display = 'block';
      row.dataset.photoUrl = prefill.photoUrl;
      if (prefill.photoPath) row.dataset.photoPath = prefill.photoPath;
      const b = row.querySelector('.step-photo-btn'); if (b) b.textContent = 'Change photo';
    }
  }

  // Delete
  row.querySelector('.step-del').onclick = () => { row.remove(); rmSteps_renumber(); markRecipeDirty(); };

  // Reorder
  row.querySelector('.step-up').onclick = () => {
    const parent = row.parentElement;
    if (parent && row.previousElementSibling) parent.insertBefore(row, row.previousElementSibling);
    rmSteps_renumber(); markRecipeDirty();
  };
  row.querySelector('.step-down').onclick = () => {
    const parent = row.parentElement;
    if (parent && row.nextElementSibling) parent.insertBefore(row.nextElementSibling, row);
    rmSteps_renumber(); markRecipeDirty();
  };

  // Photo via shared picker
  {
    const photoBtn = row.querySelector('.step-photo-btn');
    const img = row.querySelector('.step-preview');
    if (photoBtn){
      photoBtn.onclick = () => {
        if (typeof openPhotoPicker !== 'function'){ alert('Photo picker not available.'); return; }
        openPhotoPicker({
          onFile: (file) => {
            if (!file) return;
            const u = URL.createObjectURL(file);
            img.src = u; img.style.display = 'block';
            row._file = file;
            delete row.dataset.photoUrl; delete row.dataset.photoPath;
            photoBtn.textContent = 'Change photo';
            markRecipeDirty();
          }
        });
      };
    }
  }

  // Text tools
  {
    const ta = row.querySelector('.step-text');
    const tools = Array.from(row.querySelectorAll('.step-tool'));
    const insert = (before='', after='') => {
      if (!ta) return;
      const s = ta.selectionStart ?? ta.value.length;
      const e = ta.selectionEnd ?? s;
      const val = ta.value;
      const sel = val.slice(s,e);
      const next = val.slice(0,s) + before + sel + after + val.slice(e);
      const hadSel = e > s;
      const pos = hadSel ? (s + before.length + sel.length + after.length) : (s + before.length);
      ta.value = next; ta.focus({preventScroll:true}); try{ ta.setSelectionRange(pos,pos); }catch{}
      markRecipeDirty();
    };
    const linePrefix = (prefix) => {
      if (!ta) return;
      const s = ta.selectionStart ?? 0, e = ta.selectionEnd ?? 0, v = ta.value;
      const lineStart = v.lastIndexOf('\n', s-1) + 1;
      const lineEnd = v.indexOf('\n', e); const end = lineEnd === -1 ? v.length : lineEnd;
      const selected = v.slice(lineStart, end);
      const replaced = selected.split('\n').map(l => (l ? prefix + l : prefix)).join('\n');
      ta.value = v.slice(0, lineStart) + replaced + v.slice(end);
      const pos = lineStart + prefix.length;
      ta.focus({preventScroll:true}); try{ ta.setSelectionRange(pos,pos); }catch{}
      markRecipeDirty();
    };
    tools.forEach(b => {
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act==='task') return linePrefix('[ ] ');
        if (act==='bullet') return linePrefix('• ');
        if (act==='bold') return insert('**','**');
        if (act==='italic') return insert('*','*');
      });
    });
  }

  return row;
}
function addStepRow(prefill=null){
  const list = $('rmStepsList'); if (!list) return;
  rmSteps_setupDnd();
  const row = createStepRow(prefill);
  list.appendChild(row);
  rmSteps_renumber();
  // optional hook
  if (window.initStepIngredientAutocomplete) window.initStepIngredientAutocomplete();
  // Auto default photo guesser may be added here (omitted for brevity)
}
function readStepsFromEditor(){
  const list = $('rmStepsList');
  const rows = Array.from(list ? list.children : []);
  const steps = rows.map((row) => {
    const id = row.dataset.stepId || uid8();
    const text = (row.querySelector('.step-text')?.value || '').trim();
    const mm = parseInt(row.querySelector('.step-mm')?.value || '0', 10) || 0;
    const ss = parseInt(row.querySelector('.step-ss')?.value || '0', 10) || 0;
    const total = Math.max(0, (mm*60) + Math.min(59, ss));
    if (!text) return null;
    const photoUrl = row.dataset.photoUrl || null;
    const photoPath = row.dataset.photoPath || null;
    return { id, text, timerSec: total > 0 ? total : null, photoUrl, photoPath };
  }).filter(Boolean);
  return steps;
}

/* ===== Open / Close ===== */
function openRecipeModal(mode='add', data=null){
  data = data ? JSON.parse(JSON.stringify(data)) : null;

  $('rmTitle').textContent = mode === 'edit' ? 'Edit Recipe' : 'Add Recipe';
  editingRecipeId = (mode === 'edit' && data && data.id) ? data.id : null;

  if (rmDelete) rmDelete.style.display = editingRecipeId ? '' : 'none';

  recipeDirty = false;
  updateRecipeSaveButton();

  // fields
  $('rmName').value = (data && data.name) || '';
  $('rmBasePortions').value = (data && data.basePortions) || 2;

  // tags
  const preset = (data && Array.isArray(data.tags)) ? data.tags : [];
  renderTagsUI(preset);

  // cover
  rmCoverFile = null; rmRemoveCover = false;
  rmExistingCoverPath = (data && data.coverPath) ? data.coverPath : null;
  if (rmCoverPreview){
    if (data && data.coverUrl){
      rmCoverPreview.src = data.coverUrl; rmCoverPreview.style.display='block';
      if (rmCoverRemoveBtn) rmCoverRemoveBtn.style.display = '';
      if (rmCoverName) rmCoverName.textContent = '';
    } else {
      rmCoverPreview.src = ''; rmCoverPreview.style.display='none';
      if (rmCoverRemoveBtn) rmCoverRemoveBtn.style.display = 'none';
      if (rmCoverName) rmCoverName.textContent = '';
    }
  }

  // ingredients
  if (rmIngredients){
    rmIngredients.innerHTML = '';
    const list = (data && Array.isArray(data.ingredients) && data.ingredients.length) ? data.ingredients : [ { name:'', qty:'', size:'', notes:'' } ];
    for (const ing of list) rmIngredients.appendChild(createIngRow(ing));
  }

  // steps
  const rmStepsList = $('rmStepsList');
  if (rmStepsList){
    rmStepsList.innerHTML = '';
    const stepsList = (data && Array.isArray(data.steps) && data.steps.length) ? data.steps : [];
    for (const s of stepsList) addStepRow(s);
    rmSteps_setupDnd(); rmSteps_renumber();
  }

  // start collapsed
  try{
    ['rmIngredientsWrap','rmSteps','rmTagsWrap'].forEach(id => $(id)?.removeAttribute('open'));
    localStorage.setItem('rmIngredients.open','0');
    localStorage.setItem('rmSteps.open','0');
    localStorage.setItem('rmTags.open','0');
    ['rmIngredientsCaret','rmStepsCaret','rmTagsCaret'].forEach(id => { const c=$(id); if (c) c.style.transform='rotate(-90deg)'; });
  }catch{}

  // show
  recipeModal.classList.add('show');
  document.body.classList.add('modal-open');
  recipeModal.setAttribute('aria-hidden','false');

  try { history.pushState({ recipeModalOpen: true }, ''); } catch{}
  setTimeout(()=>{ try{ const ae=document.activeElement; if (ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA' || ae.tagName==='SELECT' || ae.isContentEditable)) ae.blur(); }catch{} },0);
}
function closeRecipeModal(){
  recipeModal.classList.remove('show');
  recipeModal.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
  try { if (history.state && history.state.recipeModalOpen) history.back(); } catch{}
}
window.addEventListener('popstate', () => {
  try{
    if (recipeModal && recipeModal.classList.contains('show')){
      recipeModal.classList.remove('show');
      recipeModal.setAttribute('aria-hidden','true');
      document.body.classList.remove('modal-open');
    }
  }catch{}
});

/* Open/Close triggers */
if (btnOpenAddRecipe) btnOpenAddRecipe.onclick = () => openRecipeModal('add');
if (rmClose) rmClose.onclick = closeRecipeModal;

/* ===== Save / Delete =====
   Requires globals: auth, db, firebase, household, lastSnapshotRecipes,
   scheduleRenderRecipes, showToast, uploadRecipeCover(file, recipeId, prevPath),
   uploadStepPhoto(file, recipeId, stepId, prevPath), hardDeleteRecipe(id). */

if (rmDelete){
  rmDelete.onclick = async (ev) => {
    if (!auth || !auth.currentUser || !household || !editingRecipeId) return;
    const hard = !!ev.altKey;
    if (!hard){
      const ok = confirm('Delete this recipe? It will be hidden from the list (soft delete).');
      if (!ok) return;
      // optimistic close + local remove
      closeRecipeModal();
      try{
        if (Array.isArray(lastSnapshotRecipes)){
          lastSnapshotRecipes = lastSnapshotRecipes.filter(r => r && r.id !== editingRecipeId);
          if (typeof scheduleRenderRecipes === 'function') scheduleRenderRecipes(lastSnapshotRecipes);
        }
        showToast && showToast('Deleting…');
      }catch{}
      // background soft delete
      try{
        const ref = db.collection('recipes').doc(household).collection('recipes').doc(editingRecipeId);
        await ref.set({ deletedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
        if (typeof subscribeRecipes === 'function') subscribeRecipes();
      }catch(e){ console.error(e); alert('Delete failed'); }
    } else {
      const ok = confirm('Hard delete this recipe and all its photos? This cannot be undone.');
      if (!ok) return;
      closeRecipeModal();
      try { await hardDeleteRecipe(editingRecipeId); showToast && showToast('Deleted'); }
      catch(e){ console.error(e); alert('Hard delete failed'); }
    }
  };
}

if (rmSave){
  rmSave.onclick = async () => {
    // Decide by dirty state
    if (!recipeDirty) { closeRecipeModal(); return; }

    if (!auth || !auth.currentUser || !household || !db || !firebase){
      alert('Sign in and set household first.');
      return;
    }

    const name = ($('rmName').value || '').trim();
    const basePortions = Math.max(1, Number($('rmBasePortions').value || 2));
    const tags = getActiveTags();
    if (!name){ alert('Enter a name'); try{ $('rmName').focus(); }catch{} return; }

    const nameLower = name.toLowerCase();

    try{
      const col = db.collection('recipes').doc(household).collection('recipes');

      // duplicate guard
      const qs = await col.where('nameLower','==', nameLower).get();
      const dup = qs.docs.find(d => {
        const data = d.data() || {};
        const isDeleted = !!data.deletedAt;
        const isSame = editingRecipeId && d.id === editingRecipeId;
        return !isDeleted && !isSame;
      });
      if (dup){ alert('A recipe with that name already exists.'); return; }

      // close fast
      closeRecipeModal();
      await new Promise(r => setTimeout(r, 0));

      const now = firebase.firestore.FieldValue.serverTimestamp();
      const who = (auth.currentUser.email || auth.currentUser.uid || 'unknown');

      let recipeDocRef;

      if (!editingRecipeId){
        recipeDocRef = col.doc(); // pre-generate id
        // optimistic insert
        try{
          const optimistic = {
            id: recipeDocRef.id, name, nameLower, basePortions, tags,
            coverUrl:null, coverPath:null, lastUsedServings: basePortions,
            createdAt:{ _client: Date.now() }, createdBy: who,
            updatedAt:{ _client: Date.now() }, updatedBy: who, deletedAt:null
          };
          lastSnapshotRecipes = Array.isArray(lastSnapshotRecipes) ? [...lastSnapshotRecipes, optimistic] : [optimistic];
          if (typeof scheduleRenderRecipes === 'function') scheduleRenderRecipes(lastSnapshotRecipes);
        }catch{}
        await recipeDocRef.set({
          id: recipeDocRef.id, name, nameLower, basePortions, tags,
          coverUrl:null, coverPath:null, lastUsedServings: basePortions,
          createdAt: now, createdBy: who, updatedAt: now, updatedBy: who, deletedAt:null
        });
        showToast && showToast('Recipe created');
      } else {
        recipeDocRef = col.doc(editingRecipeId);
        // optimistic patch
        try{
          if (Array.isArray(lastSnapshotRecipes)){
            lastSnapshotRecipes = lastSnapshotRecipes.map(r => r && r.id === editingRecipeId
              ? { ...r, name, nameLower, basePortions, tags, updatedAt:{ _client: Date.now() }, updatedBy: who }
              : r);
            if (typeof scheduleRenderRecipes === 'function') scheduleRenderRecipes(lastSnapshotRecipes);
          }
        }catch{}
        await recipeDocRef.set({ name, nameLower, basePortions, tags, updatedAt: now, updatedBy: who }, { merge:true });
        showToast && showToast('Recipe updated');
      }

      // save ingredients + steps
      try{
        const ingredients = readIngredientsFromEditor();
        const steps = readStepsFromEditor();

        // upload any new step photos in background
        const listEl = $('rmStepsList');
        const rowMap = new Map();
        if (listEl) Array.from(listEl.children).forEach(r => rowMap.set(r.dataset.stepId, r));

        const recipeIdForUpload = recipeDocRef && recipeDocRef.id;
        const uploadTasks = [];
        if (recipeIdForUpload && Array.isArray(steps) && steps.length){
          for (const s of steps){
            const row = rowMap.get(s.id);
            if (row && row._file && typeof uploadStepPhoto === 'function'){
              const prevPath = row.dataset.photoPath || null;
              const task = uploadStepPhoto(row._file, recipeIdForUpload, s.id, prevPath)
                .then(({ url, path }) => {
                  s.photoUrl = url; s.photoPath = path;
                  try { row.dataset.photoUrl = url; row.dataset.photoPath = path; } catch{}
                  row._file = null;
                })
                .catch(e => console.warn('Step photo upload failed for', s.id, e));
              uploadTasks.push(task);
            }
          }
        }

        recipeDocRef.set({ ingredients, steps, updatedAt: now, updatedBy: who }, { merge:true })
          .catch(e => { console.error(e); alert('Saving ingredients/steps failed: ' + (e.message || e)); });

        // cover upload or removal
        if (typeof uploadRecipeCover === 'function'){
          if (rmCoverFile){
            try{
              const prev = rmExistingCoverPath || null;
              const { url, path } = await uploadRecipeCover(rmCoverFile, recipeDocRef.id, prev);
              await recipeDocRef.set({ coverUrl:url, coverPath:path, updatedAt: now, updatedBy: who }, { merge:true });
            }catch(e){ console.warn('Cover upload failed', e); }
          } else if (rmRemoveCover){
            try{
              await recipeDocRef.set({ coverUrl:'', coverPath:'', updatedAt: now, updatedBy: who }, { merge:true });
            }catch(e){ console.warn('Cover remove failed', e); }
          }
        }

        Promise.allSettled(uploadTasks).then(()=>{}); // ignore
      } catch(e){
        console.error(e);
        alert('Save failed: ' + (e.message || e));
      }
    } catch(e){
      console.error(e);
      alert('Save failed: ' + (e.message || e));
    }
  };
}

/* Optional: minimal helpers expected by Save flow
   Define uploadRecipeCover and uploadStepPhoto in your project as before. */
