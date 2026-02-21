"use strict";

const axios = require("axios");
const { getAccessToken } = require("../auth/imsAuth");
const aepConfig = require("../config/aepConfig");

/**
 * Returns a pre-configured Axios instance with the standard
 * AEP HTTP headers injected on every request.
 *
 * @returns {Promise<import('axios').AxiosInstance>}
 */
async function getAepClient() {
    const token = await getAccessToken();

    const client = axios.create({
        baseURL: aepConfig.baseUrl,
        headers: {
            Authorization: `Bearer ${token}`,
            "x-api-key": aepConfig.clientId,
            "x-gw-ims-org-id": aepConfig.orgId,
            "x-sandbox-name": aepConfig.sandboxName,
            "Content-Type": "application/json",
        },
    });

    // ---- Response interceptor: uniform error logging ----------
    client.interceptors.response.use(
        (res) => res,
        (err) => {
            const status = err.response?.status ?? "N/A";
            const message =
                err.response?.data?.title ||
                err.response?.data?.message ||
                err.message;
            console.error(`[aepClient] HTTP ${status} – ${message}`);
            return Promise.reject(err);
        }
    );

    return client;
}

module.exports = { getAepClient };
