#!/usr/bin/env node
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createScannerDevices } from "./scanner-devices.mjs";

const PORT = 17380;

export function createBridge(origin, scanner = createScannerDevices()) {
  if (!origin || !/^https?:\/\/[^/]+$/.test(origin) || origin === "null") {
    throw new Error("请通过 SCANNER_ALLOWED_ORIGIN 指定 InteSchool 网站来源，例如 https://school.example.com");
  }
  let scanning = false;
  return createServer(async (request, response) => {
    if (request.headers.origin !== origin) {
      response.writeHead(403).end("Forbidden origin");
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "X-InteSchool-Scanner, Content-Type");
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
    if (request.headers["x-inteschool-scanner"] !== "scanner-v1") { response.writeHead(404).end("Not found"); return; }
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" }).end('{"status":"ready"}');
      return;
    }
    if (request.method === "GET" && request.url === "/devices") {
      try {
        const devices = await scanner.listDevices();
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(devices));
      } catch (error) { response.writeHead(500).end(error instanceof Error ? error.message.slice(0, 300) : "设备查询失败"); }
      return;
    }
    if (request.method !== "POST" || request.url !== "/scan") { response.writeHead(404).end("Not found"); return; }
    if (scanning) { response.writeHead(409).end("扫描仪正在使用中"); return; }
    scanning = true;
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk.toString("utf8");
        if (body.length > 2048) { response.writeHead(413).end("请求过大"); return; }
      }
      let options;
      try { options = JSON.parse(body); } catch { response.writeHead(400).end("扫描参数无效"); return; }
      if (!options || typeof options.deviceId !== "string" || options.deviceId.length > 512 || typeof options.duplex !== "boolean") {
        response.writeHead(400).end("请选择扫描仪及扫描模式"); return;
      }
      const result = await scanner.scan({ deviceId: options.deviceId, duplex: options.duplex });
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message.slice(0, 300) : "扫描失败");
    } finally { scanning = false; }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const origin = process.env.SCANNER_ALLOWED_ORIGIN;
  createBridge(origin).listen(PORT, "127.0.0.1", () => {
    process.stdout.write(`InteSchool scanner bridge running at http://127.0.0.1:${PORT} (origin: ${origin})\n`);
  });
}
