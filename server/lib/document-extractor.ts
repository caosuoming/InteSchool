import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import katex from "katex";
import sanitizeHtml from "sanitize-html";
import { extractDocxStructuredText } from "./docx-structured-text.js";

export interface ExtractedDocument {
  text: string;
  html: string;
  format: "docx" | "pdf" | "text";
  warnings: string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMathAwareHtml(text: string): string {
  const renderLine = (line: string) => {
    const parts: string[] = [];
    const pattern = /\$([^$\n]+)\$/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      parts.push(escapeHtml(line.slice(cursor, match.index)));
      const latex = match[1].trim();
      if (latex) {
        parts.push(katex.renderToString(latex, {
          throwOnError: false,
          strict: false,
          output: "htmlAndMathml",
        }));
      }
      cursor = pattern.lastIndex;
    }
    parts.push(escapeHtml(line.slice(cursor)));
    return parts.join("");
  };

  return text.split("\n")
    .map((line) => `<p>${line ? renderLine(line) : "<br>"}</p>`)
    .join("");
}

export async function extractDocument(filePath: string): Promise<ExtractedDocument> {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".docx") {
    const data = await readFile(filePath);
    const [raw, rendered, structuredText] = await Promise.all([
      mammoth.extractRawText({ path: filePath }),
      mammoth.convertToHtml({ path: filePath }, {
        includeDefaultStyleMap: true,
        convertImage: mammoth.images.imgElement(async () => ({
          src: "",
          alt: "文档图片未在文本预览中内联",
        })),
      }),
      extractDocxStructuredText(data),
    ]);
    const text = structuredText || raw.value.trim();
    const hasMath = /\$[^$\n]+\$/.test(text);
    return {
      text,
      html: hasMath
        ? renderMathAwareHtml(text)
        : sanitizeHtml(rendered.value, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
            allowedAttributes: { a: ["href", "title"], img: ["src", "alt"] },
            allowedSchemes: ["http", "https", "data"],
          }),
      format: "docx",
      warnings: [...raw.messages, ...rendered.messages].map((message) => message.message),
    };
  }

  if (extension === ".pdf") {
    const data = await readFile(filePath);
    const parser = new PDFParse({ data });
    try {
      const result = await parser.getText();
      const text = result.text.trim();
      return {
        text,
        html: `<pre>${escapeHtml(text)}</pre>`,
        format: "pdf",
        warnings: [],
      };
    } finally {
      await parser.destroy();
    }
  }

  if ([".txt", ".md"].includes(extension)) {
    const text = (await readFile(filePath, "utf8")).trim();
    return {
      text,
      html: `<pre>${escapeHtml(text)}</pre>`,
      format: "text",
      warnings: [],
    };
  }

  throw new Error("该文件格式不支持服务端文本提取");
}
