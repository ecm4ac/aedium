let featsData = [];

fetch('feats.json')
    .then(response => response.json())
    .then(data => {
        featsData = data;
        populateFilterOptions(data);
        renderResults(data);
    })
    .catch(err => console.error('Error loading feats.json:', err));

function populateFilterOptions(data) {
    const ancestryContainer = document.getElementById('ancestry-filters');
    const classContainer = document.getElementById('class-filters');

    const ancestries = [...new Set(data.map(f => f.ancestry).filter(Boolean))].sort();
    const classes = [...new Set(data.map(f => f.class).filter(Boolean))].sort();

    ancestries.forEach(a => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" name="Ancestry" value="${a}"> ${a}`;
        ancestryContainer.appendChild(label);
    });

    classes.forEach(c => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" name="Class" value="${c}"> ${c}`;
        classContainer.appendChild(label);
    });

    document.querySelectorAll('#sidebar input').forEach(input => {
        input.addEventListener('change', applyFilters);
    });

    // Accordion toggles
    document.querySelectorAll('.accordion h3').forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('active');
            const content = header.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
            }
        });
    });
}

function applyFilters() {
    const typeFilters = getCheckedValues('Type');
    const tierFilters = getCheckedValues('Tier');
    const ancestryFilters = getCheckedValues('Ancestry');
    const classFilters = getCheckedValues('Class');

    const filtered = featsData.filter(f => {
        let match = true;

        if (typeFilters.length && !typeFilters.includes(f.category)) match = false;
        if (ancestryFilters.length && !ancestryFilters.includes(f.ancestry)) match = false;
        if (classFilters.length && !classFilters.includes(f.class)) match = false;

        // Tier filter check
        if (tierFilters.length) {
            const hasTier = f.feats && f.feats.some(t => tierFilters.includes(t.tier));
            if (!hasTier) match = false;
        }

        return match;
    });

    renderResults(filtered, tierFilters);
}

function getCheckedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(cb => cb.value);
}

function renderResults(results, tierFilters = []) {
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    if (!results.length) {
        container.innerHTML = '<p>No feats match your current filters.</p>';
        return;
    }

    results.forEach(f => {
        const card = document.createElement('div');
        card.classList.add('feat-card');

        // Build meta line based on category rules
        let metaParts = [];
        if (f.category === 'Ancestry') {
            metaParts.push(`${f.ancestry}${f.group ? ' ' + f.group : ''}`);
        } else if (f.category === 'Class') {
            metaParts.push(`${f.class}${f.group ? ' ' + f.group : ''}`);
        } else {
            metaParts.push(f.category);
        }
        if (f.parentTrait) metaParts.push(f.parentTrait);
        if (f.featureTier) metaParts.push(`${f.featureTier} Tier`);
        if (f.featureLevel) metaParts.push(`Req Level: ${f.featureLevel}`);
        if (f.spellLevel) metaParts.push(`${f.spellLevel} Level`);

        // Build feat description sections
        let descHtml = '';
        if (Array.isArray(f.feats)) {
            f.feats.forEach(entry => {
                if (!tierFilters.length || tierFilters.includes(entry.tier)) {
                    descHtml += `<p><strong>${entry.tier}</strong> - ${entry.description}</p>`;
                }
            });
        }

        // Tags as pill elements
        let tagHtml = '';
        if (f.tag) {
            const tags = f.tag.split(',').map(t => t.trim()).filter(Boolean);
            tags.forEach(tag => tagHtml += `<span class="tag">${tag}</span>`);
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

// Reset button clears all filters
document.getElementById('reset-filters').addEventListener('click', () => {
    document.querySelectorAll('#sidebar input[type=checkbox]').forEach(cb => cb.checked = false);
    applyFilters(); // re-run filter logic
});

// Accordion logic - start all open
document.querySelectorAll('.accordion').forEach(acc => {
    acc.classList.add('open');
    acc.querySelector('h3').addEventListener('click', () => {
        acc.classList.toggle('open');
    });
});