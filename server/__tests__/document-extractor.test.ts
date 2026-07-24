// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mammothMocks = vi.hoisted(() => ({
  extractRawText: vi.fn(),
  convertToHtml: vi.fn(),
  imgElement: vi.fn(),
  imageHandler: undefined as undefined | ((image: unknown) => Promise<{ src: string; alt: string }>),
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
      value: '<p>安全正文</p><script>alert(1)</script><img src="javascript:bad" onerror="bad">',
      messages: [{ message: "render warning" }],
    });

    const result = await extractDocument(filePath);

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
      { path: filePath },
      expect.objectContaining({ includeDefaultStyleMap: true }),
    );
    expect(mammothMocks.imageHandler).toBeTypeOf("function");
    await expect(mammothMocks.imageHandler!({})).resolves.toEqual({
      src: "",
      alt: "文档图片未在文本预览中内联",
    });
  });

  it("extracts PDF text, escapes preview HTML, and always destroys the parser", async () => {
    const filePath = join(workDir, "paper.pdf");
    await writeFile(filePath, Buffer.from("fake-pdf"));
    pdfMocks.getText.mockResolvedValue({ text: "  <集合> & \"元素\" '关系'  " });

    const result = await extractDocument(filePath);

    expect(result).toEqual({
      text: "<集合> & \"元素\" '关系'",
      html: "<pre>&lt;集合&gt; &amp; &quot;元素&quot; &#39;关系&#39;</pre>",
      format: "pdf",
      warnings: [],
    });
    expect(pdfMocks.constructorArgs).toHaveLength(1);
    expect(pdfMocks.constructorArgs[0]).toMatchObject({ data: Buffer.from("fake-pdf") });
    expect(pdfMocks.destroy).toHaveBeenCalledOnce();
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

    await expect(extractDocument(filePath))
      .rejects.toThrow("该文件格式不支持服务端文本提取");
  });
});
