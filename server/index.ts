import { buildApp } from "./app.js";
import { probeMathTypeRuntime } from "./lib/mathtype-docx.js";

if (process.env.NODE_ENV === "production") {
  const mathTypeRuntime = await probeMathTypeRuntime();
  if (!mathTypeRuntime.available) {
    throw new Error(`MathType runtime unavailable: ${mathTypeRuntime.message}`);
  }
}

const { app, config } = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.host, port: config.port });
