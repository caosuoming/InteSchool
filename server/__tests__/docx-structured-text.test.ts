// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractDocxImage, extractDocxStructuredText } from "../lib/docx-structured-text.js";

const documentPrefix = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>`;
const documentSuffix = `<w:sectPr/></w:body></w:document>`;

async function makeDocx(body: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", `${documentPrefix}${body}${documentSuffix}`);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("DOCX structure-aware text extraction", () => {
  it("preserves Word equations in their original paragraph order", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:t>1. 已知 </w:t></w:r>
        <m:oMath>
          <m:f>
            <m:num><m:r><m:t>x</m:t></m:r></m:num>
            <m:den><m:r><m:t>2</m:t></m:r></m:den>
          </m:f>
          <m:r><m:t>=1</m:t></m:r>
        </m:oMath>
        <w:r><w:t>，求 x。</w:t></w:r>
      </w:p>
      <w:p><w:r><w:t>A. 1 B. 2 C. 3 D. 4</w:t></w:r></w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      "1. 已知 $\\frac{x}{2}=1$，求 x。\nA. 1 B. 2 C. 3 D. 4",
    );
  });

  it("extracts table cells without merging option boundaries", async () => {
    const data = await makeDocx(`
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>A. 甲</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>B. 乙</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe("A. 甲\tB. 乙");
  });

  it("normalizes decomposed not-equal signs before converting Word equations", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:t>若 </w:t></w:r>
        <m:oMath><m:r><m:t>x≠y</m:t></m:r></m:oMath>
        <w:r><w:t>，则两数不同。</w:t></w:r>
      </w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      "若 $x\\neq y$，则两数不同。",
    );
  });

  it("preserves embedded images in their paragraph position", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:t>1. 如图，求阴影面积。</w:t></w:r>
        <w:r><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:r>
      </w:p>
      <w:p><w:r><w:t>答案：4</w:t></w:r></w:p>
    `);

    await expect(extractDocxStructuredText(
      data,
      (relationshipId) => `/api/files/file-1/assets/${relationshipId}`,
    )).resolves.toBe(
      "1. 如图，求阴影面积。![文档图片](/api/files/file-1/assets/rId5)\n答案：4",
    );
  });

  it("marks WMF and EMF image relationships for browser-side conversion", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", `${documentPrefix}
      <w:p>
        <w:r><w:t>公式：</w:t></w:r>
        <w:r><w:drawing><a:blip r:embed="rIdWmf"/></w:drawing></w:r>
        <w:r><w:drawing><a:blip r:embed="rIdPng"/></w:drawing></w:r>
      </w:p>
      ${documentSuffix}`);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdWmf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/formula.wmf"/>
        <Relationship Id="rIdPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png"/>
      </Relationships>`);
    const data = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractDocxStructuredText(
      data,
      (relationshipId) => `/api/files/file-1/assets/${relationshipId}`,
    )).resolves.toBe(
      "公式：![文档图片](/api/files/file-1/assets/rIdWmf?officeMetafile=wmf)"
      + "![文档图片](/api/files/file-1/assets/rIdPng)",
    );
  });

  it("reads only internal image relationships from the DOCX package", async () => {
    const zip = new JSZip();
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png"/>
        <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="media/not-image.png"/>
        <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/tracker.png" TargetMode="External"/>
      </Relationships>`);
    const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    zip.file("word/media/diagram.png", imageData);
    zip.file("word/media/not-image.png", imageData);
    const data = await zip.generateAsync({ type: "nodebuffer" });

    await expect(extractDocxImage(data, "rId5")).resolves.toEqual({
      data: imageData,
      contentType: "image/png",
      fileName: "diagram.png",
    });
    await expect(extractDocxImage(data, "rId6")).resolves.toBeNull();
    await expect(extractDocxImage(data, "rId7")).resolves.toBeNull();
    await expect(extractDocxImage(data, "../../secret")).resolves.toBeNull();
  });

  it("returns an empty string when document.xml is absent", async () => {
    const data = await new JSZip().generateAsync({ type: "nodebuffer" });
    await expect(extractDocxStructuredText(data)).resolves.toBe("");
  });
});
