import type {
  SchoolClass, PersonalClass, Student, AnyClass, ClassroomChoice, Teacher,
  StudentArchiveOverview, StudentArchiveRecord, StudentArchiveStatus,
  StudentArchiveStatusInput, StudentContactInfo,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { schoolRosterService } from "./school-roster.js";
import { getStudentArchiveStatus } from "../../src/lib/student-archive.js";

export interface StudentInput {
  name: string;
  studentNo: string;
  grade?: string;
  gender?: "male" | "female";
  isExternal?: boolean;
  externalSchool?: string;
}

function updateSchoolClassStudentCount(classId: string, delta: number): void {
  db.update("schoolClasses", (list) =>
    list.map((schoolClass) =>
      schoolClass.id === classId
        ? { ...schoolClass, studentCount: Math.max(0, schoolClass.studentCount + delta) }
        : schoolClass,
    ),
  );
}

function requireActiveStudent(studentId: string): Student {
  const student = db.read("students").find((item) => item.id === studentId);
  if (!student) throw new Error("学生不存在");
  if (student.status !== "active") throw new Error("仅在读学生可执行该操作");
  return student;
}

const STUDENT_ARCHIVE_MANAGER_ROLES = new Set([
  "gradeLeader",
  "dean",
  "vicePrincipal",
  "principal",
]);
const STUDENT_ARCHIVE_EDITABLE_STATUSES = new Set<StudentArchiveStatus>([
  "attending",
  "studyAway",
  "visiting",
  "leave",
  "suspended",
  "transferred",
]);

function currentAffiliation(teacher: Teacher, schoolId: string | null) {
  return teacher.affiliations?.find((item) => item.schoolId === schoolId)
    || teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent)
    || null;
}

function canManageStudentArchive(teacher: Teacher, schoolId: string | null): boolean {
  const affiliation = currentAffiliation(teacher, schoolId);
  const role = affiliation?.role || teacher.role;
  if (role === "school_admin" || role === "platform_admin") return true;
  const roles = affiliation?.roles || teacher.roles || [];
  return roles.some((item) => STUDENT_ARCHIVE_MANAGER_ROLES.has(item));
}

function appendStudentArchiveRecord(record: StudentArchiveRecord): void {
  db.update("studentArchiveRecords", (records: StudentArchiveRecord[] | undefined) => [
    ...(records || []),
    record,
  ]);
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function normalizeContacts(input: StudentContactInfo): StudentContactInfo {
  const guardian1Name = cleanOptional(input.guardian1Name ?? input.guardianName);
  const guardian1Phone = cleanOptional(input.guardian1Phone ?? input.guardianPhone);
  return {
    studentPhone: cleanOptional(input.studentPhone),
    guardian1Name,
    guardian1Phone,
    guardian2Name: cleanOptional(input.guardian2Name),
    guardian2Phone: cleanOptional(input.guardian2Phone),
    guardianName: guardian1Name,
    guardianPhone: guardian1Phone,
    emergencyContact: cleanOptional(input.emergencyContact),
    emergencyPhone: cleanOptional(input.emergencyPhone),
  };
}

function syncStudentParentAuthorizations(student: Student, contacts: StudentContactInfo): void {
  const now = new Date().toISOString();
  const entries = [
    [contacts.guardian1Name ?? contacts.guardianName, contacts.guardian1Phone ?? contacts.guardianPhone],
    [contacts.guardian2Name, contacts.guardian2Phone],
  ] as const;
  const generated = entries.flatMap(([guardianName, rawPhone]) => {
    const phone = rawPhone?.trim().replace(/[\s()-]/g, "").replace(/^\+86/, "") || "";
    if (!/^1[3-9]\d{9}$/.test(phone)) return [];
    return [{
      id: `parent-auth-${student.id}-${phone}`,
      phone,
      guardianName,
      studentId: student.id,
      schoolId: student.schoolId,
      createdAt: now,
      updatedAt: now,
    }];
  });
  db.update("parentAuthorizations", (items: Array<Record<string, unknown>> | undefined) => [
    ...((items || []).filter((item) => item.studentId !== student.id)),
    ...generated,
  ]);
}

export const classService = {
  async listClassroomChoices(): Promise<ClassroomChoice[]> {
    await delay(100);
    const schoolNames = new Map(db.read("schools").map((school) => [school.id, school.name]));
    return db.read("schoolClasses")
      .filter((item) => item.status !== "graduated" && item.status !== "deleted")
      .map((item) => ({
        id: item.id,
        schoolId: item.schoolId,
        schoolName: schoolNames.get(item.schoolId) || "学校",
        name: item.name,
        grade: item.grade,
      }))
      .sort((a, b) => `${a.schoolName}${a.grade}${a.name}`.localeCompare(`${b.schoolName}${b.grade}${b.name}`, "zh-CN"));
  },

  async listSchoolClasses(schoolId: string): Promise<SchoolClass[]> {
    await delay(200);
    return db.read("schoolClasses").filter((c) => c.schoolId === schoolId && c.status !== "deleted");
  },

  async listPersonalClasses(teacherId: string): Promise<PersonalClass[]> {
    await delay(200);
    return db.read("personalClasses").filter((c) => c.teacherId === teacherId);
  },

  async listAllClasses(schoolId: string, teacherId: string): Promise<AnyClass[]> {
    await delay(250);
    const school = db.read("schoolClasses").filter((c) => c.schoolId === schoolId && c.status !== "deleted");
    const personal = db.read("personalClasses").filter((c) => c.teacherId === teacherId);
    return [...school, ...personal];
  },

  async createSchoolClass(
    schoolId: string,
    teacherId: string,
    name: string,
    grade: string,
    options?: { classTypeId?: string; gradeYear?: number; gradeId?: string },
  ): Promise<SchoolClass> {
    await delay(400);
    maybeThrowError();
    const gradeYear = options?.gradeYear;
    const newClass: SchoolClass = {
      id: genId("cls"),
      type: "school",
      schoolId,
      gradeId: options?.gradeId,
      name,
      grade,
      gradeYear,
      gradYear: gradeYear ? gradeYear + 3 : undefined,
      classTypeId: options?.classTypeId,
      studentCount: 0,
      status: "active",
      createdBy: teacherId,
      createdAt: new Date().toISOString(),
    };
    db.update("schoolClasses", (list) => [...list, newClass]);
    return newClass;
  },

  async createPersonalClass(
    teacherId: string,
    name: string,
    description: string,
  ): Promise<PersonalClass> {
    await delay(400);
    maybeThrowError();
    const newClass: PersonalClass = {
      id: genId("pcls"),
      type: "personal",
      teacherId,
      name,
      description,
      studentIds: [],
      createdAt: new Date().toISOString(),
    };
    db.update("personalClasses", (list) => [...list, newClass]);
    return newClass;
  },

  async addStudent(
    classId: string,
    schoolId: string,
    input: StudentInput,
  ): Promise<Student> {
    await delay(300);
    maybeThrowError();
    const schoolClass = db.read("schoolClasses").find((item) => item.id === classId);
    if (schoolClass?.status === "graduated") throw new Error("已毕业班级不能新增学生");
    if (schoolClass?.status === "deleted") throw new Error("回收站中的班级不能新增学生");
    const student: Student = {
      id: genId("stu"),
      name: input.name,
      studentNo: input.studentNo,
      classId,
      schoolId,
      grade: input.grade || "",
      gender: input.gender,
      isExternal: input.isExternal,
      externalSchool: input.externalSchool,
      status: "active",
      archiveStatus: input.isExternal ? "visiting" : "attending",
    };
    db.update("students", (list) => [...list, student]);
    // 更新班级学生数
    if (schoolClass) updateSchoolClassStudentCount(classId, 1);
    db.update("personalClasses", (list) =>
      list.map((c) =>
        c.id === classId ? { ...c, studentIds: [...c.studentIds, student.id] } : c,
      ),
    );
    return student;
  },

  async addExternalStudentToPersonalClass(
    classId: string,
    input: Omit<StudentInput, "isExternal"> & { externalSchool: string },
  ): Promise<Student> {
    await delay(300);
    maybeThrowError();
    const student: Student = {
      id: genId("stu"),
      name: input.name,
      studentNo: input.studentNo,
      classId: "",
      schoolId: "",
      grade: input.grade || "",
      gender: input.gender,
      isExternal: true,
      externalSchool: input.externalSchool,
      status: "active",
      archiveStatus: "visiting",
    };
    db.update("students", (list) => [...list, student]);
    db.update("personalClasses", (list) =>
      list.map((c) =>
        c.id === classId && !c.studentIds.includes(student.id)
          ? { ...c, studentIds: [...c.studentIds, student.id] }
          : c,
      ),
    );
    return student;
  },

  async listStudentsByClass(classId: string): Promise<Student[]> {
    await delay(200);
    const all = db.read("students");
    const personal = db.read("personalClasses").find((c) => c.id === classId);
    // 正常班级列表中只显示在读学生（挂起的学生在休学生收容所中）
    if (personal) {
      return all.filter((s) => personal.studentIds.includes(s.id) && s.status === "active");
    }
    return all.filter((s) => s.classId === classId && s.status === "active");
  },

  /** 获取挂起的学生列表（休学生收容所） */
  async listSuspendedStudents(schoolIdOrTeacherId: string, scope: "school" | "personal" = "school"): Promise<Student[]> {
    await delay(150);
    const all = db.read("students");
    if (scope === "school") {
      return all.filter((s) => s.schoolId === schoolIdOrTeacherId && s.status === "suspended");
    }
    // 个人身份：找挂起的校外学生（通过 personalClassStudents 或 personalClasses.studentIds 关联）
    const personalClasses = db.read("personalClasses").filter((c) => c.teacherId === schoolIdOrTeacherId);
    const studentIds = new Set<string>();
    personalClasses.forEach((c) => c.studentIds.forEach((id) => studentIds.add(id)));
    return all.filter((s) => studentIds.has(s.id) && s.status === "suspended");
  },

  async listStudentsBySchool(schoolId: string): Promise<Student[]> {
    await delay(200);
    return db.read("students").filter((s) => s.schoolId === schoolId && s.status !== "deleted");
  },

  /** 获取已毕业或已转校学生档案。 */
  async listDepartedStudents(schoolIdOrTeacherId: string, scope: "school" | "personal" = "school"): Promise<Student[]> {
    await delay(150);
    const departedStatuses = new Set(["graduated", "transferred"]);
    const all = db.read("students");
    if (scope === "school") {
      return all.filter((student) =>
        student.schoolId === schoolIdOrTeacherId && departedStatuses.has(student.status),
      );
    }
    const personalClasses = db.read("personalClasses").filter((item) => item.teacherId === schoolIdOrTeacherId);
    const studentIds = new Set(personalClasses.flatMap((item) => item.studentIds));
    return all.filter((student) => studentIds.has(student.id) && departedStatuses.has(student.status));
  },

  /**
   * 列出当前教师所教班级（由学校管理人员配置的任教/班主任班级，以及教师自己的个人班级）
   */
  async listMyClasses(schoolId: string | null, teacherId: string): Promise<AnyClass[]> {
    await delay(200);
    const teacher = db.read("teachers").find((item) => item.id === teacherId);
    const affiliation = teacher?.affiliations?.find((item) => item.schoolId === schoolId)
      || teacher?.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
      || teacher?.affiliations?.find((item) => item.isCurrent);
    const assignedSchoolClassIds = new Set([
      ...(affiliation?.teachingClassIds || teacher?.teachingClassIds || []),
      ...(affiliation?.homeroomClassIds || teacher?.homeroomClassIds || []),
    ]);
    const school = db
      .read("schoolClasses")
      .filter((c) =>
        c.schoolId === schoolId
        && assignedSchoolClassIds.has(c.id)
        && c.status !== "graduated"
        && c.status !== "deleted",
      );
    const personal = db
      .read("personalClasses")
      .filter((c) => c.teacherId === teacherId);
    return [...school, ...personal];
  },

  /**
   * 列出当前教师所教班级的学生
   */
  async listMyStudents(schoolId: string | null, teacherId: string): Promise<Student[]> {
    await delay(250);
    const myClasses = await this.listMyClasses(schoolId, teacherId);
    const allStudents = db.read("students");
    const schoolClassIds = new Set(
      myClasses.filter((c) => c.type === "school").map((c) => c.id),
    );
    const personalStudentIds = new Set(
      myClasses
        .filter((c): c is PersonalClass => c.type === "personal")
        .flatMap((c) => c.studentIds),
    );
    return allStudents.filter(
      (s) =>
        s.status === "active"
        && (schoolClassIds.has(s.classId) || personalStudentIds.has(s.id)),
    );
  },

  /**
   * 列出当前教师可查看的学生档案。普通教师查看任教班级，档案管理员查看全校。
   */
  async listMyStudentArchives(
    schoolId: string | null,
    teacherId: string,
  ): Promise<StudentArchiveOverview> {
    await delay(250);
    const teacher = db.read("teachers").find((item: Teacher) => item.id === teacherId) as Teacher | undefined;
    if (!teacher) throw new Error("教师不存在");

    const personalClasses = db.read("personalClasses")
      .filter((item: PersonalClass) => item.teacherId === teacherId);
    const schoolClasses = canManageStudentArchive(teacher, schoolId)
      ? db.read("schoolClasses").filter((item: SchoolClass) =>
          item.schoolId === schoolId && item.status !== "deleted" && item.status !== "graduated",
        )
      : (await this.listMyClasses(schoolId, teacherId))
          .filter((item): item is SchoolClass => item.type === "school");
    const classes: AnyClass[] = [...schoolClasses, ...personalClasses];
    const schoolClassIds = new Set(schoolClasses.map((item) => item.id));
    const personalStudentIds = new Set(personalClasses.flatMap((item) => item.studentIds));
    const students = (db.read("students") as Student[])
      .filter((student) =>
        student.status !== "deleted"
        && (schoolClassIds.has(student.classId) || personalStudentIds.has(student.id)),
      )
      .map((student) => ({ ...student, archiveStatus: getStudentArchiveStatus(student) }));
    const studentIds = new Set(students.map((student) => student.id));
    const records = ((db.read("studentArchiveRecords") || []) as StudentArchiveRecord[])
      .filter((record) => studentIds.has(record.studentId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return { classes, students, records };
  },

  async updateStudentContacts(
    studentId: string,
    input: StudentContactInfo & { note?: string },
    teacher: Teacher,
  ): Promise<Student> {
    await delay(200);
    maybeThrowError();
    const student = (db.read("students") as Student[]).find((item) => item.id === studentId);
    if (!student || student.status === "deleted") throw new Error("学生不存在");
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("无效的联系方式");
    }
    const contacts = normalizeContacts(input);
    let updated = student;
    db.update("students", (students: Student[]) => students.map((item) => {
      if (item.id !== studentId) return item;
      updated = { ...item, contacts };
      return updated;
    }));
    syncStudentParentAuthorizations(updated, contacts);
    appendStudentArchiveRecord({
      id: genId("stu-archive"),
      studentId,
      schoolId: student.schoolId,
      classId: student.classId,
      type: "contact",
      contacts,
      note: cleanOptional(input.note),
      createdBy: teacher.id,
      createdByName: teacher.name,
      createdAt: new Date().toISOString(),
    });
    return updated;
  },

  async updateStudentArchiveStatus(
    studentId: string,
    input: StudentArchiveStatusInput,
    teacher: Teacher,
  ): Promise<Student> {
    await delay(250);
    maybeThrowError();
    const student = (db.read("students") as Student[]).find((item) => item.id === studentId);
    if (!student || student.status === "deleted") throw new Error("学生不存在");
    if (!input || !STUDENT_ARCHIVE_EDITABLE_STATUSES.has(input.status)) {
      throw new Error("无效的学生档案状态");
    }
    const previousStatus = getStudentArchiveStatus(student);
    if (previousStatus === "graduated" || previousStatus === "transferred") {
      throw new Error("离校学生档案不能修改当前状态");
    }
    const externalSchool = cleanOptional(input.externalSchool);
    if (["studyAway", "visiting"].includes(input.status) && !externalSchool) {
      throw new Error("请填写借读学校");
    }
    const now = new Date().toISOString();
    const wasCounted = student.status === "active";
    let nextStatus = student.status;
    const archiveStatus: StudentArchiveStatus = input.status;
    let isExternal = student.isExternal;
    let suspendedAt = student.suspendedAt;
    let resumedAt = student.resumedAt;
    let transferredAt = student.transferredAt;
    let archiveStatusBeforeLeave = student.archiveStatusBeforeLeave;

    if (input.status === "leave" && previousStatus !== "leave") {
      archiveStatusBeforeLeave = previousStatus;
    } else if (previousStatus === "leave" && input.status !== "leave") {
      archiveStatusBeforeLeave = undefined;
    }

    if (input.status === "suspended") {
      nextStatus = "suspended";
      suspendedAt = now;
    } else if (input.status === "transferred") {
      nextStatus = "transferred";
      transferredAt = now;
    } else {
      nextStatus = "active";
      if (!wasCounted) resumedAt = now;
      if (input.status === "visiting") isExternal = true;
      if (input.status === "studyAway" || input.status === "attending") isExternal = false;
    }

    const isCounted = nextStatus === "active";
    if (wasCounted !== isCounted && student.classId
      && db.read("schoolClasses").some((item: SchoolClass) => item.id === student.classId)) {
      updateSchoolClassStudentCount(student.classId, isCounted ? 1 : -1);
    }

    let updated = student;
    db.update("students", (students: Student[]) => students.map((item) => {
      if (item.id !== studentId) return item;
      updated = {
        ...item,
        status: nextStatus,
        archiveStatus,
        archiveStatusBeforeLeave,
        isExternal,
        externalSchool: ["studyAway", "visiting"].includes(input.status)
          ? externalSchool
          : input.status === "attending"
            ? undefined
            : item.externalSchool,
        suspendedAt,
        resumedAt,
        transferredAt,
      };
      return updated;
    }));

    appendStudentArchiveRecord({
      id: genId("stu-archive"),
      studentId,
      schoolId: student.schoolId,
      classId: student.classId,
      type: "status",
      previousStatus,
      status: archiveStatus,
      externalSchool,
      startDate: cleanOptional(input.startDate),
      endDate: cleanOptional(input.endDate),
      note: cleanOptional(input.note),
      createdBy: teacher.id,
      createdByName: teacher.name,
      createdAt: now,
    });
    return updated;
  },

  /**
   * 列出当前教师所教班级ID集合
   */
  async listMyClassIds(schoolId: string | null, teacherId: string): Promise<Set<string>> {
    const myClasses = await this.listMyClasses(schoolId, teacherId);
    return new Set(myClasses.map((c) => c.id));
  },

  /**
   * 根据ID批量获取班级信息
   */
  async getClassesByIds(ids: string[]): Promise<AnyClass[]> {
    await delay(100);
    if (ids.length === 0) return [];
    const idSet = new Set(ids);
    const school = db.read("schoolClasses").filter((c) => idSet.has(c.id));
    const personal = db.read("personalClasses").filter((c) => idSet.has(c.id));
    return [...school, ...personal];
  },

  async addStudentToPersonalClass(
    classId: string,
    studentId: string,
  ): Promise<void> {
    await delay(200);
    db.update("personalClasses", (list) =>
      list.map((c) =>
        c.id === classId && !c.studentIds.includes(studentId)
          ? { ...c, studentIds: [...c.studentIds, studentId] }
          : c,
      ),
    );
  },

  async removeStudentFromPersonalClass(
    classId: string,
    studentId: string,
  ): Promise<void> {
    await delay(200);
    db.update("personalClasses", (list) =>
      list.map((c) =>
        c.id === classId
          ? { ...c, studentIds: c.studentIds.filter((id) => id !== studentId) }
          : c,
      ),
    );
  },

  async deleteClass(classId: string, isPersonal: boolean): Promise<void> {
    await delay(300);
    if (isPersonal) {
      db.update("personalClasses", (list) => list.filter((c) => c.id !== classId));
    } else {
      db.update("schoolClasses", (list) => list.filter((c) => c.id !== classId));
    }
  },

  async updateSchoolClass(
    classId: string,
    patch: Partial<Pick<SchoolClass, "name" | "grade" | "classTypeId" | "gradeYear">>,
  ): Promise<SchoolClass | null> {
    await delay(250);
    maybeThrowError();
    const current = db.read("schoolClasses").find((item) => item.id === classId);
    if (current?.status === "graduated") throw new Error("已毕业班级不能再修改");
    let updated: SchoolClass | null = null;
    db.update("schoolClasses", (list) =>
      list.map((c) => {
        if (c.id !== classId) return c;
        const gradeYear = patch.gradeYear !== undefined ? patch.gradeYear : c.gradeYear;
        updated = {
          ...c,
          ...patch,
          gradeYear,
          gradYear: gradeYear ? gradeYear + 3 : c.gradYear,
        };
        return updated;
      }),
    );

    // 如果班级年级变更，同步该班所有学生的年级
    if (patch.grade && updated) {
      const newGrade = patch.grade;
      db.update("students", (list) =>
        list.map((s) =>
          s.classId === classId && s.grade !== newGrade
            ? { ...s, grade: newGrade }
            : s,
        ),
      );
    }

    return updated;
  },

  async updatePersonalClass(
    classId: string,
    patch: Pick<PersonalClass, "name">,
  ): Promise<PersonalClass | null> {
    await delay(250);
    maybeThrowError();
    const name = patch.name.trim();
    if (!name) throw new Error("个人教学班名称不能为空");

    let updated: PersonalClass | null = null;
    db.update("personalClasses", (list) =>
      list.map((personalClass) => {
        if (personalClass.id !== classId) return personalClass;
        updated = { ...personalClass, name };
        return updated;
      }),
    );
    return updated;
  },

  async getStudent(studentId: string): Promise<Student | null> {
    await delay(100);
    return db.read("students").find((s) => s.id === studentId) || null;
  },

  /**
   * 更新学生基础信息（姓名、学号、年级、性别等）。
   * 用于扫描答题卡时按学号识别学生，所以学号是关键字段。
   */
  async updateStudent(
    studentId: string,
    patch: Partial<Pick<Student, "name" | "studentNo" | "grade" | "gender" | "subjectSelection" | "externalSchool">>,
  ): Promise<Student | null> {
    await delay(250);
    maybeThrowError();
    let updated: Student | null = null;
    db.update("students", (list) =>
      list.map((s) => {
        if (s.id !== studentId) return s;
        updated = { ...s, ...patch };
        return updated;
      }),
    );
    return updated;
  },

  /**
   * 学生换班：将学生从原班级转入新班级，可选择同时调整学号。
   * 学情数据（答题记录等）通过 studentId 关联，全部保留。
   * 规则：只要不同时改变姓名、学号、班级，就是同一个学生。
   */
  async transferStudent(
    studentId: string,
    toClassId: string,
    options?: { newStudentNo?: string },
  ): Promise<Student | null> {
    await delay(300);
    maybeThrowError();
    const student = requireActiveStudent(studentId);
    const targetSchoolClass = db.read("schoolClasses").find((item) => item.id === toClassId);
    const toClass = targetSchoolClass
      || db.read("personalClasses").find((item) => item.id === toClassId);
    if (!toClass) throw new Error("目标班级不存在");
    if (targetSchoolClass?.status === "graduated") throw new Error("不能转入已毕业班级");
    if (student.classId === toClassId) throw new Error("学生已在目标班级中");

    const fromClassId = student.classId;
    const studentNoChanged = options?.newStudentNo !== undefined && options.newStudentNo !== student.studentNo;
    const now = new Date().toISOString();

    // 更新学生信息
    let updated: Student | null = null;
    db.update("students", (list) =>
      list.map((s) => {
        if (s.id !== studentId) return s;
        updated = {
          ...s,
          classId: toClassId,
          studentNo: options?.newStudentNo ?? s.studentNo,
          grade: "grade" in toClass ? toClass.grade : s.grade,
          classHistory: [
            ...(s.classHistory || []),
            { fromClassId, toClassId, changedAt: now, studentNoChanged },
          ],
        };
        return updated;
      }),
    );

    // 更新原班级和新班级的学生人数（如果是学校班级）
    if (fromClassId && db.read("schoolClasses").some((item) => item.id === fromClassId)) {
      updateSchoolClassStudentCount(fromClassId, -1);
    }
    if (targetSchoolClass) updateSchoolClassStudentCount(toClassId, 1);

    return updated;
  },

  /**
   * 挂起学生（休学等）。挂起后学情数据全部保留，学生从班级列表移入休学生收容所。
   * 学生的 classId 保留为原班级，恢复时可默认回到原班。
   */
  async suspendStudent(studentId: string): Promise<Student | null> {
    await delay(250);
    maybeThrowError();
    const student = requireActiveStudent(studentId);

    let updated: Student | null = null;
    const now = new Date().toISOString();
    const fromClassId = student.classId;

    db.update("students", (list) =>
      list.map((s) => {
        if (s.id !== studentId) return s;
        updated = {
          ...s,
          status: "suspended",
          archiveStatus: "suspended",
          archiveStatusBeforeLeave: undefined,
          suspendedAt: now,
        };
        return updated;
      }),
    );

    // 更新学校班级学生数
    if (fromClassId && db.read("schoolClasses").some((item) => item.id === fromClassId)) {
      updateSchoolClassStudentCount(fromClassId, -1);
    }

    return updated;
  },

  /** 将单个在读学生标记为提前毕业。 */
  async graduateStudent(studentId: string): Promise<Student | null> {
    await delay(250);
    maybeThrowError();
    const student = requireActiveStudent(studentId);
    const now = new Date().toISOString();
    let updated: Student | null = null;

    db.update("students", (list) =>
      list.map((item) => {
        if (item.id !== studentId) return item;
        updated = {
          ...item,
          status: "graduated",
          archiveStatus: "graduated",
          archiveStatusBeforeLeave: undefined,
          graduatedAt: now,
          graduationType: "early",
        };
        return updated;
      }),
    );

    if (student.classId && db.read("schoolClasses").some((item) => item.id === student.classId)) {
      updateSchoolClassStudentCount(student.classId, -1);
    }
    return updated;
  },

  /** 将单个在读学生标记为转校离开。 */
  async transferOutStudent(studentId: string): Promise<Student | null> {
    await delay(250);
    maybeThrowError();
    const student = requireActiveStudent(studentId);
    const now = new Date().toISOString();
    let updated: Student | null = null;

    db.update("students", (list) =>
      list.map((item) => {
        if (item.id !== studentId) return item;
        updated = {
          ...item,
          status: "transferred",
          archiveStatus: "transferred",
          archiveStatusBeforeLeave: undefined,
          transferredAt: now,
        };
        return updated;
      }),
    );

    if (student.classId && db.read("schoolClasses").some((item) => item.id === student.classId)) {
      updateSchoolClassStudentCount(student.classId, -1);
    }
    return updated;
  },

  /** 将班级中的全部在读学生正常毕业，并封存班级。 */
  async graduateClass(classId: string): Promise<{ class: SchoolClass; graduatedCount: number }> {
    await delay(350);
    maybeThrowError();
    const schoolClass = db.read("schoolClasses").find((item) => item.id === classId);
    if (!schoolClass) throw new Error("班级不存在");
    if (schoolClass.status === "graduated") throw new Error("班级已毕业");

    const now = new Date().toISOString();
    const graduatingIds = new Set(
      db.read("students")
        .filter((student) => student.classId === classId && student.status === "active")
        .map((student) => student.id),
    );

    db.update("students", (list) =>
      list.map((student) =>
        graduatingIds.has(student.id)
          ? {
              ...student,
              status: "graduated",
              archiveStatus: "graduated",
              archiveStatusBeforeLeave: undefined,
              graduatedAt: now,
              graduationType: "regular",
            }
          : student,
      ),
    );

    let updatedClass = schoolClass;
    db.update("schoolClasses", (list) =>
      list.map((item) => {
        if (item.id !== classId) return item;
        updatedClass = {
          ...item,
          status: "graduated",
          graduatedAt: now,
          studentCount: 0,
        };
        return updatedClass;
      }),
    );

    return { class: updatedClass, graduatedCount: graduatingIds.size };
  },

  /**
   * 恢复学生学籍（从休学或转学回收状态恢复到某个班级）。
   * @param studentId 学生ID
   * @param toClassId 恢复后进入的班级ID（可选，不传则回到原班级）
   */
  async resumeStudent(
    studentId: string,
    toClassId?: string,
  ): Promise<Student | null> {
    await delay(250);
    maybeThrowError();
    const student = db.read("students").find((s) => s.id === studentId);
    if (!student) throw new Error("学生不存在");
    if (student.status !== "suspended" && student.status !== "transferred") {
      throw new Error("学生未处于休学或转学状态");
    }

    let updated: Student | null = null;
    const now = new Date().toISOString();
    const targetClassId = toClassId || student.classId;
    const targetClass = targetClassId
      ? db.read("schoolClasses").find((item) => item.id === targetClassId)
      : undefined;
    if (targetClass?.status === "graduated") throw new Error("不能恢复到已毕业班级");

    if (targetClassId && targetClassId !== student.classId) {
      // 恢复到不同的班级，走换班逻辑
      const fromClassId = student.classId;
      const toClass = targetClass;
      db.update("students", (list) =>
        list.map((s) => {
          if (s.id !== studentId) return s;
          updated = {
            ...s,
            status: "active",
            archiveStatus: "attending",
            archiveStatusBeforeLeave: undefined,
            resumedAt: now,
            classId: targetClassId,
            grade: toClass?.grade || s.grade,
            classHistory: [
              ...(s.classHistory || []),
              { fromClassId, toClassId: targetClassId, changedAt: now, studentNoChanged: false },
            ],
          };
          return updated;
        }),
      );

      // 更新新班级学生数（原班级在挂起时已经减过了）
      if (toClass) updateSchoolClassStudentCount(targetClassId, 1);
    } else {
      // 恢复到原班级
      db.update("students", (list) =>
        list.map((s) => {
          if (s.id !== studentId) return s;
          updated = {
            ...s,
            status: "active",
            archiveStatus: "attending",
            archiveStatusBeforeLeave: undefined,
            resumedAt: now,
          };
          return updated;
        }),
      );

      // 更新原班级学生数
      if (targetClassId) {
        if (targetClass) updateSchoolClassStudentCount(targetClassId, 1);
      }
    }
    return updated;
  },
  ...schoolRosterService,
};
