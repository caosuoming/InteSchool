#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const PORT = 17380;
const LIMIT = 25 * 1024 * 1024;
const TIMEOUT = 120_000;

function run(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "buffer", maxBuffer: LIMIT, timeout: TIMEOUT, windowsHide: false },
      (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

export async function scanOnce() {
  let data;
  if (process.platform === "win32") {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$dialog = New-Object -ComObject WIA.CommonDialog",
      "$image = $dialog.ShowAcquireImage()",
      "if ($null -eq $image) { throw '未选择扫描仪或扫描已取消' }",
      "[Console]::Out.Write([Convert]::ToBase64String([byte[]]$image.FileData.BinaryData))",
    ].join("; ");
    const output = await run("powershell.exe", ["-NoProfile", "-Sta", "-Command", script]);
    data = Buffer.from(output.toString("utf8").trim(), "base64");
  } else {
    data = await run("scanimage", ["--format=png", "--resolution", "300"]);
  }
  if (!data.length || data.length > LIMIT) throw new Error("扫描图像为空或超过 25 MB");
  const mime = data.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71])) ? "image/png"
    : data[0] === 0xff && data[1] === 0xd8 ? "image/jpeg"
      : data.subarray(0, 2).toString() === "BM" ? "image/bmp" : null;
  if (!mime) throw new Error("扫描仪返回了无法识别的图像格式");
  return { data, mime };
}

export function createBridge(origin, acquire = scanOnce) {
  if (!origin || !/^https?:\/\/[^/]+$/.test(origin) || origin === "null") {
    throw new Error("请通过 SCANNER_ALLOWED_ORIGIN 指定 InteSchool 网站来源，例如 https://school.example.com");
  }
  let scanning = false;
  return createServer(async (request, response) => {
    const allowed = request.headers.origin === origin;
    if (!allowed) {
      response.writeHead(403).end("Forbidden origin");
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "X-InteSchool-Scanner");
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Cache-Control", "no-store");

    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" }).end('{"status":"ready"}');
      return;
    }
    if (request.method !== "POST" || request.url !== "/scan" || request.headers["x-inteschool-scanner"] !== "scanner-v1") {
      response.writeHead(404).end("Not found");
      return;
    }
    if (scanning) {
      response.writeHead(409).end("扫描仪正在使用中");
      return;
    }
    scanning = true;
    try {
      const { data, mime } = await acquire();
      response.writeHead(200, { "Content-Type": mime, "Content-Length": data.length }).end(data);
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message.slice(0, 300) : "扫描失败");
    } finally {
      scanning = false;
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const origin = process.env.SCANNER_ALLOWED_ORIGIN;
  createBridge(origin).listen(PORT, "127.0.0.1", () => {
    process.stdout.write(`InteSchool scanner bridge running at http://127.0.0.1:${PORT} (origin: ${origin})\n`);
  });
}
