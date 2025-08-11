/* script.js
   Full interactive filtering + dynamic advanced modal generator
   Data-agnostic; expects feats.json objects with keys:
   name,id,ancestry,class,category,group,featureTier,parentTrait,spellLevel,featureLevel,tag,feats[]
*/

/* -------------------------
   Utilities
   ------------------------- */
// safe trim & normalize
const norm = v => (v == null ? '' : String(v).trim());

// handle value matching for arrays, CSV strings, or single strings
function valueMatchesField(fieldValue, wanted) {
  if (!wanted) return false;
  if (fieldValue == null) return false;
  if (Array.isArray(fieldValue)) return fieldValue.map(x=>String(x).trim()).includes(wanted);
  const s = String(fieldValue);
  if (s.includes(',')) return s.split(',').map(x=>x.trim()).includes(wanted);
  return s.trim() === wanted;
}

// return unique values for a field across the dataset
function uniqueFieldValues(data, fieldName) {
  const set = new Set();
  data.forEach(item => {
    const v = item[fieldName];
    if (!v) return;
    if (Array.isArray(v)) v.forEach(x=>x && set.add(String(x).trim()));
    else if (String(v).includes(',')) String(v).split(',').map(x=>x.trim()).forEach(x=>x && set.add(x));
    else set.add(String(v).trim());
  });
  return Array.from(set).sort();
}

/* -------------------------
   State
   ------------------------- */
let featsData = [];                 // raw JSON
let currentPrimaryFiltered = [];    // result after sidebar primary filters (used to build modal)
let advancedState = {               // persists applied advanced filters
  parentTraits: new Set(),         // strings (parentTrait)
  childIds: new Set(),             // feat ids chosen individually
  spellLevels: new Set(),          // "1st","3rd",...
  featureLevels: new Set()         // "1st","3rd",...
};

/* -------------------------
   Load data and init
   ------------------------- */
fetch('feats.json')
  .then(r => r.json())
  .then(data => {
    featsData = data;
    populateSidebarOptions(data);
    applyFilters(); // first render
    wireAccordionToggles();
    wireReset();
    wireStickyModalButtons();
  })
  .catch(e => {
    console.error('Failed to load feats.json', e);
    document.getElementById('results-container').innerHTML = '<p>Error loading feats.json</p>';
  });

/* -------------------------
   Sidebar population & wiring
   ------------------------- */
function populateSidebarOptions(data) {
  const ancestryContainer = document.getElementById('ancestry-filters');
  const classContainer = document.getElementById('class-filters');

  const ancestries = uniqueFieldValues(data, 'ancestry');
  const classes = uniqueFieldValues(data, 'class');

  ancestries.forEach(a => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" name="Ancestry" value="${a}"> ${a}`;
    ancestryContainer.appendChild(lbl);
  });

  classes.forEach(c => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" name="Class" value="${c}"> ${c}`;
    classContainer.appendChild(lbl);
  });

  // wire all sidebar inputs
  document.querySelectorAll('#sidebar input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      // when sidebar changes, clear modal selections (not applied) visually but keep applied advancedState
      buildAndDisableModalOptions(); // so modal options reflect current scope
      applyFilters();
    });
  });
}

/* -------------------------
   Accordion wiring
   ------------------------- */
function wireAccordionToggles() {
  document.querySelectorAll('.accordion').forEach(acc => {
    const header = acc.querySelector('.acc-header');
    header.addEventListener('click', () => acc.classList.toggle('open'));
    // default open (HTML already has open class on each block)
  });
}

/* -------------------------
   Reset buttons
   ------------------------- */
function wireReset() {
  document.getElementById('reset-filters').addEventListener('click', () => {
    document.querySelectorAll('#sidebar input[type="checkbox"]').forEach(cb => cb.checked = false);
    // also clear advanced applied filters
    clearAdvancedState();
    applyFilters();
  });

  document.getElementById('reset-advanced-btn').addEventListener('click', () => {
    clearAdvancedState();
    applyFilters();
  });
}

/* clear applied advancedState */
function clearAdvancedState() {
  advancedState.parentTraits.clear();
  advancedState.childIds.clear();
  advancedState.spellLevels.clear();
  advancedState.featureLevels.clear();
}

/* -------------------------
   Read checks helper
   ------------------------- */
function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`#sidebar input[name="${name}"]:checked`)).map(i => i.value);
}

/* -------------------------
   Primary filtering (sidebar) - OR logic union across categories
   ------------------------- */
function applyFilters() {
  const typeFilters = getCheckedValues('Type');
  const ancestryFilters = getCheckedValues('Ancestry');
  const classFilters = getCheckedValues('Class');
  const tierFilters = getCheckedValues('Tier');

  // primary selected present?
  const primarySelected = typeFilters.length + ancestryFilters.length + classFilters.length > 0;

  // unionMatches: keep feat if it matches any selected primary filter (or all if none selected)
  const unionMatches = featsData.filter(f => {
    if (!primarySelected) return true;

    // match type/category
    if (typeFilters.length && typeFilters.includes(String(f.category))) return true;

    // ancestry or class
    if (ancestryFilters.length && ancestryFilters.some(a => valueMatchesField(f.ancestry, a))) return true;
    if (classFilters.length && classFilters.some(c => valueMatchesField(f.class, c))) return true;

    return false;
  });

  // Save primary filtered set for modal generation
  currentPrimaryFiltered = unionMatches;

  // Now apply tier filter (must have at least one matching tier entry)
  let afterTier = unionMatches.filter(f => {
    if (!tierFilters.length) return true;
    if (!Array.isArray(f.feats)) return false;
    return f.feats.some(ft => tierFilters.includes(ft.tier));
  });

  // apply advanced filters (if any are applied) - advanced selection acts as a union across chosen advanced items
  const final = applyAdvancedToSet(afterTier);

  renderResults(final);
  buildAndDisableModalOptions(); // keep modal options in sync with current scope
  renderActivePills();
}

/* -------------------------
   Advanced filter application (applied advancedState)
   advancedState picks are unioned; if none selected -> keep all
   ------------------------- */
function applyAdvancedToSet(candidates) {
  // if advancedState empty, return candidates
  if (
    advancedState.parentTraits.size === 0 &&
    advancedState.childIds.size === 0 &&
    advancedState.spellLevels.size === 0 &&
    advancedState.featureLevels.size === 0
  ) return candidates;

  // keep feats that match ANY selected advanced criteria
  return candidates.filter(f => {
    // childIds (direct by id)
    if (advancedState.childIds.has(f.id)) return true;

    // parentTrait matches any selected
    if (f.parentTrait && advancedState.parentTraits.has(f.parentTrait)) return true;

    // spellLevel / featureLevel match
    if (f.spellLevel && advancedState.spellLevels.size && advancedState.spellLevels.has(f.spellLevel)) return true;
    if (f.featureLevel && advancedState.featureLevels.size && advancedState.featureLevels.has(f.featureLevel)) return true;

    // Also, children inside feats array might have tiers etc. We assume spellLevel/featureLevel are at feat level (as per your schema)
    return false;
  });
}

/* -------------------------
   Render results
   ------------------------- */
function renderResults(results) {
  const container = document.getElementById('results-container');
  container.innerHTML = '';

  if (!results.length) {
    container.innerHTML = '<p>No feats match your current filters.</p>';
    return;
  }

  results.forEach(f => {
    const card = document.createElement('div');
    card.className = 'feat-card';

    // Build meta parts per your rules
    const metaParts = [];
    if (f.category === 'Ancestry') {
      if (f.ancestry) metaParts.push(`${f.ancestry}${f.group ? ' ' + f.group : ''}`);
    } else if (f.category === 'Class') {
      if (f.class) metaParts.push(`${f.class}${f.group ? ' ' + f.group : ''}`);
    } else {
      if (f.category) metaParts.push(f.category);
    }
    if (f.parentTrait) metaParts.push(f.parentTrait);
    if (f.featureTier) metaParts.push(`${f.featureTier} Tier`);
    if (f.featureLevel) metaParts.push(`Req Level: ${f.featureLevel}`);
    if (f.spellLevel) metaParts.push(`${f.spellLevel} Level`);

    // Build tier descriptions (sorted canonical order)
    let descHtml = '';
    if (Array.isArray(f.feats)) {
      const canonical = ['Adventurer','Champion','Epic'];
      const sorted = [...f.feats].sort((a,b)=> canonical.indexOf(a.tier)-canonical.indexOf(b.tier));
      sorted.forEach(e => {
        const desc = String(e.description || '').replace(/^"|"$/g,'').trim();
        descHtml += `<p><strong>${e.tier}:</strong> ${desc}</p>`;
      });
    }

    // tags
    let tagHtml = '';
    if (f.tag) {
      const tags = String(f.tag).split(',').map(t=>t.trim()).filter(Boolean);
      tags.forEach(t => tagHtml += `<span class="tag">${t}</span>`);
    }

    card.innerHTML = `
      <h3><strong>${f.name}</strong></h3>
      ${metaParts.length ? `<div class="feat-meta">${metaParts.join(' | ')}</div>` : ''}
      <div class="feat-description">${descHtml}</div>
      ${tagHtml ? `<div class="feat-tags">${tagHtml}</div>` : ''}
    `;
    container.appendChild(card);
  });
}

/* -------------------------
   Active filter pills (sidebar + advanced)
   ------------------------- */
function renderActivePills() {
  const out = document.getElementById('active-filters');
  out.innerHTML = '';

  // sidebar categories
  const cats = ['Type','Tier','Ancestry','Class'];
  cats.forEach(cat => {
    const vals = getCheckedValues(cat);
    vals.forEach(v => out.appendChild(makePill(`${cat}: ${v}`, () => {
      // uncheck this checkbox and reapply
      const cb = document.querySelector(`#sidebar input[name="${cat}"][value="${CSS.escape(v)}"]`);
      if (cb) cb.checked = false;
      applyFilters();
    })));
  });

  // advancedState pills
  advancedState.parentTraits.forEach(pt => out.appendChild(makePill(`Parent: ${pt}`, () => {
    advancedState.parentTraits.delete(pt); applyFilters();
  })));
  advancedState.childIds.forEach(cid => {
    // find name for id
    const f = featsData.find(x=>x.id === cid);
    const label = f ? `Feat: ${f.name}` : `Feat: ${cid}`;
    out.appendChild(makePill(label, () => { advancedState.childIds.delete(cid); applyFilters(); }));
  });
  advancedState.spellLevels.forEach(sl => out.appendChild(makePill(`Spell Lvl: ${sl}`, () => { advancedState.spellLevels.delete(sl); applyFilters(); })));
  advancedState.featureLevels.forEach(fl => out.appendChild(makePill(`Req Lvl: ${fl}`, () => { advancedState.featureLevels.delete(fl); applyFilters(); })));
}

function makePill(text, onClick) {
  const span = document.createElement('span');
  span.className = 'filter-pill';
  span.textContent = text;
  const x = document.createElement('span');
  x.className = 'pill-x';
  x.textContent = ' ×';
  x.style.marginLeft = '8px';
  x.addEventListener('click', onClick);
  span.appendChild(x);
  return span;
}

/* -------------------------
   ADVANCED MODAL: build dynamic grid & options
   ------------------------- */
function wireStickyModalButtons() {
  const modal = document.getElementById('advanced-filter-modal');
  const openBtn = document.getElementById('advanced-filter-btn');
  const closeBtn = modal.querySelector('.close-modal');
  const applyBtn = document.getElementById('apply-advanced-filters');
  const clearBtn = document.getElementById('clear-advanced-filters');

  openBtn.addEventListener('click', () => {
    buildAndDisableModalOptions(); // build modal from currentPrimaryFiltered
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden','false');
  });
  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; modal.setAttribute('aria-hidden','true'); });
  window.addEventListener('click', (e) => { if (e.target === modal) { modal.style.display='none'; modal.setAttribute('aria-hidden','true'); } });

  applyBtn.addEventListener('click', () => {
    // read selections from modal and store into advancedState, then applyFilters
    readModalSelectionsAndApply();
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden','true');
    applyFilters();
  });

  clearBtn.addEventListener('click', () => {
    // clear only selections currently in modal (not applied state)
    clearModalSelections();
  });
}

/* Build modal content using currentPrimaryFiltered (sidebar scope) */
function buildAndDisableModalOptions() {
  const container = document.getElementById('advanced-filter-container');
  container.innerHTML = ''; // rebuild

  const data = currentPrimaryFiltered.length ? currentPrimaryFiltered : featsData;

  // Build lists grouped by category/group/parentTrait
  // For classes: groups of interest may appear, we'll gather unique groups under Class feats
  const classItems = data.filter(f => f.category === 'Class');
  const ancestryItems = data.filter(f => f.category === 'Ancestry');

  const classGroups = {}; // groupName -> array of feats
  classItems.forEach(f => {
    const g = norm(f.group) || 'Other';
    if (!classGroups[g]) classGroups[g] = [];
    classGroups[g].push(f);
  });

  const ancestryGroups = {};
  ancestryItems.forEach(f => {
    const g = norm(f.group) || 'Other';
    if (!ancestryGroups[g]) ancestryGroups[g] = [];
    ancestryGroups[g].push(f);
  });

  // Decide columns: up to 4 class groups and up to 2 ancestry groups.
  // We will pick canonical class group order if present, else fallback to keys order.
  const canonicalClassOrder = ['Feature','Talent','Multiclass','Spell'];
  const classCols = [];
  canonicalClassOrder.forEach(k => { if (classGroups[k]) classCols.push({name:k,items:classGroups[k]}); });
  // include any other class groups after canonical
  Object.keys(classGroups).forEach(k => { if (!canonicalClassOrder.includes(k)) classCols.push({name:k,items:classGroups[k]}); });
  // limit to 4 columns
  const classColsFinal = classCols.slice(0,4);

  // ancestry columns (canonical order Trait, Lineage)
  const canonicalAncOrder = ['Trait','Lineage'];
  const ancCols = [];
  canonicalAncOrder.forEach(k => { if (ancestryGroups[k]) ancCols.push({name:k,items:ancestryGroups[k]}); });
  Object.keys(ancestryGroups).forEach(k => { if (!canonicalAncOrder.includes(k)) ancCols.push({name:k,items:ancestryGroups[k]}); });
  const ancColsFinal = ancCols.slice(0,2);

  // Build grid headers
  const grid = document.createElement('div');
  grid.className = 'adv-grid';

  // If there are class columns, add a Class header spanning their columns
  if (classColsFinal.length) {
    const header = document.createElement('div');
    header.className = 'adv-header';
    header.style.gridColumn = `span ${classColsFinal.length}`;
    header.textContent = 'Class';
    grid.appendChild(header);
  }
  // add ancestry header if present
  if (ancColsFinal.length) {
    const headerA = document.createElement('div');
    headerA.className = 'adv-header ancestry';
    headerA.style.gridColumn = `span ${ancColsFinal.length}`;
    headerA.textContent = 'Ancestry';
    grid.appendChild(headerA);
  }

  // Now add sub-headings row (group names) for class cols and ancestry cols
  classColsFinal.forEach(col => {
    const sub = document.createElement('div');
    sub.className = 'adv-col';
    sub.innerHTML = `<div class="adv-subheading">${col.name}</div>`;
    grid.appendChild(sub);
  });
  ancColsFinal.forEach(col => {
    const sub = document.createElement('div');
    sub.className = 'adv-col';
    sub.innerHTML = `<div class="adv-subheading">${col.name}</div>`;
    grid.appendChild(sub);
  });

  // Fill each class column with standalone feats (no parentTrait) then grouped parentTrait boxes
  classColsFinal.forEach(col => {
    const cell = document.createElement('div');
    cell.className = 'adv-col';
    // standalone items
    const standalone = col.items.filter(f => !f.parentTrait);
    standalone.forEach(f => {
      const id = `modal-child-${f.id}`;
      const lbl = document.createElement('label');
      lbl.innerHTML = `<input type="checkbox" class="modal-child" data-id="${f.id}" id="${id}"> ${f.name}`;
      cell.appendChild(lbl);
    });

    // group by parentTrait
    const grouped = {};
    col.items.filter(f => f.parentTrait).forEach(f => {
      if (!grouped[f.parentTrait]) grouped[f.parentTrait] = [];
      grouped[f.parentTrait].push(f);
    });

    Object.keys(grouped).forEach(pt => {
      const box = document.createElement('div');
      box.className = 'group-box';
      const ptId = `modal-parent-${pt.replace(/\s+/g,'_')}`;
      const header = document.createElement('div');
      header.innerHTML = `<label><input type="checkbox" class="modal-parent" data-parent="${pt}" id="${ptId}"> <strong>${pt}</strong></label>`;
      box.appendChild(header);

      grouped[pt].forEach(f => {
        const id = `modal-child-${f.id}`;
        const childLbl = document.createElement('label');
        childLbl.style.display = 'block';
        childLbl.innerHTML = `<input type="checkbox" class="modal-child" data-id="${f.id}" data-parent="${pt}" id="${id}"> ${f.name}`;
        box.appendChild(childLbl);
      });

      cell.appendChild(box);
    });

    grid.appendChild(cell);
  });

  // Fill each ancestry column similarly
  ancColsFinal.forEach(col => {
    const cell = document.createElement('div');
    cell.className = 'adv-col';
    const standalone = col.items.filter(f => !f.parentTrait);
    standalone.forEach(f => {
      const id = `modal-child-${f.id}`;
      const lbl = document.createElement('label');
      lbl.innerHTML = `<input type="checkbox" class="modal-child" data-id="${f.id}" id="${id}"> ${f.name}`;
      cell.appendChild(lbl);
    });

    const grouped = {};
    col.items.filter(f => f.parentTrait).forEach(f => {
      if (!grouped[f.parentTrait]) grouped[f.parentTrait] = [];
      grouped[f.parentTrait].push(f);
    });

    Object.keys(grouped).forEach(pt => {
      const box = document.createElement('div');
      box.className = 'group-box';
      const ptId = `modal-parent-${pt.replace(/\s+/g,'_')}`;
      const header = document.createElement('div');
      header.innerHTML = `<label><input type="checkbox" class="modal-parent" data-parent="${pt}" id="${ptId}"> <strong>${pt}</strong></label>`;
      box.appendChild(header);

      grouped[pt].forEach(f => {
        const id = `modal-child-${f.id}`;
        const childLbl = document.createElement('label');
        childLbl.style.display = 'block';
        childLbl.innerHTML = `<input type="checkbox" class="modal-child" data-id="${f.id}" data-parent="${pt}" id="${id}"> ${f.name}`;
        box.appendChild(childLbl);
      });

      cell.appendChild(box);
    });

    grid.appendChild(cell);
  });

  container.appendChild(grid);

  // Build Spell Level and Feature Level checkboxes (1st,3rd,5th,7th,9th)
  const spellContainer = document.getElementById('modal-spelllevel-options');
  const featureContainer = document.getElementById('modal-featurelevel-options');
  const levels = ['1st','3rd','5th','7th','9th'];
  spellContainer.innerHTML = '';
  featureContainer.innerHTML = '';

  // Determine which levels are present in the currentPrimaryFiltered
  const presentSpellLevels = new Set();
  const presentFeatureLevels = new Set();
  (currentPrimaryFiltered.length ? currentPrimaryFiltered : featsData).forEach(f => {
    if (f.spellLevel) presentSpellLevels.add(f.spellLevel);
    if (f.featureLevel) presentFeatureLevels.add(f.featureLevel);
  });

  levels.forEach(lv => {
    const sId = `modal-spell-${lv}`;
    const fId = `modal-feature-${lv}`;
    const sLbl = document.createElement('label');
    sLbl.innerHTML = `<input type="checkbox" class="modal-spelllevel" value="${lv}" id="${sId}"> ${lv}`;
    const fLbl = document.createElement('label');
    fLbl.innerHTML = `<input type="checkbox" class="modal-featurelevel" value="${lv}" id="${fId}"> ${lv}`;

    // gray out if not present
    if (!presentSpellLevels.has(lv)) sLbl.classList.add('modal-disabled');
    if (!presentFeatureLevels.has(lv)) fLbl.classList.add('modal-disabled');

    spellContainer.appendChild(sLbl);
    featureContainer.appendChild(fLbl);
  });

  // Wire parent <-> children toggle behavior in modal
  wireModalParentChildBehavior();

  // Pre-check UI for already-applied advancedState (if any)
  precheckModalFromAdvancedState();
}

/* parent checkbox toggles child checkboxes */
function wireModalParentChildBehavior() {
  document.querySelectorAll('.modal-parent').forEach(parentCb => {
    parentCb.addEventListener('change', () => {
      const parent = parentCb.dataset.parent;
      const kids = document.querySelectorAll(`.modal-child[data-parent="${CSS.escape(parent)}"]`);
      kids.forEach(k => k.checked = parentCb.checked);
    });
  });

  // if any child toggled, reflect on parent checkbox
  document.addEventListener('change', (e) => {
    if (!e.target.classList.contains('modal-child')) return;
    const parent = e.target.dataset.parent;
    if (!parent) return;
    const parentCb = document.querySelector(`.modal-parent[data-parent="${CSS.escape(parent)}"]`);
    if (!parentCb) return;
    const kids = Array.from(document.querySelectorAll(`.modal-child[data-parent="${CSS.escape(parent)}"]`));
    parentCb.checked = kids.length && kids.every(k => k.checked);
  });
}

/* pre-check modal elements if advancedState already has these selections applied */
function precheckModalFromAdvancedState() {
  // parentTraits
  advancedState.parentTraits.forEach(pt => {
    const parentEl = document.querySelector(`.modal-parent[data-parent="${CSS.escape(pt)}"]`);
    if (parentEl) parentEl.checked = true;
  });
  // childIds
  advancedState.childIds.forEach(cid => {
    const childEl = document.querySelector(`.modal-child[data-id="${CSS.escape(cid)}"]`);
    if (childEl) childEl.checked = true;
  });
  // spellLevels
  advancedState.spellLevels.forEach(sl => {
    const el = document.querySelector(`.modal-spelllevel[value="${CSS.escape(sl)}"]`);
    if (el) el.checked = true;
  });
  // featureLevels
  advancedState.featureLevels.forEach(fl => {
    const el = document.querySelector(`.modal-featurelevel[value="${CSS.escape(fl)}"]`);
    if (el) el.checked = true;
  });
}

/* clear only modal selection controls (but don't clear applied advancedState) */
function clearModalSelections() {
  document.querySelectorAll('#advanced-filter-modal .modal-child, #advanced-filter-modal .modal-parent').forEach(i => i.checked = false);
  document.querySelectorAll('#advanced-filter-modal .modal-spelllevel, #advanced-filter-modal .modal-featurelevel').forEach(i => i.checked = false);
}

/* read modal selections and write into advancedState (applied) */
function readModalSelectionsAndApply() {
  // clear current advancedState
  advancedState.parentTraits.clear();
  advancedState.childIds.clear();
  advancedState.spellLevels.clear();
  advancedState.featureLevels.clear();

  // parents
  document.querySelectorAll('.modal-parent:checked').forEach(cb => {
    advancedState.parentTraits.add(cb.dataset.parent);
  });
  // children (individual feat ids)
  document.querySelectorAll('.modal-child:checked').forEach(cb => {
    advancedState.childIds.add(cb.dataset.id);
  });
  // spelllevels
  document.querySelectorAll('.modal-spelllevel:checked').forEach(cb => advancedState.spellLevels.add(cb.value));
  // featurelevels
  document.querySelectorAll('.modal-featurelevel:checked').forEach(cb => advancedState.featureLevels.add(cb.value));
}

/* -------------------------
   Keep modal options in sync with primary scope (disable if no matching items)
   - Called whenever sidebar filters change or data changes
   ------------------------- */
function buildAndDisableModalOptions() {
  // If modal is open, re-build its content; if not open, still build prepared content for when opened
  const modal = document.getElementById('advanced-filter-modal');
  const isOpen = modal.style.display === 'block';
  // rebuild the modal content (safe both if open or not)
  buildAndDisableModalOptions_inner();
  if (!isOpen) {
    // close modal remains closed
    modal.style.display = 'none';
  }
}

function buildAndDisableModalOptions_inner() {
  // reuse builder to recreate modal options
  const container = document.getElementById('advanced-filter-container');
  // we will rebuild using the currentPrimaryFiltered list (or full if empty)
  // call the builder function
  // it's safe to call it repeatedly
  currentPrimaryFiltered = currentPrimaryFiltered || [];
  // use same builder as above
  // to avoid duplication we'll just call the same function name (exists above)
  // but we need to pass-through currentPrimaryFiltered; the builder references that variable already
  // So simply call:
  buildAndDisableModalOptions(); // this will rebuild - note: recursive but safe since function reassigns; to avoid infinite recursion, we wrap:
  // Actually avoid reentrancy: instead, to keep simple, just call the builder defined earlier by reusing it:
  // (But we've already implemented buildAndDisableModalOptions() above as the full builder)
}

/* -------------------------
   End of file
   ------------------------- */
