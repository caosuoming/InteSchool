import type {
  ExamArrangement,
  ExamInvigilationConfig,
  ExamInvigilationSlotOverride,
  ExamInvigilationTeacher,
  ExamSubjectExamTime,
} from "@/types";

export interface ExamInvigilationRoomColumn {
  roomId: string;
  roomNumber: string;
  roomLocation: string;
  studentCount: number;
}

export interface ExamInvigilationSlotRow {
  key: string;
  date: string;
  period: "morning" | "afternoon";
  time: string;
  durationMinutes: number;
  subjects: string[];
  subjectLabel: string;
  roomStudentCounts: Record<string, number>;
  roomTeacherIds: Record<string, string | null>;
  outsideTeacherId: string | null;
  patrolTeacherId: string | null;
}

export interface ExamInvigilationTeacherStat {
  teacherId: string;
  name: string;
  subject: string;
  minutes: number;
  sessions: number;
}

export interface ExamInvigilationTable {
  rooms: ExamInvigilationRoomColumn[];
  rows: ExamInvigilationSlotRow[];
  teacherStats: ExamInvigilationTeacherStat[];
}

const PERIOD_ORDER = { morning: 0, afternoon: 1 } as const;

export function invigilationSlotKey(times: ExamSubjectExamTime[]): string {
  const first = times[0];
  const subjects = times.map((item) => item.subject).sort((left, right) => left.localeCompare(right, "zh-CN"));
  return `${first.date}|${first.period}|${first.time}|${subjects.join("+")}`;
}

function assignmentSubjects(subjectLabel: string): string[] {
  return subjectLabel.split(/\s*\/\s*/).map((item) => item.trim()).filter(Boolean);
}

function orderedSchedules(arrangement: ExamArrangement, config: ExamInvigilationConfig): ExamSubjectExamTime[] {
  const subjectOrder = new Map(arrangement.subjects.map((subject, index) => [subject, index]));
  return config.subjectTimes
    .filter((item) => item.subject && item.date && item.time && arrangement.subjects.includes(item.subject))
    .map((item) => ({
      ...item,
      durationMinutes: Math.max(1, Math.round(item.durationMinutes || 120)),
    }))
    .sort((left, right) => (
      left.date.localeCompare(right.date)
      || PERIOD_ORDER[left.period] - PERIOD_ORDER[right.period]
      || left.time.localeCompare(right.time)
      || (subjectOrder.get(left.subject) ?? 999) - (subjectOrder.get(right.subject) ?? 999)
      || left.subject.localeCompare(right.subject, "zh-CN")
    ));
}

function groupSchedules(arrangement: ExamArrangement, config: ExamInvigilationConfig): ExamSubjectExamTime[][] {
  const groups = new Map<string, ExamSubjectExamTime[]>();
  for (const item of orderedSchedules(arrangement, config)) {
    const key = `${item.date}|${item.period}|${item.time}`;
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  }
  return [...groups.values()];
}

function chooseTeacher(
  candidates: ExamInvigilationTeacher[],
  unavailable: Set<string>,
  minutes: Map<string, number>,
): ExamInvigilationTeacher | null {
  return candidates
    .filter((teacher) => !unavailable.has(teacher.id))
    .sort((left, right) => (
      (minutes.get(left.id) || 0) - (minutes.get(right.id) || 0)
      || left.name.localeCompare(right.name, "zh-CN")
    ))[0] || null;
}

function validManualTeacherId(
  value: string | null | undefined,
  teachers: Map<string, ExamInvigilationTeacher>,
): string | null | undefined {
  if (value === null) return null;
  if (!value) return undefined;
  return teachers.has(value) ? value : undefined;
}

function normalizeOverride(
  override: ExamInvigilationSlotOverride | undefined,
  teachers: Map<string, ExamInvigilationTeacher>,
): ExamInvigilationSlotOverride {
  const outsideTeacherId = validManualTeacherId(override?.outsideTeacherId, teachers);
  const patrolTeacherId = validManualTeacherId(override?.patrolTeacherId, teachers);
  return {
    roomTeacherIds: Object.fromEntries(Object.entries(override?.roomTeacherIds || {}).map(([roomId, teacherId]) => [
      roomId,
      validManualTeacherId(teacherId, teachers) ?? null,
    ])),
    ...(outsideTeacherId !== undefined ? { outsideTeacherId } : {}),
    ...(patrolTeacherId !== undefined ? { patrolTeacherId } : {}),
  };
}

export function buildExamInvigilationTable(
  arrangement: ExamArrangement,
  config: ExamInvigilationConfig,
): ExamInvigilationTable {
  const teachers = new Map(config.teachers.map((teacher) => [teacher.id, teacher]));
  const teacherMinutes = new Map(config.teachers.map((teacher) => [teacher.id, 0]));
  const teacherSessions = new Map(config.teachers.map((teacher) => [teacher.id, 0]));
  const groupedTimes = groupSchedules(arrangement, config);
  const usedRoomIds = new Set<string>();

  const rowInputs = groupedTimes.map((times) => {
    const subjects = times.map((item) => item.subject);
    const subjectSet = new Set(subjects);
    const roomStudents = new Map<string, Set<string>>();
    const roomSubjects = new Map<string, Set<string>>();
    for (const assignment of arrangement.assignments) {
      const matchingSubjects = assignmentSubjects(assignment.subjectLabel).filter((subject) => subjectSet.has(subject));
      if (matchingSubjects.length === 0) continue;
      const current = roomStudents.get(assignment.roomId) || new Set<string>();
      current.add(assignment.studentId);
      roomStudents.set(assignment.roomId, current);
      const currentSubjects = roomSubjects.get(assignment.roomId) || new Set<string>();
      matchingSubjects.forEach((subject) => currentSubjects.add(subject));
      roomSubjects.set(assignment.roomId, currentSubjects);
      usedRoomIds.add(assignment.roomId);
    }
    return {
      times,
      key: invigilationSlotKey(times),
      subjects,
      subjectSet,
      roomStudents,
      roomSubjects,
      durationMinutes: Math.max(...times.map((item) => item.durationMinutes || 120)),
    };
  });

  const rooms = arrangement.rooms
    .filter((room) => usedRoomIds.has(room.id))
    .map((room) => ({
      roomId: room.id,
      roomNumber: room.number || room.name,
      roomLocation: room.location || room.name,
      studentCount: Math.max(0, ...rowInputs.map((row) => row.roomStudents.get(room.id)?.size || 0)),
    }));

  const markAssignment = (teacherId: string | null | undefined, durationMinutes: number) => {
    if (!teacherId) return;
    teacherMinutes.set(teacherId, (teacherMinutes.get(teacherId) || 0) + durationMinutes);
    teacherSessions.set(teacherId, (teacherSessions.get(teacherId) || 0) + 1);
  };

  const rows = rowInputs.map((input) => {
    const unavailable = new Set<string>();
    const override = normalizeOverride(config.overrides?.[input.key], teachers);
    const roomTeacherIds: Record<string, string | null> = {};

    // Reserve every explicit manual assignment before filling automatic cells.
    for (const teacherId of Object.values(override.roomTeacherIds)) {
      if (teacherId) unavailable.add(teacherId);
    }
    if (override.outsideTeacherId) unavailable.add(override.outsideTeacherId);
    if (override.patrolTeacherId) unavailable.add(override.patrolTeacherId);

    const outsideOverridden = Object.prototype.hasOwnProperty.call(override, "outsideTeacherId");
    let outsideTeacherId = outsideOverridden ? override.outsideTeacherId ?? null : undefined;
    if (outsideTeacherId === undefined) {
      const teacher = chooseTeacher(
        config.teachers.filter((item) => item.isPrepLeader && input.subjectSet.has(item.subject)),
        unavailable,
        teacherMinutes,
      );
      outsideTeacherId = teacher?.id || null;
      if (teacher) unavailable.add(teacher.id);
    }

    const patrolOverridden = Object.prototype.hasOwnProperty.call(override, "patrolTeacherId");
    let patrolTeacherId = patrolOverridden ? override.patrolTeacherId ?? null : undefined;
    if (patrolTeacherId === undefined) {
      const teacher = chooseTeacher(
        config.teachers.filter((item) => item.isLeader),
        unavailable,
        teacherMinutes,
      );
      patrolTeacherId = teacher?.id || null;
      if (teacher) unavailable.add(teacher.id);
    }

    for (const room of rooms) {
      const count = input.roomStudents.get(room.roomId)?.size || 0;
      if (count === 0) {
        roomTeacherIds[room.roomId] = null;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(override.roomTeacherIds, room.roomId)) {
        roomTeacherIds[room.roomId] = override.roomTeacherIds[room.roomId] || null;
        continue;
      }
      const roomSubjectSet = input.roomSubjects.get(room.roomId) || input.subjectSet;
      const sameSubject = config.teachers.filter((item) => (
        roomSubjectSet.has(item.subject) && !item.isLeader && !item.isPrepLeader
      ));
      const fallbackSameSubject = config.teachers.filter((item) => roomSubjectSet.has(item.subject) && !item.isLeader);
      const teacher = chooseTeacher(sameSubject, unavailable, teacherMinutes)
        || chooseTeacher(fallbackSameSubject, unavailable, teacherMinutes);
      roomTeacherIds[room.roomId] = teacher?.id || null;
      if (teacher) unavailable.add(teacher.id);
    }

    Object.values(roomTeacherIds).forEach((teacherId) => markAssignment(teacherId, input.durationMinutes));
    markAssignment(outsideTeacherId, input.durationMinutes);
    markAssignment(patrolTeacherId, input.durationMinutes);

    const first = input.times[0];
    return {
      key: input.key,
      date: first.date,
      period: first.period,
      time: first.time,
      durationMinutes: input.durationMinutes,
      subjects: input.subjects,
      subjectLabel: input.subjects.join(" / "),
      roomStudentCounts: Object.fromEntries(rooms.map((room) => [room.roomId, input.roomStudents.get(room.roomId)?.size || 0])),
      roomTeacherIds,
      outsideTeacherId: outsideTeacherId || null,
      patrolTeacherId: patrolTeacherId || null,
    } satisfies ExamInvigilationSlotRow;
  });

  const teacherStats = config.teachers.map((teacher) => ({
    teacherId: teacher.id,
    name: teacher.name,
    subject: teacher.subject,
    minutes: teacherMinutes.get(teacher.id) || 0,
    sessions: teacherSessions.get(teacher.id) || 0,
  }));

  return { rooms, rows, teacherStats };
}
