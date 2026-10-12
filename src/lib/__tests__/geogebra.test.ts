import { describe, expect, it, vi } from "vitest";
import { exportGeoGebraFile, geogebraFileFromBase64 } from "@/lib/geogebra";

async function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

describe("GeoGebra .ggb export", () => {
  it("creates a binary .ggb file with a safe name", async () => {
    const file = geogebraFileFromBase64(btoa("ggb\0contents"), "A/B");
    expect(file.name).toBe("A_B.ggb");
    expect(file.type).toBe("application/vnd.geogebra.file");
    expect(await readFile(file)).toBe("ggb\0contents");
  });

  it("exports using the GeoGebra asynchronous API", async () => {
    const getBase64 = vi.fn((callback: (value: string) => void) => callback(btoa("file bytes")));
    const file = await exportGeoGebraFile({ getBase64, remove: vi.fn() }, "图形");
    expect(getBase64).toHaveBeenCalledTimes(1);
    expect(file.name).toBe("图形.ggb");
    expect(await readFile(file)).toBe("file bytes");
  });

  it("rejects empty exports and failed API calls", async () => {
    expect(() => geogebraFileFromBase64("", "bad")).toThrow();
    await expect(exportGeoGebraFile({
      getBase64: () => { throw new Error("applet failed"); }, remove: vi.fn(),
    }, "bad")).rejects.toThrow("applet failed");
  });
});
