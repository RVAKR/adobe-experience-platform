"use strict";

const { getAepClient } = require("../utils/aepClient");

/* -----------------------------------------------------------------------
 * AEP Query Service — wraps the Query Service API.
 *
 * AEP Query Service executes ANSI SQL against data stored in the
 * Data Lake.  Queries run asynchronously; this service handles both
 * submission and polling.
 * ---------------------------------------------------------------------- */

/**
 * Submits a SQL query to AEP Query Service.
 *
 * @param {string} sql        - Valid ANSI SQL string
 * @param {string} [name]     - Human-readable query name (for audit trail)
 * @param {string} [outputDataset]  - If set, results are persisted to this dataset
 * @returns {Promise<string>} queryId
 */
async function submitQuery(sql, name = "AEP POC Query", outputDataset) {
    console.log("[query] Submitting query…");
    const client = await getAepClient();

    const payload = {
        dbName: `${process.env.AEP_SANDBOX_NAME || "prod"}:all`,
        sql,
        name,
        description: "Query submitted by the AEP POC automation layer.",
        ...(outputDataset && {
            ctasParameters: {
                datasetName: outputDataset,
                description: `Results of query: ${name}`,
            },
        }),
    };

    const response = await client.post(
        "/data/foundation/query/queries",
        payload
    );

    const queryId = response.data.id;
    console.log(`[query] Query submitted: ${queryId}`);
    return queryId;
}

/**
 * Retrieves the current status and metadata of a query.
 *
 * @param {string} queryId
 * @returns {Promise<object>}
 */
async function getQueryStatus(queryId) {
    const client = await getAepClient();
    const response = await client.get(
        `/data/foundation/query/queries/${queryId}`
    );
    return response.data;
}

/**
 * Polls a query until it reaches a terminal state.
 *
 * @param {string} queryId
 * @param {number} [maxAttempts=30]
 * @param {number} [intervalMs=5000]
 * @returns {Promise<object>} final query object
 */
async function waitForQuery(queryId, maxAttempts = 30, intervalMs = 5_000) {
    let query;
    let attempts = 0;
    const terminal = ["SUCCESS", "FAILED", "KILLED"];

    do {
        await sleep(intervalMs);
        query = await getQueryStatus(queryId);
        attempts++;
        console.log(
            `[query] ${queryId} → ${query.state} (attempt ${attempts})`
        );
    } while (!terminal.includes(query.state) && attempts < maxAttempts);

    if (!terminal.includes(query.state)) {
        throw new Error(
            `[query] Query ${queryId} did not complete within ${maxAttempts} attempts.`
        );
    }

    return query;
}

/**
 * Convenience: submit and wait.
 *
 * @param {string} sql
 * @param {string} [name]
 * @param {string} [outputDataset]
 * @returns {Promise<object>}
 */
async function runQuery(sql, name, outputDataset) {
    const queryId = await submitQuery(sql, name, outputDataset);
    return waitForQuery(queryId);
}

// ---- Pre-built query templates -----------------------------------------

/**
 * Returns a customer count SQL query for the given AEP dataset table name.
 * AEP table names follow the pattern: {sandboxName}.{datasetName}
 *
 * @param {string} tableName
 */
function customerCountQuery(tableName) {
    return `SELECT COUNT(*) AS total_customers FROM ${tableName}`;
}

/**
 * Returns an aggregation query grouped by loyalty tier.
 */
function loyaltyTierQuery(tableName) {
    return `
    SELECT
      loyaltyDetails.tier        AS loyalty_tier,
      COUNT(*)                   AS customer_count,
      AVG(loyaltyDetails.points) AS avg_points
    FROM ${tableName}
    GROUP BY loyaltyDetails.tier
    ORDER BY customer_count DESC
  `.trim();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    submitQuery,
    getQueryStatus,
    waitForQuery,
    runQuery,
    customerCountQuery,
    loyaltyTierQuery,
};
