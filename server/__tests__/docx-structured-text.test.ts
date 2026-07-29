// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractDocxStructuredText } from "../lib/docx-structured-text.js";

const documentPrefix = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
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

  it("returns an empty string when document.xml is absent", async () => {
    const data = await new JSZip().generateAsync({ type: "nodebuffer" });
    await expect(extractDocxStructuredText(data)).resolves.toBe("");
  });
});
