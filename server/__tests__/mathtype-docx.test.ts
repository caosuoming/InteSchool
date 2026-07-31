// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { convertMathTypeDocxToOmml, type MathTypeDecoder } from "../lib/mathtype-docx.js";

const DOCUMENT_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:v="urn:schemas-microsoft-com:vml">
  <w:body>
    <w:p>
      <w:r><w:t>已知</w:t></w:r>
      <w:r>
        <w:object>
          <v:shape><v:imagedata r:id="rIdPreview"/></v:shape>
          <o:OLEObject Type="Embed" ProgID="__PROG_ID__" r:id="rIdEquation"/>
        </w:object>
      </w:r>
      <w:r><w:t>，求值。</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

const RELATIONSHIPS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdEquation"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject"
    Target="embeddings/oleObject1.bin"/>
  <Relationship Id="rIdPreview"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
    Target="media/image1.wmf"/>
</Relationships>`;

interface DocxOptions {
  progId?: string;
  ole?: Buffer;
  preview?: Buffer;
}

async function createDocx({
  progId = "Equation.DSMT4",
  ole = Buffer.from("fake-mathtype-ole"),
  preview = Buffer.from("preview"),
}: DocxOptions = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", DOCUMENT_TEMPLATE.replace("__PROG_ID__", progId));
  zip.file("word/_rels/document.xml.rels", RELATIONSHIPS_XML);
  zip.file("word/embeddings/oleObject1.bin", ole);
  zip.file("word/media/image1.wmf", preview);
  return zip.generateAsync({ type: "nodebuffer" });
}

function signatureDetectedOle(): Buffer {
  return Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(64),
    Buffer.from("Equation Native", "utf16le"),
  ]);
}

const SIMPLE_MATHML = `
<math xmlns="http://www.w3.org/1998/Math/MathML">
  <mrow><mi>x</mi><mo>=</mo><mfrac><mn>1</mn><mn>2</mn></mfrac></mrow>
</math>`;

describe("MathType DOCX conversion", () => {
  it("replaces embedded MathType objects with editable OMML and removes obsolete parts", async () => {
    const decoder: MathTypeDecoder = vi.fn(async (equations) => {
      expect(equations).toHaveLength(1);
      expect(equations[0]).toMatchObject({ relationshipId: "rIdEquation", format: "ole" });
      expect(equations[0].data.toString()).toBe("fake-mathtype-ole");
      return new Map([["rIdEquation", SIMPLE_MATHML]]);
    });

    const result = await convertMathTypeDocxToOmml(await createDocx(), decoder);
    const converted = await JSZip.loadAsync(result.buffer);
    const documentXml = await converted.file("word/document.xml")!.async("string");
    const relationshipsXml = await converted.file("word/_rels/document.xml.rels")!.async("string");

    expect(result).toMatchObject({
      detectedCount: 1,
      convertedCount: 1,
      failedCount: 0,
      warnings: [],
    });
    expect(documentXml).not.toContain("OLEObject");
    expect(documentXml).not.toContain("<w:object");
    expect(documentXml).toContain("<m:oMath");
    expect(documentXml).toContain("<m:f>");
    expect(documentXml).toMatch(/<m:t[^>]*>x=<\/m:t>/);
    expect(relationshipsXml).not.toContain("rIdEquation");
    expect(relationshipsXml).not.toContain("rIdPreview");
    expect(converted.file("word/embeddings/oleObject1.bin")).toBeNull();
    expect(converted.file("word/media/image1.wmf")).toBeNull();
  });

  it("detects MathType from the OLE payload when ProgID is generic", async () => {
    const decoder: MathTypeDecoder = vi.fn(async (equations) => {
      expect(equations).toHaveLength(1);
      expect(equations[0]).toMatchObject({ relationshipId: "rIdEquation", format: "ole" });
      return new Map([["rIdEquation", SIMPLE_MATHML]]);
    });

    const result = await convertMathTypeDocxToOmml(await createDocx({
      progId: "Package",
      ole: signatureDetectedOle(),
    }), decoder);

    expect(decoder).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ detectedCount: 1, convertedCount: 1, failedCount: 0 });
  });

  it("falls back to embedded MathType WMF data when the OLE stream cannot be decoded", async () => {
    const decoder: MathTypeDecoder = vi.fn(async (equations) => {
      const equation = equations[0];
      if (equation.format === "ole") {
        return {
          mathml: new Map(),
          errors: new Map([[equation.relationshipId, "damaged OLE stream"]]),
        };
      }
      expect(equation.format).toBe("wmf");
      expect(equation.data.includes(Buffer.from("MathTypeUU"))).toBe(true);
      return new Map([[equation.relationshipId, SIMPLE_MATHML]]);
    });

    const result = await convertMathTypeDocxToOmml(await createDocx({
      preview: Buffer.concat([Buffer.from("wmf-header"), Buffer.from("MathTypeUU"), Buffer.from("mtef")]),
    }), decoder);

    expect(decoder).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      detectedCount: 1,
      convertedCount: 1,
      failedCount: 0,
      warnings: [],
    });
  });

  it("preserves the original document and reports decoder failures", async () => {
    const original = await createDocx();
    const result = await convertMathTypeDocxToOmml(original, async () => {
      throw new Error("converter unavailable");
    });

    expect(result.buffer).toBe(original);
    expect(result).toMatchObject({
      detectedCount: 1,
      convertedCount: 0,
      failedCount: 1,
      warnings: [
        "converter unavailable",
        "有 1 个 MathType 公式保留为原始对象",
      ],
    });
  });

  it("reports per-equation decoder errors instead of silently dropping them", async () => {
    const result = await convertMathTypeDocxToOmml(await createDocx(), async (equations) => ({
      mathml: new Map(),
      errors: new Map([[equations[0].relationshipId, "unsupported MTEF record"]]),
    }));

    expect(result).toMatchObject({ detectedCount: 1, convertedCount: 0, failedCount: 1 });
    expect(result.warnings).toContain("公式 rIdEquation 解码失败：unsupported MTEF record");
  });

  it("does not invoke the decoder for unrelated OLE objects", async () => {
    const decoder = vi.fn<MathTypeDecoder>();
    const original = await createDocx({ progId: "Package" });
    const result = await convertMathTypeDocxToOmml(original, decoder);

    expect(decoder).not.toHaveBeenCalled();
    expect(result.buffer).toBe(original);
    expect(result.detectedCount).toBe(0);
  });
});
