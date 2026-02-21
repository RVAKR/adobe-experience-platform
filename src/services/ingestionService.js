"use strict";

const { getAepClient } = require("../utils/aepClient");

/* -----------------------------------------------------------------------
 * Ingestion Service — wraps the AEP Batch Ingestion API.
 *
 * Lifecycle:
 *   1.  createBatch()    → obtain a batch ID
 *   2.  uploadFile()     → PUT data files into the batch
 *   3.  closeBatch()     → signal AEP to process the batch
 *
 * AEP then validates, transforms, and indexes the data asynchronously.
 * ---------------------------------------------------------------------- */

/**
 * Creates a new batch in AEP for the specified dataset.
 *
 * @param {string} datasetId
 * @returns {Promise<string>} batchId
 */
async function createBatch(datasetId) {
    console.log("[ingestion] Creating batch…");
    const client = await getAepClient();

    const response = await client.post("/data/foundation/import/batches", {
        datasetId,
        inputFormat: { format: "json" },
    });

    const batchId = response.data.id;
    console.log(`[ingestion] Batch created: ${batchId}`);
    return batchId;
}

/**
 * Uploads a JSON payload (array of XDM records) to an open batch.
 *
 * AEP expects each record on its own newline (NDJSON) for JSON batches.
 *
 * @param {string} batchId
 * @param {string} datasetId
 * @param {Array<object>} records  - Array of XDM-compliant objects
 * @returns {Promise<void>}
 */
async function uploadRecordsToBatch(batchId, datasetId, records) {
    console.log(
        `[ingestion] Uploading ${records.length} record(s) to batch ${batchId}…`
    );
    const client = await getAepClient();

    // Serialize as NDJSON
    const ndjson = records.map((r) => JSON.stringify(r)).join("\n");

    await client.put(
        `/data/foundation/import/batches/${batchId}/datasets/${datasetId}/files/records.json`,
        ndjson,
        {
            headers: {
                "Content-Type": "application/octet-stream",
            },
        }
    );

    console.log("[ingestion] Records uploaded successfully.");
}

/**
 * Signals AEP that the batch is complete and ready for processing.
 * After calling this the batch enters PROCESSING → SUCCEEDED / FAILED.
 *
 * @param {string} batchId
 * @returns {Promise<void>}
 */
async function closeBatch(batchId) {
    console.log(`[ingestion] Closing batch ${batchId}…`);
    const client = await getAepClient();

    await client.post(
        `/data/foundation/import/batches/${batchId}?action=COMPLETE`
    );

    console.log(`[ingestion] Batch ${batchId} closed — AEP is now processing it.`);
}

/**
 * Polls the batch status until it reaches SUCCEEDED or FAILED.
 *
 * @param {string} batchId
 * @param {number} [maxAttempts=20]
 * @param {number} [intervalMs=15000]
 * @returns {Promise<string>} final status
 */
async function waitForBatch(batchId, maxAttempts = 20, intervalMs = 15_000) {
    const client = await getAepClient();
    let status = "PROCESSING";
    let attempts = 0;

    while (
        !["SUCCEEDED", "FAILED", "ABORTED"].includes(status) &&
        attempts < maxAttempts
    ) {
        await sleep(intervalMs);
        const res = await client.get(
            `/data/foundation/import/batches/${batchId}`
        );
        status = res.data.status;
        attempts++;
        console.log(`[ingestion] Batch ${batchId} status: ${status} (attempt ${attempts})`);
    }

    return status;
}

/**
 * High-level convenience — creates batch, uploads records, closes batch,
 * and optionally waits for processing to complete.
 *
 * @param {string} datasetId
 * @param {Array<object>} records
 * @param {boolean} [wait=false]
 * @returns {Promise<{batchId: string, finalStatus?: string}>}
 */
async function ingestRecords(datasetId, records, wait = false) {
    const batchId = await createBatch(datasetId);
    await uploadRecordsToBatch(batchId, datasetId, records);
    await closeBatch(batchId);

    if (wait) {
        const finalStatus = await waitForBatch(batchId);
        return { batchId, finalStatus };
    }

    return { batchId };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    createBatch,
    uploadRecordsToBatch,
    closeBatch,
    waitForBatch,
    ingestRecords,
};
