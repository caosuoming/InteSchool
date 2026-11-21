import { describe, expect, it } from "vitest";
import { scoreScanMark } from "./scanner-grading";

describe("scanner grading suggestions (never automatic final grades)", () => {
  it("compares exact choice options without accepting ambiguous OCR strings", () => {
    expect(scoreScanMark("choice", "CA", "", 4, "AC").suggestedScore).toBe(4);
    expect(scoreScanMark("choice", "D", "", 4, "AC").suggestedScore).toBe(0);
    expect(scoreScanMark("choice", "A?", "", 4, "A").suggestedScore).toBeNull();
    expect(scoreScanMark("choice", "AA", "", 4, "A").suggestedScore).toBeNull();
    expect(scoreScanMark("choice", "A", "", 4, "答案：A").suggestedScore).toBeNull();
  });
  it("treats explicit red crosses and backslashes as fill errors, never assumes correctness", () => {
    for (const mark of ["×", "✕", "X", "\\"]) {
      expect(scoreScanMark("fill", mark, "", 5).suggestedScore).toBe(0);
    }
    expect(scoreScanMark("fill", "", "", 5).suggestedScore).toBeNull();
    expect(scoreScanMark("fill", "+1", "", 5).suggestedScore).toBeNull();
  });
  it("enforces right-bottom score box precedence and keeps invalid boxes unresolved", () => {
    expect(scoreScanMark("essay", "-2", "8", 10).suggestedScore).toBe(8);
    expect(scoreScanMark("essay", "-2", "３", 10).suggestedScore).toBe(3);
    expect(scoreScanMark("essay", "+2", "12", 10).suggestedScore).toBeNull();
    expect(scoreScanMark("essay", "-2", "?", 10).suggestedScore).toBeNull();
  });
  it("handles deltas conservatively, without extrapolating malformed or out-of-range marks", () => {
    expect(scoreScanMark("essay", "+2", "", 10).suggestedScore).toBe(2);
    expect(scoreScanMark("essay", "-2", "", 10).suggestedScore).toBe(8);
    expect(scoreScanMark("essay", "－1.5分", "", 10).suggestedScore).toBe(8.5);
    expect(scoreScanMark("essay", "+11", "", 10).suggestedScore).toBeNull();
    expect(scoreScanMark("essay", "2", "", 10).suggestedScore).toBeNull();
    expect(scoreScanMark("essay", "--1", "", 10).suggestedScore).toBeNull();
  });
});
