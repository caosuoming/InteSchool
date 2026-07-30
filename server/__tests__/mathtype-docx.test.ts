// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { convertMathTypeDocxToOmml, type MathTypeDecoder } from "../lib/mathtype-docx.js";

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
          <o:OLEObject Type="Embed" ProgID="Equation.DSMT4" r:id="rIdEquation"/>
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

async function createDocx(withMathType = true): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    withMathType
      ? DOCUMENT_XML
      : DOCUMENT_XML.replace("Equation.DSMT4", "Package").replace("rIdEquation", "rIdPackage"),
  );
  zip.file("word/_rels/document.xml.rels", RELATIONSHIPS_XML);
  zip.file("word/embeddings/oleObject1.bin", Buffer.from("fake-mathtype-ole"));
  zip.file("word/media/image1.wmf", Buffer.from("preview"));
  return zip.generateAsync({ type: "nodebuffer" });
}

const SIMPLE_MATHML = `
<math xmlns="http://www.w3.org/1998/Math/MathML">
  <mrow><mi>x</mi><mo>=</mo><mfrac><mn>1</mn><mn>2</mn></mfrac></mrow>
</math>`;

describe("MathType DOCX conversion", () => {
  it("replaces embedded MathType objects with editable OMML", async () => {
    const decoder: MathTypeDecoder = vi.fn(async (equations) => {
      expect(equations).toHaveLength(1);
      expect(equations[0].relationshipId).toBe("rIdEquation");
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
    expect(converted.file("word/embeddings/oleObject1.bin")).toBeNull();
  });

  it("keeps the original document when the decoder is unavailable", async () => {
    const original = await createDocx();
    const result = await convertMathTypeDocxToOmml(original, async () => {
      throw new Error("converter unavailable");
    });

    expect(result.buffer).toBe(original);
    expect(result).toMatchObject({
      detectedCount: 1,
      convertedCount: 0,
      failedCount: 1,
      warnings: ["converter unavailable"],
    });
  });

  it("does not invoke the decoder for unrelated OLE objects", async () => {
    const decoder = vi.fn<MathTypeDecoder>();
    const original = await createDocx(false);
    const result = await convertMathTypeDocxToOmml(original, decoder);

    expect(decoder).not.toHaveBeenCalled();
    expect(result.buffer).toBe(original);
    expect(result.detectedCount).toBe(0);
  });
});
