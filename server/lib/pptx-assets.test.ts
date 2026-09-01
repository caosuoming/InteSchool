import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractPptxImage } from "./pptx-assets.js";

const RELATIONSHIP_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const IMAGE_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

async function pptxWithRelationships(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("ppt/media/image1.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  zip.file("ppt/media/not-image.bin", Buffer.from("not image"));
  zip.file("ppt/slides/_rels/slide1.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="${RELATIONSHIP_NS}">
  <Relationship Id="rId5" Type="${IMAGE_RELATIONSHIP}" Target="../media/image1.png"/>
  <Relationship Id="rIdExternal" Type="${IMAGE_RELATIONSHIP}" Target="https://example.com/image.png" TargetMode="External"/>
  <Relationship Id="rIdTraversal" Type="${IMAGE_RELATIONSHIP}" Target="../../../secret.png"/>
  <Relationship Id="rIdOther" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="../media/not-image.bin"/>
</Relationships>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("PPTX image assets", () => {
  it("extracts an embedded image by slide relationship", async () => {
    const image = await extractPptxImage(
      await pptxWithRelationships(),
      "ppt-slide-1-rId5",
    );

    expect(image).toEqual({
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: "image/png",
      fileName: "image1.png",
    });
  });

  it("rejects malformed, external, traversal, and non-image relationships", async () => {
    const data = await pptxWithRelationships();

    await expect(extractPptxImage(data, "rId5")).resolves.toBeNull();
    await expect(extractPptxImage(data, "ppt-slide-0-rId5")).resolves.toBeNull();
    await expect(extractPptxImage(data, "ppt-slide-1-rIdExternal")).resolves.toBeNull();
    await expect(extractPptxImage(data, "ppt-slide-1-rIdTraversal")).resolves.toBeNull();
    await expect(extractPptxImage(data, "ppt-slide-1-rIdOther")).resolves.toBeNull();
  });
});
