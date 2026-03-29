/* ---------- Campus mini map: real locations, arrowed links, walking animation ---------- */
const MINIMAP_MS_PER_METER = 220;
const MINIMAP_MIN_LEG_MS = 900;
const NODE_PIN_COLORS = ["#FF6B9D", "#FFC93C", "#60A5FA", "#A78BFA", "#34d399", "#fb923c", "#f472b6", "#818cf8"];

function layoutCampusPositions() {
    const nodes = getNodes();
    const n = nodes.length;
    const positions = {};
    if (n === 0) return positions;
    const radius = n <= 3 ? 28 : n <= 6 ? 34 : 38;
    for (let i = 0; i < n; i += 1) {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        positions[nodes[i]] = {
            x: 50 + radius * Math.cos(angle),
            y: 50 + radius * Math.sin(angle)
        };
    }
    return positions;
}

function listUniqueEdges() {
    const list = [];
    const seen = new Set();
    for (const a of getNodes()) {
        if (!campus[a]) continue;
        for (const b of Object.keys(campus[a])) {
            const key = [a, b].sort().join("||");
            if (seen.has(key)) continue;
            seen.add(key);
            list.push({ a, b, meters: campus[a][b] });
        }
    }
    return list;
}

function edgeKeyUndirected(a, b) {
    return [a, b].sort().join("||");
}

function buildRouteEdgeSet(path) {
    const set = new Set();
    if (!path || path.length < 2) return set;
    for (let i = 0; i < path.length - 1; i += 1) {
        set.add(edgeKeyUndirected(path[i], path[i + 1]));
    }
    return set;
}

/** One clear arrow along A→B (toward B). Used only on active route legs. */
function svgDirectedArrowTowardB(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    /* Slightly past center so it reads “go this way” without crowding the nodes */
    const t = 0.58;
    const x = ax + dx * t;
    const y = ay + dy * t;
    return `<g transform="translate(${x.toFixed(3)},${y.toFixed(3)}) rotate(${angle.toFixed(2)})" class="minimap-arrow-once">
        <polygon class="minimap-arrow-chevron" points="0,-1.15 1.85,0 0,1.15"/>
    </g>`;
}

/** Nudge label so it sits beside the line, not on top of it */
function edgeLabelOffset(ax, ay, bx, by, mx, my) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 2.8;
    const ny = (dx / len) * 2.8;
    return { x: mx + nx, y: my + ny };
}

function initCampusMinimap() {
    const fab = document.getElementById("minimap-fab");
    const overlay = document.getElementById("minimap-overlay");
    const backdrop = document.getElementById("minimap-backdrop");
    const closeBtn = document.getElementById("minimap-close");
    const zonesRoot = document.getElementById("minimap-zones");
    const player = document.getElementById("minimap-player");
    const svg = document.getElementById("minimap-edges");
    const tripLine = document.getElementById("minimap-trip-line");

    let positions = {};
    let currentAtNode = null;
    let isMaximized = false;
    let animToken = 0;

    function pinColorFor(name) {
        const nodes = getNodes();
        const idx = Math.max(0, nodes.indexOf(name));
        return NODE_PIN_COLORS[idx % NODE_PIN_COLORS.length];
    }

    function initialFor(name) {
        const t = String(name).trim();
        return t ? t[0].toUpperCase() : "?";
    }

    function setTripText(html) {
        if (tripLine) tripLine.innerHTML = html || "";
    }

    function drawEdges(highlightPath) {
        if (!svg) return;
        const routeSet = buildRouteEdgeSet(highlightPath);
        const edges = listUniqueEdges();
        let body = "";

        const focusNode = currentAtNode || document.getElementById("startSelect")?.value || null;

        /* 1) Default view (declutter): show only the focused location connections. */
        for (const { a, b, meters } of edges) {
            const pa = positions[a];
            const pb = positions[b];
            if (!pa || !pb) continue;
            const onRoute = routeSet.has(edgeKeyUndirected(a, b));
            if (onRoute) continue;

            // When navigating, hide non-route lines completely.
            if (highlightPath && highlightPath.length > 1) continue;

            // When not navigating, only show links connected to the focused node.
            if (focusNode && a !== focusNode && b !== focusNode) continue;

            body += `<line class="minimap-edge-path" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>`;
            const mx = (pa.x + pb.x) / 2;
            const my = (pa.y + pb.y) / 2;
            const lo = edgeLabelOffset(pa.x, pa.y, pb.x, pb.y, mx, my);
            body += `<text class="minimap-edge-label" x="${lo.x.toFixed(2)}" y="${lo.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="2.6" font-family="VT323, monospace">${meters}m</text>`;
        }

        /* 2) Active route: one directed leg at a time, single arrow toward “next” stop. */
        if (highlightPath && highlightPath.length > 1) {
            for (let i = 0; i < highlightPath.length - 1; i += 1) {
                const from = highlightPath[i];
                const to = highlightPath[i + 1];
                const pa = positions[from];
                const pb = positions[to];
                if (!pa || !pb) continue;
                const meters = campus[from]?.[to] ?? "?";
                body += `<line class="minimap-edge-path minimap-edge-path--route" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>`;
                body += svgDirectedArrowTowardB(pa.x, pa.y, pb.x, pb.y);
                const mx = (pa.x + pb.x) / 2;
                const my = (pa.y + pb.y) / 2;
                const lo = edgeLabelOffset(pa.x, pa.y, pb.x, pb.y, mx, my);
                body += `<text class="minimap-edge-label minimap-edge-label--route" x="${lo.x.toFixed(2)}" y="${lo.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="2.85" font-family="VT323, monospace">${meters}m</text>`;
            }
        }

        svg.innerHTML = body;
    }

    function renderNodes() {
        if (!zonesRoot) return;
        const start = document.getElementById("startSelect")?.value;
        const nodes = getNodes();
        zonesRoot.innerHTML = nodes
            .map((name) => {
                const p = positions[name];
                if (!p) return "";
                const col = pinColorFor(name);
                const here = currentAtNode === name ? '<span class="minimap-zone-here">HERE</span>' : "";
                const startCls = name === start ? " minimap-campus-node--start" : "";
                return `
                <button type="button" class="minimap-campus-node${startCls}" data-loc="${escapeAttr(name)}"
                    style="left:${p.x}%; top:${p.y}%;" aria-label="Set start to ${escapeAttr(name)}">
                    <span class="minimap-zone-glow" style="background-color:${col};"></span>
                    <span class="minimap-campus-pin" style="background-color:${col};">${initialFor(name)}</span>
                    <span class="minimap-campus-name">${escapeHtml(name)}</span>
                    ${here}
                </button>`;
            })
            .join("");

        zonesRoot.querySelectorAll(".minimap-campus-node").forEach((btn) => {
            btn.addEventListener("click", () => {
                const loc = btn.getAttribute("data-loc");
                const sel = document.getElementById("startSelect");
                if (sel && loc) {
                    sel.value = loc;
                    sel.dispatchEvent(new Event("change", { bubbles: true }));
                }
                currentAtNode = loc;
                placePlayer(loc, 0);
                drawEdges(null);
                renderNodes();
                document.getElementById("zone-tasks")?.scrollIntoView({ behavior: "smooth", block: "start" });
                closeMinimap();
            });
        });
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function escapeAttr(s) {
        return escapeHtml(s).replace(/'/g, "&#39;");
    }

    function placePlayer(nodeName, durationMs) {
        const p = positions[nodeName];
        if (!p || !player) return;
        player.style.transitionDuration = `${durationMs}ms`;
        player.style.left = `${p.x}%`;
        player.style.top = `${p.y}%`;
    }

    function syncFromStartSelect() {
        const v = document.getElementById("startSelect")?.value;
        if (v && positions[v]) {
            currentAtNode = v;
            placePlayer(v, 0);
            if (isMaximized) {
                drawEdges(null);
                renderNodes();
            }
        }
    }

    function refresh() {
        positions = layoutCampusPositions();
        const start = document.getElementById("startSelect")?.value;
        currentAtNode = start && positions[start] ? start : getNodes()[0] || null;
        drawEdges(null);
        renderNodes();
        if (currentAtNode) placePlayer(currentAtNode, 0);
        setTripText("Each line shows meters. Use <strong>Start navigation</strong> to walk the route on the map.");
    }

    function openMinimap(skipRefresh) {
        if (!skipRefresh) refresh();
        isMaximized = true;
        overlay.classList.remove("minimap-overlay--hidden");
        overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("minimap-open");
        closeBtn.focus();
    }

    function closeMinimap() {
        isMaximized = false;
        overlay.classList.add("minimap-overlay--hidden");
        overlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("minimap-open");
        fab.focus();
    }

    function runNavigation(result) {
        animToken += 1;
        const myToken = animToken;
        const path = result.path || [];
        if (!path.length) return;

        positions = layoutCampusPositions();
        player.classList.remove("is-walking");

        if (path.length === 1) {
            currentAtNode = path[0];
            placePlayer(path[0], 0);
            drawEdges(null);
            if (isMaximized) {
                renderNodes();
                setTripText(`Already at <strong>${escapeHtml(path[0])}</strong>.`);
            }
            return;
        }

        drawEdges(path);
        renderNodes();
        openMinimap(true);

        const totalM = result.distance;
        let walkedM = 0;
        let estElapsed = 0;

        currentAtNode = path[0];
        placePlayer(path[0], 0);
        player.classList.add("is-walking");

        setTripText(
            `Starting at <strong>${escapeHtml(path[0])}</strong> → <strong>${escapeHtml(path[path.length - 1])}</strong> · ` +
                `${totalM}m total · ~${formatWalkDuration(totalM / WALK_SPEED_MPS)} at ${WALK_SPEED_MPS} m/s`
        );

        let step = 0;

        function runLeg() {
            if (myToken !== animToken) return;
            if (step >= path.length - 1) {
                player.classList.remove("is-walking");
                currentAtNode = path[path.length - 1];
                setTripText(
                    `Arrived at <strong>${escapeHtml(path[path.length - 1])}</strong> · ${totalM}m · ~${formatWalkDuration(
                        totalM / WALK_SPEED_MPS
                    )} total`
                );
                renderNodes();
                return;
            }

            const from = path[step];
            const to = path[step + 1];
            const meters = campus[from]?.[to] ?? 0;
            const legMs = Math.max(MINIMAP_MIN_LEG_MS, meters * MINIMAP_MS_PER_METER);
            const legSec = meters / WALK_SPEED_MPS;
            walkedM += meters;
            estElapsed += legSec;

            setTripText(
                `Walking <strong>${escapeHtml(from)}</strong> ➜ <strong>${escapeHtml(to)}</strong> · ` +
                    `<strong>${meters}m</strong> this leg (~${formatWalkDuration(legSec)}) · ` +
                    `progress <strong>${walkedM}m / ${totalM}m</strong> · est. elapsed <strong>${formatWalkDuration(
                        estElapsed
                    )}</strong>`
            );

            placePlayer(to, legMs);

            setTimeout(() => {
                if (myToken !== animToken) return;
                currentAtNode = to;
                renderNodes();
                step += 1;
                runLeg();
            }, legMs + 80);
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(runLeg);
        });
    }

    fab.addEventListener("click", () => {
        if (isMaximized) closeMinimap();
        else openMinimap(false);
    });

    backdrop.addEventListener("click", closeMinimap);
    closeBtn.addEventListener("click", closeMinimap);

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isMaximized) {
            e.preventDefault();
            closeMinimap();
        }
    });

    document.getElementById("startSelect")?.addEventListener("change", () => {
        syncFromStartSelect();
        drawEdges(null);
        renderNodes();
    });

    window.__campusMinimapRefresh = refresh;
    window.__campusMinimapRunNav = runNavigation;

    refresh();
}

function initCampusMinimapSafe() {
    if (document.getElementById("minimap-edges")) {
        initCampusMinimap();
    }
}

initCampusMinimapSafe();