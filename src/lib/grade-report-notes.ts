import type { GradeExam, GradeExamSettings } from "../types/index.js";

/** Report annotations are derived from the exam's own settings, never from another exam in the cohort. */
export function buildGradeReportNotes(
  exam: GradeExam,
  settings: GradeExamSettings = exam.settings,
  classId?: string,
  subject?: string,
): string[] {
  const notes: string[] = [];
  const remark = exam.examRemark?.trim();
  if (remark) notes.push(`考试备注：${remark}`);

  const classNames = new Map(exam.records.map((record) => [record.classId, record.className]));
  for (const item of settings.classSubjects) {
    if (classId && item.classId !== classId) continue;
    // Do not describe subjects a class never sat as "excluded from ranking".
    const satSubjects = [...new Set(item.examSubjects)].filter(
      (name) => exam.subjects.includes(name) && (!subject || subject === name),
    );
    const separate = new Set(item.separateRankSubjects || []);
    const unified = new Set(item.statisticSubjects);
    const separateSubjects = satSubjects.filter((name) => separate.has(name));
    const excludedSubjects = satSubjects.filter((name) => !separate.has(name) && !unified.has(name));
    if (!separateSubjects.length && !excludedSubjects.length) continue;
    const className = classNames.get(item.classId) || item.classId;
    if (separateSubjects.length) {
      notes.push(`${className}：${separateSubjects.join("、")}实行单独排名，不计入全年级统一排名。`);
    }
    if (excludedSubjects.length) {
      notes.push(`${className}：${excludedSubjects.join("、")}不参与全年级成绩排名。`);
    }
  }
  return notes;
}
