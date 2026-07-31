import { spawn } from "node:child_process";

const child = spawn(
  "ruby",
  ["-W0", "-e", 'require "mathtype_to_mathml_plus"; STDOUT.write("ok")'],
  {
    env: { ...process.env, RUBYOPT: "-W0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);

let stdout = "";
let stderr = "";
const timer = setTimeout(() => {
  child.kill("SIGKILL");
  console.error("MathType runtime check timed out.");
  process.exitCode = 1;
}, 10_000);

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});
child.on("error", (error) => {
  clearTimeout(timer);
  if (error.code === "ENOENT") {
    console.error("MathType conversion requires Ruby, but the ruby executable was not found.");
  } else {
    console.error(`Unable to start Ruby: ${error.message}`);
  }
  process.exitCode = 1;
});
child.on("close", (code) => {
  clearTimeout(timer);
  if (process.exitCode) return;
  if (code === 0 && stdout === "ok") {
    console.log("MathType runtime is available.");
    return;
  }
  console.error("MathType conversion requires mathtype_to_mathml_plus 0.0.16.");
  if (stderr.trim()) console.error(stderr.trim());
  process.exitCode = 1;
});
