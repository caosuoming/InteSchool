import katex from "katex";
import { normalizeLegacyOmmlMathText } from "@/lib/legacy-omml-formulas";

const ESCAPED_DOLLAR = "\uE000INTESCHOOL_DOLLAR\uE001";
const SKIP_SELECTOR = ".katex, .katex-formula, script, style, textarea";

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
  if (containsHtmlTag(normalizedContent)) {
    template.innerHTML = normalizedContent;
  } else {
    template.content.append(document.createTextNode(normalizedContent));
  }

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
    segments.push({
      type: "text",
      value: restoreEscapedDollars(protectedContent.slice(lastIndex)),
    });
  }

  return segments.length > 0
    ? segments
    : [{ type: "text", value: restoreEscapedDollars(protectedContent) }];
}

function restoreEscapedDollars(content: string): string {
  return content.split(ESCAPED_DOLLAR).join("$");
}

function containsHtmlTag(content: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(content);
}
