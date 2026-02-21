"use strict";

const { getAepClient } = require("../utils/aepClient");
const aepConfig = require("../config/aepConfig");

/* -----------------------------------------------------------------------
 * Flow Service – wires together a Source Connection → Target Connection
 * via AEP Data Flows (Flow Service API).
 *
 * Complete flow recipe:
 *   1.  Create Source Connection   (Postgres credentials)
 *   2.  Create Target Connection   (AEP Dataset sink)
 *   3.  Create a Dataflow         (maps source → target)
 * ---------------------------------------------------------------------- */

/**
 * Creates an AEP Source Connection for a PostgreSQL database.
 *
 * @param {object} pgCredentials
 * @param {string} pgCredentials.connectionString  - JDBC-style connection string
 * @param {string} [pgCredentials.host]
 * @param {number} [pgCredentials.port]
 * @param {string} [pgCredentials.database]
 * @param {string} [pgCredentials.username]
 * @param {string} [pgCredentials.password]
 * @returns {Promise<string>} sourceConnectionId
 */
async function createSourceConnection({
    connectionString,
    host,
    port,
    database,
    username,
    password,
}) {
    console.log("[flow] Creating PostgreSQL source connection…");
    const client = await getAepClient();

    // Step 1 — create a base connection (stores credentials)
    const baseConnResponse = await client.post(
        "/data/foundation/flowservice/connections",
        {
            name: "AEP POC – PostgreSQL Base Connection",
            description: "Base connection for the AEP POC PostgreSQL source.",
            connectionSpec: {
                id: aepConfig.postgresSourceConnectionSpecId,
                version: "1.0",
            },
            auth: {
                specName: "Connection String Based Authentication",
                params: {
                    connectionString:
                        connectionString ||
                        buildConnectionString({ host, port, database, username, password }),
                },
            },
        }
    );
    const baseConnectionId = baseConnResponse.data.id;
    console.log(`[flow] Base connection ID: ${baseConnectionId}`);

    // Step 2 — create a source connection on top of the base connection
    const sourceConnResponse = await client.post(
        "/data/foundation/flowservice/sourceConnections",
        {
            name: "AEP POC – PostgreSQL Source Connection",
            baseConnectionId,
            connectionSpec: {
                id: aepConfig.postgresSourceConnectionSpecId,
                version: "1.0",
            },
            data: { format: "tabular" },
            params: {
                tableName: process.env.POSTGRES_TABLE || "customers",
                columns: [],         // empty = select all columns
            },
        }
    );

    const sourceConnectionId = sourceConnResponse.data.id;
    console.log(`[flow] Source connection ID: ${sourceConnectionId}`);
    return sourceConnectionId;
}

/**
 * Creates an AEP Target Connection that points to a Dataset.
 *
 * @param {string} datasetId
 * @param {string} schemaId
 * @returns {Promise<string>} targetConnectionId
 */
async function createTargetConnection(datasetId, schemaId) {
    console.log("[flow] Creating target connection…");
    const client = await getAepClient();

    const response = await client.post(
        "/data/foundation/flowservice/targetConnections",
        {
            name: "AEP POC – Dataset Target Connection",
            description: "Writes ingested data to the AEP POC dataset.",
            // AEP Data Lake connection spec (fixed)
            connectionSpec: {
                id: "c604ff05-7f1a-43c0-8e18-33bf874cb11c",
                version: "1.0",
            },
            data: { format: "parquet_xdm" },
            params: {
                dataSetId: datasetId,
            },
            schemaRef: {
                id: schemaId,
                contentType: "application/vnd.adobe.xed+json;version=1",
            },
        }
    );

    const targetConnectionId = response.data.id;
    console.log(`[flow] Target connection ID: ${targetConnectionId}`);
    return targetConnectionId;
}

/**
 * Creates the Dataflow that moves data from the source to the target.
 *
 * @param {string} sourceConnectionId
 * @param {string} targetConnectionId
 * @param {string} [scheduleInterval]  - cron expression for ingestion schedule
 * @returns {Promise<string>} flowId
 */
async function createDataflow(
    sourceConnectionId,
    targetConnectionId,
    scheduleInterval = "0 0 * * *"   // daily at midnight UTC
) {
    console.log("[flow] Creating dataflow…");
    const client = await getAepClient();

    const response = await client.post(
        "/data/foundation/flowservice/flows",
        {
            name: "AEP POC – PostgreSQL to Dataset Dataflow",
            description:
                "Scheduled daily ingestion from PostgreSQL to AEP Dataset.",
            flowSpec: {
                // Copy activity spec for database sources
                id: "14518937-270c-4525-bdec-c2ba7cce3860",
                version: "1.0",
            },
            sourceConnectionIds: [sourceConnectionId],
            targetConnectionIds: [targetConnectionId],
            scheduleParams: {
                startTime: Math.floor(Date.now() / 1000),
                frequency: "day",
                interval: 1,
            },
            transformations: [
                {
                    name: "Mapping",
                    params: {
                        mappingId: "",    // optionally inject a pre-created mapping ID
                        mappingVersion: 0,
                    },
                },
            ],
        }
    );

    const flowId = response.data.id;
    console.log(`[flow] Dataflow created with ID: ${flowId}`);
    return flowId;
}

/**
 * Builds a PostgreSQL JDBC-style connection string from its components.
 */
function buildConnectionString({ host, port, database, username, password }) {
    return `Server=${host};Port=${port};Database=${database};UID=${username};PWD=${password};`;
}

/**
 * Convenience: orchestrates source connection + target connection + dataflow
 * in a single call.
 *
 * @param {object} pgCredentials
 * @param {string} datasetId
 * @param {string} schemaId
 * @returns {Promise<{sourceConnectionId, targetConnectionId, flowId}>}
 */
async function createFullFlow(pgCredentials, datasetId, schemaId) {
    const sourceConnectionId = await createSourceConnection(pgCredentials);
    const targetConnectionId = await createTargetConnection(datasetId, schemaId);
    const flowId = await createDataflow(sourceConnectionId, targetConnectionId);
    return { sourceConnectionId, targetConnectionId, flowId };
}

module.exports = {
    createSourceConnection,
    createTargetConnection,
    createDataflow,
    createFullFlow,
};
