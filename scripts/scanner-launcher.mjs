#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { appendFileSync, closeSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { approveOrigin, parsePairingUri } from "./scanner-pairing.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const bridge = join(scripts, "scanner-bridge.mjs");
const runtime = process.execPath;

async function isListening() {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port: 17380 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

async function main() {
  const uri = process.argv[2];
  if (uri) {
    // The Windows protocol handler asks the user to approve the full origin
    // before invoking this launcher. Never accept unvalidated URI parameters.
    await approveOrigin(parsePairingUri(uri));
  }
  await access(bridge);
  if (await isListening()) return;
  const { SCANNER_ALLOWED_ORIGIN: _configuredOrigin, ...cleanEnvironment } = process.env;
  const logDir = join(process.env.LOCALAPPDATA || join(homedir(), ".local", "state"), "InteSchool", "Scanner");
  await mkdir(logDir, { recursive: true });
  const logFile = join(logDir, "bridge.log");
  const log = openSync(logFile, "a");
  try {
    const child = spawn(runtime, [bridge], {
      cwd: dirname(scripts),
      detached: true,
      windowsHide: true,
      stdio: ["ignore", log, log],
      env: cleanEnvironment,
    });
    child.on("error", (error) => appendFileSync(logFile, new Date().toISOString() + " Launch error: " + error.message + "\n"));
    child.unref();
  } finally {
    closeSync(log);
  }
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
