interface QuestionMathFields {
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  summary?: string;
  board?: string;
}

const LEGACY_MEAN_VECTOR_PATTERN =
  /(?:样本均值|均值|平均值|平均数)\s*(?:为|是|记为|记作)?\s*\$\\vec\{([A-Za-z])\}\$/g;

function meanVariables(stem: string): Set<string> {
  const variables = new Set<string>();
  for (const match of stem.matchAll(LEGACY_MEAN_VECTOR_PATTERN)) {
    variables.add(match[1]);
  }
  return variables;
}

function replaceLegacyMeanVectors(text: string, variables: Set<string>): string {
  let normalized = text;
  for (const variable of variables) {
    normalized = normalized.split(`\\vec{${variable}}`).join(`\\bar{${variable}}`);
  }
  return normalized;
}

/**
 * Repairs questions extracted before the OMML overbar fix. The old converter
 * treated an unrecognized Word overline accent as a vector arrow. Only repair
 * a variable when the stem explicitly labels that same symbol as a mean, so
 * genuine vector notation remains untouched.
 */
export function normalizeLegacyQuestionMeanNotation<T extends QuestionMathFields>(question: T): T {
  const variables = meanVariables(question.stem);
  if (variables.size === 0) return question;

  return {
    ...question,
    stem: replaceLegacyMeanVectors(question.stem, variables),
    options: question.options?.map((option) => replaceLegacyMeanVectors(option, variables)),
    answer: replaceLegacyMeanVectors(question.answer, variables),
    analysis: replaceLegacyMeanVectors(question.analysis, variables),
    summary: question.summary
      ? replaceLegacyMeanVectors(question.summary, variables)
      : question.summary,
    board: question.board
      ? replaceLegacyMeanVectors(question.board, variables)
      : question.board,
  };
}
