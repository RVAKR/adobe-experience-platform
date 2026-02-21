"use strict";

const axios = require("axios");
const aepConfig = require("../config/aepConfig");

let _cachedToken = null;
let _tokenExpiresAt = 0;

/**
 * Fetches a fresh IMS OAuth 2.0 access token using the
 * client-credentials flow, and caches it until it expires.
 *
 * @returns {Promise<string>} Bearer token
 */
async function getAccessToken() {
    const now = Date.now();

    // Return cached token if still valid (with 60-s buffer)
    if (_cachedToken && now < _tokenExpiresAt - 60_000) {
        return _cachedToken;
    }

    const params = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: aepConfig.clientId,
        client_secret: aepConfig.clientSecret,
        scope: aepConfig.scopes,
    });

    const response = await axios.post(aepConfig.imsTokenUrl, params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const { access_token, expires_in } = response.data;
    _cachedToken = access_token;
    _tokenExpiresAt = now + expires_in * 1_000;

    console.log("[auth] New IMS access token obtained.");
    return _cachedToken;
}

module.exports = { getAccessToken };
