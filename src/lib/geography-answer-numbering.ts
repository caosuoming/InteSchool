/**
 * Geography choice groups retain multiple printed question numbers even though
 * they are stored as a single question. Keep their answer labels aligned with
 * those numbers and use the same "n." style as the visible stem.
 */
const answerLabel = /(?:[（(][ \t]*([\d０-９]{1,4})[ \t]*[）)]|(^|[\s>])([\d０-９]{1,4})[ \t]*[.．、](?![\d０-９]))[ \t]*/gm;

export function geographyAnswerLabelNumbers(field: string): number[] {
  return [...field.matchAll(answerLabel)]
    .map((match) => Number((match[1] || match[3]).normalize("NFKC")));
}

/** Only rewrite recognizable numbered answer labels, never arbitrary prose. */
export function rewriteGeographyAnswerLabels(
  field: string,
  numberForLabel: (original: number, index: number) => number | undefined,
): string {
  let index = 0;
  return field.replace(answerLabel, (match, parenthesized: string | undefined, prefix: string | undefined, dotted: string | undefined) => {
    const original = Number((parenthesized || dotted).normalize("NFKC"));
    const replacement = numberForLabel(original, index++);
    return replacement === undefined ? match : `${prefix || ""}${replacement}. `;
  });
}

export function alignGeographyGroupAnswerNumbers(stem: string, field: string, displayedNumbers?: readonly number[]): string {
  const plainStem = stem
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const numbers = displayedNumbers || [...plainStem.matchAll(/^\s*([\d０-９]{1,4})\s*[.．、]\s*\S/gm)]
    .map((match) => Number(match[1].normalize("NFKC")));
  if (numbers.length < 2 || numbers.some((number, index) => (
    index > 0 && number !== numbers[index - 1] + 1
  ))) return field;

  const labeled = geographyAnswerLabelNumbers(field);
  // An incomplete key must not be assigned new ordinal numbers. Existing
  // printed labels can still be formatted without changing their values.
  const complete = labeled.length === numbers.length && labeled.every((number, index) => (
    index === 0 || number === labeled[index - 1] + 1
  ));
  if (!complete) {
    return labeled.length > 0 && labeled.every((number) => numbers.includes(number))
      ? rewriteGeographyAnswerLabels(field, (number) => number)
      : field;
  }
  // The two-argument API also handles legacy extracts without a verified
  // subject; only accept source-number offsets for explicit geography callers.
  if (!displayedNumbers && !labeled.every((number, index) =>
    number === index + 1 || number === numbers[index])) return field;

  return rewriteGeographyAnswerLabels(field, (_number, index) => numbers[index]);
}
