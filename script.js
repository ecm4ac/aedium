let featsData = [];

fetch('feats.json')
    .then(response => response.json())
    .then(data => {
        featsData = data;
        populateFilters(data);
        renderResults(data);
    })
    .catch(err => console.error('Error loading feats.json:', err));

function populateFilters(data) {
    const ancestrySelect = document.getElementById('ancestry-filter');
    const classSelect = document.getElementById('class-filter');

    const ancestries = [...new Set(data.map(f => f.ancestry).filter(Boolean))].sort();
    const classes = [...new Set(data.map(f => f.class).filter(Boolean))].sort();

    ancestries.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a;
        opt.textContent = a;
        ancestrySelect.appendChild(opt);
    });

    classes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        classSelect.appendChild(opt);
    });

    ancestrySelect.addEventListener('change', applyFilters);
    classSelect.addEventListener('change', applyFilters);
    document.querySelectorAll('input[name="Tier"]').forEach(radio => {
        radio.addEventListener('change', applyFilters);
    });
}

function getSelectedTier() {
    const selected = document.querySelector('input[name="Tier"]:checked');
    return selected && selected.value !== "" ? selected.value : null;
}

function applyFilters() {
    const ancestryVal = document.getElementById('ancestry-filter').value;
    const classVal = document.getElementById('class-filter').value;
    const tierVal = getSelectedTier();

    const filtered = featsData.filter(f => {
        let match = true;
        if (ancestryVal && f.ancestry !== ancestryVal) match = false;
        if (classVal && f.class !== classVal) match = false;

        if (tierVal) {
            const regex = new RegExp(`${tierVal}\\s*-\\s*`, 'i');
            if (!regex.test(f.featDescription || "")) match = false;
        }

        return match;
    });

    renderResults(filtered);
}

function renderResults(results) {
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    if (results.length === 0) {
        container.innerHTML = '<p>No feats match your current filters.</p>';
        return;
    }

    const tierFilter = getSelectedTier();

    results.forEach(feat => {
        const card = document.createElement('div');
        card.classList.add('feat-card');

        const metaParts = [];
        if (feat.category) metaParts.push(feat.category);
        if (feat.ancestry) metaParts.push(feat.ancestry);
        if (feat.class) metaParts.push(feat.class);

        let tierSections = '';
        if (feat.featDescription) {
            const tierOrder = ['Adventurer', 'Champion', 'Epic'];

            tierOrder.forEach(tier => {
                const regex = new RegExp(`${tier}\\s*-\\s*(.*?)(?=(Adventurer|Champion|Epic|$))`, 'is');
                const match = feat.featDescription.match(regex);

                if (match && match[1].trim()) {
                    if (!tierFilter || tierFilter === tier) {
                        tierSections += `<p><strong>${tier}</strong> - ${match[1].trim()}</p>`;
                    }
                }
            });
        }

        if (tierFilter && tierSections.trim() === '') {
            return;
        }

        card.innerHTML = `
            <h3><strong>${feat.name}</strong></h3>
            <div class="feat-meta">${metaParts.join(' | ')}</div>
            <div class="feat-description">${tierSections}</div>
        `;

        container.appendChild(card);
    });
}