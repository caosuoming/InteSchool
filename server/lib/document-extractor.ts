import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import katex from "katex";
import sanitizeHtml from "sanitize-html";
import { extractDocxStructuredText } from "./docx-structured-text.js";
import { convertMathTypeDocxToOmml } from "./mathtype-docx.js";

export interface ExtractedDocument {
  text: string;
  html: string;
  format: "docx" | "pdf" | "text";
  warnings: string[];
}

export interface ExtractDocumentOptions {
  docxImageUrl?: (relationshipId: string) => string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safePreviewImageSource(value: string): string | null {
  const source = value.trim();
  if (/^\/api\/files\/[A-Za-z0-9-]+\/assets\/[A-Za-z0-9_.%-]+(?:\?officeMetafile=(?:wmf|emf))?$/.test(source)) return source;
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(source)) return source;
  return null;
}

function officeMetafileFormat(source: string): "wmf" | "emf" | null {
  const match = source.match(/[?&]officeMetafile=(wmf|emf)(?:&|$)/);
  return match?.[1] === "wmf" || match?.[1] === "emf" ? match[1] : null;
}

function renderMathAwareHtml(text: string): string {
  const renderLine = (line: string) => {
    const parts: string[] = [];
    const pattern = /\$([^$\n]+)\$|!\[([^\]]*)\]\(([^)]+)\)/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      parts.push(escapeHtml(line.slice(cursor, match.index)));
      const latex = match[1]?.trim();
      if (latex) {
        parts.push(katex.renderToString(latex, {
          throwOnError: false,
          strict: false,
          output: "htmlAndMathml",
        }));
      } else {
        const source = safePreviewImageSource(match[3] || "");
        if (source) {
          const metafile = officeMetafileFormat(source);
          const metafileAttribute = metafile ? ` data-office-metafile="${metafile}"` : "";
          parts.push(`<img src="${escapeHtml(source)}" alt="${escapeHtml(match[2] || "文档图片")}"${metafileAttribute}>`);
        } else {
          parts.push(escapeHtml(match[0]));
        }
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

export async function extractDocument(
  filePath: string,
  options: ExtractDocumentOptions = {},
): Promise<ExtractedDocument> {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".docx") {
    const data = await readFile(filePath);
    const mathType = await convertMathTypeDocxToOmml(data);
    const convertedData = mathType.buffer;
    const [raw, rendered, structuredText] = await Promise.all([
      mammoth.extractRawText({ buffer: convertedData }),
      mammoth.convertToHtml({ buffer: convertedData }, {
        includeDefaultStyleMap: true,
        convertImage: mammoth.images.imgElement(async (image) => ({
          src: `data:${image.contentType};base64,${await image.read("base64")}`,
          alt: "文档图片",
        })),
      }),
      extractDocxStructuredText(convertedData, options.docxImageUrl),
    ]);
    const text = (structuredText || raw.value.trim()).normalize("NFC");
    const hasRichContent = /\$[^$\n]+\$|!\[[^\]]*\]\([^)]+\)/.test(text);
    return {
      text,
      html: hasRichContent
        ? renderMathAwareHtml(text)
        : sanitizeHtml(rendered.value.normalize("NFC"), {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
            allowedAttributes: { a: ["href", "title"], img: ["src", "alt"] },
            allowedSchemes: ["http", "https", "data"],
          }),
      format: "docx",
      warnings: [
        ...raw.messages.map((message) => message.message),
        ...rendered.messages.map((message) => message.message),
        ...mathType.warnings,
      ],
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
