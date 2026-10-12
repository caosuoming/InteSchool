import type { AnswerSheetOptionBreak } from "./answer-sheet";

/** Keep option text intact, favor four options per row, and fall back to pairs. */
export function layoutChoiceOptions(
  widths: number[],
  availableWidth: number,
  breaks: Record<number, AnswerSheetOptionBreak> = {},
  gap = 8,
): number[][] {
  const fits = (columns: number) => {
    if (availableWidth <= 0 || widths.some((width) => width <= 0)) return true;
    for (let index = 0; index < widths.length; index += columns) {
      const row = widths.slice(index, index + columns);
      if (row.reduce((sum, width) => sum + width, 0) + gap * (row.length - 1) > availableWidth) {
        return false;
      }
    }
    return true;
  };
  const columns = fits(4) ? 4 : 2;
  const rows: number[][] = [];
  let row: number[] = [];
  let rowWidth = 0;

  widths.forEach((width, index) => {
    const rule = breaks[index];
    const exceedsWidth = availableWidth > 0 && width > 0 && row.length > 0
      && rowWidth + gap + width > availableWidth;
    if (row.length > 0 && (rule === "new-line"
      || exceedsWidth
      || (rule !== "same-line" && row.length >= columns)
      || row.length >= 4)) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    rowWidth += row.length ? gap + width : width;
    row.push(index);
  });
  if (row.length) rows.push(row);
  return rows;
}
