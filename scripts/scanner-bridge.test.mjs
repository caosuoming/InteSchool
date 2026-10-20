import { afterAll, beforeAll, describe, it } from "vitest";
import { strict as assert } from "node:assert";
import { createBridge } from "./scanner-bridge.mjs";
import { createScannerDevices } from "./scanner-devices.mjs";

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
  it("discovers Linux SANE devices and reports absent drivers clearly", async () => {
    const sane = createScannerDevices({ platform: "linux", execute: async () => 'avision:libusb:001\tAvision AV640\n' });
    assert.deepEqual((await sane.listDevices()).devices[0].id, "sane:avision:libusb:001");
    const missing = createScannerDevices({ platform: "linux", execute: async () => { throw new Error("scanimage missing"); } });
    assert.match((await missing.listDevices()).diagnostics.join(" "), /scanimage missing/);
  });
});
