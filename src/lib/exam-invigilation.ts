import type {
  ExamArrangement,
  ExamInvigilationConfig,
  ExamInvigilationPeriod,
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

export interface ExamInvigilationRoomLocationGroup {
  roomLocation: string;
  roomIds: string[];
  roomNumbers: string[];
  studentCount: number;
}

export interface ExamInvigilationSlotRow {
  key: string;
  date: string;
  period: ExamInvigilationPeriod;
  time: string;
  durationMinutes: number;
  subjects: string[];
  subjectLabel: string;
  roomStudentCounts: Record<string, number>;
  roomTeacherIds: Record<string, string | null>;
  outsideTeacherId: string | null;
  duplicateTeacherIds: string[];
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
  roomLocationGroups: ExamInvigilationRoomLocationGroup[];
  rows: ExamInvigilationSlotRow[];
  patrolTeacherIds: string[];
  teacherStats: ExamInvigilationTeacherStat[];
}

export interface BuildExamInvigilationTableOptions {
  /** 往期累计时长，用作自动排表的公平性基线，不计入本次 teacherStats。 */
  baselineTeacherMinutes?: Record<string, number>;
}

const PERIOD_ORDER: Record<ExamInvigilationPeriod, number> = { morning: 0, afternoon: 1, evening: 2 };
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const;

export function examInvigilationPeriodLabel(period: ExamInvigilationPeriod): string {
  if (period === "morning") return "上午";
  if (period === "afternoon") return "下午";
  return "晚上";
}

export function formatExamDateWithWeekday(date: string): string {
  const weekday = formatExamWeekday(date);
  return weekday ? `${date} ${weekday}` : date;
}

export function formatExamWeekday(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  return WEEKDAYS[value.getUTCDay()];
}

export function formatExamTimeRange(time: string, durationMinutes: number): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const start = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isFinite(start)) return time;
  const duration = Math.max(1, Math.round(durationMinutes || 0));
  const end = start + duration;
  const endMinutes = end % (24 * 60);
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  return `${time}–${end >= 24 * 60 ? "次日" : ""}${endTime}`;
}

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
  allowed: (teacher: ExamInvigilationTeacher) => boolean = () => true,
): ExamInvigilationTeacher | null {
  return candidates
    .filter((teacher) => !unavailable.has(teacher.id) && allowed(teacher))
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
  return {
    roomTeacherIds: Object.fromEntries(Object.entries(override?.roomTeacherIds || {}).map(([roomId, teacherId]) => [
      roomId,
      validManualTeacherId(teacherId, teachers) ?? null,
    ])),
    ...(outsideTeacherId !== undefined ? { outsideTeacherId } : {}),
  };
}

function resolvePatrolTeacherIds(
  config: ExamInvigilationConfig,
  teachers: Map<string, ExamInvigilationTeacher>,
): string[] {
  const requested = config.patrolTeacherIds !== undefined
    ? config.patrolTeacherIds
    : [
      ...config.teachers.filter((teacher) => teacher.isLeader).map((teacher) => teacher.id),
      ...Object.values(config.overrides || {}).flatMap((override) => override.patrolTeacherId ? [override.patrolTeacherId] : []),
    ];
  return [...new Set(requested)].filter((teacherId) => teachers.has(teacherId));
}

function groupRoomsByLocation(rooms: ExamInvigilationRoomColumn[]): {
  rooms: ExamInvigilationRoomColumn[];
  groups: ExamInvigilationRoomLocationGroup[];
} {
  const grouped = new Map<string, ExamInvigilationRoomColumn[]>();
  for (const room of rooms) {
    const current = grouped.get(room.roomLocation) || [];
    current.push(room);
    grouped.set(room.roomLocation, current);
  }
  const groups = [...grouped.entries()].map(([roomLocation, items]) => ({
    roomLocation,
    roomIds: items.map((room) => room.roomId),
    roomNumbers: items.map((room) => room.roomNumber),
    studentCount: items.reduce((sum, room) => sum + room.studentCount, 0),
  }));
  return { rooms: groups.flatMap((group) => group.roomIds.map((roomId) => rooms.find((room) => room.roomId === roomId)!)), groups };
}

function duplicateTeacherIds(assignments: Array<string | null | undefined>): string[] {
  const counts = new Map<string, number>();
  for (const teacherId of assignments) {
    if (!teacherId) continue;
    counts.set(teacherId, (counts.get(teacherId) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([teacherId]) => teacherId);
}

export function buildExamInvigilationTable(
  arrangement: ExamArrangement,
  config: ExamInvigilationConfig,
  options: BuildExamInvigilationTableOptions = {},
): ExamInvigilationTable {
  const teachers = new Map(config.teachers.map((teacher) => [teacher.id, teacher]));
  const teacherMinutes = new Map(config.teachers.map((teacher) => [teacher.id, 0]));
  const teacherPriorityMinutes = new Map(config.teachers.map((teacher) => [
    teacher.id,
    Math.max(0, options.baselineTeacherMinutes?.[teacher.id] || 0),
  ]));
  const teacherSessions = new Map(config.teachers.map((teacher) => [teacher.id, 0]));
  const teacherDates = new Map(config.teachers.map((teacher) => [teacher.id, new Set<string>()]));
  const groupedTimes = groupSchedules(arrangement, config);
  const patrolTeacherIds = resolvePatrolTeacherIds(config, teachers);
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

  const rawRooms = arrangement.rooms
    .filter((room) => usedRoomIds.has(room.id))
    .map((room) => ({
      roomId: room.id,
      roomNumber: room.number || room.name,
      roomLocation: room.location || room.name,
      studentCount: Math.max(0, ...rowInputs.map((row) => row.roomStudents.get(room.id)?.size || 0)),
    }));
  const groupedRooms = groupRoomsByLocation(rawRooms);
  const rooms = groupedRooms.rooms;

  const markAssignment = (teacherId: string | null | undefined, durationMinutes: number, date: string) => {
    if (!teacherId) return;
    teacherMinutes.set(teacherId, (teacherMinutes.get(teacherId) || 0) + durationMinutes);
    teacherPriorityMinutes.set(teacherId, (teacherPriorityMinutes.get(teacherId) || 0) + durationMinutes);
    teacherSessions.set(teacherId, (teacherSessions.get(teacherId) || 0) + 1);
    teacherDates.get(teacherId)?.add(date);
  };

  const matchesDateRequirement = (teacher: ExamInvigilationTeacher, date: string) => {
    const requirement = config.teacherRequirements?.[teacher.id]?.sameDay || "any";
    const dates = teacherDates.get(teacher.id) || new Set<string>();
    if (requirement === "no") return !dates.has(date);
    if (requirement === "yes") return dates.size === 0 || dates.has(date);
    return true;
  };

  const rows = rowInputs.map((input) => {
    const unavailable = new Set<string>(patrolTeacherIds);
    const override = normalizeOverride(config.overrides?.[input.key], teachers);
    const roomTeacherIds: Record<string, string | null> = {};

    const roomGroups = groupedRooms.groups.map((group) => {
      const activeRoomIds = group.roomIds.filter((roomId) => (input.roomStudents.get(roomId)?.size || 0) > 0);
      const overriddenRoomId = activeRoomIds.find((roomId) => Object.prototype.hasOwnProperty.call(override.roomTeacherIds, roomId));
      const overriddenTeacherId = overriddenRoomId === undefined ? undefined : override.roomTeacherIds[overriddenRoomId];
      return {
        group,
        activeRoomIds,
        canonicalRoomId: activeRoomIds[0],
        overriddenTeacherId,
      };
    });

    for (const item of roomGroups) {
      if (item.overriddenTeacherId) unavailable.add(item.overriddenTeacherId);
    }
    if (override.outsideTeacherId) unavailable.add(override.outsideTeacherId);

    const outsideOverridden = Object.prototype.hasOwnProperty.call(override, "outsideTeacherId");
    let outsideTeacherId = outsideOverridden ? override.outsideTeacherId ?? null : undefined;
    if (outsideTeacherId === undefined) {
      const teacher = chooseTeacher(
        config.teachers.filter((item) => item.isPrepLeader && input.subjectSet.has(item.subject)),
        unavailable,
        teacherPriorityMinutes,
        (candidate) => matchesDateRequirement(candidate, input.times[0].date),
      );
      outsideTeacherId = teacher?.id || null;
      if (teacher) unavailable.add(teacher.id);
    }

    for (const item of roomGroups) {
      item.group.roomIds.forEach((roomId) => { roomTeacherIds[roomId] = null; });
      if (!item.canonicalRoomId) continue;
      if (item.overriddenTeacherId !== undefined) {
        roomTeacherIds[item.canonicalRoomId] = item.overriddenTeacherId || null;
        continue;
      }
      const roomSubjectSet = new Set<string>();
      item.activeRoomIds.forEach((roomId) => {
        const subjects = input.roomSubjects.get(roomId);
        subjects?.forEach((subject) => roomSubjectSet.add(subject));
      });
      if (roomSubjectSet.size === 0) input.subjectSet.forEach((subject) => roomSubjectSet.add(subject));
      const sameSubject = config.teachers.filter((item) => (
        roomSubjectSet.has(item.subject) && !item.isLeader && !item.isPrepLeader
      ));
      const fallbackSameSubject = config.teachers.filter((item) => roomSubjectSet.has(item.subject) && !item.isLeader);
      const otherTeachers = config.teachers.filter((item) => !item.isLeader && !item.isPrepLeader);
      const fallbackOtherTeachers = config.teachers.filter((item) => !item.isLeader);
      const teacher = chooseTeacher(
        sameSubject,
        unavailable,
        teacherPriorityMinutes,
        (candidate) => matchesDateRequirement(candidate, input.times[0].date),
      ) || chooseTeacher(
        fallbackSameSubject,
        unavailable,
        teacherPriorityMinutes,
        (candidate) => matchesDateRequirement(candidate, input.times[0].date),
      ) || chooseTeacher(
        otherTeachers,
        unavailable,
        teacherPriorityMinutes,
        (candidate) => matchesDateRequirement(candidate, input.times[0].date),
      ) || chooseTeacher(
        fallbackOtherTeachers,
        unavailable,
        teacherPriorityMinutes,
        (candidate) => matchesDateRequirement(candidate, input.times[0].date),
      );
      roomTeacherIds[item.canonicalRoomId] = teacher?.id || null;
      if (teacher) unavailable.add(teacher.id);
    }

    const date = input.times[0].date;
    Object.values(roomTeacherIds).forEach((teacherId) => markAssignment(teacherId, input.durationMinutes, date));
    markAssignment(outsideTeacherId, input.durationMinutes, date);
    patrolTeacherIds.forEach((teacherId) => markAssignment(teacherId, input.durationMinutes, date));

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
      duplicateTeacherIds: duplicateTeacherIds([
        ...Object.values(roomTeacherIds),
        outsideTeacherId,
        ...patrolTeacherIds,
      ]),
    } satisfies ExamInvigilationSlotRow;
  });

  const teacherStats = config.teachers.map((teacher) => ({
    teacherId: teacher.id,
    name: teacher.name,
    subject: teacher.subject,
    minutes: teacherMinutes.get(teacher.id) || 0,
    sessions: teacherSessions.get(teacher.id) || 0,
  }));

  return {
    rooms,
    roomLocationGroups: groupedRooms.groups,
    rows,
    patrolTeacherIds,
    teacherStats,
  };
}
