import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approveOrigin, parsePairingUri, readPairedOrigins, validateWebsiteOrigin } from "./scanner-pairing.mjs";
import { createBridge } from "./scanner-bridge.mjs";

describe("scanner installer site pairing", () => {
  it("accepts only exact secure origins and valid protocol URIs", () => {
    expect(parsePairingUri("inteschool-scanner://connect?origin=https%3A%2F%2Fschool.example")).toBe("https://school.example");
    expect(validateWebsiteOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    for (const invalid of ["http://evil.example", "https://school.example/path", "https://school.example@evil.example",
      "javascript:alert(1)", "https://school.example/", "https://school.example?x=1"]) {
      expect(() => validateWebsiteOrigin(invalid)).toThrow();
    }
    for (const invalid of ["inteschool-scanner://connect?origin=http%3A%2F%2Fevil.example",
      "inteschool-scanner://evil?origin=https%3A%2F%2Fschool.example",
      "inteschool-scanner://connect?origin=https%3A%2F%2Fschool.example&origin=https%3A%2F%2Fevil.example"]) {
      expect(() => parsePairingUri(invalid)).toThrow();
    }
  });

  it("persists only approved origins; denies all remote requests before pairing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "inteschool-pairing-test-"));
    const file = join(dir, "origins.json");
    const device = { listDevices: async () => ({devices:[], diagnostics:[]}), scan: async () => ({pages:[]}) };
    const server = createBridge(undefined, device, { originsFile: file });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (origin) => fetch(base + "/health", { headers: { Origin: origin, "X-InteSchool-Scanner":"scanner-v1" } });
    try {
      expect((await request("https://school.example")).status).toBe(403);
      await approveOrigin("https://school.example", file);
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual(["https://school.example"]);
      expect(await readPairedOrigins(file)).toEqual(["https://school.example"]);
      expect((await request("https://school.example")).status).toBe(200);
      expect((await request("https://evil.example")).status).toBe(403);
      await approveOrigin("https://second.example", file);
      expect((await readPairedOrigins(file)).length).toBe(2);
      expect((await request("https://second.example")).status).toBe(200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
