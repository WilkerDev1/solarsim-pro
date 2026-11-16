import { serve } from "@hono/node-server";
import { createMcpApp } from "./app.js";
import { readConfig } from "./config.js";

let config;
try {
  config = readConfig();
} catch (error) {
  console.error(
    "MCP remote startup failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exit(1);
}
const server = serve({
  fetch: createMcpApp({ config }).fetch,
  port: config.port,
  hostname: config.host,
});
console.log(
  `SolarSim MCP remote listening on ${config.host}:${config.port} for ${config.publicUrl}`,
);
// Stateless: in-flight requests finish, new connections are refused, then exit.
const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10000).unref();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
