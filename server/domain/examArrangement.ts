import type {
  ExamArrangement,
  ExamArrangementContext,
  ExamArrangementInput,
  ExamInvigilationConfig,
  GradeExam,
  GradeImportContext,
} from "../../src/types/index.js";
import { generateExamAssignments } from "../../src/lib/exam-arrangement.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { gradeService } from "./grade.js";

function readArrangements(): ExamArrangement[] {
  const value = db.read("examArrangements");
  if (!Array.isArray(value)) return [];
  return (value as ExamArrangement[]).map((item) => {
    const rooms = item.rooms.map((room) => ({
      ...room,
      name: room.number || room.name,
      number: room.number || room.name,
      location: room.location || room.name,
    }));
    const roomMap = new Map(rooms.map((room) => [room.id, room]));
    return {
      ...item,
      subjectSetupMode: item.subjectSetupMode || "all",
      selectionSubjects: structuredClone(item.selectionSubjects || {}),
      separateSubjects: structuredClone(
        item.separateSubjects ?? (item.mode === "subject" ? item.subjects : []),
      ),
      simultaneousSubjectGroups: structuredClone(item.simultaneousSubjectGroups || []),
      seatOrder: item.seatOrder || "random",
      groupRoomIds: structuredClone(item.groupRoomIds || {}),
      rooms,
      studentSubjects: item.studentSubjects.map((selection) => ({
        ...selection,
        absent: Boolean(selection.absent),
      })),
      assignments: item.assignments.map((assignment) => {
        const room = roomMap.get(assignment.roomId);
        return {
          ...assignment,
          roomName: assignment.roomNumber || assignment.roomName,
          roomNumber: assignment.roomNumber || assignment.roomName,
          roomLocation: assignment.roomLocation || room?.location || assignment.roomName,
        };
      }),
      invigilation: item.invigilation ? structuredClone(item.invigilation) : undefined,
    };
  });
}

function toArrangementContext(context: GradeImportContext): ExamArrangementContext {
  return {
    cohort: context.cohort,
    classes: context.classes,
    students: context.students,
    teachers: context.teachers,
  };
}

export const examArrangementService = {
  async listCohorts(schoolId: string) {
    return gradeService.listCohorts(schoolId);
  },

  async getContext(schoolId: string, cohortKey: string): Promise<ExamArrangementContext> {
    const context = await gradeService.getImportContext(schoolId, cohortKey);
    const exams = db.read("gradeExams");
    const latestExam = (Array.isArray(exams) ? exams as GradeExam[] : [])
      .filter((exam) => exam.schoolId === schoolId && exam.cohortKey === cohortKey)
      .sort((left, right) => {
        const leftTime = left.examDate || left.updatedAt || left.createdAt;
        const rightTime = right.examDate || right.updatedAt || right.createdAt;
        return rightTime.localeCompare(leftTime);
      })[0];
    return {
      ...toArrangementContext(context),
      previousGradeRanks: latestExam
        ? Object.fromEntries(latestExam.records.map((record) => [record.studentId, record.gradeRank]))
        : undefined,
    };
  },

  async listArrangements(schoolId: string, cohortKey?: string): Promise<ExamArrangement[]> {
    await delay(120);
    return readArrangements()
      .filter((item) => item.schoolId === schoolId && (!cohortKey || item.cohortKey === cohortKey))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },

  async saveArrangement(
    schoolId: string,
    teacherId: string,
    input: ExamArrangementInput,
  ): Promise<ExamArrangement> {
    await delay(180);
    maybeThrowError();
    const context = await this.getContext(schoolId, input.cohortKey);
    const separateSubjects = input.separateSubjects ?? (input.mode === "subject" ? input.subjects : []);
    const preparedInput: ExamArrangementInput = {
      ...input,
      subjectSetupMode: input.subjectSetupMode || "all",
      selectionSubjects: structuredClone(input.selectionSubjects || {}),
      separateSubjects: structuredClone(separateSubjects),
      simultaneousSubjectGroups: structuredClone(input.simultaneousSubjectGroups || []),
      seatOrder: input.seatOrder || "random",
      groupRoomIds: structuredClone(input.groupRoomIds || {}),
      rooms: input.rooms.map((room) => ({
        ...room,
        name: room.number || room.name,
        number: room.number || room.name,
        location: room.location || room.name,
      })),
      studentSubjects: input.studentSubjects.map((selection) => ({
        ...selection,
        absent: Boolean(selection.absent),
      })),
    };
    const assignments = generateExamAssignments(preparedInput, context);
    const existing = input.id
      ? readArrangements().find((item) => item.id === input.id)
      : undefined;
    if (input.id && !existing) throw new Error("考场安排方案不存在");
    if (existing && (existing.schoolId !== schoolId || existing.teacherId !== teacherId)) {
      throw new Error("无权修改其他教师的考场安排方案");
    }

    const now = new Date().toISOString();
    const arrangement: ExamArrangement = {
      id: existing?.id || genId("exam-arrangement"),
      schoolId,
      teacherId,
      cohortKey: context.cohort.key,
      cohortLabel: context.cohort.label,
      name: preparedInput.name.trim(),
      examDate: preparedInput.examDate || undefined,
      mode: preparedInput.mode,
      subjectSetupMode: preparedInput.subjectSetupMode,
      subjects: [...preparedInput.subjects],
      selectionSubjects: structuredClone(preparedInput.selectionSubjects),
      separateSubjects: structuredClone(preparedInput.separateSubjects),
      simultaneousSubjectGroups: structuredClone(preparedInput.simultaneousSubjectGroups),
      seatOrder: preparedInput.seatOrder,
      groupRoomIds: structuredClone(preparedInput.groupRoomIds),
      rooms: structuredClone(preparedInput.rooms),
      classRules: structuredClone(preparedInput.classRules),
      studentSubjects: structuredClone(preparedInput.studentSubjects),
      assignments,
      invigilation: existing?.invigilation ? structuredClone(existing.invigilation) : undefined,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    db.update("examArrangements", (items: ExamArrangement[]) => existing
      ? items.map((item) => item.id === existing.id ? arrangement : item)
      : [...items, arrangement]);
    return arrangement;
  },

  async saveInvigilationConfig(
    schoolId: string,
    arrangementId: string,
    config: ExamInvigilationConfig,
  ): Promise<ExamArrangement> {
    await delay(120);
    maybeThrowError();
    const current = readArrangements().find((item) => item.id === arrangementId);
    if (!current) throw new Error("考场安排方案不存在");
    if (current.schoolId !== schoolId) throw new Error("无权修改其他学校的监考表");

    const subjectSet = new Set(current.subjects);
    const teacherIds = new Set<string>();
    const teachers = config.teachers.map((teacher) => {
      const name = teacher.name.trim();
      const subject = teacher.subject.trim();
      if (!name || !subject) throw new Error("任课教师的姓名和学科不能为空");
      if (teacherIds.has(teacher.id)) throw new Error("任课教师配置中存在重复记录");
      teacherIds.add(teacher.id);
      return {
        ...teacher,
        name,
        subject,
        isPrepLeader: Boolean(teacher.isPrepLeader),
        isLeader: Boolean(teacher.isLeader),
      };
    });
    const subjectTimes = config.subjectTimes.map((item) => {
      if (!subjectSet.has(item.subject)) throw new Error(`考试方案不存在学科「${item.subject}」`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw new Error(`「${item.subject}」考试日期格式不正确`);
      if (!/^\d{2}:\d{2}$/.test(item.time)) throw new Error(`「${item.subject}」考试时刻格式不正确`);
      return {
        ...item,
        durationMinutes: Math.max(1, Math.round(item.durationMinutes || 120)),
      };
    });
    const requestedPatrolTeacherIds = config.patrolTeacherIds ?? [
      ...teachers.filter((teacher) => teacher.isLeader).map((teacher) => teacher.id),
      ...Object.values(config.overrides || {}).flatMap((override) => override.patrolTeacherId ? [override.patrolTeacherId] : []),
    ];
    const patrolTeacherIds = [...new Set(requestedPatrolTeacherIds)].filter((id) => teacherIds.has(id));
    const validOverrides = Object.fromEntries(Object.entries(config.overrides || {}).map(([key, override]) => [
      key,
      {
        roomTeacherIds: Object.fromEntries(Object.entries(override.roomTeacherIds || {}).filter(([, teacherId]) => (
          teacherId === null || teacherIds.has(teacherId)
        ))),
        ...(override.outsideTeacherId === null || (override.outsideTeacherId && teacherIds.has(override.outsideTeacherId))
          ? { outsideTeacherId: override.outsideTeacherId }
          : {}),
      },
    ]));
    const teacherMap = new Map(teachers.map((teacher) => [teacher.id, teacher.name]));
    for (const override of Object.values(validOverrides)) {
      const assignedTeacherIds = [
        ...Object.values(override.roomTeacherIds),
        override.outsideTeacherId,
        ...patrolTeacherIds,
      ].filter((id): id is string => Boolean(id));
      const seen = new Set<string>();
      const duplicates = new Set<string>();
      for (const id of assignedTeacherIds) {
        if (seen.has(id)) duplicates.add(id);
        seen.add(id);
      }
      if (duplicates.size > 0) {
        const names = [...duplicates].map((id) => teacherMap.get(id) || "未知教师").join("、");
        throw new Error(`同一场监考不能安排同一位老师：${names}`);
      }
    }
    const teacherNotes = Object.fromEntries(Object.entries(config.teacherNotes || {}).flatMap(([teacherId, note]) => {
      if (!teacherIds.has(teacherId)) return [];
      const value = note.trim();
      return value ? [[teacherId, value]] : [];
    }));
    const teacherRequirements = Object.fromEntries(Object.entries(config.teacherRequirements || {}).flatMap(([teacherId, requirement]) => {
      if (!teacherIds.has(teacherId)) return [];
      const sameDay = requirement.sameDay;
      if (sameDay !== "yes" && sameDay !== "no") return [];
      return [[teacherId, { sameDay }]];
    }));
    const invigilation: ExamInvigilationConfig = {
      teachers,
      subjectTimes,
      patrolTeacherIds,
      overrides: validOverrides,
      ...(Object.keys(teacherNotes).length ? { teacherNotes } : {}),
      ...(Object.keys(teacherRequirements).length ? { teacherRequirements } : {}),
    };
    const updated: ExamArrangement = {
      ...current,
      invigilation,
      updatedAt: new Date().toISOString(),
    };
    db.update("examArrangements", (items: ExamArrangement[]) => items.map((item) => (
      item.id === arrangementId ? updated : item
    )));
    return updated;
  },

  async deleteArrangement(arrangementId: string): Promise<void> {
    await delay(120);
    maybeThrowError();
    const exists = readArrangements().some((item) => item.id === arrangementId);
    if (!exists) throw new Error("考场安排方案不存在");
    db.update("examArrangements", (items: ExamArrangement[]) =>
      items.filter((item) => item.id !== arrangementId),
    );
  },
};
