import { buildAnswerSheetQrPayload } from "./answer-sheet-qr";
import type { ScannerPageRecord } from "../services/scanner";

export interface ScannerSheetKey {
  id: string;
  type: "paper" | "lecture";
  answerSheetRevisionId?: string;
}

export interface ScannerSheetStatistics {
  total: number;
  valid: number;
  reviewed: number;
  exceptions: number;
  unknownClass: number;
  classes: { id: string; name: string; count: number }[];
}

/** Summaries always use the active QR revision; previous revisions are not valid. */
export function scannerSheetStatistics(records: ScannerPageRecord[], sheet: ScannerSheetKey): ScannerSheetStatistics {
  const expectedQr = buildAnswerSheetQrPayload(
    sheet.type === "paper" ? "exam-paper" : "lecture", sheet.id, sheet.answerSheetRevisionId,
  );
  const counts = new Map<string, { id: string; name: string; count: number }>();
  let total = 0;
  let valid = 0;
  let reviewed = 0;
  let exceptions = 0;
  let unknownClass = 0;
  for (const record of records) {
    if (record.sheetType !== sheet.type || record.sheetId !== sheet.id) continue;
    total++;
    const qrValid = (record.verified && record.qrPayload === expectedQr)
      || (Boolean(record.manualVerifiedAt)
        && (record.manualVerifiedRevisionId || null) === (sheet.answerSheetRevisionId || null));
    if (qrValid) valid++;
    if (record.reviewedAt) reviewed++;
    if (!qrValid || !record.studentId) exceptions++;
    if (qrValid && record.studentId) {
      if (!record.studentClassId) {
        unknownClass++;
      } else {
        const existing = counts.get(record.studentClassId);
        if (existing) existing.count++;
        else counts.set(record.studentClassId, {
          id: record.studentClassId,
          name: record.studentClassName || "未命名班级",
          count: 1,
        });
      }
    }
  }
  return {
    total, valid, reviewed, exceptions, unknownClass,
    classes: [...counts.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
