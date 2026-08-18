import { describe, expect, it } from "vitest";
import {
  buildAnswerSheetQrPayload,
  DEFAULT_STUDENT_NUMBER_DIGITS,
  normalizeStudentNumberDigits,
} from "./answer-sheet";

describe("answer-sheet helpers", () => {
  it("builds a stable resource-specific QR payload", () => {
    expect(buildAnswerSheetQrPayload("exam-paper", "paper-123"))
      .toBe("intes://answer-sheet/v1/exam-paper/paper-123");
    expect(buildAnswerSheetQrPayload("lecture", "lecture/123"))
      .toBe("intes://answer-sheet/v1/lecture/lecture%2F123");
  });

  it("normalizes the configurable student-number digit count", () => {
    expect(normalizeStudentNumberDigits(0)).toBe(1);
    expect(normalizeStudentNumberDigits(7.4)).toBe(7);
    expect(normalizeStudentNumberDigits(99)).toBe(12);
    expect(normalizeStudentNumberDigits(Number.NaN)).toBe(DEFAULT_STUDENT_NUMBER_DIGITS);
  });
});
