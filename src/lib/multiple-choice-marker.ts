/** Keep the visual marker separate from the stored question stem. */
export function needsMultipleChoiceMarker(isMultiple: boolean, stem: string): boolean {
  if (!isMultiple) return false;
  const leadingText = stem
    .replace(/<[^>]*>/g, "")
    .replace(/^(?:\s|&nbsp;|&#160;|&#xA0;)+/gi, "")
    .replace(/^(?:\d+[.．、]|[（(]\d+[）)])\s*/, "");
  return !/^[（(]\s*多选\s*[）)]/.test(leadingText);
}
