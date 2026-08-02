// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mammothMocks = vi.hoisted(() => ({
  extractRawText: vi.fn(),
  convertToHtml: vi.fn(),
  imgElement: vi.fn(),
  imageHandler: undefined as
    | undefined
    | ((image: {
        contentType: string;
        read: (encoding: string) => Promise<string>;
      }) => Promise<{ src: string; alt: string }>),
}));

const structuredTextMocks = vi.hoisted(() => ({
  extractDocxStructuredText: vi.fn(),
}));

vi.mock("../lib/docx-structured-text.js", () => ({
  extractDocxStructuredText: structuredTextMocks.extractDocxStructuredText,
}));

const mathTypeMocks = vi.hoisted(() => ({
  convertMathTypeDocxToOmml: vi.fn(),
}));

vi.mock("../lib/mathtype-docx.js", () => ({
  convertMathTypeDocxToOmml: mathTypeMocks.convertMathTypeDocxToOmml,
}));

vi.mock("mammoth", () => ({
  default: {
    extractRawText: mammothMocks.extractRawText,
    convertToHtml: mammothMocks.convertToHtml,
    images: {
      imgElement: mammothMocks.imgElement.mockImplementation((handler) => {
        mammothMocks.imageHandler = handler;
        return { type: "image-converter" };
      }),
    },
  },
}));

const pdfMocks = vi.hoisted(() => ({
  getText: vi.fn(),
  destroy: vi.fn(),
  constructorArgs: [] as unknown[],
}));

vi.mock("pdf-parse", () => ({
  PDFParse: class {
    constructor(options: unknown) {
      pdfMocks.constructorArgs.push(options);
    }

    getText(): Promise<{ text: string }> {
      return pdfMocks.getText();
    }

    destroy(): Promise<void> {
      return pdfMocks.destroy();
    }
  },
}));

import { extractDocument } from "../lib/document-extractor.js";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "inteschool-extractor-"));
  mammothMocks.extractRawText.mockReset();
  mammothMocks.convertToHtml.mockReset();
  mammothMocks.imgElement.mockClear();
  mammothMocks.imageHandler = undefined;
  structuredTextMocks.extractDocxStructuredText.mockReset();
  structuredTextMocks.extractDocxStructuredText.mockResolvedValue("");
  mathTypeMocks.convertMathTypeDocxToOmml.mockReset();
  mathTypeMocks.convertMathTypeDocxToOmml.mockImplementation(
    async (buffer: Buffer) => ({
      buffer,
      detectedCount: 0,
      convertedCount: 0,
      failedCount: 0,
      warnings: [],
    }),
  );
  pdfMocks.getText.mockReset();
  pdfMocks.destroy.mockReset();
  pdfMocks.destroy.mockResolvedValue(undefined);
  pdfMocks.constructorArgs.length = 0;
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("document extractor", () => {
  it("extracts DOCX text, sanitizes HTML, and returns converter warnings", async () => {
    const filePath = join(workDir, "lesson.DOCX");
    await writeFile(filePath, "fake docx");
    mammothMocks.extractRawText.mockResolvedValue({
      value: "  第一章 集合  ",
      messages: [{ message: "raw warning" }],
    });
    mammothMocks.convertToHtml.mockResolvedValue({
      value:
        '<p>安全正文</p><script>alert(1)</script><img src="javascript:bad" onerror="bad">',
      messages: [{ message: "render warning" }],
    });

    const result = await extractDocument(filePath, {
      docxImageUrl: (relationshipId) =>
        `/api/files/file-1/assets/${relationshipId}`,
    });

    expect(result).toEqual({
      text: "第一章 集合",
      html: expect.any(String),
      format: "docx",
      warnings: ["raw warning", "render warning"],
    });
    expect(result.html).toContain("<p>安全正文</p>");
    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("onerror");
    expect(result.html).not.toContain("javascript:");
    expect(mammothMocks.convertToHtml).toHaveBeenCalledWith(
      { buffer: Buffer.from("fake docx") },
      expect.objectContaining({ includeDefaultStyleMap: true }),
    );
    expect(mammothMocks.imageHandler).toBeTypeOf("function");
    await expect(
      mammothMocks.imageHandler!({
        contentType: "image/png",
        read: vi.fn().mockResolvedValue("aW1hZ2U="),
      }),
    ).resolves.toEqual({
      src: "data:image/png;base64,aW1hZ2U=",
      alt: "文档图片",
    });
    expect(structuredTextMocks.extractDocxStructuredText).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Function),
    );
    const imageUrl =
      structuredTextMocks.extractDocxStructuredText.mock.calls[0][1];
    expect(imageUrl("rId5")).toBe("/api/files/file-1/assets/rId5");
  });

  it("uses structure-aware DOCX text and renders preserved formulas", async () => {
    const filePath = join(workDir, "math.docx");
    await writeFile(filePath, "fake docx");
    mammothMocks.extractRawText.mockResolvedValue({
      value: "公式丢失",
      messages: [],
    });
    mammothMocks.convertToHtml.mockResolvedValue({
      value: "<p>公式丢失</p>",
      messages: [],
    });
    structuredTextMocks.extractDocxStructuredText.mockResolvedValue(
      "1. 已知 $\\frac{x}{2}=1$，求 x。\nA. 1 B. 2 C. 3 D. 4",
    );

    const result = await extractDocument(filePath);

    expect(result.text).toContain("$\\frac{x}{2}=1$");
    expect(result.html).toContain('class="katex"');
    expect(result.html).toContain("A. 1 B. 2 C. 3 D. 4");
    expect(result.html).not.toContain("$\\frac{x}{2}=1$");
  });

  it("extracts DOCX text without generating preview HTML", async () => {
    const filePath = join(workDir, "text-only.docx");
    await writeFile(filePath, "fake docx");
    structuredTextMocks.extractDocxStructuredText.mockResolvedValue(
      "18. （1）证明见解析；\n（2）$m\\le e-1$。",
    );

    const result = await extractDocument(filePath, { includeHtml: false });

    expect(result).toEqual({
      text: "18. （1）证明见解析；\n（2）$m\\le e-1$。",
      html: "",
      format: "docx",
      warnings: [],
    });
    expect(mammothMocks.extractRawText).not.toHaveBeenCalled();
    expect(mammothMocks.convertToHtml).not.toHaveBeenCalled();
  });

  it("falls back to Mammoth raw text in text-only mode", async () => {
    const filePath = join(workDir, "text-only-fallback.docx");
    await writeFile(filePath, "fake docx");
    mammothMocks.extractRawText.mockResolvedValue({
      value: "  fallback body  ",
      messages: [{ message: "fallback warning" }],
    });

    await expect(extractDocument(filePath, { includeHtml: false })).resolves.toEqual({
      text: "fallback body",
      html: "",
      format: "docx",
      warnings: ["fallback warning"],
    });
    expect(mammothMocks.convertToHtml).not.toHaveBeenCalled();
  });

  it("hides Mammoth diagnostics for formulas and styles handled by the structured preview", async () => {
    const filePath = join(workDir, "native-formulas.docx");
    await writeFile(filePath, "fake docx");
    mammothMocks.extractRawText.mockResolvedValue({
      value: "公式丢失",
      messages: [
        {
          message:
            "An unrecognised element was ignored: {http://schemas.openxmlformats.org/officeDocument/2006/math}oMath",
        },
        {
          message:
            "Unrecognised paragraph style: 'First Paragraph' (Style ID: FirstParagraph)",
        },
      ],
    });
    mammothMocks.convertToHtml.mockResolvedValue({
      value: "<p>公式丢失</p>",
      messages: [
        {
          message:
            "An unrecognised element was ignored: {http://schemas.openxmlformats.org/officeDocument/2006/math}oMathPara",
        },
        { message: "kept warning" },
        { message: "kept warning" },
      ],
    });
    structuredTextMocks.extractDocxStructuredText.mockResolvedValue(
      "已知 $x^2=1$。",
    );

    const result = await extractDocument(filePath);

    expect(result.html).toContain('class="katex"');
    expect(result.warnings).toEqual(["kept warning"]);
  });

  it("normalizes decomposed not-equal signs in DOCX preview HTML", async () => {
    const filePath = join(workDir, "not-equal.docx");
    await writeFile(filePath, "fake docx");
    mammothMocks.extractRawText.mockResolvedValue({
      value: "若 x≠y，则两数不同。",
      messages: [],
    });
    mammothMocks.convertToHtml.mockResolvedValue({
      value: "<p>若 x≠y，则两数不同。</p>",
      messages: [],
    });

    const result = await extractDocument(filePath);

    expect(result.text).toBe("若 x≠y，则两数不同。");
    expect(result.html).toContain("若 x≠y，则两数不同。");
    expect(result.html).not.toContain("\u0338");
  });

  it("renders preserved image references alongside formulas", async () => {
    const filePath = join(workDir, "illustrated-math.docx");
    await writeFile(filePath, "fake docx");
    mammothMocks.extractRawText.mockResolvedValue({
      value: "图形题",
      messages: [],
    });
    mammothMocks.convertToHtml.mockResolvedValue({
      value: "<p>图形题</p>",
      messages: [],
    });
    structuredTextMocks.extractDocxStructuredText.mockResolvedValue(
      "1. 已知 $x=1$，如图。![示意图](/api/files/file-1/assets/rId5)",
    );

    const result = await extractDocument(filePath);

    expect(result.html).toContain('class="katex"');
    expect(result.html).toContain(
      '<img src="/api/files/file-1/assets/rId5" alt="示意图" style="max-width:100%;height:auto;object-fit:contain;vertical-align:middle" class="office-document-image">',
    );
  });

  it("renders ordinary images at their Word display dimensions", async () => {
    const filePath = join(workDir, "scaled-image.docx");
    await writeFile(filePath, "fake docx");
    mammothMocks.extractRawText.mockResolvedValue({
      value: "图形题",
      messages: [],
    });
    mammothMocks.convertToHtml.mockResolvedValue({
      value: "<p>图形题</p>",
      messages: [],
    });
    structuredTextMocks.extractDocxStructuredText.mockResolvedValue(
      "如图。![示意图](/api/files/file-1/assets/rId5?officeWidth=200.00&officeHeight=100.00)",
    );

    const result = await extractDocument(filePath);

    expect(result.html).toContain('data-office-width="200"');
    expect(result.html).toContain('data-office-height="100"');
    expect(result.html).toContain('class="office-document-image"');
    expect(result.html).toContain(
      'style="width:200px;max-width:100%;height:auto;aspect-ratio:200/100;object-fit:contain;vertical-align:middle"',
    );
  });

  it("preserves Word dimensions for browser-rendered WMF formulas", async () => {
    const filePath = join(workDir, "legacy-formula.docx");
    await writeFile(filePath, "fake docx");
    mammothMocks.extractRawText.mockResolvedValue({
      value: "公式",
      messages: [],
    });
    mammothMocks.convertToHtml.mockResolvedValue({
      value: "<p>公式</p>",
      messages: [],
    });
    structuredTextMocks.extractDocxStructuredText.mockResolvedValue(
      "所以 ![公式](/api/files/file-1/assets/rId5?officeMetafile=wmf&officeWidth=96.00&officeHeight=24.00)",
    );

    const result = await extractDocument(filePath);

    expect(result.html).toContain('data-office-metafile="wmf"');
    expect(result.html).toContain('data-office-width="96"');
    expect(result.html).toContain('data-office-height="24"');
    expect(result.html).toContain('class="office-metafile-image"');
    expect(result.html).toContain(
      'style="width:96px;max-width:100%;height:auto;aspect-ratio:96/24;object-fit:contain;vertical-align:middle"',
    );
  });

  it("extracts PDF text, escapes preview HTML, and always destroys the parser", async () => {
    const filePath = join(workDir, "paper.pdf");
    await writeFile(filePath, Buffer.from("fake-pdf"));
    pdfMocks.getText.mockResolvedValue({
      text: "  <集合> & \"元素\" '关系'  ",
    });

    const result = await extractDocument(filePath);

    expect(result).toEqual({
      text: "<集合> & \"元素\" '关系'",
      html: "<pre>&lt;集合&gt; &amp; &quot;元素&quot; &#39;关系&#39;</pre>",
      format: "pdf",
      warnings: [],
    });
    expect(pdfMocks.constructorArgs).toHaveLength(1);
    expect(pdfMocks.constructorArgs[0]).toMatchObject({
      data: Buffer.from("fake-pdf"),
    });
    expect(pdfMocks.destroy).toHaveBeenCalledOnce();
  });

  it("omits PDF preview HTML in text-only mode", async () => {
    const filePath = join(workDir, "paper-text-only.pdf");
    await writeFile(filePath, Buffer.from("fake-pdf"));
    pdfMocks.getText.mockResolvedValue({ text: " body " });

    await expect(extractDocument(filePath, { includeHtml: false })).resolves.toEqual({
      text: "body",
      html: "",
      format: "pdf",
      warnings: [],
    });
  });

  it("destroys the PDF parser when extraction fails", async () => {
    const filePath = join(workDir, "broken.pdf");
    await writeFile(filePath, Buffer.from("broken"));
    pdfMocks.getText.mockRejectedValue(new Error("invalid pdf"));

    await expect(extractDocument(filePath)).rejects.toThrow("invalid pdf");
    expect(pdfMocks.destroy).toHaveBeenCalledOnce();
  });

  it("extracts text and markdown files with escaped HTML", async () => {
    const textPath = join(workDir, "notes.txt");
    const markdownPath = join(workDir, "notes.md");
    await writeFile(textPath, "  line <one> & two  ", "utf8");
    await writeFile(markdownPath, "  # Heading\ncontent  ", "utf8");

    await expect(extractDocument(textPath)).resolves.toEqual({
      text: "line <one> & two",
      html: "<pre>line &lt;one&gt; &amp; two</pre>",
      format: "text",
      warnings: [],
    });
    await expect(extractDocument(markdownPath)).resolves.toEqual({
      text: "# Heading\ncontent",
      html: "<pre># Heading\ncontent</pre>",
      format: "text",
      warnings: [],
    });
  });

  it("rejects unsupported document formats", async () => {
    const filePath = join(workDir, "slides.pptx");
    await writeFile(filePath, "unsupported");

    await expect(extractDocument(filePath)).rejects.toThrow(
      "该文件格式不支持服务端文本提取",
    );
  });
});
