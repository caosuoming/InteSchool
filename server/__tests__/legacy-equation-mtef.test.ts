import { describe, expect, it } from "vitest";
import * as CFB from "cfb";
import JSZip from "jszip";
import { convertMathTypeDocxToOmml } from "../lib/mathtype-docx.js";

// Minimal Equation Editor 3.0 MTEF v3 stream with the formula PAC.
// This is legacy data that the MathType 7-only Ruby path cannot decode.
const EQUATION_NATIVE = Buffer.from(
  "1c00000002000ec21500000000000000b83d6600bc24640000000000030101031e0a011283500012834100128343000000",
  "hex",
);

async function oldEquationDocument(): Promise<Buffer> {
  const compound = CFB.utils.cfb_new();
  CFB.utils.cfb_add(compound, "Equation Native", EQUATION_NATIVE);
  const ole = CFB.write(compound, { type: "buffer" });
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document
    xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:v="urn:schemas-microsoft-com:vml">
    <w:body><w:p><w:r><w:object><v:shape/><o:OLEObject
      ProgID="Equation.KSEE3" r:id="rIdEquation"/></w:object></w:r></w:p></w:body>
    </w:document>`);
  zip.file("word/_rels/document.xml.rels", `<Relationships
    xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rIdEquation"
      Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject"
      Target="embeddings/oleObject1.bin"/>
    </Relationships>`);
  zip.file("word/embeddings/oleObject1.bin", ole);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("legacy Equation Editor 3.0 equations", () => {
  it("converts old Equation Native MTEF to editable OMML", async () => {
    const result = await convertMathTypeDocxToOmml(await oldEquationDocument());
    expect(result).toMatchObject({ detectedCount: 1, convertedCount: 1, failedCount: 0 });
    const converted = await JSZip.loadAsync(result.buffer);
    const xml = await converted.file("word/document.xml")!.async("string");
    expect(xml).toContain("<m:oMath");
    expect(xml).not.toContain("o:OLEObject");
    expect(xml).toContain("PAC");
  });
});
