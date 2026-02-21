"use strict";

const { getAepClient } = require("../utils/aepClient");

/* -----------------------------------------------------------------------
 * Profile Service — wraps the AEP Real-Time Customer Profile API.
 *
 * Profiles are built automatically from ingested datasets that have
 * `unifiedProfile: enabled`.  This service provides lookup and merge
 * helpers so we can verify profile creation and inspect merged data.
 * ---------------------------------------------------------------------- */

/**
 * Looks up a unified customer profile by identity.
 *
 * @param {string} namespace  - Identity namespace (e.g. "Email", "CRMID")
 * @param {string} id         - The identity value (e.g. "user@example.com")
 * @returns {Promise<object>} - Merged profile entity
 */
async function getProfileByIdentity(namespace, id) {
    console.log(`[profile] Looking up profile for ${namespace}:${id}…`);
    const client = await getAepClient();

    const response = await client.get(
        `/data/core/ups/access/entities`,
        {
            params: {
                schema: "https://ns.adobe.com/xdm/context/profile",
                entityIdNS: namespace,
                entityId: id,
            },
            headers: {
                // Profile Access API uses a different accept header
                Accept: "application/vnd.adobe.xdm+json",
            },
        }
    );

    return response.data;
}

/**
 * Retrieves multiple profiles in a single batch request.
 *
 * @param {Array<{namespace: string, id: string}>} identities
 * @returns {Promise<object>} - Map of entityId → profile
 */
async function getBatchProfiles(identities) {
    console.log(`[profile] Batch-fetching ${identities.length} profile(s)…`);
    const client = await getAepClient();

    const payload = {
        schema: { name: "https://ns.adobe.com/xdm/context/profile" },
        identities: identities.map(({ namespace, id }) => ({
            entityIdNS: { code: namespace },
            entityId: id,
        })),
    };

    const response = await client.post(
        "/data/core/ups/access/entities",
        payload
    );

    return response.data;
}

/**
 * Returns a summary of the unified profile store for the sandbox.
 * Useful for monitoring how many profiles have been created.
 *
 * @returns {Promise<object>}
 */
async function getProfileStoreStats() {
    const client = await getAepClient();
    const response = await client.get("/data/core/ups/previewsamplestatus");
    return response.data;
}

/**
 * Triggers a profile preview sample job to refresh the profile count estimate.
 *
 * @returns {Promise<string>} previewId
 */
async function triggerProfilePreview() {
    console.log("[profile] Triggering profile preview sample job…");
    const client = await getAepClient();

    const response = await client.post("/data/core/ups/previewsamplejob");
    const previewId = response.data.previewQueryId;
    console.log(`[profile] Preview job triggered: ${previewId}`);
    return previewId;
}

module.exports = {
    getProfileByIdentity,
    getBatchProfiles,
    getProfileStoreStats,
    triggerProfilePreview,
};
