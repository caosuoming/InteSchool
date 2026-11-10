/**
 * A geography choice group is stored as one question, but its individual questions
 * retain the numbers printed in the original paper. Older extracted answers were
 * numbered from 1 within each group; align them with the visible stem instead.
 */
export function alignGeographyGroupAnswerNumbers(stem: string, field: string): string {
  const plainStem = stem
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const numbers = [...plainStem.matchAll(/^\s*([\d０-９]{1,4})\s*[.．、]\s*\S/gm)]
    .map((match) => Number(match[1].normalize("NFKC")));
  if (numbers.length < 2 || numbers.some((number, index) => (
    index > 0 && number !== numbers[index - 1] + 1
  ))) return field;

  const lines = field.split("\n");
  const marker = /^(\s*[（(]\s*)([\d０-９]{1,4})(\s*[）)])/;
  const labeled = lines.flatMap((line, index) => {
    const match = marker.exec(line);
    return match ? [{ index, number: Number(match[2].normalize("NFKC")) }] : [];
  });
  if (labeled.length !== numbers.length) return field;
  const isLocal = labeled.every((item, index) => item.number === index + 1);
  const isOriginal = labeled.every((item, index) => item.number === numbers[index]);
  if (!isLocal && !isOriginal) return field;

  for (let index = 0; index < labeled.length; index += 1) {
    const lineIndex = labeled[index].index;
    lines[lineIndex] = lines[lineIndex].replace(marker, (_, left: string, _old: string, right: string) =>
      `${left}${numbers[index]}${right}`);
  }
  return lines.join("\n");
}
