"use strict";

const { getAepClient } = require("../utils/aepClient");

/**
 * XDM Schema Definition for the AEP POC.
 *
 * Field group design:
 *   - _experience.analytics.customDimensions  (standard Adobe mixin)
 *   - Custom profile attributes  (name, email, loyalty tier, age)
 *   - Custom event attributes    (event type, product SKU, revenue)
 */
const SCHEMA_DEFINITION = {
    title: "AEP POC Customer Profile Schema",
    description:
        "XDM Individual Profile schema used in the AEP proof-of-concept project.",
    type: "object",
    // XDM Individual Profile base class
    allOf: [
        {
            $ref:
                "https://ns.adobe.com/xdm/context/profile",
        },
        {
            // Custom field group – Personal Information
            properties: {
                personalEmail: {
                    title: "Email Address",
                    description: "Primary email address of the customer.",
                    $ref: "https://ns.adobe.com/xdm/context/emailaddress",
                },
                person: {
                    title: "Person",
                    $ref: "https://ns.adobe.com/xdm/context/person",
                },
                homePhone: {
                    title: "Home Phone",
                    $ref: "https://ns.adobe.com/xdm/context/phonenumber",
                },
            },
        },
        {
            // Custom field group – Loyalty & Commerce
            properties: {
                loyaltyDetails: {
                    title: "Loyalty Details",
                    type: "object",
                    properties: {
                        tier: {
                            title: "Loyalty Tier",
                            type: "string",
                            enum: ["bronze", "silver", "gold", "platinum"],
                            description: "Customer loyalty program tier.",
                        },
                        points: {
                            title: "Loyalty Points",
                            type: "integer",
                            minimum: 0,
                        },
                        joinDate: {
                            title: "Join Date",
                            type: "string",
                            format: "date",
                        },
                    },
                },
            },
        },
    ],
    meta: {
        // Indicate this is an Individual Profile schema class
        xdmType: "record",
        class: "https://ns.adobe.com/xdm/context/profile",
    },
};

/**
 * Creates an XDM schema in AEP.
 *
 * @returns {Promise<string>} The `$id` (URI) of the newly created schema.
 */
async function createSchema() {
    console.log("[schema] Creating XDM schema…");
    const client = await getAepClient();

    const response = await client.post("/data/foundation/schemaregistry/tenant/schemas", {
        ...SCHEMA_DEFINITION,
        meta: SCHEMA_DEFINITION.meta,
        // Schema Registry requires the Accept header to include version
    }, {
        headers: {
            Accept: "application/vnd.adobe.xed+json;version=1",
        },
    });

    const schemaId = response.data.$id;
    console.log(`[schema] Created schema with ID: ${schemaId}`);
    return schemaId;
}

/**
 * Lists all tenant schemas in the current sandbox.
 *
 * @returns {Promise<Array>} Array of schema summaries.
 */
async function listSchemas() {
    const client = await getAepClient();
    const response = await client.get(
        "/data/foundation/schemaregistry/tenant/schemas",
        { headers: { Accept: "application/vnd.adobe.xed-id+json" } }
    );
    return response.data.results || [];
}

module.exports = { createSchema, listSchemas };
