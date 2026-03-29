const campus = {
    "Main Gate": { "SGO Library": 20, "Guidance Office": 5 },
    "SGO Library": { "Main Gate": 45, "SGO Canteen": 5, "Admin": 40 },
    "SGO Canteen": { "Library": 5, "SGO Building": 7, "Guidance Office": 45 },
    "Admin": { "SGO Library": 40, "SHS Building": 35, "Main Gate": 6, "Guidance Office": 2},
    "SGO Building": { "SGO Canteen": 7, "Admin": 43, "SHS Building": 10, "Guidance Office": 47 },
    "SHS Building": { "Main Gate": 30, "SGO Canteen": 15 },
    "Guidance Office": { "SGO Building": 47, "SGO Library": 3 }
};

const STORAGE_KEY = "smartCampusNavGraph_v1";

function isValidCampusData(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    if (Object.keys(obj).length === 0) return true;
    for (const [node, neighbors] of Object.entries(obj)) {
        if (typeof node !== "string" || !neighbors || typeof neighbors !== "object" || Array.isArray(neighbors)) {
            return false;
        }
        for (const [n, w] of Object.entries(neighbors)) {
            if (typeof n !== "string" || typeof w !== "number" || !Number.isFinite(w) || w <= 0) {
                return false;
            }
        }
    }
    return true;
}

function saveCampusToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(campus));
        return true;
    } catch (e) {
        return false;
    }
}

function loadCampusFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!isValidCampusData(parsed)) return false;
        for (const k of Object.keys(campus)) {
            delete campus[k];
        }
        for (const [k, v] of Object.entries(parsed)) {
            campus[k] = { ...v };
        }
        return true;
    } catch (e) {
        return false;
    }
}

function manualSaveCampus() {
    if (saveCampusToStorage()) {
        setResult("addStatus", "✅ Saved campus graph to this browser (localStorage).", "ok");
    } else {
        setResult("addStatus", "Could not save (browser blocked storage or quota).", "warn");
    }
}

function manualLoadCampus() {
    if (loadCampusFromStorage()) {
        renderAll();
        setResult("addStatus", "✅ Loaded campus graph from saved data.", "ok");
    } else {
        setResult("addStatus", "No valid saved graph found yet. Add connections and save, or use the default map.", "warn");
    }
}

function formatDate() {
    return new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
    });
}

function setResult(targetId, text, type = "info") {
    document.getElementById(targetId).innerHTML = `<div class="result-box ${type}">${text}</div>`;
}

function getNodes() {
    return Object.keys(campus).sort();
}

function countEdges() {
    const seen = new Set();
    for (const from of getNodes()) {
        for (const to of Object.keys(campus[from])) {
            const key = [from, to].sort().join("::");
            seen.add(key);
        }
    }
    return seen.size;
}

function countConnectedComponents() {
    const visited = new Set();
    let components = 0;
    for (const node of getNodes()) {
        if (visited.has(node)) continue;
        components += 1;
        const queue = [node];
        visited.add(node);
        while (queue.length > 0) {
            const current = queue.shift();
            for (const neighbor of Object.keys(campus[current])) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
    }
    return components;
}

function renderGraphViews() {
    const locationList = document.getElementById("locationList");
    const mapData = document.getElementById("mapData");
    locationList.innerHTML = "";
    mapData.innerHTML = "";

    for (const node of getNodes()) {
        locationList.innerHTML += `<div class="line">• ${node}</div>`;
        const neighbors = Object.entries(campus[node])
            .map(([name, dist]) => `${name} (${dist}m)`)
            .join(", ");
        mapData.innerHTML += `<div class="line"><strong>${node}</strong> → ${neighbors || "No links"}</div>`;
    }
}

function fillSelect(selectId) {
    const select = document.getElementById(selectId);
    select.innerHTML = "";
    for (const node of getNodes()) {
        select.add(new Option(node, node));
    }
}

function fillDeleteLocationSelect() {
    const select = document.getElementById("deleteLocationSelect");
    if (!select) return;
    const prev = select.value;
    select.innerHTML = "";
    const nodes = getNodes();
    select.add(new Option("— choose —", ""));
    for (const node of nodes) {
        select.add(new Option(node, node));
    }
    if (prev && nodes.includes(prev)) {
        select.value = prev;
    }
}

function renderAll() {
    document.getElementById("todayDate").textContent = formatDate();

    renderGraphViews();
    fillSelect("connA");
    fillSelect("connB");
    fillSelect("startSelect");
    fillSelect("endSelect");
    fillDeleteLocationSelect();

    document.getElementById("locCount").textContent = String(getNodes().length);
    document.getElementById("edgeCount").textContent = String(countEdges());
    document.getElementById("componentCount").textContent = String(countConnectedComponents());

    if (typeof window.__campusMinimapRefresh === "function") {
        window.__campusMinimapRefresh();
    }
}

function areConnected(start, end) {
    if (!campus[start] || !campus[end]) return false;
    const queue = [start];
    const visited = new Set([start]);

    while (queue.length > 0) {
        const current = queue.shift();
        if (current === end) return true;

        for (const neighbor of Object.keys(campus[current])) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return false;
}

function checkConnectivity() {
    const a = document.getElementById("connA").value;
    const b = document.getElementById("connB").value;

    if (a === b) {
        setResult("connectDisplay", `✅ ${a} is connected to itself.`, "ok");
        return;
    }

    if (areConnected(a, b)) {
        setResult("connectDisplay", `✅ ${a} and ${b} are connected in the campus graph.`, "ok");
    } else {
        setResult("connectDisplay", `❌ ${a} and ${b} are not connected.`, "warn");
    }
}

function shortestPath(startNode, endNode) {
    const distances = {};
    const previous = {};
    const unvisited = new Set(getNodes());

    for (const node of unvisited) {
        distances[node] = Infinity;
        previous[node] = null;
    }
    distances[startNode] = 0;

    while (unvisited.size > 0) {
        const current = [...unvisited].reduce((best, node) =>
            distances[node] < distances[best] ? node : best
        );

        if (distances[current] === Infinity) break;
        unvisited.delete(current);

        if (current === endNode) break;

        for (const [neighbor, weight] of Object.entries(campus[current])) {
            if (!unvisited.has(neighbor)) continue;
            const candidate = distances[current] + weight;
            if (candidate < distances[neighbor]) {
                distances[neighbor] = candidate;
                previous[neighbor] = current;
            }
        }
    }

    if (distances[endNode] === Infinity) {
        return null;
    }

    const path = [];
    let current = endNode;
    while (current !== null) {
        path.unshift(current);
        current = previous[current];
    }

    return { path, distance: distances[endNode], steps: Math.max(path.length - 1, 0) };
}

function askDistanceBetween(newNode, oldNode, fallbackDistance) {
    const message = `Enter walking distance in meters from "${newNode}" to "${oldNode}":`;
    const raw = window.prompt(message, String(fallbackDistance));
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        return fallbackDistance;
    }
    return value;
}

const WALK_SPEED_MPS = 1.25;

function formatWalkDuration(sec) {
    if (sec < 60) {
        return `${sec.toFixed(1)} s`;
    }
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s}s`;
}

function findPath() {
    const startNode = document.getElementById("startSelect").value;
    const endNode = document.getElementById("endSelect").value;

    if (startNode === endNode) {
        setResult("pathDisplay", `You are already at <strong>${startNode}</strong>. Steps: 0`, "info");
        if (typeof window.__campusMinimapRunNav === "function") {
            window.__campusMinimapRunNav({ path: [startNode], distance: 0, steps: 0 });
        }
        return;
    }

    const result = shortestPath(startNode, endNode);
    if (!result) {
        setResult("pathDisplay", "No route found between the selected locations.", "warn");
        return;
    }

    const estSec = result.distance / WALK_SPEED_MPS;
    setResult(
        "pathDisplay",
        `<strong>Shortest Path:</strong> ${result.path.join(" ➜ ")}<br>` +
        `<strong>Number of Steps:</strong> ${result.steps}<br>` +
        `<strong>Total Distance:</strong> ${result.distance} meters<br>` +
        `<strong>Est. walk time:</strong> ~${formatWalkDuration(estSec)} (≈ ${WALK_SPEED_MPS} m/s)`,
        "ok"
    );

    if (typeof window.__campusMinimapRunNav === "function") {
        window.__campusMinimapRunNav(result);
    }
}

function addConnection() {
    const nodeAInput = document.getElementById("nodeA");
    const nodeBInput = document.getElementById("nodeB");
    const weightInput = document.getElementById("weightInput");

    const a = nodeAInput.value.trim();
    const b = nodeBInput.value.trim();
    const distance = Number(weightInput.value);

    if (!a || !b) {
        setResult("addStatus", "Please enter both locations.", "warn");
        return;
    }

    if (a === b) {
        setResult("addStatus", "A location cannot connect to itself.", "warn");
        return;
    }

    if (!Number.isFinite(distance) || distance <= 0) {
        setResult("addStatus", "Distance must be a positive number.", "warn");
        return;
    }

    const existingNodes = getNodes();
    const isNewA = !campus[a];
    const isNewB = !campus[b];

    if (!campus[a]) campus[a] = {};
    if (!campus[b]) campus[b] = {};

    // Only auto-expand one new location at a time so A and B
    // do not both receive identical "connect to all" behavior.
    let autoExpandedNode = null;
    if (isNewA) {
        autoExpandedNode = a;
    } else if (isNewB) {
        autoExpandedNode = b;
    }

    if (autoExpandedNode) {
        for (const oldNode of existingNodes) {
            if (oldNode === autoExpandedNode) continue;
            if (!campus[autoExpandedNode][oldNode]) {
                const customDistance = askDistanceBetween(autoExpandedNode, oldNode, distance);
                campus[autoExpandedNode][oldNode] = customDistance;
                campus[oldNode][autoExpandedNode] = customDistance;
            }
        }
    }

    campus[a][b] = distance;
    campus[b][a] = distance;

    nodeAInput.value = "";
    nodeBInput.value = "";
    weightInput.value = "";

    renderAll();
    const savedOk = saveCampusToStorage();
    const saveNote = savedOk ? "" : " (⚠️ could not save to browser storage)";

    if (autoExpandedNode && isNewA && isNewB) {
        setResult(
            "addStatus",
            `✅ Added path: ${a} ↔ ${b} (${distance}m). Auto-expanded ${autoExpandedNode} to existing locations with individual distances. ${b} is only linked to ${a} for now.${saveNote}`,
            "ok"
        );
        return;
    }

    if (autoExpandedNode) {
        setResult(
            "addStatus",
            `✅ Added path: ${a} ↔ ${b} (${distance}m). Auto-expanded ${autoExpandedNode} to all existing locations using individual distance inputs.${saveNote}`,
            "ok"
        );
        return;
    }

    setResult("addStatus", `✅ Added path: ${a} ↔ ${b} (${distance}m)${saveNote}`, "ok");
}

function deleteLocation() {
    const select = document.getElementById("deleteLocationSelect");
    const name = select ? select.value.trim() : "";

    if (!name) {
        setResult("addStatus", "Choose a location to remove.", "warn");
        return;
    }

    if (!campus[name]) {
        setResult("addStatus", "That location is not in the graph.", "warn");
        return;
    }

    if (!window.confirm(`Remove "${name}" and every path connected to it?`)) {
        return;
    }

    delete campus[name];

    for (const node of Object.keys(campus)) {
        if (campus[node][name]) {
            delete campus[node][name];
        }
    }

    renderAll();
    const savedOk = saveCampusToStorage();
    const saveNote = savedOk ? "" : " (⚠️ could not save to browser storage)";

    if (getNodes().length === 0) {
        setResult("addStatus", `Removed "${name}". Campus is empty — add new locations to build the map again.${saveNote}`, "info");
        return;
    }

    setResult("addStatus", `✅ Removed "${name}" and its connections.${saveNote}`, "ok");
}

document.getElementById("checkBtn").addEventListener("click", checkConnectivity);
document.getElementById("goBtn").addEventListener("click", findPath);
document.getElementById("addBtn").addEventListener("click", addConnection);
document.getElementById("saveGraphBtn").addEventListener("click", manualSaveCampus);
document.getElementById("loadGraphBtn").addEventListener("click", manualLoadCampus);
document.getElementById("deleteLocationBtn").addEventListener("click", deleteLocation);

loadCampusFromStorage();
renderAll();