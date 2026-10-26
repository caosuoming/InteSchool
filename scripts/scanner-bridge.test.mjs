import { afterAll, beforeAll, describe, it } from "vitest";
import { strict as assert } from "node:assert";
import { writeFile } from "node:fs/promises";
import { createBridge } from "./scanner-bridge.mjs";
import { createScannerDevices, decodeScannerOutput, execScanner } from "./scanner-devices.mjs";

const origin = "https://inteschool.example.org";
const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let bridge;
let base;
let acquired = 0;
const device = { id: "twain:av640", name: "av640", duplex: true, driver: "TWAIN" };
const headers = { Origin: origin, "X-InteSchool-Scanner": "scanner-v1" };

beforeAll(async () => {
  bridge = createBridge(origin, {
    listDevices: async () => ({ devices: [device], diagnostics: [] }),
    scan: async (opts) => {
      assert.deepEqual(opts, { deviceId: device.id, duplex: true });
      acquired++;
      return { pages: [{ data: image.toString("base64"), mime: "image/png" }] };
    },
  });
  await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${bridge.address().port}`;
});
afterAll(async () => { await new Promise((resolve) => bridge.close(resolve)); });

describe("local scanner bridge", () => {
  it("rejects foreign origins, missing headers, and malformed requests", async () => {
    assert.equal((await fetch(`${base}/devices`, { headers: { ...headers, Origin: "https://attacker.example" } })).status, 403);
    assert.equal((await fetch(`${base}/scan`, { method: "POST", headers: { Origin: origin } })).status, 404);
    assert.equal((await fetch(`${base}/scan`, { method: "POST", headers, body: "{broken" })).status, 400);
    assert.equal(acquired, 0);
  });
  it("lists devices, handles preflight, and scans with chosen duplex driver", async () => {
    const preflight = await fetch(`${base}/scan`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Private-Network": "true" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
    const devices = await fetch(`${base}/devices`, { headers });
    assert.equal(devices.status, 200);
    assert.deepEqual((await devices.json()).devices, [device]);
    const response = await fetch(`${base}/scan`, { method: "POST", headers, body: JSON.stringify({ deviceId: device.id, duplex: true }) });
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from((await response.json()).pages[0].data, "base64"), image);
    assert.equal(acquired, 1);
  });
});

describe("scanner driver enumeration", () => {
  it("uses high-quality JPEG for TWAIN ADF scans and returns browser-compatible images", async () => {
    const executed = [];
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
    const backend = createScannerDevices({ platform: "win32", naps2: "naps2.exe", execute: async (command, args) => {
      if (command === "powershell.exe") return "[]";
      if (args[0] === "--listdevices") return "阅卷仪640\r\n";
      executed.push(args);
      await writeFile(args[1].replace("$(nnnn)", "0001"), jpeg);
      return "";
    } });
    const result = await backend.scan({ deviceId: "twain:阅卷仪640", duplex: false });
    assert.deepEqual(result.pages, [{ mime: "image/jpeg", data: jpeg.toString("base64") }]);
    assert.equal(executed.length, 1);
    assert.match(executed[0][1], /page-\$\(nnnn\)\.jpg$/);
    assert.deepEqual(executed[0].slice(-4), ["--dpi", "300", "--jpegquality", "90"]);
  });
  it("reports the real no-paper error that NAPS2 writes to stdout", async () => {
    await assert.rejects(() => execScanner(process.execPath, [
      "-e", "process.stdout.write('TWAIN error: NoMedia\\nNo scanned pages to export.\\n'); process.exit(1)",
    ], 10_000), /扫描仪未检测到纸张/);
  });
  it("decodes Chinese scanner names from Windows GBK console output without damaging UTF-8", () => {
    const gbk = Buffer.from("d4c4beedd2c7363430", "hex");
    assert.equal(decodeScannerOutput(gbk, { platform: "win32" }), "阅卷仪640");
    assert.equal(decodeScannerOutput(Buffer.from("阅卷仪640"), { platform: "win32" }), "阅卷仪640");
    assert.equal(decodeScannerOutput(gbk, { platform: "win32", legacyEncoding: "gb18030" }), "阅卷仪640");
  });
  it("handles WIA and TWAIN independently, and rejects unavailable duplex for WIA", async () => {
    const executed = [];
    const backend = createScannerDevices({ platform: "win32", naps2: "naps2.exe", execute: async (command, args) => {
      executed.push([command, args]);
      if (command === "powershell.exe") return '[{"id":"wia-id","name":"AV640 WIA"}]';
      return 'AV640 TWAIN\r\n';
    } });
    const { devices } = await backend.listDevices();
    assert.deepEqual(devices.map(({ id }) => id), ["wia:wia-id", "twain:AV640 TWAIN"]);
    await assert.rejects(() => backend.scan({ deviceId: "wia:wia-id", duplex: true }), /WIA/);
    assert.equal(executed.some(([command]) => command === "naps2.exe"), true);
  });
  it("explains that TWAIN-only scanners need NAPS2 when its executable is missing", async () => {
    const backend = createScannerDevices({ platform: "win32", naps2: "missing-naps2.exe", execute: async (command) => {
      if (command === "powershell.exe") return "[]";
      throw new Error("spawn missing-naps2.exe ENOENT");
    } });
    const result = await backend.listDevices();
    assert.deepEqual(result.devices, []);
    assert.match(result.diagnostics.join(" "), /NAPS2.*TWAIN/);
  });

  it("discovers Linux SANE devices and reports absent drivers clearly", async () => {
    const sane = createScannerDevices({ platform: "linux", execute: async () => 'avision:libusb:001\tAvision AV640\n' });
    assert.deepEqual((await sane.listDevices()).devices[0].id, "sane:avision:libusb:001");
    const missing = createScannerDevices({ platform: "linux", execute: async () => { throw new Error("scanimage missing"); } });
    assert.match((await missing.listDevices()).diagnostics.join(" "), /scanimage missing/);
  });
});
