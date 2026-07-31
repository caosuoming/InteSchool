import katex from "katex";
import { normalizeLegacyOmmlMathText } from "./legacy-omml-formulas";

const TOKEN_PATTERN = /\$((?:[^$]|[\r\n])*?)\$|!\[([^\]]*)\]\(([^)]+)\)/g;
const PLACEHOLDER_PATTERN = /\uE000(\d+)\uE001/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string): string {
  const textarea = document.createElement("textarea");
  let decoded = value.normalize("NFC");

  // Stored document text may be escaped more than once. Decode a bounded
  // number of times, then escape plain text again before returning HTML.
  for (let pass = 0; pass < 2; pass += 1) {
    textarea.innerHTML = decoded;
    const next = textarea.value;
    if (next === decoded) break;
    decoded = next;
  }

  return decoded.normalize("NFC");
}

function renderFormula(latex: string): string {
  const normalized = latex.trim().normalize("NFC");
  if (!normalized) return "";

  try {
    const formulaHtml = katex.renderToString(normalized, {
      throwOnError: false,
      displayMode: false,
      output: "htmlAndMathml",
      strict: false,
    });
    return `<span class="formula-inline" style="display: inline-flex; margin: 0 2px; vertical-align: 0.1em;">${formulaHtml}</span>`;
  } catch {
    return `<span class="font-mono text-ink-600">${escapeHtml(normalized)}</span>`;
  }
}

function safeImageSource(source: string): string | null {
  const trimmed = source.trim();
  if (/^(?:https?:|data:image\/|blob:|\/)/i.test(trimmed)) return trimmed;
  return null;
}

function officeMetafileAttribute(source: string): string {
  const match = source.match(/[?&]officeMetafile=(wmf|emf)(?:&|$)/);
  return match ? ` data-office-metafile="${match[1]}"` : "";
}

function renderImage(alt: string, source: string): string {
  const safeSource = safeImageSource(source);
  if (!safeSource) return escapeHtml(`![${alt}](${source})`);
  return `<img src="${escapeHtml(safeSource)}" alt="${escapeHtml(alt)}"${officeMetafileAttribute(safeSource)} class="max-w-full h-auto rounded-lg border border-ink-200" />`;
}

function renderTextWithKeywords(text: string, keywords: string[]): string {
  if (!keywords.length) return escapeHtml(text);

  const escapedKeywords = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
    .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escapedKeywords.length) return escapeHtml(text);

  const lineStartPattern = new RegExp(
    `^([\\s]*)(?:(${escapedKeywords.join("|")})([\\s]*[\\d一二三四五六七八九十]+[、．.）)]?)?)`,
  );

  return text.split(/(\r?\n)/).map((line) => {
    if (line === "\n" || line === "\r\n") return line;
    const match = lineStartPattern.exec(line);
    if (!match) return escapeHtml(line);

    const leadingSpaces = match[1] || "";
    const keyword = match[2] || "";
    const numbering = match[3] || "";
    const remaining = line.slice(match[0].length);
    return [
      escapeHtml(leadingSpaces),
      keyword
        ? `<span class="bg-ink-700 text-white px-0.5 py-0 rounded text-xs">${escapeHtml(keyword + numbering)}</span>`
        : "",
      escapeHtml(remaining),
    ].join("");
  }).join("");
}

/**
 * Render extracted document text while preserving formulas and optional
 * line-start keyword highlighting. Formula/image HTML is protected before
 * plain-text escaping, avoiding the fragile DOM round trip used previously.
 */
export function renderExtractText(
  text: string,
  keywords: string[] = [],
  highlightEnabled = true,
): string {
  if (!text) return "";

  const protectedHtml: string[] = [];
  const reserve = (html: string): string => {
    const index = protectedHtml.push(html) - 1;
    return `\uE000${index}\uE001`;
  };

  const decoded = normalizeLegacyOmmlMathText(decodeHtmlEntities(text));
  const protectedText = decoded.replace(
    TOKEN_PATTERN,
    (_match, latex: string | undefined, alt: string | undefined, source: string | undefined) => {
      if (latex !== undefined) return reserve(renderFormula(latex));
      return reserve(renderImage(alt || "", source || ""));
    },
  );

  const renderedText = highlightEnabled
    ? renderTextWithKeywords(protectedText, keywords)
    : escapeHtml(protectedText);

  return renderedText.replace(PLACEHOLDER_PATTERN, (_match, index: string) => {
    return protectedHtml[Number(index)] || "";
  });
}
