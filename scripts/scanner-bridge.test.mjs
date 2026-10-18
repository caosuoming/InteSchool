import { afterAll, beforeAll, it } from "vitest";
import { strict as assert } from "node:assert";
import { createBridge } from "./scanner-bridge.mjs";

const origin = "https://inteschool.example.org";
const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let bridge;
let base;
let acquired = 0;

beforeAll(async () => {
  bridge = createBridge(origin, async () => {
    acquired++;
    return { data: image, mime: "image/png" };
  });
  await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${bridge.address().port}`;
});
afterAll(async () => { await new Promise((resolve) => bridge.close(resolve)); });

it("rejects other website origins and non-scanner requests", async () => {
  const forbidden = await fetch(`${base}/scan`, { method: "POST", headers: { Origin: "https://attacker.example", "X-InteSchool-Scanner": "scanner-v1" } });
  assert.equal(forbidden.status, 403);
  const noHeader = await fetch(`${base}/scan`, { method: "POST", headers: { Origin: origin } });
  assert.equal(noHeader.status, 404);
  assert.equal(acquired, 0);
});

it("permits browser preflight and returns real scan bytes", async () => {
  const preflight = await fetch(`${base}/scan`, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Private-Network": "true" } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
  const response = await fetch(`${base}/scan`, { method: "POST", headers: { Origin: origin, "X-InteSchool-Scanner": "scanner-v1" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  assert.equal(acquired, 1);
});
