/* script.js
   - data-agnostic renderer
   - sidebar fixed + accordions open by default
   - union (OR) logic across Type/Ancestry/Class selections
   - Tier filters applied to returned set (i.e., further narrowing)
*/

let featsData = [];

/* UTILS ======================================================= */

// handle field value checking for arrays / comma-separated strings / single strings
function valueMatchesField(fieldValue, wanted) {
  if (fieldValue == null) return false;
  if (Array.isArray(fieldValue)) return fieldValue.includes(wanted);
  if (typeof fieldValue === 'string') {
    // split by comma if contains commas and trim
    if (fieldValue.indexOf(',') !== -1) {
      return fieldValue.split(',').map(s => s.trim()).includes(wanted);
    }
    return fieldValue === wanted;
  }
  return false;
}

// collect unique values for a given field (works if field is array or comma-list)
function uniqueFieldValues(data, fieldName) {
  const set = new Set();
  data.forEach(item => {
    const v = item[fieldName];
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach(x => x && set.add(String(x).trim()));
    } else if (typeof v === 'string' && v.indexOf(',') !== -1) {
      v.split(',').map(s => s.trim()).forEach(x => x && set.add(x));
    } else {
      set.add(String(v).trim());
    }
  });
  return Array.from(set).sort();
}

/* LOAD DATA =================================================== */
fetch('feats.json')
  .then(r => r.json())
  .then(data => {
    featsData = data;
    populateFilterOptions(data);
    applyFilters();   // initial render
    wireAccordionToggles();
    wireReset();
  })
  .catch(e => {
    console.error('Failed to load feats.json', e);
    document.getElementById('results-container').innerHTML = '<p>Error loading feats.json</p>';
  });

/* POPULATE FILTERS ============================================ */
function populateFilterOptions(data) {
  // dynamic ancestry/class lists
  const ancestries = uniqueFieldValues(data, 'ancestry');
  const classes = uniqueFieldValues(data, 'class');

  const ancestryContainer = document.getElementById('ancestry-filters');
  const classContainer = document.getElementById('class-filters');

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

  // wire all sidebar inputs to re-filter
  document.querySelectorAll('#sidebar input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', applyFilters);
  });
}

/* ACCORDION TOGGLING ========================================== */
function wireAccordionToggles() {
  document.querySelectorAll('.accordion').forEach(acc => {
    const header = acc.querySelector('.acc-header');
    header.addEventListener('click', () => {
      acc.classList.toggle('open');
      // content visibility controlled by CSS (.open .accordion-content)
    });
    // ensure .open present for default-open accordions (already set in HTML)
  });
}

/* RESET BUTTON ================================================ */
function wireReset() {
  const btn = document.getElementById('reset-filters');
  btn.addEventListener('click', () => {
    document.querySelectorAll('#sidebar input[type="checkbox"]').forEach(cb => cb.checked = false);
    applyFilters();
  });
}

/* READ CHECKED VALUES ========================================= */
function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`#sidebar input[name="${name}"]:checked`)).map(i => i.value);
}

/* APPLY FILTERS (UNION across Category selections) ============ */
/*
  Behavior:
  - If NO Type/Ancestry/Class filters are selected => include all feats (subject to Tier)
  - If any Type/Ancestry/Class filters are selected => include feats that match ANY selected value
    (i.e., union/OR logic across categories)
  - After union, apply Tier filter to keep only feats that contain the tier(s) selected
*/
function applyFilters() {
  const typeFilters = getCheckedValues('Type');       // e.g. ["Class"]
  const ancestryFilters = getCheckedValues('Ancestry');
  const classFilters = getCheckedValues('Class');
  const tierFilters = getCheckedValues('Tier');       // e.g. ["Adventurer"]

  const somePrimarySelected = (typeFilters.length + ancestryFilters.length + classFilters.length) > 0;

  // union match: feat passes if it matches ANY of the selected non-tier filters
  const unionMatches = featsData.filter(f => {
    if (!somePrimarySelected) return true; // no primary filters selected -> include candidate

    // check Type (category)
    if (typeFilters.length && typeFilters.includes(f.category)) return true;

    // check ancestry
    if (ancestryFilters.length && ancestryFilters.some(a => valueMatchesField(f.ancestry, a))) return true;

    // check class
    if (classFilters.length && classFilters.some(c => valueMatchesField(f.class, c))) return true;

    // no match found
    return false;
  });

  // Now apply tier filters (if any) to the union set.
  // If tierFilters present, a feat is kept only if it contains at least one matching feat-tier entry.
  const finalSet = unionMatches.filter(f => {
    if (!tierFilters.length) return true;
    if (!Array.isArray(f.feats)) return false;
    return f.feats.some(ft => tierFilters.includes(ft.tier));
  });

  renderResults(finalSet, tierFilters);
}

/* RENDER RESULTS ============================================== */
function renderResults(results, tierFilters = []) {
  const container = document.getElementById('results-container');
  container.innerHTML = '';

  // show active filter pills
  renderActivePills();

  if (!results.length) {
    container.innerHTML = '<p>No feats match your current filters.</p>';
    return;
  }

  results.forEach(f => {
    const card = document.createElement('div');
    card.className = 'feat-card';

    // Build the header meta line based on category rules (Ancestry vs Class vs General)
    const metaParts = [];

    if (f.category === 'Ancestry') {
      // "{ancestry} {group}" first
      if (f.ancestry) metaParts.push(`${f.ancestry}${f.group ? ' ' + f.group : ''}`);
    } else if (f.category === 'Class') {
      if (f.class) metaParts.push(`${f.class}${f.group ? ' ' + f.group : ''}`);
    } else {
      // fallback (General etc.)
      if (f.category) metaParts.push(f.category);
    }

    if (f.parentTrait) metaParts.push(f.parentTrait);
    if (f.featureTier) metaParts.push(`${f.featureTier} Tier`);
    if (f.featureLevel) metaParts.push(`Req Level: ${f.featureLevel}`);
    if (f.spellLevel) metaParts.push(`${f.spellLevel} Level`);

    // Build tiered descriptions, only showing selected tiers if tierFilters present
    let descHtml = '';
    if (Array.isArray(f.feats)) {
      // iterate in canonical order (Adventurer, Champion, Epic) if present
      const canonical = ['Adventurer','Champion','Epic'];
      const entriesSorted = [...f.feats].sort((a,b) => {
        return canonical.indexOf(a.tier) - canonical.indexOf(b.tier);
      });

      entriesSorted.forEach(entry => {
        if (!tierFilters.length || tierFilters.includes(entry.tier)) {
          const desc = String(entry.description || '').replace(/^"|"$/g, '').trim();
          descHtml += `<p><strong>${entry.tier}</strong>: ${desc}</p>`;
        }
      });
    }

    // tags
    let tagHtml = '';
    if (f.tag) {
      const tags = String(f.tag).split(',').map(t => t.trim()).filter(Boolean);
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

/* RENDER ACTIVE FILTER PILL(S) ================================= */
function renderActivePills() {
  const out = document.getElementById('active-filters');
  const categories = ['Type','Tier','Ancestry','Class'];
  const pills = [];

  categories.forEach(cat => {
    const vals = getCheckedValues(cat);
    vals.forEach(v => {
      // create a pill string
      const pill = document.createElement('span');
      pill.className = 'tag';
      pill.style.background = '#dfe6f0';
      pill.style.color = '#222';
      pill.style.marginRight = '6px';
      pill.style.cursor = 'pointer';
      pill.textContent = `${cat}: ${v}`;
      pill.title = 'Click to remove';
      pill.addEventListener('click', () => {
        // uncheck the corresponding checkbox and reapply filters
        const cb = document.querySelector(`#sidebar input[name="${cat}"][value="${CSS.escape(v)}"]`);
        if (cb) cb.checked = false;
        applyFilters();
      });
      pills.push(pill);
    });
  });

  out.innerHTML = '';
  pills.forEach(p => out.appendChild(p));
}