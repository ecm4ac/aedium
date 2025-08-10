let feats = [];
let activeFilters = {
    Type: [],
    Tier: [],
    Ancestry: [],
    Class: []
};

// Define filter categories & options
const filterData = {
    "Type": ["General", "Ancestry", "Class"],
    "Tier": ["Adventurer", "Champion", "Epic"],
    "Ancestry": [
        "Alar Elf","Arranite","Caul-Born","Cayori","Dennai","Dorofei","Dwarf","Forged","Grovewarden",
        "Half-Dwarf","Half-Elf","Half-Orc","Herutak","Human","Kahari","Kolak","Kryssharak","Kythrian",
        "Lyncanthrope","Minotaur","Nomadic Elf","Orc","Relekkin","Stoneborn","Tontu","Tryllan",
        "Tulaak","Varkari","Vathir","Veyari","Yossar"
    ],
    "Class": [
        "Abomination","Aeon Summoner","Avenger","Barbarian","Bard","Chaos Mage","Cleric","Commander",
        "Druid","Fateweaver","Fighter","Haunted One","Monk","Necromancer","Occultist","Paladin",
        "Psion","Ranger","Rogue","Savage","Slayer","Sorcerer","Swordmage","The Fury","Theurge",
        "Vanguard","Warlock","Wizard"
    ]
};

document.addEventListener("DOMContentLoaded", () => {
    fetch("feats.json")
        .then(res => res.json())
        .then(data => {
            feats = data;
            renderFilters();
        });
});

function renderFilters() {
    const filterContainer = document.getElementById("filters");
    filterContainer.innerHTML = "";

    for (let category in filterData) {
        const group = document.createElement("div");
        group.className = "filter-group";

        const header = document.createElement("h3");
        header.textContent = category;
        header.addEventListener("click", () => {
            optionsDiv.style.display = optionsDiv.style.display === "block" ? "none" : "block";
        });

        const optionsDiv = document.createElement("div");
        optionsDiv.className = "filter-options";

        filterData[category].forEach(option => {
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.value = option;
            checkbox.addEventListener("change", () => {
                toggleFilter(category, option, checkbox.checked);
            });

            const span = document.createElement("span");
            span.textContent = option;

            label.appendChild(checkbox);
            label.appendChild(span);
            optionsDiv.appendChild(label);
        });

        group.appendChild(header);
        group.appendChild(optionsDiv);
        filterContainer.appendChild(group);
    }
}

function toggleFilter(category, option, isChecked) {
    if (isChecked) {
        activeFilters[category].push(option);
    } else {
        activeFilters[category] = activeFilters[category].filter(o => o !== option);
    }
    updateFeatList();
}

function updateFeatList() {
    const list = document.getElementById("feat-list");
    let filtered = feats.filter(f => matchesFilters(f));

    // Disable filters with zero matches
    disableUnusedFilters(filtered);

    if (filtered.length === 0) {
        list.innerHTML = "<p>No feats match your selection.</p>";
        return;
    }

    list.innerHTML = "";
    filtered.forEach(f => {
        const card = document.createElement("div");
        card.className = "feat-card";
        card.innerHTML = `<strong>${f.name}</strong> (${f.featTier})<br>${f.featDescription}`;
        list.appendChild(card);
    });
}

function matchesFilters(feat) {
    for (let cat in activeFilters) {
        if (activeFilters[cat].length > 0) {
            if (cat === "Type" && !activeFilters[cat].includes(feat.category)) return false;
            if (cat === "Tier" && !activeFilters[cat].includes(feat.featTier)) return false;
            if (cat === "Ancestry" && !activeFilters[cat].includes(feat.ancestry)) return false;
            if (cat === "Class" && !activeFilters[cat].includes(feat.class)) return false;
        }
    }
    return true;
}

function disableUnusedFilters(filteredFeats) {
    document.querySelectorAll(".filter-group").forEach(group => {
        const category = group.querySelector("h3").textContent;
        const options = group.querySelectorAll("input[type='checkbox']");

        options.forEach(checkbox => {
            let hasMatch = filteredFeats.some(f => {
                if (category === "Type") return f.category === checkbox.value;
                if (category === "Tier") return f.featTier === checkbox.value;
                if (category === "Ancestry") return f.ancestry === checkbox.value;
                if (category === "Class") return f.class === checkbox.value;
            });
            checkbox.disabled = !hasMatch;
        });
    });
}
