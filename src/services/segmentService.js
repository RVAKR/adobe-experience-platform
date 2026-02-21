"use strict";

const { getAepClient } = require("../utils/aepClient");

/* -----------------------------------------------------------------------
 * Segment Service — wraps the AEP Segmentation Service API.
 *
 * Segments (Audience Definitions) are PQL-based rules evaluated against
 * Real-Time Customer Profiles.  This service handles definition CRUD
 * and segment job (evaluation) orchestration.
 * ---------------------------------------------------------------------- */

/**
 * Creates a new segment definition using Profile Query Language (PQL).
 *
 * @param {object} params
 * @param {string} params.name         - Human-readable segment name.
 * @param {string} params.description  - What this segment represents.
 * @param {string} params.expression   - PQL expression string.
 * @param {string} params.schemaId     - XDM schema `$id` this segment targets.
 * @returns {Promise<string>} segmentId
 */
async function createSegment({ name, description, expression, schemaId }) {
    console.log(`[segment] Creating segment: "${name}"…`);
    const client = await getAepClient();

    const response = await client.post(
        "/data/core/ups/segment/definitions",
        {
            name,
            description,
            expression: {
                type: "PQL",
                format: "pql/text",
                value: expression,
            },
            schema: {
                name: schemaId || "https://ns.adobe.com/xdm/context/profile",
            },
            // ttlInDays controls how long membership cache is retained
            ttlInDays: 60,
        }
    );

    const segmentId = response.data.id;
    console.log(`[segment] Segment created: ${segmentId}`);
    return segmentId;
}

/**
 * Retrieves a segment definition by ID.
 *
 * @param {string} segmentId
 * @returns {Promise<object>}
 */
async function getSegment(segmentId) {
    const client = await getAepClient();
    const response = await client.get(
        `/data/core/ups/segment/definitions/${segmentId}`
    );
    return response.data;
}

/**
 * Lists all segment definitions in the sandbox.
 *
 * @param {number} [limit=100]
 * @returns {Promise<Array>}
 */
async function listSegments(limit = 100) {
    const client = await getAepClient();
    const response = await client.get("/data/core/ups/segment/definitions", {
        params: { limit },
    });
    return response.data.children || [];
}

/**
 * Triggers a batch segment evaluation job for one or more segment IDs.
 *
 * @param {string[]} segmentIds
 * @returns {Promise<string>} segmentJobId
 */
async function runSegmentJob(segmentIds) {
    console.log(
        `[segment] Starting segment job for ${segmentIds.length} segment(s)…`
    );
    const client = await getAepClient();

    const response = await client.post("/data/core/ups/segment/jobs", {
        segmentIds,
    });

    const segmentJobId = response.data.id;
    console.log(`[segment] Segment job started: ${segmentJobId}`);
    return segmentJobId;
}

/**
 * Polls a segment job until it reaches a terminal state.
 *
 * @param {string} segmentJobId
 * @param {number} [maxAttempts=20]
 * @param {number} [intervalMs=10000]
 * @returns {Promise<object>} final job object
 */
async function waitForSegmentJob(
    segmentJobId,
    maxAttempts = 20,
    intervalMs = 10_000
) {
    const client = await getAepClient();
    let job;
    let attempts = 0;
    const terminal = ["SUCCEEDED", "FAILED", "CANCELLED"];

    do {
        await sleep(intervalMs);
        const response = await client.get(
            `/data/core/ups/segment/jobs/${segmentJobId}`
        );
        job = response.data;
        attempts++;
        console.log(
            `[segment] Job ${segmentJobId} → ${job.status} (attempt ${attempts})`
        );
    } while (!terminal.includes(job.status) && attempts < maxAttempts);

    return job;
}

// ---- Pre-built PQL segment definitions ---------------------------------

/**
 * Returns a PQL expression for customers with Gold or Platinum loyalty tiers.
 */
const GOLD_PLUS_SEGMENT = {
    name: "Gold & Platinum Loyalty Members",
    description:
        "Customers who are in the Gold or Platinum loyalty tier.",
    expression:
        "loyaltyDetails.tier in [\"gold\", \"platinum\"]",
};

/**
 * Returns a PQL expression for high-value customers (>= 5000 points).
 */
const HIGH_VALUE_SEGMENT = {
    name: "High-Value Customers",
    description: "Customers with 5,000 or more loyalty points.",
    expression: "loyaltyDetails.points >= 5000",
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    createSegment,
    getSegment,
    listSegments,
    runSegmentJob,
    waitForSegmentJob,
    GOLD_PLUS_SEGMENT,
    HIGH_VALUE_SEGMENT,
};
