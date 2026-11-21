/** Shanghai chemistry composite questions: one bank entry can contain several
 * paper-wide numbered questions. Parenthesized and circled subparts stay fixed.
 */
const topLevelMarker = /^([ \t]*(?:<(?:p|div|span)\b[^>]*>[ \t]*)*)([\d０-９]{1,4})([ \t]*[.．、][ \t]*)(?=\S)(?!\d)/gm;

export function chemistrySubQuestionNumbers(stem: string): number[] {
  return [...stem.matchAll(topLevelMarker)].map((match) => Number(match[2].normalize("NFKC")));
}

export function isChemistryCompositeGroup(stem: string, type: string, subject?: string): boolean {
  return subject?.trim() === "化学" && type === "essay" && chemistrySubQuestionNumbers(stem).length >= 1;
}

export function renumberChemistryGroupStem(stem: string, startNumber: number): string {
  let offset = 0;
  return stem.replace(topLevelMarker, (_match, prefix: string, _original: string, separator: string) =>
    prefix + (startNumber + offset++) + separator);
}

export function renumberChemistryGroupField(
  stem: string, field: string, startNumber: number,
): string {
  const originalNumbers = chemistrySubQuestionNumbers(stem);
  const labels = chemistrySubQuestionNumbers(field);
  const relativeLabels = labels.length > 0
    && labels.every((number) => number >= 1 && number <= originalNumbers.length)
    && !labels.every((number) => originalNumbers.includes(number));
  const mapping = new Map(originalNumbers.map((number, index) =>
    [relativeLabels ? index + 1 : number, startNumber + index]));
  return field.replace(topLevelMarker, (match, prefix: string, original: string, separator: string) => {
    const next = mapping.get(Number(original.normalize("NFKC")));
    return next === undefined ? match : prefix + next + separator;
  });
}
