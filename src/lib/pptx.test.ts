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
});
