import type {
  GradeBandRule,
  GradeExam,
  GradeScoreRecord,
  GradeStatisticsTemplate,
} from "../types/index.js";
import {
  displayGradeFormulaValue,
  evaluateGradeFormula,
} from "./grade-formula.js";

export type GradeReportCell = string | number | null;

export interface GradeReportTable {
  headers: string[];
  rows: GradeReportCell[][];
  widths?: number[];
}

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

export function buildGradeReportTable(
  exam: GradeExam,
  template: GradeStatisticsTemplate,
): GradeReportTable {
  if (template.kind === "customTable") {
    const columns = template.columns || [];
    return {
      headers: columns.map((column) => column.name),
      widths: columns.map((column) => column.width || 14),
      rows: [...exam.records]
        .sort((left, right) => left.gradeRank - right.gradeRank || left.studentNo.localeCompare(right.studentNo))
        .map((record) => columns.map((column) => {
          try {
            return displayGradeFormulaValue(evaluateGradeFormula(
              column.formula,
              record,
              template.scoreMode,
            ));
          } catch (error) {
            return `#错误: ${error instanceof Error ? error.message : "公式无效"}`;
          }
        })),
    };
  }

  if (template.kind === "studentRanking") {
    const records = [...exam.records].sort((left, right) => left.gradeRank - right.gradeRank);
    return {
      headers: ["年级名次", "班级名次", "班级", "学号", "姓名", ...template.subjects, "模板总分"],
      widths: [10, 10, 16, 16, 12, ...template.subjects.map(() => 12), 14],
      rows: records.map((record) => [
        record.gradeRank,
        record.classRank,
        record.className,
        record.studentNo,
        record.studentName,
        ...template.subjects.map((subject) => recordSubjectValue(record, subject, template.scoreMode)),
        gradeTemplateTotal(record, template),
      ]),
    };
  }

  if (template.kind === "classAverage") {
    const classIds = [...new Set(exam.records.map((record) => record.classId))];
    const rows = classIds.map((classId) => {
      const records = exam.records.filter((record) => record.classId === classId);
      const subjectAverages = template.subjects.map((subject) => averageGradeValues(records.map((record) =>
        recordSubjectValue(record, subject, template.scoreMode),
      )));
      const totals = records.map((record) => template.subjects.reduce((sum, subject) => {
        const value = recordSubjectValue(record, subject, template.scoreMode);
        return sum + (typeof value === "number" ? value : 0);
      }, 0));
      return [
        records[0]?.className || "未知班级",
        records.length,
        ...subjectAverages,
        averageGradeValues(totals),
      ] satisfies GradeReportCell[];
    }).sort((left, right) => (
      Number(right[right.length - 1] || 0) - Number(left[left.length - 1] || 0)
    ));
    return {
      headers: ["班级", "人数", ...template.subjects, "总分平均"],
      widths: [16, 10, ...template.subjects.map(() => 12), 14],
      rows,
    };
  }

  if (template.kind === "electiveGradeSegment") {
    const distribution = buildElectiveGradeDistribution(exam, template);
    const labels = [...new Set(distribution.flatMap((item) => Object.keys(item.counts)))];
    return {
      headers: ["科目", ...labels.map((label) => `${label}档人数`), "参考人数"],
      widths: [12, ...labels.map(() => 12), 12],
      rows: distribution.map((item) => [
        item.subject,
        ...labels.map((label) => item.counts[label] || 0),
        item.total,
      ]),
    };
  }

  const values = exam.records.map((record) => gradeTemplateTotal(record, template));
  const segments = buildGradeScoreSegments(values, template.segmentSize || 10);
  return {
    headers: ["分数段", "人数", "比例"],
    widths: [16, 12, 12],
    rows: segments.map((segment) => [segment.label, segment.count, `${(segment.rate * 100).toFixed(1)}%`]),
  };
}
