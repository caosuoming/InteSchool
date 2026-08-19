// @vitest-environment node

import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  extractDocxImage,
  extractDocxStructuredText,
} from "../lib/docx-structured-text.js";

const documentPrefix = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
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

  it("preserves vector-angle formulas with CJK angle delimiters", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:t>设 </w:t></w:r>
        <m:oMath>
          <m:d>
            <m:dPr><m:begChr m:val="〈"/><m:endChr m:val="〉"/></m:dPr>
            <m:e>
              <m:acc>
                <m:accPr><m:chr m:val="⃗"/></m:accPr>
                <m:e><m:r><m:t>AB</m:t></m:r></m:e>
              </m:acc>
              <m:r><m:t>,</m:t></m:r>
              <m:acc>
                <m:accPr><m:chr m:val="⃗"/></m:accPr>
                <m:e><m:r><m:t>AC</m:t></m:r></m:e>
              </m:acc>
            </m:e>
          </m:d>
          <m:r><m:t>=θ</m:t></m:r>
        </m:oMath>
        <w:r><w:t>。</w:t></w:r>
      </w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      String.raw`设 $\left\langle\overrightarrow{AB},\overrightarrow{AC}\right\rangle=\theta$。`,
    );
  });

  it("preserves Word run superscript and subscript formatting", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:t>a</w:t></w:r>
        <w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t>n</w:t></w:r>
        <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>2</w:t></w:r>
        <w:r><w:t>+1</w:t></w:r>
      </w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      '<i class="math-variable">a</i><sub><i class="math-variable">n</i></sub><sup>2</sup>+1',
    );
  });

  it("preserves standalone italic Word math variables without styling prose letters", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:t>I 卷：设 </w:t></w:r>
        <w:r><w:rPr><w:i/></w:rPr><w:t>a</w:t></w:r>
        <w:r><w:t>=1。</w:t></w:r>
      </w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      'I 卷：设 <i class="math-variable">a</i>=1。',
    );
  });

  it("preserves multi-letter italic Word math labels", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:t>三棱锥</w:t></w:r>
        <w:r><w:rPr><w:i/></w:rPr><w:t>O</w:t></w:r>
        <w:r><w:t>－</w:t></w:r>
        <w:r><w:rPr><w:i/></w:rPr><w:t>ABC</w:t></w:r>
        <w:r><w:t>中，</w:t></w:r>
        <w:r><w:rPr><w:i/></w:rPr><w:t>OA</w:t></w:r>
        <w:r><w:t>＝1</w:t></w:r>
      </w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      '三棱锥<i class="math-variable">O</i>－<i class="math-variable">ABC</i>中，'
        + '<i class="math-variable">OA</i>＝1',
    );
  });

  it("honors an explicit false Word italic property", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:rPr><w:i w:val="0"/></w:rPr><w:t>A</w:t></w:r>
      </w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe("A");
  });

  it("converts fragmented legacy Word EQ fields instead of leaving formula gaps", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:t>数列的前 n 项和 b_n=1-</w:t></w:r>
        <w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText> eq \\f</w:instrText></w:r>
        <w:r><w:instrText>(2,</w:instrText></w:r>
        <w:r><w:instrText>7)</w:instrText></w:r>
        <w:r><w:fldChar w:fldCharType="end"/></w:r>
        <w:r><w:t>n。</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:t>A. -</w:t></w:r>
        <w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText>eq \\f(1,3)</w:instrText></w:r>
        <w:r><w:fldChar w:fldCharType="end"/></w:r>
        <w:r><w:t> B. </w:t></w:r>
        <w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText>eq \\f(5,7)</w:instrText></w:r>
        <w:r><w:fldChar w:fldCharType="end"/></w:r>
      </w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      "数列的前 n 项和 b_n=1-$\\frac{2}{7}$n。\n"
        + "A. -$\\frac{1}{3}$ B. $\\frac{5}{7}$",
    );
  });

  it("preserves subscript and superscript formatting inside legacy EQ instructions", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText>eq a</w:instrText></w:r>
        <w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:instrText>n</w:instrText></w:r>
        <w:r><w:instrText>＋x</w:instrText></w:r>
        <w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:instrText>2</w:instrText></w:r>
        <w:r><w:fldChar w:fldCharType="end"/></w:r>
      </w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      "$a{}_{n}+x{}^{2}$",
    );
  });

  it("keeps the displayed result of non-equation Word fields", async () => {
    const data = await makeDocx(`
      <w:p>
        <w:r><w:t>日期：</w:t></w:r>
        <w:r><w:fldChar w:fldCharType="begin"/></w:r>
        <w:r><w:instrText>DATE \\@ yyyy-MM-dd</w:instrText></w:r>
        <w:r><w:fldChar w:fldCharType="separate"/></w:r>
        <w:r><w:t>2026-08-11</w:t></w:r>
        <w:r><w:fldChar w:fldCharType="end"/></w:r>
      </w:p>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      "日期：2026-08-11",
    );
  });

  it("preserves table rows and cells instead of flattening them", async () => {
    const data = await makeDocx(`
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>A. 甲</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>B. 乙</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      '<table class="document-table"><tbody><tr><td>A. 甲</td><td>B. 乙</td></tr></tbody></table>',
    );
  });

  it("preserves structured math markup inside table cells without allowing arbitrary HTML", async () => {
    const data = await makeDocx(`
      <w:tbl>
        <w:tr>
          <w:tc>
            <w:p>
              <w:r><w:t>月份序号</w:t></w:r>
              <w:r><w:rPr><w:i/></w:rPr><w:t>x</w:t></w:r>
            </w:p>
          </w:tc>
          <w:tc><w:p><w:r><w:t>&lt;script&gt;alert(1)&lt;/script&gt;</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      '<table class="document-table"><tbody><tr>'
        + '<td>月份序号<i class="math-variable">x</i></td>'
        + '<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>'
        + '</tr></tbody></table>',
    );
  });

  it("preserves horizontal and vertical merged table cells", async () => {
    const data = await makeDocx(`
      <w:tbl>
        <w:tr>
          <w:tc>
            <w:tcPr><w:vMerge w:val="restart"/></w:tcPr>
            <w:p><w:r><w:t>题号</w:t></w:r></w:p>
          </w:tc>
          <w:tc>
            <w:tcPr><w:gridSpan w:val="2"/></w:tcPr>
            <w:p><w:r><w:t>1-2</w:t></w:r></w:p>
          </w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>
          <w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    `);

    await expect(extractDocxStructuredText(data)).resolves.toBe(
      '<table class="document-table"><tbody>'
        + '<tr><td rowspan="2">题号</td><td colspan="2">1-2</td></tr>'
        + '<tr><td>A</td><td>B</td></tr>'
        + '</tbody></table>',
    );
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

    await expect(
      extractDocxStructuredText(
        data,
        (relationshipId) => `/api/files/file-1/assets/${relationshipId}`,
      ),
    ).resolves.toBe(
      "1. 如图，求阴影面积。![文档图片](/api/files/file-1/assets/rId5)\n答案：4",
    );
  });

  it("marks WMF and EMF image relationships for browser-side conversion", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `${documentPrefix}
      <w:p>
        <w:r><w:t>公式：</w:t></w:r>
        <w:r><w:drawing><a:blip r:embed="rIdWmf"/></w:drawing></w:r>
        <w:r><w:drawing><a:blip r:embed="rIdPng"/></w:drawing></w:r>
      </w:p>
      ${documentSuffix}`,
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdWmf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/formula.wmf"/>
        <Relationship Id="rIdPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png"/>
      </Relationships>`,
    );
    const data = await zip.generateAsync({ type: "nodebuffer" });

    await expect(
      extractDocxStructuredText(
        data,
        (relationshipId) => `/api/files/file-1/assets/${relationshipId}`,
      ),
    ).resolves.toBe(
      "公式：![文档图片](/api/files/file-1/assets/rIdWmf?officeMetafile=wmf)" +
        "![文档图片](/api/files/file-1/assets/rIdPng)",
    );
  });

  it("preserves Word display dimensions for WMF and EMF previews", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `${documentPrefix}
      <w:p>
        <w:r>
          <w:drawing>
            <wp:inline>
              <wp:extent cx="952500" cy="476250"/>
              <a:graphic><a:blip r:embed="rIdWmf"/></a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
        <w:r>
          <w:object>
            <v:shape style="width:72pt;height:18pt">
              <v:imagedata r:id="rIdEmf"/>
            </v:shape>
          </w:object>
        </w:r>
      </w:p>
      ${documentSuffix}`,
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdWmf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/formula.wmf"/>
        <Relationship Id="rIdEmf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/formula.emf"/>
      </Relationships>`,
    );
    const data = await zip.generateAsync({ type: "nodebuffer" });

    await expect(
      extractDocxStructuredText(
        data,
        (relationshipId) => `/api/files/file-1/assets/${relationshipId}`,
      ),
    ).resolves.toBe(
      "![文档图片](/api/files/file-1/assets/rIdWmf?officeMetafile=wmf&officeWidth=100.00&officeHeight=50.00)" +
        "![文档图片](/api/files/file-1/assets/rIdEmf?officeMetafile=emf&officeWidth=96.00&officeHeight=24.00)",
    );
  });

  it("preserves legacy VML formula previews referenced through o:relid", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `${documentPrefix}
      <w:p>
        <w:r><w:t>a=</w:t></w:r>
        <w:r>
          <w:object>
            <v:shape style="width:54pt;height:18pt">
              <v:imagedata o:relid="rIdLegacyFormula"/>
            </v:shape>
          </w:object>
        </w:r>
      </w:p>
      ${documentSuffix}`,
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdLegacyFormula" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/formula.wmf"/>
      </Relationships>`,
    );
    const data = await zip.generateAsync({ type: "nodebuffer" });

    await expect(
      extractDocxStructuredText(
        data,
        (relationshipId) => `/api/files/file-1/assets/${relationshipId}`,
      ),
    ).resolves.toBe(
      "a=![文档图片](/api/files/file-1/assets/rIdLegacyFormula?officeMetafile=wmf&officeWidth=72.00&officeHeight=24.00)",
    );
  });

  it("preserves Word display dimensions for ordinary document images", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `${documentPrefix}
      <w:p>
        <w:r>
          <w:drawing>
            <wp:inline>
              <wp:extent cx="1905000" cy="952500"/>
              <a:graphic><a:blip r:embed="rIdPng"/></a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>
      ${documentSuffix}`,
    );
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdPng" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png"/>
      </Relationships>`,
    );
    const data = await zip.generateAsync({ type: "nodebuffer" });

    await expect(
      extractDocxStructuredText(
        data,
        (relationshipId) => `/api/files/file-1/assets/${relationshipId}`,
      ),
    ).resolves.toBe(
      "![文档图片](/api/files/file-1/assets/rIdPng?officeWidth=200.00&officeHeight=100.00)",
    );
  });

  it("reads only internal image relationships from the DOCX package", async () => {
    const zip = new JSZip();
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/diagram.png"/>
        <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="media/not-image.png"/>
        <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/tracker.png" TargetMode="External"/>
      </Relationships>`,
    );
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
