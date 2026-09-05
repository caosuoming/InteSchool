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

    const slides = await extractPptxSlideOutlines(source);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toMatchObject({ title: "第一页", content: "第一页\n第一页正文" });
    expect(slides[1]).toMatchObject({ title: "第二页", content: "第二页\n第二页正文" });
    expect(slides[0].elements).toHaveLength(2);
    await expect(countPptxSlides(source)).resolves.toBe(2);
  });


  it("preserves PPT text geometry, rich formatting, line breaks, and embedded images", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldSz cx="12192000" cy="6858000"/>
</p:presentation>`);
    zip.file("ppt/slides/slide1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="TextBox 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="1219200" y="685800"/><a:ext cx="6096000" cy="1371600"/></a:xfrm><a:noFill/></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p>
        <a:pPr algn="ctr"><a:defRPr sz="2400"><a:ea typeface="宋体"/></a:defRPr></a:pPr>
        <a:r><a:rPr sz="3200" b="1"><a:ea typeface="微软雅黑"/><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>第一行</a:t></a:r>
        <a:br/><a:r><a:t>第二行</a:t></a:r>
      </a:p></p:txBody>
    </p:sp>
    <p:pic>
      <p:nvPicPr><p:cNvPr id="3" name="Picture 2" descr="函数示意图"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId5"/></p:blipFill>
      <p:spPr><a:xfrm><a:off x="7315200" y="1371600"/><a:ext cx="3657600" cy="3429000"/></a:xfrm></p:spPr>
    </p:pic>
  </p:spTree></p:cSld>
</p:sld>`);
    const source = await zip.generateAsync({ type: "uint8array" });

    const [slide] = await extractPptxSlideOutlines(source, {
      imageUrl: (slideNumber, relationshipId) =>
        `/api/files/file-1/assets/ppt-slide-${slideNumber}-${relationshipId}`,
    });

    expect(slide.elements).toHaveLength(2);
    expect(slide.elements?.[0]).toMatchObject({
      kind: "text",
      x: 10,
      y: 10,
      width: 50,
      height: 20,
      fontFamily: "微软雅黑",
      fontWeight: "bold",
      color: "#FF0000",
      textAlign: "center",
      backgroundColor: "transparent",
      padding: 0,
    });
    expect(slide.elements?.[0]).toHaveProperty("content", expect.stringContaining("第一行"));
    expect(slide.elements?.[0]).toHaveProperty("content", expect.stringContaining("<br>"));
    expect(slide.elements?.[0]).toHaveProperty("content", expect.stringContaining("font-family:&quot;微软雅黑&quot;"));
    expect(slide.elements?.[1]).toMatchObject({
      kind: "image",
      src: "/api/files/file-1/assets/ppt-slide-1-rId5",
      alt: "函数示意图",
      x: 60,
      y: 20,
      width: 30,
      height: 50,
    });
  });

  it("preserves native PPT tables as editable rich-text elements", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldSz cx="12192000" cy="6858000"/>
</p:presentation>`);
    zip.file("ppt/slides/slide1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:graphicFrame>
      <p:nvGraphicFramePr><p:cNvPr id="4" name="表格 3"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>
      <p:xfrm><a:off x="1219200" y="685800"/><a:ext cx="6096000" cy="2743200"/></p:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
        <a:tbl>
          <a:tblPr firstRow="1"/>
          <a:tblGrid><a:gridCol w="3048000"/><a:gridCol w="3048000"/></a:tblGrid>
          <a:tr h="914400">
            <a:tc gridSpan="2">
              <a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="2000" b="1"/><a:t>合并标题</a:t></a:r></a:p></a:txBody>
              <a:tcPr anchor="ctr"><a:solidFill><a:srgbClr val="FFF2CC"/></a:solidFill></a:tcPr>
            </a:tc>
            <a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>不应重复</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
          </a:tr>
          <a:tr h="914400">
            <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>左侧</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>
            <a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>右侧 $x^2$</a:t></a:r></a:p></a:txBody><a:tcPr anchor="b"/></a:tc>
          </a:tr>
        </a:tbl>
      </a:graphicData></a:graphic>
    </p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`);
    const source = await zip.generateAsync({ type: "uint8array" });

    const [slide] = await extractPptxSlideOutlines(source);

    expect(slide.elements).toHaveLength(1);
    expect(slide.elements?.[0]).toMatchObject({
      kind: "text",
      x: 10,
      y: 10,
      width: 50,
      height: 40,
      fontWeight: "bold",
      backgroundColor: "transparent",
      padding: 0,
    });
    const content = slide.elements?.[0]?.kind === "text" ? slide.elements[0].content : "";
    expect(content).toContain('class="ppt-import-table"');
    expect(content).toContain('<col style="width:50.0000%">');
    expect(content).toContain('style="height:50.0000%"');
    expect(content).toContain('colspan="2"');
    expect(content).toContain("background-color:#FFF2CC");
    expect(content).toContain("vertical-align:middle");
    expect(content).toContain("vertical-align:bottom");
    expect(content).toContain("合并标题");
    expect(content).toContain("右侧 $x^2$");
    expect(content).not.toContain("不应重复");
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
