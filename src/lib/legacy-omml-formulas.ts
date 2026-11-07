const LEGACY_DOUBLE_STRUCK_PATTERN = /\\mathbb\{([CQN])\}/g;
const LEGACY_UNICODE_DELIMITER_PATTERN = /\\(left|right)([‖∥∣])/g;
const LEGACY_REDUNDANT_CASES_WRAPPER_PATTERN =
  /\\left\\\{\s*\\begin\{aligned\}\s*(\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*\\end\{aligned\}\s*\\right\./g;
const LEGACY_MALFORMED_CASES_WRAPPER_PATTERN =
  /\\left\s*(\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*\\right\./g;
const UNMARKED_CASES_PATTERN =
  /(<(code|pre|script|style)\b[^>]*>[\s\S]*?<\/\2\s*>|\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|<[^>]*>)|(\\begin\{cases\}[^<>]*?\\end\{cases\})/gi;

function recoverCaseRows(latex: string): string {
  const begin = String.raw`\begin{cases}`;
  const end = String.raw`\end{cases}`;
  const content = latex.slice(begin.length, -end.length);
  if (/\\\\|[\r\n]/.test(content)) return latex;

  const separated = content
    .replace(/[,，]\s*(?=[+-]?\d*[A-Za-z](?:_[A-Za-z0-9{}]+)?\s*=)/g, String.raw`\\`)
    .replace(/(?<=[0-9})])\s+(?=[+-]?\d*[A-Za-z][A-Za-z0-9+-]*\s*=)/g, String.raw`\\`);
  return `${begin}${separated}${end}`;
}

function wrapUnmarkedCases(text: string): string {
  if (!text.includes(String.raw`\begin{cases}`)) return text;
  return text.replace(UNMARKED_CASES_PATTERN, (match, protectedText: string | undefined, _tag: string | undefined, cases: string | undefined) => {
    if (protectedText || !cases) return match;
    return `$${recoverCaseRows(cases)}$`;
  });
}
const LEGACY_REDUNDANT_CASES_DELIMITER_PATTERN =
  /\\left\\\{\s*(\\begin\{cases\}[\s\S]*?\\end\{cases\})\s*\\right\./g;
const LEGACY_CROSSED_MATRIX_DELIMITER_PATTERN =
  /\\left\\\{\s*\\begin\{matrix\}\s*\\begin\{matrix\}([\s\S]*?)\\end\{matrix\}\s*\\right\.\s*\\end\{matrix\}/g;
const BARE_LEGACY_MATH_PATTERN =
  /\\left\\\{\s*\\begin\{matrix\}\s*\\begin\{matrix\}[\s\S]*?\\end\{matrix\}\s*\\right\.\s*\\end\{matrix\}|\\left\\\{\s*\\begin\{matrix\}[\s\S]*?\\end\{matrix\}\s*\\right\.|(?:\\left(?:\\\{)?\s*)?\\begin\{cases\}[\s\S]*?\\end\{cases\}(?:\s*\\right\.)?|[A-Za-z]\\overset\{\}\s*\\Rightarrow\s*\}[A-Za-z]|\\left\([^$\n，。；,;]*?\\right\)(?:\^\{[^{}]+\})?(?:\s*=[\w{}+-]+)?/g;

const LEGACY_ARC_VECTOR_PATTERN =
  /((?:圆弧|优弧|劣弧|弧)[^$\n]{0,12})\$(?:\\vec|\\over(?:right|left)arrow)\{([A-Za-z]{2,4})\}\$/g;

function normalizeLegacyOmmlDelimiters(latex: string): string {
  return latex.replace(
    LEGACY_UNICODE_DELIMITER_PATTERN,
    (_match, side: "left" | "right", delimiter: string) => {
      const normalizedDelimiter = delimiter === "∣" ? "|" : "\\|";
      return `\\${side}${normalizedDelimiter}`;
    },
  );
}

export function normalizeOmmlLatexStructures(latex: string): string {
  return latex
    .replace(LEGACY_CROSSED_MATRIX_DELIMITER_PATTERN,
      String.raw`\left\{\begin{matrix}$1\end{matrix}\right.`)
    .replace(LEGACY_REDUNDANT_CASES_DELIMITER_PATTERN, "$1")
    .replace(LEGACY_REDUNDANT_CASES_WRAPPER_PATTERN, "$1")
    // Some Word formulas omit the delimiter after \left. A cases environment
    // already draws its own brace, so the invalid outer wrapper can be removed.
    .replace(LEGACY_MALFORMED_CASES_WRAPPER_PATTERN, "$1")
    // Old MathType imports sometimes serialize a negated implication as an
    // incomplete overset followed by an orphan closing brace.
    .replace(/\\overset\{\}\s*\\Rightarrow\s*\}/g, String.raw`\nRightarrow `);
}

function restoreBareMath(text: string): string {
  const unmatchedDollar = text.indexOf("$");
  if (unmatchedDollar >= 0) {
    return restoreBareMath(text.slice(0, unmatchedDollar)) + text.slice(unmatchedDollar);
  }
  return text.replace(BARE_LEGACY_MATH_PATTERN,
    (source) => `$${normalizeOmmlLatexStructures(source)}$`);
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
  const normalizedLatex = normalizeOmmlLatexStructures(normalizeLegacyOmmlDelimiters(latex));
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
 * historical \mathbb label issue, older imports could also mistake an arc accent
 * for a vector, while some Word/MathType documents stored Unicode vertical
 * delimiters directly after \left/\right, which KaTeX rejects.
 */
export function normalizeLegacyOmmlMathText(text: string): string {
  const arcNormalized = text.replace(
    LEGACY_ARC_VECTOR_PATTERN,
    (_match, prefix: string, points: string) => `${prefix}$\\overgroup{${points}}$`,
  );
  const normalized = arcNormalized.replace(/(\${1,2})([\s\S]+?)\1/g, (full, delimiter: string, latex: string, offset: number) => {
    const contextStart = Math.max(0, offset - 24);
    const contextEnd = Math.min(arcNormalized.length, offset + full.length + 24);
    const surroundingText = arcNormalized.slice(contextStart, contextEnd);
    const normalized = normalizeLegacyOmmlLatex(latex, surroundingText);
    return `${delimiter}${normalized}${delimiter}`;
  });

  // Keep already-delimited formulas intact. Only recover known legacy OMML
  // structures from the intervening plain text, not arbitrary backslashes.
  return wrapUnmarkedCases(normalized.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g)
    .map((segment) => segment.startsWith("$") ? segment : restoreBareMath(segment))
    .join(""));
}
