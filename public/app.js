/* =====================================================================
   AEP POC – Front-end SPA Logic (vanilla JS, no framework)
   All API calls go to the Express server which proxies to AEP.
   ===================================================================== */

"use strict";

// ---- Utilities ----------------------------------------------------------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let _toastTimer;

function showToast(message, type = "info") {
    const toast = $("#toast");
    toast.textContent = message;
    toast.style.borderColor =
        type === "success" ? "var(--color-success)"
            : type === "error" ? "var(--color-error)"
                : "var(--color-border)";
    toast.classList.add("visible");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
}

function setLoading(btn, isLoading, originalText) {
    btn.disabled = isLoading;
    btn.innerHTML = isLoading
        ? `<span class="spinner"></span> Working…`
        : originalText;
}

function showResult(el, data, isError = false) {
    el.hidden = false;
    el.className = `result-box ${isError ? "error" : "success"}`;
    el.textContent =
        typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
}

async function apiFetch(path, options = {}) {
    const response = await fetch(path, {
        headers: { "Content-Type": "application/json", ...options.headers },
        ...options,
    });

    const body = await response.json().catch(() => ({ error: response.statusText }));

    if (!response.ok) {
        throw new Error(body.error || `HTTP ${response.status}`);
    }

    return body;
}

// ---- Navigation ---------------------------------------------------------

function initNav() {
    $$(".nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            $$(".nav-btn").forEach((b) => b.classList.remove("active"));
            $$(".panel").forEach((p) => p.classList.remove("active"));

            btn.classList.add("active");
            const panel = $(`#panel-${btn.dataset.panel}`);
            if (panel) panel.classList.add("active");
        });
    });
}

// ---- Health check -------------------------------------------------------

async function checkHealth() {
    const statusEl = $("#api-status");
    const dot = statusEl.querySelector(".status-dot");
    const label = statusEl.querySelector(".status-label");

    try {
        await apiFetch("/health");
        dot.className = "status-dot ok";
        label.textContent = "Connected";
    } catch {
        dot.className = "status-dot error";
        label.textContent = "Offline";
    }
}

// ---- Sample data --------------------------------------------------------

const SAMPLE_RECORDS = [
    {
        _id: "cust-001",
        personalEmail: { address: "alice@example.com", primary: true },
        person: {
            name: { firstName: "Alice", lastName: "Smith" },
            birthYear: 1988,
            gender: "female",
        },
        loyaltyDetails: {
            tier: "gold",
            points: 7200,
            joinDate: "2022-03-15",
        },
    },
    {
        _id: "cust-002",
        personalEmail: { address: "bob@example.com", primary: true },
        person: {
            name: { firstName: "Bob", lastName: "Jones" },
            birthYear: 1975,
            gender: "male",
        },
        loyaltyDetails: {
            tier: "platinum",
            points: 15000,
            joinDate: "2020-07-01",
        },
    },
];

const SAMPLE_SQL =
    "SELECT loyaltyDetails.tier, COUNT(*) AS cnt\nFROM prod.aep_poc_customer_dataset\nGROUP BY loyaltyDetails.tier\nORDER BY cnt DESC";

// ---- Ingest panel -------------------------------------------------------

function initIngest() {
    const btn = $("#btn-ingest");
    const sampleBtn = $("#btn-ingest-sample");
    const resultEl = $("#ingest-result");
    const origText = btn.innerHTML;

    sampleBtn.addEventListener("click", () => {
        $("#ingest-records").value = JSON.stringify(SAMPLE_RECORDS, null, 2);
    });

    btn.addEventListener("click", async () => {
        const datasetId = $("#ingest-dataset-id").value.trim();
        const rawRecords = $("#ingest-records").value.trim();

        if (!datasetId) {
            showToast("Please enter a Dataset ID.", "error");
            return;
        }

        let records;
        try {
            records = JSON.parse(rawRecords);
            if (!Array.isArray(records)) throw new Error("Must be a JSON array.");
        } catch (e) {
            showToast(`Invalid JSON: ${e.message}`, "error");
            return;
        }

        setLoading(btn, true, origText);
        try {
            const result = await apiFetch("/api/ingest", {
                method: "POST",
                body: JSON.stringify({ datasetId, records }),
            });
            showResult(resultEl, result);
            showToast(`Batch submitted: ${result.batchId}`, "success");
        } catch (err) {
            showResult(resultEl, err.message, true);
            showToast(err.message, "error");
        } finally {
            setLoading(btn, false, origText);
        }
    });
}

// ---- Profile panel ------------------------------------------------------

function initProfile() {
    const btn = $("#btn-profile");
    const resultEl = $("#profile-result");
    const origText = btn.innerHTML;

    btn.addEventListener("click", async () => {
        const namespace = $("#profile-namespace").value.trim();
        const id = $("#profile-id").value.trim();

        if (!namespace || !id) {
            showToast("Namespace and identity value are required.", "error");
            return;
        }

        setLoading(btn, true, origText);
        try {
            const profile = await apiFetch(
                `/api/profile?namespace=${encodeURIComponent(namespace)}&id=${encodeURIComponent(id)}`
            );
            showResult(resultEl, profile);
        } catch (err) {
            showResult(resultEl, err.message, true);
            showToast(err.message, "error");
        } finally {
            setLoading(btn, false, origText);
        }
    });
}

// ---- Query panel --------------------------------------------------------

function initQuery() {
    const btn = $("#btn-query");
    const sampleBtn = $("#btn-query-sample");
    const resultEl = $("#query-result");
    const origText = btn.innerHTML;

    sampleBtn.addEventListener("click", () => {
        $("#query-sql").value = SAMPLE_SQL;
    });

    btn.addEventListener("click", async () => {
        const sql = $("#query-sql").value.trim();
        const name = $("#query-name").value.trim() || "AEP POC Query";

        if (!sql) {
            showToast("Please enter a SQL statement.", "error");
            return;
        }

        setLoading(btn, true, origText);
        try {
            const result = await apiFetch("/api/query", {
                method: "POST",
                body: JSON.stringify({ sql, name }),
            });
            showResult(resultEl, result);
            showToast(`Query ${result.state ?? "submitted"}: ${result.id ?? ""}`, "success");
        } catch (err) {
            showResult(resultEl, err.message, true);
            showToast(err.message, "error");
        } finally {
            setLoading(btn, false, origText);
        }
    });
}

// ---- Segments panel -----------------------------------------------------

function initSegments() {
    const btn = $("#btn-load-segments");
    const listEl = $("#segments-list");
    const origText = btn.innerHTML;

    btn.addEventListener("click", async () => {
        setLoading(btn, true, origText);
        listEl.innerHTML = "";
        try {
            const segments = await apiFetch("/api/segments");

            if (!segments.length) {
                listEl.innerHTML =
                    '<p class="empty-state">No segment definitions found in this sandbox.</p>';
                return;
            }

            listEl.innerHTML = buildTable(
                ["Name", "Description", "Expression", "TTL (days)"],
                segments.map((s) => [
                    s.name ?? "—",
                    s.description ?? "—",
                    `<code>${s.expression?.value ?? "—"}</code>`,
                    s.ttlInDays ?? "—",
                ])
            );
            showToast(`Loaded ${segments.length} segment(s).`, "success");
        } catch (err) {
            listEl.innerHTML = `<p class="empty-state" style="color:var(--color-error)">${err.message}</p>`;
            showToast(err.message, "error");
        } finally {
            setLoading(btn, false, origText);
        }
    });
}

// ---- Alerts panel -------------------------------------------------------

function initAlerts() {
    const btn = $("#btn-load-alerts");
    const listEl = $("#alerts-list");
    const origText = btn.innerHTML;

    btn.addEventListener("click", async () => {
        setLoading(btn, true, origText);
        listEl.innerHTML = "";
        try {
            const alerts = await apiFetch("/api/alerts");

            if (!alerts.length) {
                listEl.innerHTML =
                    '<p class="empty-state">No alert rules found in this sandbox.</p>';
                return;
            }

            listEl.innerHTML = buildTable(
                ["Name", "Severity", "Status", "Types"],
                alerts.map((a) => [
                    a.name ?? "—",
                    severityBadge(a.severity),
                    a.enabled ? '<span class="badge badge--success">Enabled</span>'
                        : '<span class="badge badge--error">Disabled</span>',
                    (a.alertTypes ?? []).join(", ") || "—",
                ])
            );
            showToast(`Loaded ${alerts.length} alert rule(s).`, "success");
        } catch (err) {
            listEl.innerHTML = `<p class="empty-state" style="color:var(--color-error)">${err.message}</p>`;
            showToast(err.message, "error");
        } finally {
            setLoading(btn, false, origText);
        }
    });
}

// ---- Table builder -------------------------------------------------------

function buildTable(headers, rows) {
    const ths = headers.map((h) => `<th>${h}</th>`).join("");
    const trs = rows
        .map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("");

    return `<table class="data-grid"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

function severityBadge(sev) {
    const map = {
        critical: "error",
        warning: "warning",
        info: "info",
    };
    const cls = map[sev] ?? "info";
    return `<span class="badge badge--${cls}">${sev ?? "unknown"}</span>`;
}

// ---- Boot ---------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    initNav();
    initIngest();
    initProfile();
    initQuery();
    initSegments();
    initAlerts();
    checkHealth();
    // Re-check health every 30 s
    setInterval(checkHealth, 30_000);
});
