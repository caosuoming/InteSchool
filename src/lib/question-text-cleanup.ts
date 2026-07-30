const SCORE_VALUE = String.raw`(?:[0-9０-９]+(?:[.．][0-9０-９]+)?|[零〇一二三四五六七八九十百两]+(?:点[零〇一二三四五六七八九十百两]+)?)`;
const SCORE_LABEL_BODY = String.raw`(?:(?:本|该|此|每)(?:小题|大题|题|问)\s*)?(?:(?:共|计|满分|分值(?:为)?)\s*)?${SCORE_VALUE}\s*分(?:值)?`;
const LEADING_SCORE_LABEL_PATTERN = new RegExp(
  String.raw`^[\s\u3000]*([（(【［\[]\s*${SCORE_LABEL_BODY}\s*[）)】］\]])[\s\u3000]*`,
);

export interface ScoreLabelCleanupResult {
  text: string;
  labels: string[];
}

/**
 * Remove bracketed score metadata from the beginning of a question stem.
 * Only explicit numeric score labels are matched, such as “（本小题12分）”
 * and “(5分)”, so ordinary parenthetical question content is preserved.
 */
export function stripLeadingScoreLabels(text: string): ScoreLabelCleanupResult {
  let remaining = text;
  const labels: string[] = [];

  while (remaining) {
    const match = LEADING_SCORE_LABEL_PATTERN.exec(remaining);
    if (!match) break;
    labels.push(match[1].trim());
    remaining = remaining.slice(match[0].length);
  }

  return {
    text: labels.length > 0 ? remaining.trimStart() : text,
    labels,
  };
}
