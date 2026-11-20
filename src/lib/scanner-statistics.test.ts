import { describe, expect, it } from "vitest";
import { scannerSheetStatistics } from "./scanner-statistics";
import type { ScannerPageRecord } from "../services/scanner";

const row = (id: string, patch: Partial<ScannerPageRecord> = {}): ScannerPageRecord => ({
  id, sheetId: "p", sheetType: "paper", schoolId: "s", teacherId: "t", fileId: id,
  qrPayload: "intes://answer-sheet/v1/exam-paper/p", verified: true,
  studentId: "student-1", studentClassId: "class-1", studentClassName: "高一 · 一班",
  status: "assigned", createdAt: "2026-11-20T00:00:00Z", ...patch,
});

describe("scanner sheet statistics", () => {
  it("counts only current QR versions as valid and groups recognized classes", () => {
    const rows = [
      row("a"), row("b", { studentId: null, status: "pending" }),
      row("c", { qrPayload: null, verified: false }),
      row("d", { studentId: "student-2", studentClassId: "class-2", studentClassName: "高一 · 二班", reviewedAt: "2026-11-20" }),
      row("e", { studentClassId: null }), row("f", { sheetId: "other" }),
    ];
    expect(scannerSheetStatistics(rows, { id: "p", type: "paper" })).toEqual({
      total: 5, valid: 4, reviewed: 1, exceptions: 2, unknownClass: 1,
      classes: [
        { id: "class-1", name: "高一 · 一班", count: 1 },
        { id: "class-2", name: "高一 · 二班", count: 1 },
      ],
    });
    expect(scannerSheetStatistics(rows, { id: "p", type: "paper", answerSheetRevisionId: "new" })).toMatchObject({
      total: 5, valid: 0, exceptions: 5, classes: [],
    });
  });
  it("recognizes manually verified scans only for their recorded revision", () => {
    const verified = row("manual", {
      qrPayload: null, verified: false, studentId: "st1",
      manualVerifiedAt: "2026-11-20", manualVerifiedRevisionId: "rev-a",
    });
    expect(scannerSheetStatistics([verified], { id: "p", type: "paper", answerSheetRevisionId: "rev-a" }))
      .toMatchObject({ valid: 1, exceptions: 0 });
    expect(scannerSheetStatistics([verified], { id: "p", type: "paper", answerSheetRevisionId: "rev-b" }))
      .toMatchObject({ valid: 0, exceptions: 1 });
  });

  it("separates lecture and paper scans with the same id", () => {
    expect(scannerSheetStatistics([row("a"), row("b", { sheetType: "lecture" })], {
      id: "p", type: "paper",
    }).total).toBe(1);
  });
});
