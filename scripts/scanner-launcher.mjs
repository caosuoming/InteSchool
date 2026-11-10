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
  const args = process.argv.slice(2);
  const pairingOnly = args[0] === "--pair-only";
  if ((pairingOnly && args.length !== 2) || (!pairingOnly && args.length > 1)) {
    throw new Error("连接请求无效");
  }
  const uri = pairingOnly ? args[1] : args[0];
  if (uri) {
    // Browser protocol requests require user confirmation in the VBS handler.
    // The installer offers a separate opt-in task for its pinned HTTPS origin.
    await approveOrigin(parsePairingUri(uri));
  }
  // Inno Setup waits for this invocation: never spawn the long-lived bridge
  // from the installer authorization step.
  if (pairingOnly) return;
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
