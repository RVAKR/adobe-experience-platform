"use strict";

require("dotenv").config();

const app = require("./webapp/server");

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`\n✅  AEP POC web app running at http://localhost:${PORT}`);
    console.log(`   Sandbox : ${process.env.AEP_SANDBOX_NAME || "prod"}`);
    console.log(`   Env     : ${process.env.NODE_ENV || "development"}\n`);
});

// Graceful shutdown -------------------------------------------------------

function gracefulShutdown(signal) {
    console.log(`\n[server] Received ${signal}. Shutting down gracefully…`);
    server.close(() => {
        console.log("[server] HTTP server closed.");
        process.exit(0);
    });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
    console.error("[server] Unhandled rejection:", reason);
});
