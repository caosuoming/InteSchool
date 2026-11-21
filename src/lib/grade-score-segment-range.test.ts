import { describe, expect, it } from "vitest";
import type { GradeStatisticsTemplate } from "../types/index.js";
import { resolveSubjectSegmentRange } from "./grade-score-segment-range.js";

const template: GradeStatisticsTemplate = {
  id: "table-two", kind: "totalScoreSegment", enabled: true,
  name: "成绩统计", scoreMode: "assigned", subjects: ["数学", "生物"],
};

describe("subject score segment ranges", () => {
  it("uses independent ranges and merges special lines in descending order", () => {
    const updated = { ...template, totalScoreSegmentOptions: {
      subjectScoreSegmentRanges: {
        数学: { max: 100, min: 80, step: 10 },
        生物: { max: 90, min: 50, step: 20 },
      },
      subjectScoreSegmentSpecialThresholds: { 数学: [95, 80] },
    } };
    expect(resolveSubjectSegmentRange(updated, "数学", [80]).thresholds)
      .toEqual([100, 95, 90, 80]);
    expect(resolveSubjectSegmentRange(updated, "数学", [80]).specialThresholds)
      .toEqual([95, 80]);
    expect(resolveSubjectSegmentRange(updated, "生物", [80]).thresholds)
      .toEqual([90, 70, 50]);
  });

  it("preserves preconfigured manual score thresholds when ranges are absent", () => {
    const updated = { ...template, totalScoreSegmentOptions: {
      subjectScoreSegmentThresholds: { 数学: [140, 115, 100] },
      subjectScoreSegmentSpecialThresholds: { 数学: [125] },
    } };
    expect(resolveSubjectSegmentRange(updated, "数学", [120, 100]).thresholds)
      .toEqual([140, 125, 115, 100]);
    expect(resolveSubjectSegmentRange(updated, "生物", [90, 80]).thresholds)
      .toEqual([90, 80]);
  });
});
