import type {
  GradeBandRule,
  GradeExam,
  GradeScoreRecord,
  GradeStatisticsTemplate,
} from "../types/index.js";

export interface GradeClassAverage {
  classId: string;
  className: string;
  studentCount: number;
  subjectAverages: Record<string, number | null>;
  rawTotalAverage: number;
  assignedTotalAverage: number;
}

export interface GradeScoreSegment {
  label: string;
  min: number;
  max: number;
  count: number;
  rate: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function averageGradeValues(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return null;
  return round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

export function buildGradeClassAverages(exam: GradeExam): GradeClassAverage[] {
  const groups = new Map<string, GradeScoreRecord[]>();
  exam.records.forEach((record) => {
    const current = groups.get(record.classId) || [];
    current.push(record);
    groups.set(record.classId, current);
  });
  return [...groups.entries()]
    .map(([classId, records]) => ({
      classId,
      className: records[0]?.className || "未知班级",
      studentCount: records.length,
      subjectAverages: Object.fromEntries(exam.subjects.map((subject) => [
        subject,
        averageGradeValues(records.map((record) => record.assignedScores[subject])),
      ])),
      rawTotalAverage: averageGradeValues(records.map((record) => record.rawTotal)) || 0,
      assignedTotalAverage: averageGradeValues(records.map((record) => record.assignedTotal)) || 0,
    }))
    .sort((left, right) => right.assignedTotalAverage - left.assignedTotalAverage || left.className.localeCompare(right.className, "zh-CN"));
}

export function buildGradeScoreSegments(values: number[], segmentSize: number): GradeScoreSegment[] {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return [];
  const width = Number.isFinite(segmentSize) && segmentSize > 0 ? segmentSize : 10;
  const maximum = Math.ceil(Math.max(...valid) / width) * width;
  const minimum = Math.floor(Math.min(...valid) / width) * width;
  const segments: GradeScoreSegment[] = [];
  for (let upper = maximum; upper > minimum; upper -= width) {
    const lower = upper - width;
    const includeLower = lower === minimum;
    const count = valid.filter((value) => value <= upper && (includeLower ? value >= lower : value > lower)).length;
    segments.push({
      label: includeLower ? `${lower}-${upper}` : `(${lower}, ${upper}]`,
      min: lower,
      max: upper,
      count,
      rate: round(count / valid.length),
    });
  }
  return segments;
}

function recordSubjectValue(
  record: GradeScoreRecord,
  subject: string,
  mode: GradeStatisticsTemplate["scoreMode"],
): number | null {
  return mode === "raw" ? record.scores[subject] : record.assignedScores[subject];
}

export function gradeTemplateTotal(
  record: GradeScoreRecord,
  template: GradeStatisticsTemplate,
): number {
  const values = template.subjects
    .map((subject) => recordSubjectValue(record, subject, template.scoreMode))
    .filter((value): value is number => typeof value === "number");
  if (template.kind === "coreAndBestElectiveSegment") {
    const coreSubjects = new Set(["语文", "数学", "英语"]);
    const coreValues = template.subjects
      .filter((subject) => coreSubjects.has(subject))
      .map((subject) => recordSubjectValue(record, subject, template.scoreMode))
      .filter((value): value is number => typeof value === "number");
    const electiveValues = template.subjects
      .filter((subject) => !coreSubjects.has(subject))
      .map((subject) => recordSubjectValue(record, subject, template.scoreMode))
      .filter((value): value is number => typeof value === "number")
      .sort((left, right) => right - left)
      .slice(0, template.bestElectiveCount || 1);
    return round([...coreValues, ...electiveValues].reduce((sum, value) => sum + value, 0));
  }
  return round(values.reduce((sum, value) => sum + value, 0));
}

function assignedGradeLabel(value: number | null, rules: GradeBandRule[] | undefined): string {
  if (typeof value !== "number" || !rules) return "缺考";
  const matched = rules.find((rule) => value >= rule.assignedMin && value <= rule.assignedMax);
  return matched?.label || "其他";
}

export function buildElectiveGradeDistribution(
  exam: GradeExam,
  template: GradeStatisticsTemplate,
): Array<{ subject: string; counts: Record<string, number>; total: number }> {
  return template.subjects
    .filter((subject) => exam.settings.assignmentRules[subject])
    .map((subject) => {
      const rules = exam.settings.assignmentRules[subject];
      const counts = Object.fromEntries(rules.map((rule) => [rule.label, 0]));
      let total = 0;
      exam.records.forEach((record) => {
        const value = record.assignedScores[subject];
        if (typeof value !== "number") return;
        const label = assignedGradeLabel(value, rules);
        counts[label] = (counts[label] || 0) + 1;
        total += 1;
      });
      return { subject, counts, total };
    });
}
