import type { GradeExam, GradeExamSettings, GradeImportContext } from "../types/index.js";
import { calculateGradeRecords, normalizeGradeSettings } from "./grade-statistics.js";

export function previewGradeExam(
  exam: GradeExam,
  settings: GradeExamSettings,
  context: GradeImportContext,
): GradeExam {
  const normalized = normalizeGradeSettings(
    settings,
    exam.subjects,
    context.classes.map((item) => item.id),
    context.teachers.map((item) => item.id),
  );
  const records = calculateGradeRecords(exam.records.map((record) => ({
    id: record.id,
    studentId: record.studentId,
    studentName: record.studentName,
    studentNo: record.studentNo,
    classId: record.classId,
    className: record.className,
    subjectSelection: record.subjectSelection,
    classType: record.classType,
    includeInStatistics: record.includeInStatistics,
    scores: record.scores,
    sourceAssignedScores: record.sourceAssignedScores,
  })), exam.subjects, normalized);
  return { ...exam, settings: normalized, records };
}
