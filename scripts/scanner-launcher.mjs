#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
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
  const child = spawn(runtime, [bridge], {
    cwd: dirname(scripts),
    detached: true,
    windowsHide: true,
    stdio: "ignore",
    env: cleanEnvironment,
  });
  child.unref();
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
