"use strict";

const express = require("express");
const path = require("path");
const { ingestRecords } = require("../services/ingestionService");
const { getProfileByIdentity } = require("../services/profileService");
const { runQuery, customerCountQuery } = require("../services/queryService");
const { listSegments } = require("../services/segmentService");
const { listAlerts } = require("../services/alertService");

/* -----------------------------------------------------------------------
 * Express Web Application
 *
 * Provides a simple UI and REST API for manually inserting XDM records
 * and querying the AEP sandbox without using the AEP UI.
 * ---------------------------------------------------------------------- */

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../../public")));

// ---- Health check -------------------------------------------------------

app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---- Ingestion endpoint -------------------------------------------------

/**
 * POST /api/ingest
 * Body: { datasetId: string, records: XDMRecord[] }
 *
 * Inserts one or more XDM records into the target dataset via batch ingestion.
 */
app.post("/api/ingest", async (req, res) => {
    try {
        const { datasetId, records } = req.body;

        if (!datasetId || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                error: "Request must include `datasetId` and a non-empty `records` array.",
            });
        }

        const result = await ingestRecords(datasetId, records, false);
        res.json({
            message: "Batch submitted successfully.",
            batchId: result.batchId,
        });
    } catch (err) {
        console.error("[webapp] Ingestion error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- Profile lookup endpoint --------------------------------------------

/**
 * GET /api/profile?namespace=Email&id=user@example.com
 *
 * Returns the unified Real-Time Customer Profile for the given identity.
 */
app.get("/api/profile", async (req, res) => {
    try {
        const { namespace, id } = req.query;
        if (!namespace || !id) {
            return res.status(400).json({
                error: "`namespace` and `id` query params are required.",
            });
        }

        const profile = await getProfileByIdentity(namespace, id);
        res.json(profile);
    } catch (err) {
        console.error("[webapp] Profile lookup error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- Query endpoint -----------------------------------------------------

/**
 * POST /api/query
 * Body: { sql: string, name?: string, outputDataset?: string }
 *
 * Submits an arbitrary SQL query to AEP Query Service and waits for results.
 */
app.post("/api/query", async (req, res) => {
    try {
        const { sql, name, outputDataset } = req.body;
        if (!sql) {
            return res.status(400).json({ error: "`sql` field is required." });
        }

        const result = await runQuery(sql, name, outputDataset);
        res.json(result);
    } catch (err) {
        console.error("[webapp] Query error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- Segments endpoint --------------------------------------------------

/**
 * GET /api/segments
 *
 * Lists all segment definitions available in the current sandbox.
 */
app.get("/api/segments", async (_req, res) => {
    try {
        const segments = await listSegments();
        res.json(segments);
    } catch (err) {
        console.error("[webapp] Segments list error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- Alerts endpoint ----------------------------------------------------

/**
 * GET /api/alerts
 *
 * Lists all active alert rules in the current sandbox.
 */
app.get("/api/alerts", async (_req, res) => {
    try {
        const alerts = await listAlerts();
        res.json(alerts);
    } catch (err) {
        console.error("[webapp] Alerts list error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---- Serve SPA ----------------------------------------------------------

app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "../../public/index.html"));
});

module.exports = app;
