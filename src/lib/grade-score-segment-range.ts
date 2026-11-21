import type { GradeStatisticsTemplate } from "../types/index.js";

export function resolveSubjectSegmentRange(
  template: GradeStatisticsTemplate,
  subject: string,
  defaults: number[],
): { thresholds: number[]; specialThresholds: number[]; max: number; min: number; step: number } {
  const options = template.totalScoreSegmentOptions;
  const configured = options?.subjectScoreSegmentThresholds?.[subject];
  const base = configured?.length ? configured : defaults;
  const range = options?.subjectScoreSegmentRanges?.[subject];
  const max = range?.max ?? base[0] ?? 100;
  const min = range?.min ?? base[base.length - 1] ?? 0;
  const step = range?.step ?? (base.length > 1 ? Math.max(1, base[0] - base[1]) : 10);
  const regular = range
    ? Array.from({ length: Math.min(201, Math.floor(Math.max(0, max - min) / step) + 1) },
      (_, index) => max - index * step)
    : base;
  const specialThresholds = [...new Set(options?.subjectScoreSegmentSpecialThresholds?.[subject] || [])]
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1000)
    .sort((a, b) => b - a);
  return {
    thresholds: [...new Set([...regular, ...specialThresholds])].sort((a, b) => b - a),
    specialThresholds, max, min, step,
  };
}
