const API_BASE = "http://127.0.0.1:8000";

let machinesCache = [];
let selectedHostname = null;
let activeTab = "processes";
const filterState = {
    search: "",
    minCpu: 0,
    minMem: 0,
    sortBy: "none", // none | cpu | mem | name | pid
};
let machineSearchQuery = "";
let autoRefreshEnabled = false;
let autoRefreshIntervalMs = 10000;
let autoRefreshTimer = null;

async function fetchMachines() {
    const res = await fetch(`${API_BASE}/api/processes/latest/`);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    machinesCache = await res.json();
    return machinesCache;
}

function formatIso(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function renderSidebar() {
    const list = document.getElementById("machineList");
    list.innerHTML = "";
    const query = (machineSearchQuery || "").toLowerCase();
    machinesCache
        .filter(m => !query || m.hostname.toLowerCase().includes(query))
        .forEach(m => {
            const li = document.createElement("li");
            li.className = `machine-item${m.hostname === selectedHostname ? " active" : ""}`;
            li.innerHTML = `
                <div class="machine-name">${m.hostname}</div>
                <div class="machine-updated" title="Last updated">${formatIso(m.last_updated)}</div>
            `;
            li.addEventListener("click", () => {
                selectedHostname = m.hostname;
                renderSidebar();
                renderMain();
            });
            list.appendChild(li);
        });
}

function buildProcessTree(processes) {
    const pidToNode = new Map();
    const roots = [];

    processes.forEach(p => {
        pidToNode.set(p.pid, { process: p, children: [] });
    });

    processes.forEach(p => {
        if (p.parent_pid && pidToNode.has(p.parent_pid)) {
            pidToNode.get(p.parent_pid).children.push(pidToNode.get(p.pid));
        } else {
            roots.push(pidToNode.get(p.pid));
        }
    });

    return roots;
}

function filterTree(nodes, predicate) {
    const result = [];
    for (const node of nodes) {
        const filteredChildren = filterTree(node.children, predicate);
        if (predicate(node.process) || filteredChildren.length > 0) {
            result.push({ process: node.process, children: filteredChildren });
        }
    }
    return result;
}

function sortTree(nodes, key) {
    const compare = (a, b) => {
        if (key === 'cpu') return (b.process.cpu_usage || 0) - (a.process.cpu_usage || 0);
        if (key === 'mem') return (b.process.memory_usage || 0) - (a.process.memory_usage || 0);
        if (key === 'name') return String(a.process.name).localeCompare(String(b.process.name));
        if (key === 'pid') return (a.process.pid || 0) - (b.process.pid || 0);
        return 0;
    };
    nodes.sort(compare);
    nodes.forEach(n => sortTree(n.children, key));
}

function countNodes(nodes) {
    let c = 0;
    for (const n of nodes) {
        c += 1 + countNodes(n.children);
    }
    return c;
}

function renderProcessHeader(container) {
    const header = document.createElement("div");
    header.className = "process-header";
    header.innerHTML = `
        <div></div>
        <div class="header-cell">Process</div>
        <div class="header-cell">PID</div>
        <div class="header-cell">CPU Usage</div>
        <div class="header-cell">Memory Usage</div>
    `;
    container.appendChild(header);
}

function renderProcessTree(container, tree) {
    const ul = document.createElement("ul");
    ul.className = "process-tree";

    function renderNode(node) {
        const li = document.createElement("li");
        li.className = "process-node";

        const hasChildren = node.children.length > 0;
        const line = document.createElement("div");
        line.className = "node-line";

        const toggle = document.createElement("span");
        toggle.className = `node-toggle${hasChildren ? "" : " hidden"}`;
        toggle.textContent = hasChildren ? "▾" : "";
        let expanded = true;
        toggle.addEventListener("click", () => {
            expanded = !expanded;
            toggle.textContent = expanded ? "▾" : "▸";
            childList.style.display = expanded ? "block" : "none";
        });

        const name = document.createElement("span");
        name.className = "node-col node-name";
        const p = node.process;
        name.textContent = p.name;

        const pid = document.createElement("span");
        pid.className = "node-col mono";
        pid.textContent = String(p.pid);

        const cpu = document.createElement("span");
        cpu.className = "node-col mono";
        cpu.textContent = `${Number(p.cpu_usage).toFixed(1)}%`;

        const mem = document.createElement("span");
        mem.className = "node-col mono";
        mem.textContent = `${Number(p.memory_usage).toFixed(1)}%`;

        line.appendChild(toggle);
        line.appendChild(name);
        line.appendChild(pid);
        line.appendChild(cpu);
        line.appendChild(mem);

        const childList = document.createElement("ul");
        childList.className = "child-list";
        node.children.forEach(c => childList.appendChild(renderNode(c)));

        li.appendChild(line);
        if (hasChildren) li.appendChild(childList);
        return li;
    }

    tree.forEach(n => ul.appendChild(renderNode(n)));
    container.appendChild(ul);
}

function renderResources(container, processes) {
    const totalCpu = processes.reduce((s, p) => s + (Number(p.cpu_usage) || 0), 0);
    const totalMem = processes.reduce((s, p) => s + (Number(p.memory_usage) || 0), 0);
    const count = processes.length;

    const topCpu = [...processes]
        .sort((a, b) => b.cpu_usage - a.cpu_usage)
        .slice(0, 5);
    const topMem = [...processes]
        .sort((a, b) => b.memory_usage - a.memory_usage)
        .slice(0, 5);

    container.innerHTML = `
        <div class="resource-grid">
            <div class="card">
                <h3>Overview</h3>
                <div class="kv"><span class="label">Processes:</span> ${count}</div>
                <div class="kv"><span class="label">Total CPU (sum of processes):</span> ${totalCpu.toFixed(1)}%</div>
                <div class="kv"><span class="label">Total Mem (sum of processes):</span> ${totalMem.toFixed(1)}%</div>
                <div class="kv"><span class="label">Note:</span> Process CPU/memory are per-process; sums can exceed 100%.</div>
            </div>
            <div class="card">
                <h3>Top CPU</h3>
                ${topCpu.map(p => `<div class="kv">${p.name} (PID ${p.pid}) — ${p.cpu_usage.toFixed(1)}%</div>`).join("")}
            </div>
            <div class="card">
                <h3>Top Memory</h3>
                ${topMem.map(p => `<div class="kv">${p.name} (PID ${p.pid}) — ${p.memory_usage.toFixed(1)}%</div>`).join("")}
            </div>
        </div>
    `;
}

function renderProcessToolbar(total, shown) {
    const toolbar = document.getElementById("processToolbar");
    toolbar.style.display = "flex";
    toolbar.innerHTML = `
        <div class="field">
            <label for="searchInput">Search</label>
            <input id="searchInput" type="text" placeholder="Name or PID" value="${filterState.search}">
        </div>
        <div class="field">
            <label for="minCpu">Min CPU %</label>
            <input id="minCpu" type="number" min="0" max="100" step="0.1" value="${filterState.minCpu}">
        </div>
        <div class="field">
            <label for="minMem">Min Mem %</label>
            <input id="minMem" type="number" min="0" max="100" step="0.1" value="${filterState.minMem}">
        </div>
        <div class="field">
            <label for="sortBy">Sort</label>
            <select id="sortBy">
                <option value="none" ${filterState.sortBy==='none'?'selected':''}>None</option>
                <option value="cpu" ${filterState.sortBy==='cpu'?'selected':''}>CPU desc</option>
                <option value="mem" ${filterState.sortBy==='mem'?'selected':''}>Mem desc</option>
                <option value="name" ${filterState.sortBy==='name'?'selected':''}>Name A→Z</option>
                <option value="pid" ${filterState.sortBy==='pid'?'selected':''}>PID asc</option>
            </select>
        </div>
        <button id="clearFilters">Clear</button>
        <div class="muted">Showing ${shown} of ${total}</div>
    `;

    toolbar.querySelector('#searchInput').addEventListener('input', (e) => {
        filterState.search = e.target.value;
        renderMain();
    });
    toolbar.querySelector('#minCpu').addEventListener('input', (e) => {
        filterState.minCpu = Number(e.target.value) || 0;
        renderMain();
    });
    toolbar.querySelector('#minMem').addEventListener('input', (e) => {
        filterState.minMem = Number(e.target.value) || 0;
        renderMain();
    });
    toolbar.querySelector('#sortBy').addEventListener('change', (e) => {
        filterState.sortBy = e.target.value;
        renderMain();
    });
    toolbar.querySelector('#clearFilters').addEventListener('click', () => {
        filterState.search = "";
        filterState.minCpu = 0;
        filterState.minMem = 0;
        filterState.sortBy = 'none';
        renderMain();
    });
}

function hideProcessToolbar() {
    const toolbar = document.getElementById("processToolbar");
    toolbar.style.display = "none";
    toolbar.innerHTML = "";
}

function applyAutoRefresh() {
    if (autoRefreshTimer) {
        clearTimeout(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    if (autoRefreshEnabled) {
        autoRefreshTimer = setTimeout(async () => {
            await refreshAll();
        }, autoRefreshIntervalMs);
    }
}

function bindGlobalControls() {
    const machineSearch = document.getElementById('machineSearch');
    machineSearch.addEventListener('input', (e) => {
        machineSearchQuery = e.target.value;
        renderSidebar();
    });

    const toggle = document.getElementById('autoRefreshToggle');
    const intervalSel = document.getElementById('autoRefreshInterval');
    toggle.addEventListener('change', () => {
        autoRefreshEnabled = toggle.checked;
        applyAutoRefresh();
    });
    intervalSel.addEventListener('change', () => {
        autoRefreshIntervalMs = Number(intervalSel.value) || 10000;
        applyAutoRefresh();
    });
}

function renderMain() {
    const title = document.getElementById("pageTitle");
    const meta = document.getElementById("selectedMeta");
    const processView = document.getElementById("processView");
    const resourcesView = document.getElementById("resourcesView");

    const selected = machinesCache.find(m => m.hostname === selectedHostname);
    if (!selected) {
        title.textContent = "Process Monitor";
        meta.textContent = "Select a machine from the left";
        processView.innerHTML = "";
        resourcesView.innerHTML = "";
        hideProcessToolbar();
        return;
    }

    title.textContent = selected.hostname;
    meta.textContent = `Last updated ${formatIso(selected.last_updated)} · ${selected.processes.length} processes`;

    if (activeTab === "processes") {
        processView.innerHTML = "";
        const tree = buildProcessTree(selected.processes || []);

        const predicate = (p) => {
            const q = (filterState.search || "").toLowerCase().trim();
            const matchesSearch = !q || p.name.toLowerCase().includes(q) || String(p.pid).includes(q);
            const matchesCpu = Number(p.cpu_usage) >= (filterState.minCpu || 0);
            const matchesMem = Number(p.memory_usage) >= (filterState.minMem || 0);
            return matchesSearch && matchesCpu && matchesMem;
        };

        const pruned = filterTree(tree, predicate);
        if (filterState.sortBy !== 'none') sortTree(pruned, filterState.sortBy);
        renderProcessHeader(processView);
        renderProcessTree(processView, pruned);
        renderProcessToolbar(selected.processes.length, countNodes(pruned));
        resourcesView.innerHTML = "";
        document.getElementById("processView").style.display = "block";
        document.getElementById("resourcesView").style.display = "none";
    } else {
        hideProcessToolbar();
        resourcesView.innerHTML = "";
        renderResources(resourcesView, selected.processes || []);
        document.getElementById("processView").style.display = "none";
        document.getElementById("resourcesView").style.display = "block";
    }
}

function bindTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach(t => {
        t.addEventListener("click", () => {
            tabs.forEach(x => x.classList.remove("active"));
            t.classList.add("active");
            activeTab = t.dataset.tab;
            renderMain();
        });
    });
}

async function refreshAll() {
    try {
        await fetchMachines();
        if (!selectedHostname && machinesCache.length > 0) {
            selectedHostname = machinesCache[0].hostname;
        }
        renderSidebar();
        renderMain();
        applyAutoRefresh();
    } catch (e) {
        console.error(e);
        alert("Failed to load data. Is the backend running?");
    }
}

function bindRefresh() {
    document.getElementById("refreshBtn").addEventListener("click", refreshAll);
}

window.addEventListener("DOMContentLoaded", async () => {
    bindTabs();
    bindRefresh();
    bindGlobalControls();
    await refreshAll();
});
