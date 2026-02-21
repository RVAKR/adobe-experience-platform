"use strict";

require("dotenv").config();

const { createSchema } = require("./services/schemaService");
const { createDataset } = require("./services/datasetService");
const { createFullFlow } = require("./services/flowService");
const { ingestRecords } = require("./services/ingestionService");
const { runQuery, loyaltyTierQuery } = require("./services/queryService");
const { triggerProfilePreview, getProfileStoreStats } = require("./services/profileService");
const {
    createSegment,
    runSegmentJob,
    waitForSegmentJob,
    GOLD_PLUS_SEGMENT,
    HIGH_VALUE_SEGMENT,
} = require("./services/segmentService");
const {
    alertOnDataflowFailure,
    alertOnIngestionFailure,
} = require("./services/alertService");

/* -----------------------------------------------------------------------
 * orchestrate()
 *
 * Runs the full AEP end-to-end POC workflow:
 *
 *   1.  Create XDM schema
 *   2.  Create dataset
 *   3.  Create PostgreSQL dataflow
 *   4.  Ingest sample records manually
 *   5.  Run Query Service analytics
 *   6.  Validate profile creation
 *   7.  Create audience segments
 *   8.  Run segment evaluation jobs
 *   9.  Set up Observability alerts
 *
 * Each step logs its output and writes resource IDs to a shared context
 * object so subsequent steps can consume them.
 * ---------------------------------------------------------------------- */
async function orchestrate() {
    const ctx = {};

    console.log("\n========================================");
    console.log("  AEP POC – End-to-End Orchestration");
    console.log("========================================\n");

    // ------------------------------------------------------------------
    // STEP 1 — Create XDM Schema
    // ------------------------------------------------------------------
    console.log("── STEP 1: Create XDM Schema ──────────────────");
    ctx.schemaId = await createSchema();

    // ------------------------------------------------------------------
    // STEP 2 — Create Dataset
    // ------------------------------------------------------------------
    console.log("\n── STEP 2: Create Dataset ──────────────────────");
    ctx.datasetId = await createDataset(ctx.schemaId);

    // ------------------------------------------------------------------
    // STEP 3 — Create PostgreSQL Dataflow
    // ------------------------------------------------------------------
    console.log("\n── STEP 3: Create PostgreSQL Dataflow ──────────");
    const pgCredentials = {
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB,
        username: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
    };

    const { sourceConnectionId, targetConnectionId, flowId } =
        await createFullFlow(pgCredentials, ctx.datasetId, ctx.schemaId);

    ctx.sourceConnectionId = sourceConnectionId;
    ctx.targetConnectionId = targetConnectionId;
    ctx.flowId = flowId;

    // ------------------------------------------------------------------
    // STEP 4 — Manual Batch Ingestion (sample records via web API path)
    // ------------------------------------------------------------------
    console.log("\n── STEP 4: Manual Batch Ingestion ──────────────");
    const sampleRecords = buildSampleRecords();
    const { batchId, finalStatus } = await ingestRecords(
        ctx.datasetId,
        sampleRecords,
        true   // wait for batch to be processed
    );
    ctx.batchId = batchId;
    console.log(`[orchestrate] Batch final status: ${finalStatus}`);

    if (finalStatus !== "SUCCEEDED") {
        console.warn("[orchestrate] ⚠ Batch did not succeed — downstream steps may have no data.");
    }

    // ------------------------------------------------------------------
    // STEP 5 — Query Service: run loyalty tier analytics
    // ------------------------------------------------------------------
    console.log("\n── STEP 5: Query Service Analytics ─────────────");
    // AEP table name follows pattern: <sandboxName>.<datasetName>
    const tableName = `${process.env.AEP_SANDBOX_NAME || "prod"}.aep_poc_customer_dataset`;
    const queryResult = await runQuery(
        loyaltyTierQuery(tableName),
        "POC – Loyalty Tier Distribution"
    );
    console.log("[orchestrate] Query result:", JSON.stringify(queryResult, null, 2));

    // ------------------------------------------------------------------
    // STEP 6 — Profile validation
    // ------------------------------------------------------------------
    console.log("\n── STEP 6: Profile Store Validation ────────────");
    await triggerProfilePreview();

    // Give AEP a moment to update the sample count
    await sleep(10_000);
    const stats = await getProfileStoreStats();
    console.log("[orchestrate] Profile store stats:", JSON.stringify(stats, null, 2));

    // ------------------------------------------------------------------
    // STEP 7 — Create Audience Segments
    // ------------------------------------------------------------------
    console.log("\n── STEP 7: Create Audience Segments ────────────");
    ctx.goldPlusSegmentId = await createSegment({
        ...GOLD_PLUS_SEGMENT,
        schemaId: ctx.schemaId,
    });

    ctx.highValueSegmentId = await createSegment({
        ...HIGH_VALUE_SEGMENT,
        schemaId: ctx.schemaId,
    });

    // ------------------------------------------------------------------
    // STEP 8 — Run Segment Evaluation Jobs
    // ------------------------------------------------------------------
    console.log("\n── STEP 8: Segment Evaluation Jobs ─────────────");
    const segmentJobId = await runSegmentJob([
        ctx.goldPlusSegmentId,
        ctx.highValueSegmentId,
    ]);

    const segmentJob = await waitForSegmentJob(segmentJobId);
    console.log(
        `[orchestrate] Segment job final status: ${segmentJob.status}`
    );

    // ------------------------------------------------------------------
    // STEP 9 — Observability Alerts
    // ------------------------------------------------------------------
    console.log("\n── STEP 9: Observability Alerts ─────────────────");
    await alertOnDataflowFailure(ctx.flowId, process.env.NOTIFY_EMAIL);
    await alertOnIngestionFailure(ctx.datasetId);

    // ------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------
    console.log("\n========================================");
    console.log("  POC COMPLETE — Resource Summary");
    console.log("========================================");
    console.log(JSON.stringify(ctx, null, 2));
    console.log("\n✅ All steps completed successfully.\n");

    return ctx;
}

// ---- Sample XDM records ------------------------------------------------

function buildSampleRecords() {
    return [
        {
            _id: "cust-001",
            personalEmail: { address: "alice@example.com", primary: true },
            person: {
                name: { firstName: "Alice", lastName: "Smith" },
                birthYear: 1988,
                gender: "female",
            },
            loyaltyDetails: { tier: "gold", points: 7200, joinDate: "2022-03-15" },
        },
        {
            _id: "cust-002",
            personalEmail: { address: "bob@example.com", primary: true },
            person: {
                name: { firstName: "Bob", lastName: "Jones" },
                birthYear: 1975,
                gender: "male",
            },
            loyaltyDetails: { tier: "platinum", points: 15000, joinDate: "2020-07-01" },
        },
        {
            _id: "cust-003",
            personalEmail: { address: "carol@example.com", primary: true },
            person: {
                name: { firstName: "Carol", lastName: "White" },
                birthYear: 1993,
                gender: "female",
            },
            loyaltyDetails: { tier: "silver", points: 3450, joinDate: "2023-01-22" },
        },
        {
            _id: "cust-004",
            personalEmail: { address: "dave@example.com", primary: true },
            person: {
                name: { firstName: "Dave", lastName: "Brown" },
                birthYear: 1980,
                gender: "male",
            },
            loyaltyDetails: { tier: "bronze", points: 820, joinDate: "2024-06-10" },
        },
    ];
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { orchestrate };
