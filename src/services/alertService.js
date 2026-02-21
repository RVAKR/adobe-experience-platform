"use strict";

const { getAepClient } = require("../utils/aepClient");

/* -----------------------------------------------------------------------
 * Alert Service — wraps the AEP Observability Insights / Alerting API.
 *
 * Alerts let you receive notifications when AEP events cross defined
 * thresholds (e.g., a dataflow run fails, ingestion volume spikes, etc.).
 * ---------------------------------------------------------------------- */

/**
 * Subscribes to one or more alert types for a given AEP object.
 *
 * @param {object} params
 * @param {string}   params.name        - Human-readable alert name.
 * @param {string}   params.description - What this alert watches.
 * @param {string}   params.severity    - "critical", "warning", or "info".
 * @param {string[]} params.alertTypes  - AEP alert type identifiers.
 * @param {object}   params.notifyOn    - Alert trigger conditions.
 * @param {object[]} params.subscriptions - Notification channels.
 * @returns {Promise<string>} alertId
 */
async function createAlert({
    name,
    description,
    severity = "warning",
    alertTypes,
    notifyOn,
    subscriptions,
}) {
    console.log(`[alert] Creating alert: "${name}"…`);
    const client = await getAepClient();

    const response = await client.post(
        "/data/foundation/observability/alerts/rules",
        {
            name,
            description,
            severity,
            enabled: true,
            alertTypes,
            notifyOn: notifyOn || {
                // Default: notify when alert fires and when it resolves
                ingestion: { started: false, success: true, failure: true },
            },
            subscriptions: subscriptions || [],
        }
    );

    const alertId = response.data.id;
    console.log(`[alert] Alert created: ${alertId}`);
    return alertId;
}

/**
 * Retrieves all active alert rules in the current sandbox.
 *
 * @returns {Promise<Array>}
 */
async function listAlerts() {
    const client = await getAepClient();
    const response = await client.get(
        "/data/foundation/observability/alerts/rules"
    );
    return response.data.data || [];
}

/**
 * Subscribes to dataflow-level flow run alerts (success + failure) for
 * the given flow ID.
 *
 * This is the most common alert pattern for ingestion monitoring.
 *
 * @param {string} flowId            - The dataflow ID to watch.
 * @param {string} [notifyEmail]     - Optional email address to receive alerts.
 * @returns {Promise<object>} - Created alert subscription response.
 */
async function createFlowRunAlert(flowId, notifyEmail) {
    console.log(`[alert] Subscribing to flow run alerts for flow ${flowId}…`);
    const client = await getAepClient();

    // AEP uses a subscription pattern for flow alerts
    const payload = {
        assets: [
            {
                id: flowId,
                type: "flow",
            },
        ],
        alertTypes: [
            "sources_flow_run_started",
            "sources_flow_run_success",
            "sources_flow_run_failed",
        ],
        ...(notifyEmail && {
            subscriptions: [
                {
                    // "inApp" alerts appear in the AEP UI notification centre
                    alertType: "EMAIL",
                    asset: notifyEmail,
                },
            ],
        }),
    };

    const response = await client.post(
        "/data/foundation/observability/alerts/subscriptions",
        payload
    );

    console.log(
        `[alert] Flow run alerts subscribed (subscriptionId: ${response.data.id})`
    );
    return response.data;
}

/**
 * Deletes an alert rule by ID.
 *
 * @param {string} alertId
 * @returns {Promise<void>}
 */
async function deleteAlert(alertId) {
    console.log(`[alert] Deleting alert ${alertId}…`);
    const client = await getAepClient();
    await client.delete(
        `/data/foundation/observability/alerts/rules/${alertId}`
    );
    console.log(`[alert] Alert ${alertId} deleted.`);
}

// ---- Pre-built alert templates -----------------------------------------

/**
 * Template: alert when a dataflow run fails.
 *
 * @param {string} flowId
 * @param {string} [notifyEmail]
 */
async function alertOnDataflowFailure(flowId, notifyEmail) {
    return createFlowRunAlert(flowId, notifyEmail);
}

/**
 * Template: alert when batch ingestion fails.
 *
 * @param {string} datasetId
 * @returns {Promise<string>} alertId
 */
async function alertOnIngestionFailure(datasetId) {
    return createAlert({
        name: `Ingestion Failure – Dataset ${datasetId}`,
        description:
            "Fires when a batch ingestion into the AEP POC dataset fails.",
        severity: "critical",
        alertTypes: ["dataset_run_failed"],
        notifyOn: { datasetId },
    });
}

module.exports = {
    createAlert,
    listAlerts,
    createFlowRunAlert,
    deleteAlert,
    alertOnDataflowFailure,
    alertOnIngestionFailure,
};
