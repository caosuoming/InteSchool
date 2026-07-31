import type {
  GradeCohort,
  GradeExam,
  GradeExamImportInput,
  GradeExamSettings,
  GradeImportContext,
  GradeScoreRecord,
  GradeTeacherOption,
  SchoolClass,
  Student,
  Teacher,
} from "../../src/types/index.js";
import {
  buildDefaultGradeSettings,
  calculateGradeRecords,
  normalizeGradeSettings,
} from "../../src/lib/grade-statistics.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";

function readList<T>(key: string): T[] {
  const value = db.read(key);
  return Array.isArray(value) ? value as T[] : [];
}

function cohortKeyForClass(item: SchoolClass): string {
  return item.gradYear ? `grad-${item.gradYear}` : `grade-${item.grade}`;
}

function buildCohorts(schoolId: string): GradeCohort[] {
  const classes = readList<SchoolClass>("schoolClasses")
    .filter((item) => item.schoolId === schoolId);
  const students = readList<Student>("students")
    .filter((item) => item.schoolId === schoolId && item.status === "active");
  const groups = new Map<string, SchoolClass[]>();

  classes.forEach((item) => {
    const key = cohortKeyForClass(item);
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  });

  return [...groups.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
      const first = sorted[0];
      const classIds = sorted.map((item) => item.id);
      const classIdSet = new Set(classIds);
      return {
        key,
        label: first.gradYear ? `${first.gradYear}届${first.grade}` : first.grade,
        grade: first.grade,
        gradYear: first.gradYear,
        classIds,
        studentCount: students.filter((student) => classIdSet.has(student.classId)).length,
      } satisfies GradeCohort;
    })
    .sort((left, right) => {
      if (left.gradYear && right.gradYear) return left.gradYear - right.gradYear;
      if (left.gradYear) return -1;
      if (right.gradYear) return 1;
      return left.label.localeCompare(right.label, "zh-CN");
    });
}

function teacherOptions(schoolId: string): GradeTeacherOption[] {
  return readList<Teacher>("teachers")
    .flatMap((teacher) => {
      const affiliation = teacher.affiliations?.find((item) => item.schoolId === schoolId);
      if (!affiliation || affiliation.status !== "active") return [];
      return [{ id: teacher.id, name: teacher.name, subject: affiliation.subject }];
    })
    .sort((left, right) => left.subject.localeCompare(right.subject, "zh-CN") || left.name.localeCompare(right.name, "zh-CN"));
}

function requireContext(schoolId: string, cohortKey: string): GradeImportContext {
  const cohort = buildCohorts(schoolId).find((item) => item.key === cohortKey);
  if (!cohort) throw new Error("所选学生年级不存在");
  const classIdSet = new Set(cohort.classIds);
  const classes = readList<SchoolClass>("schoolClasses")
    .filter((item) => item.schoolId === schoolId && classIdSet.has(item.id))
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  const students = readList<Student>("students")
    .filter((item) => item.schoolId === schoolId && classIdSet.has(item.classId) && item.status === "active")
    .sort((left, right) => left.classId.localeCompare(right.classId) || left.studentNo.localeCompare(right.studentNo));
  return { cohort, classes, students, teachers: teacherOptions(schoolId) };
}

function normalizeSubjects(subjects: string[]): string[] {
  const normalized = [...new Set(subjects.map((subject) => subject.trim()).filter(Boolean))];
  if (normalized.length === 0) throw new Error("至少需要一个成绩科目");
  if (normalized.length > 30) throw new Error("成绩科目数量不能超过 30 个");
  return normalized;
}

function normalizeScores(
  scores: Record<string, number | null>,
  subjects: string[],
  sourceRowNumber: number,
): Record<string, number | null> {
  return Object.fromEntries(subjects.map((subject) => {
    const value = scores?.[subject];
    if (value === null || value === undefined) return [subject, null];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`第 ${sourceRowNumber} 行的「${subject}」成绩不是有效数字`);
    }
    if (value < -1000 || value > 1000) {
      throw new Error(`第 ${sourceRowNumber} 行的「${subject}」成绩超出合理范围`);
    }
    return [subject, Math.round(value * 100) / 100];
  }));
}

function examBaseRecords(records: GradeScoreRecord[]) {
  return records.map((record) => ({
    id: record.id,
    studentId: record.studentId,
    studentName: record.studentName,
    studentNo: record.studentNo,
    classId: record.classId,
    className: record.className,
    scores: record.scores,
  }));
}

function defaultOrNormalizedSettings(
  settings: GradeExamSettings | undefined,
  subjects: string[],
  context: GradeImportContext,
): GradeExamSettings {
  const defaults = buildDefaultGradeSettings(
    subjects,
    context.classes.map((item) => item.id),
    context.teachers,
  );
  return normalizeGradeSettings(
    settings || defaults,
    subjects,
    context.classes.map((item) => item.id),
    context.teachers.map((item) => item.id),
  );
}

export const gradeService = {
  async listCohorts(schoolId: string): Promise<GradeCohort[]> {
    await delay(120);
    return buildCohorts(schoolId);
  },

  async getImportContext(schoolId: string, cohortKey: string): Promise<GradeImportContext> {
    await delay(150);
    return requireContext(schoolId, cohortKey);
  },

  async listExams(schoolId: string, cohortKey?: string): Promise<GradeExam[]> {
    await delay(150);
    return readList<GradeExam>("gradeExams")
      .filter((item) => item.schoolId === schoolId && (!cohortKey || item.cohortKey === cohortKey))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async getExam(examId: string): Promise<GradeExam | null> {
    await delay(100);
    return readList<GradeExam>("gradeExams").find((item) => item.id === examId) || null;
  },

  async importExam(
    schoolId: string,
    teacherId: string,
    input: GradeExamImportInput,
  ): Promise<GradeExam> {
    await delay(250);
    maybeThrowError();
    const context = requireContext(schoolId, input.cohortKey);
    const subjects = normalizeSubjects(input.subjects || []);
    const name = input.name?.trim();
    if (!name) throw new Error("请填写考试名称");
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new Error("没有可导入的学生成绩");
    if (input.rows.length > 5000) throw new Error("单次最多导入 5000 名学生");

    const rowKeys = new Set<string>();
    const matchedStudentIds = new Set<string>();
    const classMap = new Map(context.classes.map((item) => [item.id, item]));
    const studentMap = new Map(context.students.map((item) => [item.id, item]));
    const schoolStudents = readList<Student>("students").filter((item) => item.schoolId === schoolId);
    const usedStudentNos = new Set(schoolStudents.map((item) => item.studentNo.trim()).filter(Boolean));
    const newStudents: Student[] = [];
    const renamedStudents = new Map<string, string>();
    const baseRecords: Array<{
      id: string;
      studentId: string;
      studentName: string;
      studentNo: string;
      classId: string;
      className: string;
      scores: Record<string, number | null>;
    }> = [];

    input.rows.forEach((row, index) => {
      const sourceRowNumber = Number.isFinite(row.sourceRowNumber) ? row.sourceRowNumber : index + 2;
      if (!row.rowKey || rowKeys.has(row.rowKey)) throw new Error(`第 ${sourceRowNumber} 行的导入标识重复`);
      rowKeys.add(row.rowKey);
      const hasExisting = Boolean(row.studentId);
      const hasNew = Boolean(row.createStudent);
      if (hasExisting === hasNew) throw new Error(`第 ${sourceRowNumber} 行必须且只能匹配一名学生`);

      let student: Student;
      if (row.studentId) {
        const existing = studentMap.get(row.studentId);
        if (!existing) throw new Error(`第 ${sourceRowNumber} 行匹配的学生不属于所选年级`);
        if (matchedStudentIds.has(existing.id)) throw new Error(`学生「${existing.name}」在表格中被重复匹配`);
        student = { ...existing };
        if (row.updateStudentName) {
          const newName = row.sourceName.trim();
          if (!newName) throw new Error(`第 ${sourceRowNumber} 行的新姓名不能为空`);
          student.name = newName;
          renamedStudents.set(student.id, newName);
        }
      } else {
        const create = row.createStudent!;
        const classItem = classMap.get(create.classId);
        if (!classItem) throw new Error(`第 ${sourceRowNumber} 行选择的班级不属于所选年级`);
        const studentName = create.name.trim();
        const studentNo = create.studentNo.trim();
        if (!studentName) throw new Error(`第 ${sourceRowNumber} 行的新学生姓名不能为空`);
        if (!studentNo) throw new Error(`第 ${sourceRowNumber} 行的新学生学号不能为空`);
        if (usedStudentNos.has(studentNo)) throw new Error(`学号「${studentNo}」已存在，不能重复新增`);
        usedStudentNos.add(studentNo);
        student = {
          id: genId("stu"),
          name: studentName,
          studentNo,
          classId: classItem.id,
          schoolId,
          grade: classItem.grade,
          status: "active",
        };
        newStudents.push(student);
      }

      matchedStudentIds.add(student.id);
      const classItem = classMap.get(student.classId);
      if (!classItem) throw new Error(`第 ${sourceRowNumber} 行的学生班级不属于所选年级`);
      baseRecords.push({
        id: genId("score"),
        studentId: student.id,
        studentName: student.name,
        studentNo: student.studentNo,
        classId: student.classId,
        className: classItem.name,
        scores: normalizeScores(row.scores, subjects, sourceRowNumber),
      });
    });

    const settings = defaultOrNormalizedSettings(input.settings, subjects, context);
    const records = calculateGradeRecords(baseRecords, subjects, settings);
    const now = new Date().toISOString();
    const exam: GradeExam = {
      id: genId("grade-exam"),
      schoolId,
      teacherId,
      cohortKey: context.cohort.key,
      cohortLabel: context.cohort.label,
      name,
      examDate: input.examDate || undefined,
      sourceFileName: input.sourceFileName?.trim() || "本地成绩表",
      sourceSheetName: input.sourceSheetName?.trim() || "Sheet1",
      subjects,
      records,
      settings,
      createdAt: now,
      updatedAt: now,
    };

    if (renamedStudents.size > 0) {
      db.update("students", (items: Student[]) => items.map((item) => {
        const newName = renamedStudents.get(item.id);
        return newName ? { ...item, name: newName } : item;
      }));
    }
    if (newStudents.length > 0) {
      db.update("students", (items: Student[]) => [...items, ...newStudents]);
      const additions = newStudents.reduce((counts, student) => {
        counts.set(student.classId, (counts.get(student.classId) || 0) + 1);
        return counts;
      }, new Map<string, number>());
      db.update("schoolClasses", (items: SchoolClass[]) => items.map((item) => ({
        ...item,
        studentCount: item.studentCount + (additions.get(item.id) || 0),
      })));
    }
    db.update("gradeExams", (items: GradeExam[]) => [...items, exam]);
    return exam;
  },

  async updateExamSettings(examId: string, settings: GradeExamSettings): Promise<GradeExam> {
    await delay(200);
    maybeThrowError();
    const current = readList<GradeExam>("gradeExams").find((item) => item.id === examId);
    if (!current) throw new Error("成绩考试不存在");
    const context = requireContext(current.schoolId, current.cohortKey);
    const normalized = defaultOrNormalizedSettings(settings, current.subjects, context);
    const updated: GradeExam = {
      ...current,
      settings: normalized,
      records: calculateGradeRecords(examBaseRecords(current.records), current.subjects, normalized),
      updatedAt: new Date().toISOString(),
    };
    db.update("gradeExams", (items: GradeExam[]) => items.map((item) => item.id === examId ? updated : item));
    return updated;
  },

  async deleteExam(examId: string): Promise<void> {
    await delay(150);
    maybeThrowError();
    const exists = readList<GradeExam>("gradeExams").some((item) => item.id === examId);
    if (!exists) throw new Error("成绩考试不存在");
    db.update("gradeExams", (items: GradeExam[]) => items.filter((item) => item.id !== examId));
  },
};
