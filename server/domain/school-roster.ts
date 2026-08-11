import type {
  SchoolClass,
  SchoolGrade,
  SchoolRosterRecycleBin,
  Student,
  StudentRosterImportOptions,
  StudentRosterImportResult,
  StudentRosterImportRow,
  StudentStatus,
} from "../../src/types/index.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { db } from "../runtime-db.js";

const GRADE_SEQUENCE = ["高一", "高二", "高三"] as const;

type ActiveStudentStatus = Exclude<StudentStatus, "deleted">;

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeClassName(value: string): string {
  const normalized = normalizeName(value);
  return /^\d+$/.test(normalized) ? `${normalized}班` : normalized;
}

function requireGrade(gradeId: string): SchoolGrade {
  const grade = (db.read("schoolGrades") as SchoolGrade[]).find((item) => item.id === gradeId);
  if (!grade) throw new Error("年级不存在");
  return grade;
}

function activeClasses(): SchoolClass[] {
  return (db.read("schoolClasses") as SchoolClass[]).filter((item) => item.status !== "deleted");
}

function updateClassCount(classId: string, delta: number): void {
  db.update("schoolClasses", (list: SchoolClass[]) => list.map((item) =>
    item.id === classId
      ? { ...item, studentCount: Math.max(0, item.studentCount + delta) }
      : item,
  ));
}

function createClassForGrade(grade: SchoolGrade, teacherId: string, name: string): SchoolClass {
  const now = new Date().toISOString();
  return {
    id: genId("cls"),
    type: "school",
    schoolId: grade.schoolId,
    gradeId: grade.id,
    name,
    grade: grade.grade,
    gradeYear: grade.gradYear - 3,
    gradYear: grade.gradYear,
    studentCount: 0,
    status: "active",
    createdBy: teacherId,
    createdAt: now,
  };
}

function restoreStatus(student: Student): ActiveStudentStatus {
  return student.deletedFromStatus || "active";
}

export const schoolRosterService = {
  async listSchoolGrades(schoolId: string): Promise<SchoolGrade[]> {
    await delay(120);
    return (db.read("schoolGrades") as SchoolGrade[])
      .filter((item) => item.schoolId === schoolId)
      .sort((left, right) => right.gradYear - left.gradYear || left.name.localeCompare(right.name, "zh-CN"));
  },

  async createSchoolGrade(
    schoolId: string,
    teacherId: string,
    gradYear: number,
    grade: string,
  ): Promise<SchoolGrade> {
    await delay(220);
    maybeThrowError();
    if (!Number.isInteger(gradYear) || gradYear < 2000 || gradYear > 2200) {
      throw new Error("毕业年份不合法");
    }
    if (!GRADE_SEQUENCE.includes(grade as (typeof GRADE_SEQUENCE)[number])) {
      throw new Error("年级仅支持高一、高二或高三");
    }
    const duplicate = (db.read("schoolGrades") as SchoolGrade[])
      .some((item) => item.schoolId === schoolId && item.gradYear === gradYear);
    if (duplicate) throw new Error(`${gradYear}届已存在`);

    const now = new Date().toISOString();
    const created: SchoolGrade = {
      id: genId("grade"),
      schoolId,
      name: `${gradYear}届${grade}`,
      grade,
      gradYear,
      status: "active",
      createdBy: teacherId,
      createdAt: now,
      updatedAt: now,
    };
    db.update("schoolGrades", (list: SchoolGrade[]) => [...list, created]);
    return created;
  },

  async advanceSchoolGrade(gradeId: string): Promise<{
    grade: SchoolGrade;
    updatedClasses: number;
    updatedStudents: number;
  }> {
    await delay(300);
    maybeThrowError();
    const current = requireGrade(gradeId);
    const index = GRADE_SEQUENCE.indexOf(current.grade as (typeof GRADE_SEQUENCE)[number]);
    if (index < 0 || index === GRADE_SEQUENCE.length - 1) {
      throw new Error("高三年级不能继续升学年，请使用整班毕业功能");
    }
    const nextGrade = GRADE_SEQUENCE[index + 1];
    const now = new Date().toISOString();
    let updatedGrade = current;

    db.update("schoolGrades", (list: SchoolGrade[]) => list.map((item) => {
      if (item.id !== gradeId) return item;
      updatedGrade = {
        ...item,
        grade: nextGrade,
        name: `${item.gradYear}届${nextGrade}`,
        updatedAt: now,
      };
      return updatedGrade;
    }));

    const classIds = new Set<string>();
    let updatedClasses = 0;
    db.update("schoolClasses", (list: SchoolClass[]) => list.map((item) => {
      if (item.gradeId !== gradeId || item.status === "deleted") return item;
      classIds.add(item.id);
      updatedClasses += 1;
      const renamed = item.name.startsWith(current.grade)
        ? `${nextGrade}${item.name.slice(current.grade.length)}`
        : item.name;
      return { ...item, grade: nextGrade, name: renamed };
    }));

    let updatedStudents = 0;
    db.update("students", (list: Student[]) => list.map((item) => {
      if (!classIds.has(item.classId) || item.status === "deleted") return item;
      updatedStudents += 1;
      return { ...item, grade: nextGrade };
    }));

    return { grade: updatedGrade, updatedClasses, updatedStudents };
  },

  async bulkCreateSchoolClasses(
    gradeId: string,
    teacherId: string,
    names: string[],
  ): Promise<SchoolClass[]> {
    await delay(260);
    maybeThrowError();
    const grade = requireGrade(gradeId);
    if (grade.status === "graduated") throw new Error("已毕业年级不能新增班级");

    const normalized = [...new Set(names.map(normalizeName).filter(Boolean))];
    if (normalized.length === 0) throw new Error("请至少填写一个班级名称");
    if (normalized.length > 100) throw new Error("单次最多新增 100 个班级");

    const existing = new Set(
      activeClasses()
        .filter((item) => item.gradeId === gradeId)
        .map((item) => item.name.toLocaleLowerCase("zh-CN")),
    );
    const duplicates = normalized.filter((name) => existing.has(name.toLocaleLowerCase("zh-CN")));
    if (duplicates.length > 0) throw new Error(`班级已存在：${duplicates.join("、")}`);

    const created = normalized.map((name) => createClassForGrade(grade, teacherId, name));
    db.update("schoolClasses", (list: SchoolClass[]) => [...list, ...created]);
    return created;
  },

  async bulkImportStudents(
    gradeId: string,
    teacherId: string,
    rows: StudentRosterImportRow[],
    options?: StudentRosterImportOptions,
  ): Promise<StudentRosterImportResult> {
    await delay(350);
    maybeThrowError();
    const grade = requireGrade(gradeId);
    if (grade.status === "graduated") throw new Error("已毕业年级不能导入学生");
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("导入文件中没有学生数据");
    if (rows.length > 5000) throw new Error("单次最多导入 5000 名学生");
    const missingStudents = options?.missingStudents || "keep";
    if (!(["keep", "delete"] as const).includes(missingStudents)) {
      throw new Error("无效的旧名单学生处理方式");
    }

    const normalizedRows = rows.map((row, index) => {
      const className = normalizeClassName(row.className || "");
      const name = normalizeName(row.name || "");
      const studentNo = normalizeName(row.studentNo || "");
      if (!className || !name) {
        throw new Error(`第 ${index + 2} 行缺少班级或姓名`);
      }
      return {
        className,
        name,
        studentNo,
        subjectSelection: normalizeName(row.subjectSelection || "") || undefined,
        isExternal: Boolean(row.isExternal),
        gender: row.gender,
      } satisfies StudentRosterImportRow;
    });

    const gradeClasses = activeClasses().filter((item) => item.gradeId === gradeId);
    const classMap = new Map(gradeClasses.map((item) => [item.name.toLocaleLowerCase("zh-CN"), item]));
    const missingNames = [...new Set(normalizedRows
      .map((row) => row.className)
      .filter((name) => !classMap.has(name.toLocaleLowerCase("zh-CN"))))];
    const createdClasses = missingNames.map((name) => createClassForGrade(grade, teacherId, name));
    createdClasses.forEach((item) => classMap.set(item.name.toLocaleLowerCase("zh-CN"), item));

    const allStudents = db.read("students") as Student[];
    const gradeClassIds = new Set(gradeClasses.map((item) => item.id));
    const existingGradeStudents = allStudents.filter((item) =>
      item.schoolId === grade.schoolId
      && item.status === "active"
      && gradeClassIds.has(item.classId),
    );
    const existingByName = new Map<string, Student[]>();
    for (const student of existingGradeStudents) {
      const key = normalizeName(student.name).toLocaleLowerCase("zh-CN");
      existingByName.set(key, [...(existingByName.get(key) || []), student]);
    }

    const seenNumbers = new Set<string>();
    let skippedStudents = 0;
    const effectiveRows = normalizedRows.filter((row) => {
      const numberKey = row.studentNo.toLocaleLowerCase("zh-CN");
      if (!numberKey) return true;
      if (seenNumbers.has(numberKey)) {
        skippedStudents += 1;
        return false;
      }
      seenNumbers.add(numberKey);
      return true;
    });

    const matchedExistingIds = new Set<string>();
    const assignments = effectiveRows.map((row) => {
      const targetClass = classMap.get(row.className.toLocaleLowerCase("zh-CN"));
      if (!targetClass) throw new Error(`班级不存在：${row.className}`);
      const nameKey = row.name.toLocaleLowerCase("zh-CN");
      const candidates = (existingByName.get(nameKey) || [])
        .filter((student) => !matchedExistingIds.has(student.id));

      let matched: Student | undefined;
      if (candidates.length === 1) {
        matched = candidates[0];
      } else if (candidates.length > 1) {
        if (row.studentNo) {
          const sameNumber = candidates.filter((student) =>
            student.studentNo.trim().toLocaleLowerCase("zh-CN") === row.studentNo.toLocaleLowerCase("zh-CN"),
          );
          if (sameNumber.length === 1) matched = sameNumber[0];
        }
        if (!matched) {
          const sameClass = candidates.filter((student) => student.classId === targetClass.id);
          if (sameClass.length === 1) matched = sameClass[0];
        }
        if (!matched) {
          throw new Error(`同一年级存在多名“${row.name}”，无法仅按姓名确定对应学生；请补充可区分的学号或班级`);
        }
      }
      if (matched) matchedExistingIds.add(matched.id);
      return { row, targetClass, matched };
    });

    const unmatchedExistingIds = new Set(
      existingGradeStudents
        .filter((student) => !matchedExistingIds.has(student.id))
        .map((student) => student.id),
    );

    const importedNumbers = new Map<string, string>();
    for (const { row } of assignments) {
      const key = row.studentNo.toLocaleLowerCase("zh-CN");
      if (key) importedNumbers.set(key, row.name);
    }
    for (const student of allStudents) {
      if (student.schoolId !== grade.schoolId || student.status === "deleted") continue;
      const numberKey = student.studentNo.trim().toLocaleLowerCase("zh-CN");
      if (!numberKey || !importedNumbers.has(numberKey)) continue;
      if (matchedExistingIds.has(student.id)) continue;
      if (missingStudents === "delete" && unmatchedExistingIds.has(student.id)) continue;
      throw new Error(`学号 ${student.studentNo} 已被“${student.name}”使用，无法导入“${importedNumbers.get(numberKey)}”`);
    }

    const now = new Date().toISOString();
    const updatedById = new Map<string, Student>();
    const createdStudents: Student[] = [];

    for (const { row, targetClass, matched } of assignments) {
      if (!matched) {
        createdStudents.push({
          id: genId("stu"),
          name: row.name,
          studentNo: row.studentNo,
          classId: targetClass.id,
          schoolId: grade.schoolId,
          grade: grade.grade,
          gender: row.gender,
          subjectSelection: row.subjectSelection,
          isExternal: row.isExternal,
          status: "active",
        });
        continue;
      }

      const classChanged = matched.classId !== targetClass.id;
      const studentNoChanged = matched.studentNo !== row.studentNo;
      updatedById.set(matched.id, {
        ...matched,
        name: row.name,
        studentNo: row.studentNo,
        classId: targetClass.id,
        grade: grade.grade,
        gender: row.gender ?? matched.gender,
        subjectSelection: row.subjectSelection,
        isExternal: row.isExternal,
        classHistory: classChanged
          ? [
              ...(matched.classHistory || []),
              {
                fromClassId: matched.classId,
                toClassId: targetClass.id,
                changedAt: now,
                studentNoChanged,
              },
            ]
          : matched.classHistory,
      });
    }

    const deletedStudentIds = missingStudents === "delete" ? unmatchedExistingIds : new Set<string>();
    const nextStudents = allStudents.map((student) => {
      const updated = updatedById.get(student.id);
      if (updated) return updated;
      if (!deletedStudentIds.has(student.id)) return student;
      return {
        ...student,
        deletedFromStatus: student.status,
        status: "deleted" as const,
        deletedAt: now,
      };
    });
    nextStudents.push(...createdStudents);

    const activeCountByClass = new Map<string, number>();
    for (const student of nextStudents) {
      if (student.status !== "active") continue;
      activeCountByClass.set(student.classId, (activeCountByClass.get(student.classId) || 0) + 1);
    }

    db.update("schoolClasses", (list: SchoolClass[]) => [
      ...list.map((item) => {
        if (!gradeClassIds.has(item.id)) return item;
        return { ...item, studentCount: activeCountByClass.get(item.id) || 0 };
      }),
      ...createdClasses.map((item) => ({
        ...item,
        studentCount: activeCountByClass.get(item.id) || 0,
      })),
    ]);
    db.update("students", () => nextStudents);

    return {
      createdClasses: createdClasses.length,
      createdStudents: createdStudents.length,
      updatedStudents: updatedById.size,
      deletedStudents: deletedStudentIds.size,
      skippedStudents,
    };
  },

  async listSchoolRosterRecycleBin(schoolId: string): Promise<SchoolRosterRecycleBin> {
    await delay(120);
    return {
      classes: (db.read("schoolClasses") as SchoolClass[])
        .filter((item) => item.schoolId === schoolId && item.status === "deleted")
        .sort((left, right) => String(right.deletedAt || "").localeCompare(String(left.deletedAt || ""))),
      students: (db.read("students") as Student[])
        .filter((item) => item.schoolId === schoolId && item.status === "deleted")
        .sort((left, right) => String(right.deletedAt || "").localeCompare(String(left.deletedAt || ""))),
    };
  },

  async deleteStudent(studentId: string): Promise<Student | null> {
    await delay(180);
    maybeThrowError();
    const current = (db.read("students") as Student[]).find((item) => item.id === studentId);
    if (!current) throw new Error("学生不存在");
    if (current.status === "deleted") return current;
    const now = new Date().toISOString();
    let deleted: Student | null = null;
    db.update("students", (list: Student[]) => list.map((item) => {
      if (item.id !== studentId) return item;
      deleted = {
        ...item,
        deletedFromStatus: item.status as ActiveStudentStatus,
        status: "deleted",
        deletedAt: now,
      };
      return deleted;
    }));
    if (current.status === "active") updateClassCount(current.classId, -1);
    return deleted;
  },

  async restoreStudent(studentId: string): Promise<Student | null> {
    await delay(180);
    maybeThrowError();
    const current = (db.read("students") as Student[]).find((item) => item.id === studentId);
    if (!current) throw new Error("学生不存在");
    if (current.status !== "deleted") throw new Error("学生不在回收站中");
    const targetClass = (db.read("schoolClasses") as SchoolClass[]).find((item) => item.id === current.classId);
    if (!targetClass || targetClass.status === "deleted") throw new Error("请先恢复学生所属班级");
    const status = restoreStatus(current);
    let restored: Student | null = null;
    db.update("students", (list: Student[]) => list.map((item) => {
      if (item.id !== studentId) return item;
      const { deletedAt: _deletedAt, deletedFromStatus: _deletedFromStatus, ...base } = item;
      restored = { ...base, status };
      return restored;
    }));
    if (status === "active") updateClassCount(current.classId, 1);
    return restored;
  },

  async deleteClass(classId: string, isPersonal: boolean): Promise<void> {
    await delay(220);
    maybeThrowError();
    if (isPersonal) {
      db.update("personalClasses", (list: Array<{ id: string }>) => list.filter((item) => item.id !== classId));
      return;
    }
    const current = (db.read("schoolClasses") as SchoolClass[]).find((item) => item.id === classId);
    if (!current) throw new Error("班级不存在");
    if (current.status === "deleted") return;
    const now = new Date().toISOString();
    db.update("schoolClasses", (list: SchoolClass[]) => list.map((item) =>
      item.id === classId
        ? {
            ...item,
            deletedFromStatus: item.status === "graduated" ? "graduated" : "active",
            status: "deleted",
            deletedAt: now,
            studentCount: 0,
          }
        : item,
    ));
    db.update("students", (list: Student[]) => list.map((item) => {
      if (item.classId !== classId || item.status === "deleted") return item;
      return {
        ...item,
        deletedFromStatus: item.status,
        status: "deleted",
        deletedAt: now,
      };
    }));
  },

  async restoreSchoolClass(classId: string): Promise<{ class: SchoolClass; restoredStudents: number }> {
    await delay(240);
    maybeThrowError();
    const current = (db.read("schoolClasses") as SchoolClass[]).find((item) => item.id === classId);
    if (!current) throw new Error("班级不存在");
    if (current.status !== "deleted") throw new Error("班级不在回收站中");
    const status = current.deletedFromStatus || "active";
    let restoredClass = current;
    let restoredStudents = 0;
    let activeStudents = 0;

    db.update("students", (list: Student[]) => list.map((item) => {
      if (item.classId !== classId || item.status !== "deleted") return item;
      const nextStatus = restoreStatus(item);
      const { deletedAt: _deletedAt, deletedFromStatus: _deletedFromStatus, ...base } = item;
      restoredStudents += 1;
      if (nextStatus === "active") activeStudents += 1;
      return { ...base, status: nextStatus };
    }));

    db.update("schoolClasses", (list: SchoolClass[]) => list.map((item) => {
      if (item.id !== classId) return item;
      const { deletedAt: _deletedAt, deletedFromStatus: _deletedFromStatus, ...base } = item;
      restoredClass = {
        ...base,
        status,
        studentCount: status === "active" ? activeStudents : 0,
      };
      return restoredClass;
    }));

    return { class: restoredClass, restoredStudents };
  },
};
