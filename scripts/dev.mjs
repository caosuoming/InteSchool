import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npmCommand, ["run", "dev:server"], { stdio: "inherit", env: process.env }),
  spawn(npmCommand, ["run", "dev:web"], { stdio: "inherit", env: process.env }),
];

let shuttingDown = false;
function shutdown(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of children) {
  child.on("exit", (code) => {
    if (!shuttingDown && code !== 0) process.exitCode = code || 1;
    shutdown();
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
