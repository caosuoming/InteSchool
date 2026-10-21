import { describe, expect, it } from "vitest";
import { assertScanBatchSize, validateScanImages } from "./scanner-import";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const image = (name = "scan.png", bytes: Uint8Array = png, type = "image/png") => new File([bytes], name, { type });

describe("scanner image import", () => {
  it("accepts PNG/JPEG signatures and normalizes files without a MIME type", async () => {
    const images = await validateScanImages([image(), image("scan.jpg", jpeg, "")]);
    expect(images.map((file) => file.type)).toEqual(["image/png", "image/jpeg"]);
  });

  it("rejects malformed and mislabeled files before uploading", async () => {
    await expect(validateScanImages([image("fake.png", new Uint8Array([1, 2, 3]))])).rejects.toThrow("有效的 PNG/JPEG");
    await expect(validateScanImages([image("fake.png", jpeg)])).rejects.toThrow("有效的 PNG/JPEG");
  });

  it("limits pages and total size, including existing scans", async () => {
    await expect(validateScanImages([image()], Array(40).fill(image()))).rejects.toThrow("40 页");
    await expect(validateScanImages([image()], [new Blob([new Uint8Array(25 * 1024 * 1024)])])).resolves.toHaveLength(1);
    const oversized = image("large.png");
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
    await expect(validateScanImages([oversized])).rejects.toThrow("25 MB");
    const fullBatch = new Blob(["x"]);
    Object.defineProperty(fullBatch, "size", { value: 120 * 1024 * 1024 });
    await expect(validateScanImages([image()], [fullBatch])).rejects.toThrow("120 MB");
    expect(() => assertScanBatchSize([image()], Array(40).fill(image()))).toThrow("40 页");
  });
});
