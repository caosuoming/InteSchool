import type {
  GradeCohort,
  GradeExam,
  GradeExamImportInput,
  GradeExamSettings,
  GradeImportContext,
  GradeQueryClass,
  GradeQueryData,
  GradeQueryExam,
  GradeScoreRecord,
  GradeStatisticsTemplate,
  GradeTeacherOption,
  GradeTemplateProfile,
  SchoolClass,
  Student,
  Teacher,
  TeacherAffiliation,
  TeacherRole,
} from "../../src/types/index.js";
import {
  buildDefaultGradeSettings,
  calculateGradeRecords,
  normalizeGradeSettings,
} from "../../src/lib/grade-statistics.js";
import { averageGradeValues } from "../../src/lib/grade-reports.js";
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
    .filter((item) => item.schoolId === schoolId && item.status !== "graduated");
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
  const templateProfile = readList<GradeTemplateProfile>("gradeTemplateProfiles")
    .find((item) => item.schoolId === schoolId && item.cohortKey === cohortKey);
  return {
    cohort,
    classes,
    students,
    teachers: teacherOptions(schoolId),
    templateProfile,
  };
}

function requireGradeTemplateManager(schoolId: string, teacherId: string): void {
  const teacher = readList<Teacher>("teachers").find((item) => item.id === teacherId);
  if (!teacher) throw new Error("当前教师不存在");
  const affiliation = teacher.affiliations?.find((item) =>
    item.schoolId === schoolId && item.status === "active",
  );
  if (!affiliation) throw new Error("当前教师不属于该学校");
  const roles = new Set<string>(affiliation.roles || teacher.roles || []);
  const managerialRoles = new Set(["gradeLeader", "dean", "vicePrincipal", "principal"]);
  const administrativeRole = affiliation.role === "school_admin"
    || affiliation.role === "platform_admin"
    || teacher.role === "school_admin"
    || teacher.role === "platform_admin";
  if (!administrativeRole && ![...roles].some((role) => managerialRoles.has(role))) {
    throw new Error("仅学校管理员、年级组长或教务管理人员可发布年级成绩模板");
  }
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
  const inheritedDefaults = context.templateProfile
    ? { ...defaults, templates: structuredClone(context.templateProfile.templates) }
    : defaults;
  return normalizeGradeSettings(
    settings || inheritedDefaults,
    subjects,
    context.classes.map((item) => item.id),
    context.teachers.map((item) => item.id),
  );
}

function activeAffiliation(teacher: Teacher): TeacherAffiliation | null {
  return teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent)
    || null;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function projectScores(
  values: Record<string, number | null>,
  subjects: string[],
): Record<string, number | null> {
  return Object.fromEntries(subjects.map((subject) => [subject, values[subject] ?? null]));
}

function buildQueryData(teacher: Teacher): GradeQueryData {
  const affiliation = activeAffiliation(teacher);
  const schoolId = affiliation ? affiliation.schoolId : teacher.schoolId;
  if (!schoolId) throw new Error("请先完成学校认证");

  const roles = unique(affiliation ? affiliation.roles : teacher.roles || []) as TeacherRole[];
  const accountRole = affiliation?.role || teacher.role;
  const subject = affiliation ? affiliation.subject : teacher.subject;
  const allClasses = readList<SchoolClass>("schoolClasses")
    .filter((item) => item.schoolId === schoolId && item.status !== "graduated");
  const classMap = new Map(allClasses.map((item) => [item.id, item]));
  const configuredTeachingClassIds = affiliation
    ? affiliation.teachingClassIds || []
    : teacher.teachingClassIds || [];
  const legacyTeachingClassIds = allClasses
    .filter((item) => item.createdBy === teacher.id)
    .map((item) => item.id);
  const teachingClassIds = unique((configuredTeachingClassIds.length > 0
    ? configuredTeachingClassIds
    : legacyTeachingClassIds).filter((id) => classMap.has(id)));
  const configuredHomeroomClassIds = affiliation
    ? affiliation.homeroomClassIds || []
    : teacher.homeroomClassIds || [];
  const homeroomClassIds = unique(configuredHomeroomClassIds
    .filter((id) => classMap.has(id)));
  const assignedClassIds = unique([...teachingClassIds, ...homeroomClassIds]);
  const configuredGrades = unique(affiliation
    ? affiliation.teachingGrades || []
    : teacher.teachingGrades || []);
  const inferredGrades = unique(assignedClassIds.map((id) => classMap.get(id)?.grade));
  const grades = configuredGrades.length > 0 ? configuredGrades : inferredGrades;
  const isSchoolWide = accountRole === "school_admin"
    || accountRole === "platform_admin"
    || roles.some((role) => ["principal", "vicePrincipal", "dean"].includes(role));
  const isGradeWide = !isSchoolWide && roles.includes("gradeLeader");
  const hasHomeroom = !isSchoolWide && !isGradeWide && homeroomClassIds.length > 0;
  const scope = isSchoolWide ? "school" : isGradeWide ? "grade" : hasHomeroom ? "homeroom" : "teacher";
  const scopeLabel = scope === "school"
    ? "全校"
    : scope === "grade"
      ? grades.join("、") || "所管年级"
      : scope === "homeroom"
        ? "班主任班级"
        : "任教班级";

  const fullClassIds = scope === "school"
    ? allClasses.map((item) => item.id)
    : scope === "grade"
      ? allClasses.filter((item) => grades.includes(item.grade)).map((item) => item.id)
      : scope === "homeroom"
        ? homeroomClassIds
        : [];
  const fullClassSet = new Set(fullClassIds);
  const teachingClassSet = new Set(teachingClassIds);
  const homeroomClassSet = new Set(homeroomClassIds);
  const targetClassIds = scope === "school" || scope === "grade" ? fullClassIds : assignedClassIds;
  const targetClassSet = new Set(targetClassIds);
  const targetCohorts = new Set(targetClassIds.map((id) => classMap.get(id)).filter(Boolean).map((item) => cohortKeyForClass(item!)));
  const schoolExams = readList<GradeExam>("gradeExams")
    .filter((exam) => exam.schoolId === schoolId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const relevantExams = scope === "school"
    ? schoolExams
    : schoolExams.filter((exam) =>
        targetCohorts.has(exam.cohortKey)
        && exam.records.some((record) => targetClassSet.has(record.classId)),
      );
  const relevantCohorts = new Set(relevantExams.map((exam) => exam.cohortKey));
  const visibleClasses = allClasses.filter((item) => {
    if (scope === "school") return true;
    if (scope === "grade") return fullClassSet.has(item.id);
    return relevantCohorts.has(cohortKeyForClass(item));
  });

  const classes: GradeQueryClass[] = visibleClasses
    .map((item): GradeQueryClass => ({
      id: item.id,
      name: item.name,
      grade: item.grade,
      cohortKey: cohortKeyForClass(item),
      access: fullClassSet.has(item.id)
        ? "all"
        : teachingClassSet.has(item.id)
          ? "subject"
          : "aggregate",
    }))
    .sort((left, right) => left.grade.localeCompare(right.grade, "zh-CN") || left.name.localeCompare(right.name, "zh-CN"));

  const exams: GradeQueryExam[] = relevantExams.flatMap((exam) => {
    const subjects = scope === "teacher"
      ? exam.subjects.filter((item) => item === subject)
      : [...exam.subjects];
    if (subjects.length === 0) return [];

    const aggregateRecords = scope === "school"
      ? exam.records
      : scope === "grade"
        ? exam.records.filter((record) => fullClassSet.has(record.classId))
        : exam.records;
    const subjectAverages = Object.fromEntries(subjects.map((item) => [
      item,
      averageGradeValues(aggregateRecords.map((record) => record.assignedScores[item])),
    ]));
    const byClass = new Map<string, GradeScoreRecord[]>();
    aggregateRecords.forEach((record) => {
      const current = byClass.get(record.classId) || [];
      current.push(record);
      byClass.set(record.classId, current);
    });
    const classSummaries = [...byClass.entries()]
      .map(([classId, records]) => {
        const canViewFullSummary = scope === "school" || scope === "grade" || fullClassSet.has(classId);
        const summarySubjects = canViewFullSummary
          ? subjects
          : subjects.filter((item) => item === subject);
        return {
          classId,
          className: records[0]?.className || classMap.get(classId)?.name || "未知班级",
          studentCount: records.length,
          subjectAverages: Object.fromEntries(summarySubjects.map((item) => [
            item,
            averageGradeValues(records.map((record) => record.assignedScores[item])),
          ])),
          rawTotalAverage: canViewFullSummary ? averageGradeValues(records.map((record) => record.rawTotal)) : null,
          assignedTotalAverage: canViewFullSummary ? averageGradeValues(records.map((record) => record.assignedTotal)) : null,
        };
      })
      .sort((left, right) => left.className.localeCompare(right.className, "zh-CN"));
    const records = exam.records.flatMap((record) => {
      const canViewAll = fullClassSet.has(record.classId) || homeroomClassSet.has(record.classId);
      const canViewSubject = teachingClassSet.has(record.classId);
      if (!canViewAll && !canViewSubject) return [];
      const visibleSubjects = canViewAll ? subjects : subjects.filter((item) => item === subject);
      if (visibleSubjects.length === 0) return [];
      return [{
        id: record.id,
        studentId: record.studentId,
        studentName: record.studentName,
        studentNo: record.studentNo,
        classId: record.classId,
        className: record.className,
        scores: projectScores(record.scores, visibleSubjects),
        assignedScores: projectScores(record.assignedScores, visibleSubjects),
        rawTotal: canViewAll ? record.rawTotal : null,
        assignedTotal: canViewAll ? record.assignedTotal : null,
        gradeRank: record.gradeRank,
        classRank: record.classRank,
      }];
    });
    return [{
      id: exam.id,
      cohortKey: exam.cohortKey,
      cohortLabel: exam.cohortLabel,
      name: exam.name,
      examDate: exam.examDate,
      subjects,
      subjectAverages,
      classSummaries,
      records,
      createdAt: exam.createdAt,
    }];
  });

  return {
    scope,
    scopeLabel,
    subject,
    roles,
    teachingClassIds,
    homeroomClassIds,
    fullClassIds,
    grades,
    classes,
    exams,
  };
}

export const gradeService = {
  async getQueryData(teacher: Teacher): Promise<GradeQueryData> {
    await delay(150);
    return buildQueryData(teacher);
  },

  async listCohorts(schoolId: string): Promise<GradeCohort[]> {
    await delay(120);
    return buildCohorts(schoolId);
  },

  async getImportContext(schoolId: string, cohortKey: string): Promise<GradeImportContext> {
    await delay(150);
    return requireContext(schoolId, cohortKey);
  },

  async getCohortTemplateProfile(
    schoolId: string,
    cohortKey: string,
  ): Promise<GradeTemplateProfile | null> {
    await delay(100);
    requireContext(schoolId, cohortKey);
    return readList<GradeTemplateProfile>("gradeTemplateProfiles")
      .find((item) => item.schoolId === schoolId && item.cohortKey === cohortKey) || null;
  },

  async saveCohortTemplateProfile(
    schoolId: string,
    cohortKey: string,
    teacherId: string,
    subjectsInput: string[],
    templates: GradeStatisticsTemplate[],
  ): Promise<GradeTemplateProfile> {
    await delay(180);
    maybeThrowError();
    requireGradeTemplateManager(schoolId, teacherId);
    const context = requireContext(schoolId, cohortKey);
    const subjects = normalizeSubjects(subjectsInput || []);
    const defaults = buildDefaultGradeSettings(
      subjects,
      context.classes.map((item) => item.id),
      context.teachers,
    );
    const normalizedTemplates = normalizeGradeSettings(
      { ...defaults, templates: templates || [] },
      subjects,
      context.classes.map((item) => item.id),
      context.teachers.map((item) => item.id),
    ).templates;
    const profiles = readList<GradeTemplateProfile>("gradeTemplateProfiles");
    const current = profiles.find((item) => item.schoolId === schoolId && item.cohortKey === cohortKey);
    const now = new Date().toISOString();
    const profile: GradeTemplateProfile = {
      id: current?.id || genId("grade-template-profile"),
      schoolId,
      cohortKey,
      templates: normalizedTemplates,
      updatedByTeacherId: teacherId,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    db.update("gradeTemplateProfiles", (items: GradeTemplateProfile[] = []) => current
      ? items.map((item) => item.id === current.id ? profile : item)
      : [...items, profile]);
    return profile;
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
