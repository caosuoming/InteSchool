import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import katex from "katex";
import sanitizeHtml from "sanitize-html";
import { extractDocxStructuredText } from "./docx-structured-text.js";
import { convertMathTypeDocxToOmml } from "./mathtype-docx.js";
import {
  documentImageInlineStyle,
  officeMetafileInlineStyle,
  parseDocumentImageDisplaySize,
  parseOfficeMetafileDisplaySize,
  parseOfficeMetafileLayout,
  type OfficeMetafileLayout,
} from "../../src/lib/office-metafile.js";
import {
  parseDocumentTable,
  serializeDocumentTable,
  splitDocumentTableSegments,
} from "../../src/lib/document-table.js";

export interface ExtractedDocument {
  text: string;
  html: string;
  format: "docx" | "pdf" | "text";
  warnings: string[];
}

export interface ExtractDocumentOptions {
  docxImageUrl?: (relationshipId: string) => string;
  includeHtml?: boolean;
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
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(source))
    return source;
  try {
    const url = new URL(source, "https://inteschool.invalid");
    if (url.origin !== "https://inteschool.invalid") return null;
    if (
      !/^\/api\/files\/[A-Za-z0-9-]+\/assets\/[A-Za-z0-9_.%-]+$/.test(
        url.pathname,
      )
    )
      return null;
    const allowedParameters = new Set([
      "officeMetafile",
      "officeWidth",
      "officeHeight",
    ]);
    if ([...url.searchParams.keys()].some((key) => !allowedParameters.has(key)))
      return null;
    const hasWidth = url.searchParams.has("officeWidth");
    const hasHeight = url.searchParams.has("officeHeight");
    const displaySize = parseOfficeMetafileDisplaySize(
      url.searchParams.get("officeWidth"),
      url.searchParams.get("officeHeight"),
    );
    if (hasWidth || hasHeight) {
      if (!hasWidth || !hasHeight || !displaySize) return null;
    }
    const format = url.searchParams.get("officeMetafile");
    if (format && format !== "wmf" && format !== "emf") return null;
    return source;
  } catch {
    return null;
  }
}

function officeMetafileAttributes(layout: OfficeMetafileLayout): string {
  const dimensions = layout.width && layout.height
    ? ` data-office-width="${layout.width}" data-office-height="${layout.height}"`
    : "";
  return ` data-office-metafile="${layout.format}"${dimensions} style="${officeMetafileInlineStyle(layout)}" class="office-metafile-image"`;
}

function documentImageAttributes(source: string): string {
  const metafile = parseOfficeMetafileLayout(source);
  if (metafile) return officeMetafileAttributes(metafile);

  const displaySize = parseDocumentImageDisplaySize(source);
  const dimensions = displaySize
    ? ` data-office-width="${displaySize.width}" data-office-height="${displaySize.height}"`
    : "";
  return `${dimensions} style="${documentImageInlineStyle(displaySize)}" class="office-document-image"`;
}

const HANDLED_MAMMOTH_WARNING_PATTERNS = [
  /^An unrecognised element was ignored: \{http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/math\}oMath(?:Para)?$/,
  /^Unrecognised paragraph style:/,
];

function documentPreviewWarnings(
  messages: Array<{ message: string }>,
  structuredPreviewAvailable: boolean,
): string[] {
  return [
    ...new Set(messages.map(({ message }) => message.trim()).filter(Boolean)),
  ].filter(
    (message) =>
      !(
        structuredPreviewAvailable &&
        HANDLED_MAMMOTH_WARNING_PATTERNS.some((pattern) =>
          pattern.test(message),
        )
      ),
  );
}

function renderMathAwareHtml(text: string): string {
  const renderLine = (line: string): string => {
    const structuredRuns: string[] = [];
    const protectedLine = line.replace(
      /<(sup|sub)>(.*?)<\/\1>|<i\s+class=["']math-variable["']>(.*?)<\/i>/gi,
      (_match, tag: string | undefined, scriptContent: string | undefined, variableContent: string | undefined) => {
        const markup = tag
          ? `<${tag.toLowerCase()}>${renderLine(scriptContent || "")}</${tag.toLowerCase()}>`
          : `<i class="math-variable">${renderLine(variableContent || "")}</i>`;
        const index = structuredRuns.push(markup) - 1;
        return `\uE100${index}\uE101`;
      },
    );
    const parts: string[] = [];
    const pattern = /\$([^$\n]+)\$|!\[([^\]]*)\]\(([^)]+)\)/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(protectedLine)) !== null) {
      parts.push(escapeHtml(protectedLine.slice(cursor, match.index)));
      const latex = match[1]?.trim();
      if (latex) {
        parts.push(
          katex.renderToString(latex, {
            throwOnError: false,
            strict: false,
            output: "htmlAndMathml",
          }),
        );
      } else {
        const source = safePreviewImageSource(match[3] || "");
        if (source) {
          parts.push(
            `<img src="${escapeHtml(source)}" alt="${escapeHtml(match[2] || "文档图片")}"${documentImageAttributes(source)}>`,
          );
        } else {
          parts.push(escapeHtml(match[0]));
        }
      }
      cursor = pattern.lastIndex;
    }
    parts.push(escapeHtml(protectedLine.slice(cursor)));
    return parts.join("").replace(/\uE100(\d+)\uE101/g, (_match, index: string) =>
      structuredRuns[Number(index)] || ""
    );
  };

  return splitDocumentTableSegments(text)
    .map((segment) => {
      if (segment.type === "table") {
        return serializeDocumentTable(
          parseDocumentTable(segment.value),
          (content) => renderLine(content).replace(/\n/g, "<br>"),
        );
      }
      return segment.value
        .split("\n")
        .map((line) => `<p>${line ? renderLine(line) : "<br>"}</p>`)
        .join("");
    })
    .join("");
}

export async function extractDocument(
  filePath: string,
  options: ExtractDocumentOptions = {},
): Promise<ExtractedDocument> {
  const extension = extname(filePath).toLowerCase();
  const includeHtml = options.includeHtml !== false;
  if (extension === ".docx") {
    const data = await readFile(filePath);
    const mathType = await convertMathTypeDocxToOmml(data);
    const convertedData = mathType.buffer;
    if (!includeHtml) {
      const structuredText = await extractDocxStructuredText(convertedData, options.docxImageUrl);
      const raw = structuredText
        ? { value: "", messages: [] as Array<{ message: string }> }
        : await mammoth.extractRawText({ buffer: convertedData });
      const text = (structuredText || raw.value.trim()).normalize("NFC");
      return {
        text,
        html: "",
        format: "docx",
        warnings: [
          ...new Set([
            ...raw.messages.map(({ message }) => message.trim()).filter(Boolean),
            ...mathType.warnings,
          ]),
        ],
      };
    }
    const [raw, rendered, structuredText] = await Promise.all([
      mammoth.extractRawText({ buffer: convertedData }),
      mammoth.convertToHtml(
        { buffer: convertedData },
        {
          includeDefaultStyleMap: true,
          convertImage: mammoth.images.imgElement(async (image) => ({
            src: `data:${image.contentType};base64,${await image.read("base64")}`,
            alt: "文档图片",
          })),
        },
      ),
      extractDocxStructuredText(convertedData, options.docxImageUrl),
    ]);
    const text = (structuredText || raw.value.trim()).normalize("NFC");
    const hasRichContent = /\$[^$\n]+\$|!\[[^\]]*\]\([^)]+\)|<(?:sup|sub)>|<i\s+class=["']math-variable["']>|<table\b[^>]*\bdocument-table\b/i.test(text);
    const mammothWarnings = documentPreviewWarnings(
      [...raw.messages, ...rendered.messages],
      hasRichContent,
    );
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
      warnings: [...new Set([...mammothWarnings, ...mathType.warnings])],
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
        html: includeHtml ? `<pre>${escapeHtml(text)}</pre>` : "",
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
      html: includeHtml ? `<pre>${escapeHtml(text)}</pre>` : "",
      format: "text",
      warnings: [],
    };
  }

  throw new Error("该文件格式不支持服务端文本提取");
}
