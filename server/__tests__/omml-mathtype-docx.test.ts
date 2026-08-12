// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  convertOmmlDocxToMathType,
  createMathTypeOleFromLatex,
} from "../lib/omml-mathtype-docx.js";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`;

const EMPTY_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

async function createOmmlDocx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("word/_rels/document.xml.rels", EMPTY_RELS);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p>
      <w:r><w:t>已知 </w:t></w:r>
      <m:oMath>
        <m:r><m:t>a</m:t></m:r>
        <m:sSub><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sub><m:r><m:t>1</m:t></m:r></m:sub></m:sSub>
      </m:oMath>
    </w:p>
    <w:p>
      <m:oMathPara><m:oMath>
        <m:f>
          <m:num><m:r><m:t>x+1</m:t></m:r></m:num>
          <m:den><m:r><m:t>2</m:t></m:r></m:den>
        </m:f>
      </m:oMath></m:oMathPara>
    </w:p>
  </w:body>
</w:document>`);
  zip.file("word/_rels/header1.xml.rels", EMPTY_RELS);
  zip.file("word/header1.xml", `<?xml version="1.0" encoding="UTF-8"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:p><m:oMath><m:r><m:t>y=3</m:t></m:r></m:oMath></w:p>
</w:hdr>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("OMML to MathType DOCX conversion", () => {
  it("creates a real Equation.DSMT4 compound object", () => {
    const ole = createMathTypeOleFromLatex(String.raw`a_n=\frac{x+1}{2}`);

    expect(ole.subarray(0, 8)).toEqual(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    expect(ole.includes(Buffer.from("Equation Native", "utf16le"))).toBe(true);
    expect(ole.includes(Buffer.from("Equation.DSMT4", "utf8"))).toBe(true);
  });

  it("converts inline, display, and header OMML formulas to MathType objects", async () => {
    const result = await convertOmmlDocxToMathType(await createOmmlDocx());
    const converted = await JSZip.loadAsync(result.buffer);
    const documentXml = await converted.file("word/document.xml")!.async("string");
    const headerXml = await converted.file("word/header1.xml")!.async("string");
    const documentRels = await converted.file("word/_rels/document.xml.rels")!.async("string");
    const headerRels = await converted.file("word/_rels/header1.xml.rels")!.async("string");
    const contentTypes = await converted.file("[Content_Types].xml")!.async("string");

    expect(result).toMatchObject({ detectedCount: 3, convertedCount: 3 });
    expect(documentXml).not.toContain("<m:oMath");
    expect(documentXml).toContain('ProgID="Equation.DSMT4"');
    expect(documentXml).toContain("<v:imagedata");
    expect(headerXml).not.toContain("<m:oMath");
    expect(headerXml).toContain('ProgID="Equation.DSMT4"');
    expect(documentRels.match(/relationships\/oleObject/g)).toHaveLength(2);
    expect(documentRels.match(/relationships\/image/g)).toHaveLength(2);
    expect(headerRels).toContain("relationships/oleObject");
    expect(headerRels).toContain("relationships/image");
    expect(contentTypes).toContain('Extension="bin"');
    expect(contentTypes).toContain('Extension="png"');

    const embeddings = Object.keys(converted.files).filter((path) => path.startsWith("word/embeddings/") && path.endsWith(".bin"));
    const previews = Object.keys(converted.files).filter((path) => path.startsWith("word/media/") && path.endsWith(".png"));
    expect(embeddings).toHaveLength(3);
    expect(previews).toHaveLength(3);
    for (const path of embeddings) {
      const ole = await converted.file(path)!.async("nodebuffer");
      expect(ole.subarray(0, 8)).toEqual(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
      expect(ole.includes(Buffer.from("Equation Native", "utf16le"))).toBe(true);
    }
    for (const path of previews) {
      const png = await converted.file(path)!.async("nodebuffer");
      expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
  });

  it("returns the original buffer when no OMML formulas are present", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    const original = await zip.generateAsync({ type: "nodebuffer" });

    const result = await convertOmmlDocxToMathType(original);
    expect(result).toMatchObject({ detectedCount: 0, convertedCount: 0 });
    expect(result.buffer).toBe(original);
  });
});
