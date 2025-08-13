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
  // Get containers
  const typeContainer = document.getElementById('type-filters');
  const ancestryContainer = document.getElementById('ancestry-filters');
  const classContainer = document.getElementById('class-filters');
  const tierContainer = document.getElementById('tier-filters');

  // Get unique values
  const types = uniqueFieldValues(data, 'category');
  const ancestries = uniqueFieldValues(data, 'ancestry');
  const classes = uniqueFieldValues(data, 'class');
  
  // Get unique tiers from the feats array
  const tiers = new Set();
  data.forEach(item => {
    if (Array.isArray(item.feats)) {
      item.feats.forEach(feat => {
        if (feat.tier) tiers.add(feat.tier);
      });
    }
  });
  const tierArray = Array.from(tiers).sort();

  // Populate Type filters
  types.forEach(t => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" name="Type" value="${t}"> ${t}`;
    typeContainer.appendChild(lbl);
  });

  // Populate Ancestry filters
  ancestries.forEach(a => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" name="Ancestry" value="${a}"> ${a}`;
    ancestryContainer.appendChild(lbl);
  });

  // Populate Class filters
  classes.forEach(c => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" name="Class" value="${c}"> ${c}`;
    classContainer.appendChild(lbl);
  });

  // Populate Tier filters
  tierArray.forEach(t => {
    const lbl = document.createElement('label');
    lbl.innerHTML = `<input type="checkbox" name="Tier" value="${t}"> ${t}`;
    tierContainer.appendChild(lbl);
  });

  // wire all sidebar inputs
  document.querySelectorAll('#sidebar input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
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
      const cb = document.querySelector(`#sidebar input[name="${cat}"][value="${escapeSelector(v)}"]`);
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

// Helper function to properly escape CSS selectors
function escapeSelector(str) {
  return str.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, "\\$&");
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
    buildModalOptions(); // build modal from currentPrimaryFiltered
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden','false');
  });
  
  closeBtn.addEventListener('click', () => { 
    modal.style.display = 'none'; 
    modal.setAttribute('aria-hidden','true'); 
  });
  
  window.addEventListener('click', (e) => { 
    if (e.target === modal) { 
      modal.style.display='none'; 
      modal.setAttribute('aria-hidden','true'); 
    } 
  });

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
function buildModalOptions() {
  const container = document.getElementById('advanced-filter-container');
  container.innerHTML = ''; // rebuild

  const data = currentPrimaryFiltered.length ? currentPrimaryFiltered : featsData;

  // Build lists grouped by category/group/parentTrait
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

  // Canonical class group order
  const canonicalClassOrder = ['Feature','Talent','Multiclass','Spell'];
  const classCols = [];
  canonicalClassOrder.forEach(k => { 
    if (classGroups[k] && classGroups[k].