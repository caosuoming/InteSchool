const LEGACY_DOUBLE_STRUCK_PATTERN = /\\mathbb\{([CQN])\}/g;
const LEGACY_UNICODE_DELIMITER_PATTERN = /\\(left|right)([‖∥∣])/g;
const LEGACY_REDUNDANT_CASES_WRAPPER_PATTERN =
  /\\left\\\{\s*\\begin\{aligned\}\s*(\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*\\end\{aligned\}\s*\\right\./g;

function normalizeLegacyOmmlDelimiters(latex: string): string {
  return latex.replace(
    LEGACY_UNICODE_DELIMITER_PATTERN,
    (_match, side: "left" | "right", delimiter: string) => {
      const normalizedDelimiter = delimiter === "∣" ? "|" : "\\|";
      return `\\${side}${normalizedDelimiter}`;
    },
  );
}

function normalizeLegacyOmmlStructures(latex: string): string {
  return latex.replace(LEGACY_REDUNDANT_CASES_WRAPPER_PATTERN, "$1");
}

const LABEL_CONTEXT_PATTERN =
  /(?:点|曲线|圆|椭圆|双曲线|抛物线|直线|平面|焦点|交点|端点|顶点|轨迹)/;

const SET_CONTEXT_PATTERNS: Record<"C" | "Q" | "N", RegExp> = {
  C: /复数(?:集|域)?/,
  Q: /有理数(?:集)?/,
  N: /(?:自然数|正整数)(?:集)?/,
};

function isSetUsage(
  latex: string,
  matchIndex: number,
  matchLength: number,
  letter: "C" | "Q" | "N",
  surroundingText: string,
): boolean {
  if (SET_CONTEXT_PATTERNS[letter].test(surroundingText)) return true;

  const before = latex.slice(Math.max(0, matchIndex - 32), matchIndex);
  const after = latex.slice(matchIndex + matchLength, matchIndex + matchLength + 32);

  if (/\\(?:notin|in|subset(?:eq)?|supset(?:eq)?|to)\s*$/.test(before)) return true;
  if (/^\s*\\(?:cup|cap|setminus|times|to)\b/.test(after)) return true;

  return false;
}

function isLabelUsage(
  latex: string,
  matchIndex: number,
  matchLength: number,
  surroundingText: string,
): boolean {
  const after = latex.slice(matchIndex + matchLength);
  if (/^\s*[_^]/.test(after)) return true;
  if (LABEL_CONTEXT_PATTERN.test(surroundingText)) return true;

  const pointListPattern = /(?:^|[^A-Za-z])(?:[A-Z]|\\mathbb\{[CQN]\})\s*[,，]\s*(?:[A-Z]|\\mathbb\{[CQN]\})(?:[^A-Za-z]|$)/;
  return pointListPattern.test(latex);
}

export function normalizeLegacyOmmlLatex(latex: string, surroundingText: string): string {
  const normalizedLatex = normalizeLegacyOmmlStructures(normalizeLegacyOmmlDelimiters(latex));
  return normalizedLatex.replace(
    LEGACY_DOUBLE_STRUCK_PATTERN,
    (match, letter: "C" | "Q" | "N", offset: number) => {
      if (isSetUsage(normalizedLatex, offset, match.length, letter, surroundingText)) return match;
      if (isLabelUsage(normalizedLatex, offset, match.length, surroundingText)) return letter;
      return match;
    },
  );
}

/**
 * Repairs formulas already persisted by older OMML converters. Besides the
 * historical \mathbb label issue, some Word/MathType documents stored Unicode
 * vertical delimiters directly after \left/\right, which KaTeX rejects.
 */
export function normalizeLegacyOmmlMathText(text: string): string {
  if (
    !text.includes("\\mathbb")
    && !/\\(?:left|right)[‖∥∣]/.test(text)
    && !(text.includes("\\left\\{") && text.includes("\\begin{cases}"))
  ) return text;

  return text.replace(/(\${1,2})([\s\S]+?)\1/g, (full, delimiter: string, latex: string, offset: number) => {
    const contextStart = Math.max(0, offset - 24);
    const contextEnd = Math.min(text.length, offset + full.length + 24);
    const surroundingText = text.slice(contextStart, contextEnd);
    const normalized = normalizeLegacyOmmlLatex(latex, surroundingText);
    return `${delimiter}${normalized}${delimiter}`;
  });
}
