const MIN_BLANK_LENGTH = 4;
const MAX_BLANK_LENGTH = 32;

const PROTECTED_TOKEN_PATTERN = /\$((?:[^$]|[\r\n])*?)\$|!\[[^\]]*\]\([^)]+\)|<[^>]+>/g;
const ANSWER_PLACEHOLDERS = new Set([
  "",
  "略",
  "待教师补充",
  "待补充",
  "未知",
]);

function clampBlankLength(length: number): number {
  return Math.max(MIN_BLANK_LENGTH, Math.min(MAX_BLANK_LENGTH, length));
}

function visibleAnswerWidth(answer?: string): number {
  if (!answer) return MIN_BLANK_LENGTH;

  const plain = answer
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\$([^$]*)\$/g, "$1")
    .replace(/\\[A-Za-z]+/g, "")
    .replace(/[{}^]/g, "")
    .trim();

  if (ANSWER_PLACEHOLDERS.has(plain)) return MIN_BLANK_LENGTH;

  let width = 0;
  for (const character of Array.from(plain)) {
    if (/\s/.test(character)) continue;
    width += character.charCodeAt(0) > 0xff ? 2 : 1;
  }
  return clampBlankLength(width);
}

function splitAnswerParts(answer: string | undefined, blankCount: number): string[] {
  if (!answer || blankCount <= 1) return Array(blankCount).fill(answer || "");

  const byStrongSeparator = answer
    .split(/\s*(?:[；;]|\r?\n)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (byStrongSeparator.length === blankCount) return byStrongSeparator;

  const byCommonSeparator = answer
    .split(/\s*[，、]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (byCommonSeparator.length === blankCount) return byCommonSeparator;

  return Array(blankCount).fill(answer);
}

function protectRichContent(text: string): {
  text: string;
  restore: (value: string) => string;
} {
  const protectedParts: string[] = [];
  const protectedText = text.replace(PROTECTED_TOKEN_PATTERN, (match) => {
    const index = protectedParts.push(match) - 1;
    return `\uE200${index}\uE201`;
  });

  return {
    text: protectedText,
    restore: (value: string) => value.replace(
      /\uE200(\d+)\uE201/g,
      (_match, index: string) => protectedParts[Number(index)] || "",
    ),
  };
}

function whitespaceWidth(value: string): number {
  let width = 0;
  for (const character of Array.from(value)) {
    if (character === "\t") {
      width += 4;
    } else if (character === "\u3000") {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function insertInferredBlank(text: string, blank: string): string {
  const emptyParentheses = /([（(])\s*([）)])/;
  if (emptyParentheses.test(text)) {
    return text.replace(emptyParentheses, (_match, left: string, right: string) => (
      `${left}${blank}${right}`
    ));
  }

  const beforeTerminal = "(?=[。．.，,；;、!?！？）)]|$)";
  const emptyAssignment = new RegExp(`([=＝])\\s*${beforeTerminal}`);
  if (emptyAssignment.test(text)) {
    return text.replace(emptyAssignment, (_match, operator: string) => `${operator}${blank}`);
  }

  const fillCue = new RegExp(
    `((?:应|需)?(?:填|填写)|(?:答案|结果|值|实数|个数|数量)?(?:为|是|等于))\\s*${beforeTerminal}`,
  );
  if (fillCue.test(text)) {
    return text.replace(fillCue, (_match, cue: string) => `${cue}${blank}`);
  }

  const trailingPunctuation = /([。．.，,；;!?！？])\s*$/;
  if (trailingPunctuation.test(text)) {
    return text.replace(trailingPunctuation, `${blank}$1`);
  }

  return `${text.trimEnd()} ${blank}`;
}

/**
 * Ensure a fill-in-the-blank stem exposes an answer area.
 *
 * Existing underline runs are preserved and extended to fit the answer.
 * Runs of at least three spaces/tabs are treated as omitted underline areas.
 * If neither exists, a conservative location heuristic inserts a blank near
 * empty parentheses, an assignment, a fill cue, or the sentence ending.
 */
export function ensureFillBlankAnswerArea(stem: string, answer?: string): string {
  if (!stem) return stem;

  const protectedContent = protectRichContent(stem);
  const candidatePattern = /(?:[_＿]{2,}|[ \t\u3000]{3,})/g;
  const candidates = [...protectedContent.text.matchAll(candidatePattern)];

  if (candidates.length > 0) {
    const answerParts = splitAnswerParts(answer, candidates.length);
    let index = 0;
    const normalized = protectedContent.text.replace(candidatePattern, (candidate) => {
      const answerWidth = visibleAnswerWidth(answerParts[index]);
      index += 1;
      const existingWidth = /^[_＿]+$/.test(candidate)
        ? candidate.length
        : whitespaceWidth(candidate);
      return "_".repeat(clampBlankLength(Math.max(existingWidth, answerWidth)));
    });
    return protectedContent.restore(normalized);
  }

  const blank = "_".repeat(visibleAnswerWidth(answer));
  return protectedContent.restore(insertInferredBlank(protectedContent.text, blank));
}

export function hasFillBlankAnswerArea(stem: string): boolean {
  const { text } = protectRichContent(stem);
  return /[_＿]{2,}|[ \t\u3000]{3,}/.test(text);
}
