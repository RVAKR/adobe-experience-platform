"use strict";

require("dotenv").config();

/**
 * Central AEP configuration module.
 * All values are sourced from environment variables so nothing
 * sensitive is ever hard-coded.
 */
const aepConfig = {
    // --- Adobe IMS / OAuth 2.0 ---------------------------------
    clientId: process.env.AEP_CLIENT_ID,
    clientSecret: process.env.AEP_CLIENT_SECRET,
    orgId: process.env.AEP_ORG_ID,
    sandboxName: process.env.AEP_SANDBOX_NAME || "prod",
    imsTokenUrl: process.env.AEP_IMS_TOKEN_URL,
    scopes: process.env.AEP_SCOPES,

    // --- AEP Platform Base URL ---------------------------------
    baseUrl: process.env.AEP_BASE_URL || "https://platform.adobe.io",

    // --- PostgreSQL source spec ID (Adobe-managed) -------------
    postgresSourceConnectionSpecId:
        process.env.POSTGRES_SOURCE_CONNECTION_SPEC_ID ||
        "74a1c565-2e08-496b-9d42-c0b84d1a77af",
};

/** Validate that all required fields are present at startup. */
function validateConfig() {
    const required = [
        "clientId",
        "clientSecret",
        "orgId",
        "imsTokenUrl",
        "scopes",
    ];
    const missing = required.filter((k) => !aepConfig[k]);
    if (missing.length) {
        throw new Error(
            `[aepConfig] Missing required environment variables: ${missing.join(", ")}`
        );
    }
}

validateConfig();

module.exports = aepConfig;
