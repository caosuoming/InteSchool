import katex from "katex";
import sanitizeHtml from "sanitize-html";
import { normalizeLegacyOmmlMathText } from "@/lib/legacy-omml-formulas";
import {
  documentImageInlineStyle,
  parseDocumentImageDisplaySize,
} from "@/lib/office-metafile";

const ESCAPED_DOLLAR = "\uE000INTESCHOOL_DOLLAR\uE001";
const SKIP_SELECTOR = ".katex, .katex-formula, script, style, textarea";
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;
const LATEX_STRUCTURE_PATTERN = /\\[A-Za-z]+|[_^{}=<>]/;
const ESCAPED_MATH_VARIABLE_PATTERN = /&lt;i\s+class=(?:&quot;|&#34;|&#x22;|&#39;|&#x27;|&apos;)(math-(?:variable|vector))(?:&quot;|&#34;|&#x22;|&#39;|&#x27;|&apos;)&gt;([\s\S]*?)&lt;\/i&gt;/gi;
const ESCAPED_VERTICAL_SCRIPT_PATTERN = /&lt;(sub|sup)&gt;([\s\S]*?)&lt;\/\1&gt;/gi;

const SAFE_RICH_TEXT_TAGS = sanitizeHtml.defaults.allowedTags.concat([
  "img",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "math", "semantics", "annotation",
  "mrow", "mi", "mo", "mn", "ms", "mtext", "mspace",
  "msup", "msub", "msubsup", "mfrac", "msqrt", "mroot",
  "mover", "munder", "munderover", "mtable", "mtr", "mtd",
  "menclose", "mpadded", "mphantom",
]);

function sanitizeRichText(content: string): string {
  return sanitizeHtml(content, {
    allowedTags: SAFE_RICH_TEXT_TAGS,
    allowedAttributes: {
      "*": ["class", "title", "role", "aria-hidden", "data-latex"],
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      th: ["colspan", "rowspan", "scope"],
      td: ["colspan", "rowspan"],
      col: ["span"],
      math: ["xmlns", "display"],
      annotation: ["encoding"],
    },
    allowedSchemes: ["http", "https", "data"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
      img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }),
    },
  });
}

interface MathSegment {
  type: "text" | "inline" | "block";
  value: string;
}

/**
 * Converts $...$ and $$...$$ formulas in plain text or rich HTML text nodes
 * into KaTeX markup while preserving the surrounding HTML structure.
 */
export function renderMathHtml(content: string): string {
  if (!content) return "";

  const template = document.createElement("template");
  const normalizedContent = content.normalize("NFC");
  const restoredContent = restoreEscapedStructuredMathMarkup(normalizedContent);
  const htmlSafeContent = protectMathAnglesForHtmlParsing(restoredContent);
  if (containsHtmlTag(htmlSafeContent)) {
    template.innerHTML = sanitizeRichText(htmlSafeContent);
  } else {
    template.content.append(document.createTextNode(normalizedContent));
  }

  replaceMarkdownImages(template.content);
  applyDocumentImageLayouts(template.content);

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const parent = textNode.parentElement;
    if (parent?.closest(SKIP_SELECTOR)) continue;

    const normalizedText = normalizeLegacyOmmlMathText(textNode.data);
    const segments = parseMathSegments(normalizedText);
    if (!segments.some((segment) => segment.type !== "text")) {
      textNode.data = normalizedText;
      continue;
    }

    const fragment = document.createDocumentFragment();
    for (const segment of segments) {
      if (segment.type === "text") {
        fragment.append(document.createTextNode(segment.value));
        continue;
      }

      fragment.append(createFormulaElement(segment.value, segment.type === "block"));
    }
    textNode.replaceWith(fragment);
  }

  return template.innerHTML;
}

/**
 * Converts rendered formula wrappers inside an editable rich-text fragment
 * back to the compact dollar-delimited LaTeX stored by InteSchool.
 *
 * Formula placeholders are restored after reading `innerHTML` so operators
 * such as `<` remain valid LaTeX instead of being persisted as `&lt;`.
 */
export function serializeMathHtml(content: string): string {
  if (!content) return "";

  const template = document.createElement("template");
  template.innerHTML = content;
  const replacements = new Map<string, string>();

  template.content
    .querySelectorAll<HTMLElement>(".katex-formula[data-latex]")
    .forEach((formula, index) => {
      const latex = formula.dataset.latex;
      if (latex === undefined) return;

      let placeholder = `\uE000INTESCHOOL_MATH_${index}\uE001`;
      while (content.includes(placeholder) || replacements.has(placeholder)) {
        placeholder += "_";
      }
      const delimiter = formula.classList.contains("katex-formula-block") ? "$$" : "$";
      replacements.set(placeholder, `${delimiter}${latex}${delimiter}`);
      formula.replaceWith(document.createTextNode(placeholder));
    });

  let serialized = template.innerHTML;
  for (const [placeholder, formula] of replacements) {
    serialized = serialized.split(placeholder).join(formula);
  }
  return serialized.normalize("NFC");
}

function applyDocumentImageLayouts(root: DocumentFragment): void {
  const images = root.querySelectorAll<HTMLImageElement>("img");
  for (const image of images) {
    image.setAttribute("loading", "lazy");
    const source = image.getAttribute("src");
    if (source) {
      const displaySize = parseDocumentImageDisplaySize(source);
      if (displaySize) image.style.cssText = documentImageInlineStyle(displaySize);
    }
    image.style.border = "0";
  }
}

function replaceMarkdownImages(root: DocumentFragment): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    if (textNode.parentElement?.closest(SKIP_SELECTOR)) continue;
    const text = textNode.data;
    MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
    if (!MARKDOWN_IMAGE_PATTERN.test(text)) continue;

    MARKDOWN_IMAGE_PATTERN.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = MARKDOWN_IMAGE_PATTERN.exec(text)) !== null) {
      if (match.index > cursor) {
        fragment.append(document.createTextNode(text.slice(cursor, match.index)));
      }
      const source = safeImageSource(match[2]);
      if (!source) {
        fragment.append(document.createTextNode(match[0]));
      } else {
        const image = document.createElement("img");
        image.src = source;
        image.alt = match[1] || "题目图片";
        fragment.append(image);
      }
      cursor = MARKDOWN_IMAGE_PATTERN.lastIndex;
    }
    if (cursor < text.length) {
      fragment.append(document.createTextNode(text.slice(cursor)));
    }
    textNode.replaceWith(fragment);
  }
}

function safeImageSource(value: string): string | null {
  const source = value.trim();
  if (/^(?:https?:\/\/|data:image\/[a-z0-9.+-]+;base64,|\/)/i.test(source)) {
    return source;
  }
  return null;
}

export function containsMathDelimiter(content: string): boolean {
  return parseMathSegments(content).some((segment) => segment.type !== "text");
}

function createFormulaElement(latex: string, displayMode: boolean): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = displayMode
    ? "katex-formula katex-formula-block block my-1 overflow-x-auto text-center"
    : "katex-formula";
  wrapper.dataset.latex = latex;
  wrapper.contentEditable = "false";
  wrapper.title = latex;
  wrapper.innerHTML = katex.renderToString(latex, {
    throwOnError: false,
    displayMode,
    output: "html",
    strict: false,
  });
  return wrapper;
}

function parseMathSegments(content: string): MathSegment[] {
  if (!content) return [{ type: "text", value: "" }];

  const protectedContent = content.replace(/\\\$/g, ESCAPED_DOLLAR);
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  const segments: MathSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(protectedContent)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        value: restoreEscapedDollars(protectedContent.slice(lastIndex, match.index)),
      });
    }

    const blockLatex = match[1];
    const inlineLatex = match[2];
    const latex = restoreEscapedDollars((blockLatex ?? inlineLatex ?? "").trim());
    if (!latex) {
      segments.push({ type: "text", value: restoreEscapedDollars(match[0]) });
    } else {
      segments.push({
        type: blockLatex !== undefined ? "block" : "inline",
        value: latex,
      });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < protectedContent.length) {
    appendTrailingSegments(segments, protectedContent.slice(lastIndex));
  }

  return segments.length > 0
    ? segments
    : [{ type: "text", value: restoreEscapedDollars(protectedContent) }];
}

function appendTrailingSegments(segments: MathSegment[], trailing: string): void {
  const delimiterIndex = trailing.indexOf("$");
  if (delimiterIndex < 0) {
    segments.push({ type: "text", value: restoreEscapedDollars(trailing) });
    return;
  }

  const isBlock = trailing.startsWith("$$", delimiterIndex);
  const delimiterLength = isBlock ? 2 : 1;
  const latex = restoreEscapedDollars(trailing.slice(delimiterIndex + delimiterLength)).trim();

  if (!isLikelyUnclosedLatex(latex)) {
    segments.push({ type: "text", value: restoreEscapedDollars(trailing) });
    return;
  }

  if (delimiterIndex > 0) {
    segments.push({
      type: "text",
      value: restoreEscapedDollars(trailing.slice(0, delimiterIndex)),
    });
  }
  segments.push({ type: isBlock ? "block" : "inline", value: latex });
}

function isLikelyUnclosedLatex(value: string): boolean {
  if (!value || !LATEX_STRUCTURE_PATTERN.test(value)) return false;

  try {
    katex.renderToString(value, {
      throwOnError: true,
      displayMode: false,
      output: "html",
      strict: false,
    });
    return true;
  } catch {
    return false;
  }
}

function restoreEscapedDollars(content: string): string {
  return content.split(ESCAPED_DOLLAR).join("$");
}

function restoreEscapedStructuredMathMarkup(content: string): string {
  let restored = content.replace(
    ESCAPED_MATH_VARIABLE_PATTERN,
    (_match, className: string, value: string) => `<i class="${className}">${value}</i>`,
  );

  // Script markers may wrap an escaped math-variable marker, so restore them
  // after the inner variable element and allow one extra pass for nesting.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = restored.replace(
      ESCAPED_VERTICAL_SCRIPT_PATTERN,
      (_match, tag: string, value: string) => `<${tag}>${value}</${tag}>`,
    );
    if (next === restored) break;
    restored = next;
  }

  return restored;
}

function protectMathAnglesForHtmlParsing(content: string): string {
  return content.replace(
    /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g,
    (_match, blockLatex: string | undefined, inlineLatex: string | undefined) => {
      const latex = blockLatex ?? inlineLatex ?? "";
      const protectedLatex = latex.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return blockLatex !== undefined
        ? `$$${protectedLatex}$$`
        : `$${protectedLatex}$`;
    },
  );
}

function containsHtmlTag(content: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(content);
}
