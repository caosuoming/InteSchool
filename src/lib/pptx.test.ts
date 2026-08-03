import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { countPptxSlides, extractPptxSlideOutlines } from "./pptx";

function slideXml(...lines: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>${lines.map((line) => `
    <p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${line}</a:t></a:r></a:p></p:txBody></p:sp>`).join("")}
  </p:spTree></p:cSld>
</p:sld>`;
}

function slideXmlWithFormula(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"
       xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
       xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p>
    <a:r><a:t>已知 </a:t></a:r>
    <mc:AlternateContent>
      <mc:Choice Requires="a14">
        <a14:m>
          <m:oMath>
            <m:f>
              <m:num><m:r><m:t>1</m:t></m:r></m:num>
              <m:den><m:r><m:t>2</m:t></m:r></m:den>
            </m:f>
          </m:oMath>
        </a14:m>
      </mc:Choice>
      <mc:Fallback><a:r><a:t>1/2-fallback</a:t></a:r></mc:Fallback>
    </mc:AlternateContent>
    <a:r><a:t>，求值。</a:t></a:r>
  </a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;
}

async function fakePptx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("ppt/slides/slide2.xml", slideXml("第二页", "第二页正文"));
  zip.file("ppt/slides/slide1.xml", slideXml("第一页", "第一页正文"));
  return zip.generateAsync({ type: "uint8array" });
}

describe("PPTX slide parser", () => {
  it("extracts source slides in numeric order", async () => {
    const source = await fakePptx();

    await expect(extractPptxSlideOutlines(source)).resolves.toEqual([
      { title: "第一页", content: "第一页\n第一页正文" },
      { title: "第二页", content: "第二页\n第二页正文" },
    ]);
    await expect(countPptxSlides(source)).resolves.toBe(2);
  });

  it("returns undefined for an invalid PPTX archive", async () => {
    await expect(countPptxSlides(new Uint8Array([1, 2, 3]))).resolves.toBeUndefined();
  });

  it("converts Office math to LaTeX and ignores its flattened fallback text", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", slideXmlWithFormula());
    const source = await zip.generateAsync({ type: "uint8array" });

    const [slide] = await extractPptxSlideOutlines(source);

    expect(slide.title).toBe("已知 $\\frac{1}{2}$，求值。");
    expect(slide.content).toBe("已知 $\\frac{1}{2}$，求值。");
    expect(slide.content).not.toContain("fallback");
  });
});
