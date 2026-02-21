"use strict";

const { getAepClient } = require("../utils/aepClient");

/**
 * Creates an AEP Dataset linked to the provided XDM schema.
 *
 * Datasets in AEP act as storage containers for data governed
 * by the associated XDM schema.
 *
 * @param {string} schemaId   - The `$id` URI of the XDM schema.
 * @param {string} [name]     - Human-readable dataset name.
 * @returns {Promise<string>} - The ID of the created dataset.
 */
async function createDataset(schemaId, name = "AEP POC Customer Dataset") {
    console.log("[dataset] Creating dataset…");
    const client = await getAepClient();

    const payload = {
        name,
        description:
            "Dataset for the AEP POC project — holds ingested customer profile records.",
        schemaRef: {
            id: schemaId,
            contentType: "application/vnd.adobe.xed+json;version=1",
        },
        fileDescription: {
            persisted: true,
            containerFormat: "parquet",    // AEP stores batches as Parquet
            format: "parquet",
        },
        // Enable Profile so records flow into Real-Time Customer Profile
        unifiedProfile: { enabled: true },
        unifiedIdentity: { enabled: true },
        tags: {
            unifiedProfile: ["enabled:true"],
            unifiedIdentity: ["enabled:true"],
        },
    };

    const response = await client.post(
        "/data/foundation/catalog/datasets",
        payload
    );

    // The API returns an array: [ "/dataSets/<id>" ]
    const datasetPath = Array.isArray(response.data)
        ? response.data[0]
        : response.data;
    const datasetId = datasetPath.split("/").pop();
    console.log(`[dataset] Created dataset ID: ${datasetId}`);
    return datasetId;
}

/**
 * Retrieves metadata for a specific dataset.
 *
 * @param {string} datasetId
 * @returns {Promise<object>}
 */
async function getDataset(datasetId) {
    const client = await getAepClient();
    const response = await client.get(
        `/data/foundation/catalog/datasets/${datasetId}`
    );
    return response.data;
}

/**
 * Lists all datasets available in the current sandbox.
 *
 * @returns {Promise<Array>}
 */
async function listDatasets() {
    const client = await getAepClient();
    const response = await client.get("/data/foundation/catalog/datasets", {
        params: { limit: 100 },
    });
    // Response is an object keyed by dataset ID
    return Object.entries(response.data).map(([id, meta]) => ({
        id,
        ...meta,
    }));
}

module.exports = { createDataset, getDataset, listDatasets };
