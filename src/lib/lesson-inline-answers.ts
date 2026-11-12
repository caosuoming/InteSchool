/** Underlined DOCX text is an answer; empty underline runs are just blanks. */
const UNDERLINED_RUNS = /<u\b[^>]*>[\s\S]*?<\/u>(?:<u\b[^>]*>[\s\S]*?<\/u>)*/gi;
const MATH_BETWEEN_BLANKS = /[_＿]{2,}[ \t]*(?:<u\b[^>]*>)?\$\$?[^$\r\n]+\$\$?(?:<\/u>)?[ \t]*[_＿]{2,}/gi;
// Word often underlines a complete interval answer as several separate runs.
// MathType formulas between the runs may not inherit Word's underline style.
const MATH_ANSWER_TOKEN = String.raw`(?:\$\$?[^$\r\n]+\$\$?|<u\b[^>]*>[^\r\n]*?<\/u>)`;
const COMPOSITE_MATH_BETWEEN_BLANKS = new RegExp(
  String.raw`[_＿]{2,}[ \t]*(?:${MATH_ANSWER_TOKEN}[ \t]*(?:[_＿]{2,}[ \t]*)?){2,}[_＿]{2,}`,
  "gi",
);
const INLINE_ANSWER_RUNS = new RegExp(`${COMPOSITE_MATH_BETWEEN_BLANKS.source}|${MATH_BETWEEN_BLANKS.source}|${UNDERLINED_RUNS.source}`, "gi");
const KNOWLEDGE_BLANK = /<span class="knowledge-answer-blank" data-answer-index="(\d+)">_{4,}<\/span>/g;

export function extractUnderlinedAnswers(content: string, knowledge = false): {
  content: string;
  answers: string[];
} {
  const answers: string[] = [];
  const cleaned = content.replace(INLINE_ANSWER_RUNS, (match) => {
    if (/^[_＿]{2,}/.test(match)) {
      const tokens = [...match.matchAll(new RegExp(MATH_ANSWER_TOKEN, "gi"))].map(([token]) =>
        token.replace(/<\/?u\b[^>]*>/gi, "").trim(),
      );
      if (tokens.length > 1) {
        answers.push(tokens.join(" "));
        return knowledge
          ? `<span class="knowledge-answer-blank" data-answer-index="${answers.length}">____</span>`
          : "____";
      }
    }
    if (!match.startsWith("<")) {
      const formula = match.match(/\$\$?[^$\r\n]+\$\$?/);
      if (formula) {
        answers.push(formula[0]);
        return knowledge
          ? `<span class="knowledge-answer-blank" data-answer-index="${answers.length}">____</span>`
          : "____";
      }
    }
    const text = match.replace(/<\/?u\b[^>]*>/gi, "");
    const plain = text.replace(/<\/?[A-Za-z][^>]*>/g, "").trim();
    if (!plain || /^[_＿\s]+$/.test(plain)) return match.replace(/<\/?u\b[^>]*>/gi, "");
    answers.push(text.trim());
    return knowledge
      ? `<span class="knowledge-answer-blank" data-answer-index="${answers.length}">____</span>`
      : "____";
  });
  return { content: cleaned, answers };
}

export function extractParenthesizedChoiceAnswer(stem: string, type: "single" | "multiple"): {
  stem: string;
  answer?: string;
} {
  const pattern = /([（(])\s*(?:<u\b[^>]*>\s*)?(?:\$(?:\\(?:mathrm|mathit|mathbf)\{)?)?([A-Da-d]{1,4})(?:\}\$|\$)?(?:\s*<\/u>)?\s*([）)])/g;
  const matches = [...stem.matchAll(pattern)];
  for (const match of matches.reverse()) {
    const letters = match[2].toUpperCase();
    if (new Set(letters).size !== letters.length) continue;
    if (type === "single" && letters.length !== 1) continue;
    // Diagrams are often emitted after the answer parenthesis, even though
    // they are visually floated beside the stem in the original Word file.
    const trailing = stem.slice(match.index! + match[0].length)
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      // A Word diagram's “（第6题）” / “（第10题答）” caption
      // can appear after the answer parentheses in extraction order.
      .replace(/[（(]第\s*\d+\s*题(?:答)?[）)]/g, "");
    if (!/^[\s\u3000.,。．!?！？]*$/.test(trailing)) continue;
    return {
      stem: `${stem.slice(0, match.index!)}${match[1]}    ${match[3]}${stem.slice(match.index! + match[0].length)}`,
      answer: letters,
    };
  }
  return { stem };
}

function escapeAnswerHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderKnowledgeInlineAnswers(content: string, answers: string[]): string {
  return content.replace(KNOWLEDGE_BLANK, (match, index: string) => {
    const answer = answers[Number(index) - 1];
    return answer
      ? `<span class="lesson-inline-answer" data-answer-step="${index}">${escapeAnswerHtml(answer)}</span>`
      : match;
  });
}

export function inlineAnswerAnimationOrders(content: string): number[] {
  return [...content.matchAll(/class="lesson-inline-answer" data-answer-step="(\d+)"/g)]
    .map((match) => Number(match[1]))
    .filter((step) => Number.isSafeInteger(step) && step > 0);
}
