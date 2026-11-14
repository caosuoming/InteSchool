/**
 * A geography choice group is stored as one question, but its individual questions
 * retain the numbers printed in the original paper. Older extracted answers were
 * numbered from 1 within each group; align them with the visible stem instead.
 */
export function alignGeographyGroupAnswerNumbers(stem: string, field: string, displayedNumbers?: readonly number[]): string {
  const plainStem = stem
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const numbers = displayedNumbers || [...plainStem.matchAll(/^\s*([\d０-９]{1,4})\s*[.．、]\s*\S/gm)]
    .map((match) => Number(match[1].normalize("NFKC")));
  if (numbers.length < 2 || numbers.some((number, index) => (
    index > 0 && number !== numbers[index - 1] + 1
  ))) return field;

  // Imported keys can be numbered from the source paper (e.g. 7-9), even
  // when the group stem has since been re-created as questions 1-3. Match
  // complete consecutive answer keys by their order, including inline keys.
  const marker = /[（(]\s*([\d０-９]{1,4})\s*[）)]/g;
  const labeled = [...field.matchAll(marker)]
    .map((match) => Number(match[1].normalize("NFKC")));
  if (labeled.length !== numbers.length || labeled.some((number, index) => (
    index > 0 && number !== labeled[index - 1] + 1
  ))) return field;
  // The two-argument legacy API is also used by extracted documents from
  // other subjects. Only allow arbitrary source-paper offsets when the caller
  // has explicitly established the geography group's displayed numbers.
  if (!displayedNumbers && !labeled.every((number, index) =>
    number === index + 1 || number === numbers[index])) return field;

  let index = 0;
  return field.replace(marker, (match, digits: string) =>
    match.replace(digits, String(numbers[index++])));
}
