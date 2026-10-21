export function buildAnswerSheetQrPayload(
  resourceType: "exam-paper" | "lecture",
  resourceId: string,
  revisionId?: string,
): string {
  const resource = encodeURIComponent(resourceId);
  return revisionId
    ? `intes://answer-sheet/v2/${resourceType}/${resource}/${encodeURIComponent(revisionId)}`
    : `intes://answer-sheet/v1/${resourceType}/${resource}`;
}
