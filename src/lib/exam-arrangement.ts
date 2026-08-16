import type {
  ExamArrangementContext,
  ExamArrangementInput,
  ExamClassRoomRule,
  ExamRoomConfig,
  ExamSeatAssignment,
  ExamSeatOrder,
  ExamStudentSeatPreference,
  ExamStudentSubjectSelection,
  Student,
} from "../types/index.js";

interface SeatTask {
  student: Student;
  className: string;
  subjectLabel: string;
  sessionKey: string;
  eligibleRoomIds: string[];
  concentrationKey?: string;
  seatPreference?: ExamStudentSeatPreference;
}

export interface ExamGroupSummary {
  key: string;
  sessionKey: string;
  subjectLabel: string;
  actualSubjectLabels: string[];
  studentCount: number;
  classIds: string[];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function examGroupKey(sessionKey: string, selectedSubjects: string[]): string {
  if (sessionKey === "combined") return `combined:${selectedSubjects.join("|")}`;
  if (sessionKey.startsWith("simultaneous:") && selectedSubjects.length === 1) {
    return `subject:${selectedSubjects[0]}`;
  }
  return sessionKey;
}

function normalizeSimultaneousSubjectGroups(
  input: ExamArrangementInput,
  subjects: string[],
  strict = false,
): string[][] {
  const subjectSet = new Set(subjects);
  const claimed = new Set<string>();
  const groups: string[][] = [];

  for (const source of input.simultaneousSubjectGroups || []) {
    const unknown = uniqueStrings(source || []).filter((subject) => !subjectSet.has(subject));
    if (strict && unknown.length > 0) {
      throw new Error(`同时考试组合包含未启用科目：${unknown.join("、")}`);
    }
    const normalized = subjects.filter((subject) => source?.includes(subject));
    const duplicated = normalized.filter((subject) => claimed.has(subject));
    if (strict && duplicated.length > 0) {
      throw new Error(`科目不能同时属于多个同时考试组合：${duplicated.join("、")}`);
    }
    const available = normalized.filter((subject) => !claimed.has(subject));
    if (strict && available.length < 2) {
      throw new Error("每个同时考试组合至少需要两个科目");
    }
    if (available.length < 2) continue;
    available.forEach((subject) => claimed.add(subject));
    groups.push(available);
  }
  return groups;
}

function simultaneousSessionKey(subject: string, groups: string[][]): string {
  const group = groups.find((items) => items.includes(subject));
  return group ? `simultaneous:${group.join("|")}` : `subject:${subject}`;
}

function taskConcentrationKey(student: Student, selectedSubjects: string[], groups: string[][]): string | undefined {
  const focused: string[] = [];
  groups.forEach((group, groupIndex) => {
    group.forEach((subject, subjectIndex) => {
      if (selectedSubjects.includes(subject)) {
        focused.push(`${String(groupIndex).padStart(2, "0")}:${String(subjectIndex).padStart(2, "0")}`);
      }
    });
  });
  if (focused.length === 0) return undefined;
  const selection = student.subjectSelection?.trim();
  return `${focused.join("|")}:${selection || selectedSubjects.join("|")}`;
}

export function summarizeExamGroups(
  input: ExamArrangementInput,
  context: ExamArrangementContext,
): ExamGroupSummary[] {
  const subjects = uniqueStrings(input.subjects || []);
  const simultaneousGroups = normalizeSimultaneousSubjectGroups(input, subjects);
  const separateSubjects = new Set(uniqueStrings(
    input.separateSubjects ?? (input.mode === "subject" ? subjects : []),
  ).filter((subject) => subjects.includes(subject)));
  const combinedSubjects = subjects.filter((subject) => !separateSubjects.has(subject));
  const selections = new Map((input.studentSubjects || []).map((item) => [item.studentId, item]));
  const groups = new Map<string, ExamGroupSummary>();

  const addGroup = (
    student: Student,
    sessionKey: string,
    groupSubjects: string[],
    actualSubjects: string[] = groupSubjects,
  ) => {
    if (actualSubjects.length === 0) return;
    const key = examGroupKey(sessionKey, groupSubjects);
    const actualSubjectLabel = actualSubjects.join(" / ");
    const current = groups.get(key);
    if (current) {
      current.studentCount += 1;
      if (!current.classIds.includes(student.classId)) current.classIds.push(student.classId);
      if (!current.actualSubjectLabels.includes(actualSubjectLabel)) current.actualSubjectLabels.push(actualSubjectLabel);
      return;
    }
    groups.set(key, {
      key,
      sessionKey,
      subjectLabel: groupSubjects.join(" / "),
      actualSubjectLabels: [actualSubjectLabel],
      studentCount: 1,
      classIds: [student.classId],
    });
  };

  for (const student of context.students) {
    const selection = selections.get(student.id);
    if (selection?.absent) continue;
    const selected = subjects.filter((subject) => (selection?.subjects || subjects).includes(subject));
    const selectedCombinedSubjects = combinedSubjects.filter((subject) => selected.includes(subject));
    addGroup(student, "combined", selectedCombinedSubjects);
    for (const subject of selected.filter((item) => separateSubjects.has(item))) {
      addGroup(student, simultaneousSessionKey(subject, simultaneousGroups), [subject]);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      actualSubjectLabels: [...group.actualSubjectLabels].sort((left, right) => left.localeCompare(right, "zh-CN")),
    }))
    .sort((left, right) =>
      left.sessionKey.localeCompare(right.sessionKey, "zh-CN")
      || left.subjectLabel.localeCompare(right.subjectLabel, "zh-CN"),
    );
}

function normalizeRooms(rooms: ExamRoomConfig[]): ExamRoomConfig[] {
  if (!Array.isArray(rooms) || rooms.length === 0) throw new Error("请至少配置一个考场");
  if (rooms.length > 200) throw new Error("单个方案最多配置 200 个考场");
  const ids = new Set<string>();
  const numbers = new Set<string>();
  return rooms.map((room, index) => {
    const id = room.id?.trim();
    const number = (room.number || room.name)?.trim();
    const location = (room.location || room.name || room.number)?.trim();
    const capacity = Math.floor(Number(room.capacity));
    if (!id) throw new Error(`第 ${index + 1} 个考场缺少标识`);
    if (!number) throw new Error(`第 ${index + 1} 个考场号不能为空`);
    if (!location) throw new Error(`考场「${number}」的位置不能为空`);
    if (ids.has(id)) throw new Error(`考场标识「${id}」重复`);
    if (numbers.has(number)) throw new Error(`考场号「${number}」重复`);
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 1000) {
      throw new Error(`考场「${number}」容量应为 1 至 1000 人`);
    }
    ids.add(id);
    numbers.add(number);
    return { id, name: number, number, location, capacity };
  });
}

function normalizeRules(
  input: ExamArrangementInput,
  context: ExamArrangementContext,
  subjects: string[],
  rooms: ExamRoomConfig[],
): Map<string, ExamClassRoomRule> {
  const classIds = new Set(context.classes.map((item) => item.id));
  const roomIds = new Set(rooms.map((item) => item.id));
  const subjectSet = new Set(subjects);
  const rules = new Map<string, ExamClassRoomRule>();

  for (const source of input.classRules || []) {
    if (!classIds.has(source.classId)) throw new Error("考场规则中包含不属于所选年级的班级");
    if (rules.has(source.classId)) throw new Error("同一班级只能配置一组考场规则");
    const defaultSubjects = uniqueStrings(source.defaultSubjects || []).filter((subject) => subjectSet.has(subject));
    const subjectRoomIds: Record<string, string[]> = {};
    const fixedSubjectRoomIds: Record<string, string> = {};
    for (const subject of subjects) {
      const configured = uniqueStrings(source.subjectRoomIds?.[subject] || []);
      if (configured.some((roomId) => !roomIds.has(roomId))) {
        throw new Error("班级考场规则引用了不存在的考场");
      }
      const fixedRoomId = source.fixedSubjectRoomIds?.[subject]?.trim();
      if (fixedRoomId && !roomIds.has(fixedRoomId)) {
        throw new Error("班级固定考场规则引用了不存在的考场");
      }
      if (fixedRoomId) fixedSubjectRoomIds[subject] = fixedRoomId;
      subjectRoomIds[subject] = fixedRoomId
        ? [fixedRoomId]
        : configured.length > 0 ? configured : rooms.map((room) => room.id);
    }
    rules.set(source.classId, { classId: source.classId, defaultSubjects, subjectRoomIds, fixedSubjectRoomIds });
  }

  for (const classItem of context.classes) {
    if (!rules.has(classItem.id)) {
      rules.set(classItem.id, {
        classId: classItem.id,
        defaultSubjects: [...subjects],
        subjectRoomIds: Object.fromEntries(subjects.map((subject) => [subject, rooms.map((room) => room.id)])),
      });
    }
  }
  return rules;
}

function normalizeSelections(
  input: ExamArrangementInput,
  context: ExamArrangementContext,
  rules: Map<string, ExamClassRoomRule>,
  subjects: string[],
): Map<string, ExamStudentSubjectSelection> {
  const studentMap = new Map(context.students.map((item) => [item.id, item]));
  const subjectSet = new Set(subjects);
  const selections = new Map<string, ExamStudentSubjectSelection>();
  for (const source of input.studentSubjects || []) {
    const student = studentMap.get(source.studentId);
    if (!student) throw new Error("学生选科数据中包含不属于所选年级的学生");
    if (selections.has(source.studentId)) throw new Error("同一学生只能配置一组选科数据");
    selections.set(source.studentId, {
      studentId: source.studentId,
      subjects: uniqueStrings(source.subjects || []).filter((subject) => subjectSet.has(subject)),
      absent: Boolean(source.absent),
      seatPreference: source.seatPreference === "first" || source.seatPreference === "last"
        ? source.seatPreference
        : undefined,
    });
  }
  for (const student of context.students) {
    if (!selections.has(student.id)) {
      selections.set(student.id, {
        studentId: student.id,
        subjects: [...(rules.get(student.classId)?.defaultSubjects || [])],
        absent: false,
      });
    }
  }
  return selections;
}

function roomIntersection(roomLists: string[][], fallback: string[]): string[] {
  if (roomLists.length === 0) return fallback;
  return fallback.filter((roomId) => roomLists.every((list) => list.includes(roomId)));
}

function createTask(
  student: Student,
  className: string,
  sessionKey: string,
  selectedSubjects: string[],
  rules: Map<string, ExamClassRoomRule>,
  allRoomIds: string[],
  groupRoomIds: Record<string, string[]>,
  simultaneousGroups: string[][],
  roomGroupKey?: string,
  fallbackRoomGroupKey?: string,
  seatPreference?: ExamStudentSeatPreference,
): SeatTask {
  const classRule = rules.get(student.classId);
  const subjectRoomIds = roomIntersection(
    selectedSubjects.map((subject) => classRule?.subjectRoomIds[subject] || allRoomIds),
    allRoomIds,
  );
  const groupKey = roomGroupKey || examGroupKey(sessionKey, selectedSubjects);
  const configuredRoomIds = groupRoomIds[groupKey]
    || (fallbackRoomGroupKey ? groupRoomIds[fallbackRoomGroupKey] : undefined);
  const eligibleRoomIds = configuredRoomIds
    ? subjectRoomIds.filter((roomId) => configuredRoomIds.includes(roomId))
    : subjectRoomIds;
  const subjectLabel = selectedSubjects.join(" / ");
  if (eligibleRoomIds.length === 0) {
    throw new Error(`「${className}」学生 ${student.name} 的「${subjectLabel}」没有共同可用考场`);
  }
  return {
    student,
    className,
    subjectLabel,
    sessionKey,
    eligibleRoomIds,
    concentrationKey: taskConcentrationKey(student, selectedSubjects, simultaneousGroups),
    seatPreference,
  };
}

function buildTasks(
  input: ExamArrangementInput,
  context: ExamArrangementContext,
  subjects: string[],
  rooms: ExamRoomConfig[],
  rules: Map<string, ExamClassRoomRule>,
  selections: Map<string, ExamStudentSubjectSelection>,
): SeatTask[] {
  const classMap = new Map(context.classes.map((item) => [item.id, item]));
  const allRoomIds = rooms.map((room) => room.id);
  const roomIdSet = new Set(allRoomIds);
  const groupRoomIds = Object.fromEntries(Object.entries(input.groupRoomIds || {}).map(([groupKey, roomIds]) => {
    const normalized = uniqueStrings(roomIds || []);
    if (normalized.length === 0) throw new Error(`考试组合「${groupKey}」至少需要选择一个考场`);
    if (normalized.some((roomId) => !roomIdSet.has(roomId))) {
      throw new Error(`考试组合「${groupKey}」引用了不存在的考场`);
    }
    return [groupKey, normalized];
  }));
  const separateSubjects = new Set(uniqueStrings(
    input.separateSubjects ?? (input.mode === "subject" ? subjects : []),
  ).filter((subject) => subjects.includes(subject)));
  const simultaneousGroups = normalizeSimultaneousSubjectGroups(input, subjects, true);
  for (const group of simultaneousGroups) {
    const separateCount = group.filter((subject) => separateSubjects.has(subject)).length;
    if (separateCount !== 0 && separateCount !== group.length) {
      throw new Error(`同时考试组合「${group.join("、")}」中的科目需全部单独排，或全部参与合并安排`);
    }
  }
  const combinedSubjects = subjects.filter((subject) => !separateSubjects.has(subject));
  const legacyCombinedGroupKey = examGroupKey("combined", combinedSubjects);
  const tasks: SeatTask[] = [];

  for (const student of context.students) {
    const selection = selections.get(student.id);
    if (!selection || selection.absent) continue;
    const selected = subjects.filter((subject) => selection.subjects.includes(subject));
    if (selected.length === 0) continue;
    for (const group of simultaneousGroups) {
      const conflicts = group.filter((subject) => selected.includes(subject));
      if (conflicts.length > 1) {
        throw new Error(`学生 ${student.name} 同时参加「${conflicts.join("、")}」，不能安排在同一考试场次`);
      }
    }
    const classItem = classMap.get(student.classId);
    if (!classItem) continue;

    const selectedCombinedSubjects = combinedSubjects.filter((subject) => selected.includes(subject));
    if (selectedCombinedSubjects.length > 0) {
      tasks.push(createTask(
        student,
        classItem.name,
        "combined",
        selectedCombinedSubjects,
        rules,
        allRoomIds,
        groupRoomIds,
        simultaneousGroups,
        undefined,
        legacyCombinedGroupKey,
        selection.seatPreference,
      ));
    }
    for (const subject of selected.filter((item) => separateSubjects.has(item))) {
      tasks.push(createTask(
        student,
        classItem.name,
        simultaneousSessionKey(subject, simultaneousGroups),
        [subject],
        rules,
        allRoomIds,
        groupRoomIds,
        simultaneousGroups,
        `subject:${subject}`,
        undefined,
        selection.seatPreference,
      ));
    }
  }
  return tasks;
}

function compareTasks(
  left: SeatTask,
  right: SeatTask,
  seatOrder: ExamSeatOrder,
  context: ExamArrangementContext,
  seed: string,
  respectSeatPreference = true,
): number {
  if (respectSeatPreference) {
    const preferenceRank = (preference?: ExamStudentSeatPreference) => preference === "first" ? 0 : preference === "last" ? 2 : 1;
    const preferenceDifference = preferenceRank(left.seatPreference) - preferenceRank(right.seatPreference);
    if (preferenceDifference !== 0) return preferenceDifference;
  }
  if (seatOrder === "previousRank") {
    const leftRank = context.previousGradeRanks?.[left.student.id] ?? Number.POSITIVE_INFINITY;
    const rightRank = context.previousGradeRanks?.[right.student.id] ?? Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) return leftRank - rightRank;
  } else {
    const leftHash = stableHash(`${seed}:${left.student.id}`);
    const rightHash = stableHash(`${seed}:${right.student.id}`);
    if (leftHash !== rightHash) return leftHash - rightHash;
  }
  return left.className.localeCompare(right.className, "zh-CN")
    || left.student.studentNo.localeCompare(right.student.studentNo, "zh-CN")
    || left.student.id.localeCompare(right.student.id);
}

function compareSeatTasks(
  left: SeatTask,
  right: SeatTask,
  seatOrder: ExamSeatOrder,
  context: ExamArrangementContext,
  seed: string,
): number {
  const preferenceRank = (preference?: ExamStudentSeatPreference) => preference === "first" ? 0 : preference === "last" ? 2 : 1;
  const preferenceDifference = preferenceRank(left.seatPreference) - preferenceRank(right.seatPreference);
  if (preferenceDifference !== 0) return preferenceDifference;
  const concentrationDifference = (left.concentrationKey || "~").localeCompare(right.concentrationKey || "~", "zh-CN");
  if (concentrationDifference !== 0) return concentrationDifference;
  return compareTasks(left, right, seatOrder, context, seed, false);
}

function allocateSession(
  tasks: SeatTask[],
  rooms: ExamRoomConfig[],
  sessionIndex: number,
  input: ExamArrangementInput,
  context: ExamArrangementContext,
): ExamSeatAssignment[] {
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const used = new Map(rooms.map((room) => [room.id, 0]));
  const seatOrder = input.seatOrder || "random";
  const seed = `${input.name}:${input.examDate || ""}:${tasks[0]?.sessionKey || sessionIndex}`;
  const sorted = [...tasks].sort((left, right) =>
    left.eligibleRoomIds.length - right.eligibleRoomIds.length
    || compareTasks(left, right, seatOrder, context, seed, false),
  );
  const datePrefix = input.examDate?.replace(/\D/g, "").slice(0, 8) || "00000000";

  const planned = sorted.map((task) => {
    const candidates = task.eligibleRoomIds
      .map((roomId) => roomMap.get(roomId))
      .filter((room): room is ExamRoomConfig => Boolean(room))
      .filter((room) => (used.get(room.id) || 0) < room.capacity)
      .sort((left, right) => {
        const leftUsed = used.get(left.id) || 0;
        const rightUsed = used.get(right.id) || 0;
        const ratio = leftUsed / left.capacity - rightUsed / right.capacity;
        return ratio || (left.number || left.name).localeCompare(right.number || right.name, "zh-CN");
      });
    const room = candidates[0];
    if (!room) {
      throw new Error(`「${task.subjectLabel}」考场容量不足，无法安排 ${task.className} ${task.student.name}`);
    }
    used.set(room.id, (used.get(room.id) || 0) + 1);
    return { task, room };
  });

  const seatNumbers = new Map<SeatTask, number>();
  for (const room of rooms) {
    planned
      .filter((item) => item.room.id === room.id)
      .sort((left, right) => compareSeatTasks(left.task, right.task, seatOrder, context, seed))
      .forEach((item, index) => seatNumbers.set(item.task, index + 1));
  }

  return planned
    .sort((left, right) => compareTasks(left.task, right.task, seatOrder, context, seed))
    .map(({ task, room }, index) => {
      const roomNumber = room.number || room.name;
      const roomLocation = room.location || room.name;
      return {
        id: `${task.sessionKey}:${task.student.id}`,
        studentId: task.student.id,
        studentName: task.student.name,
        studentNo: task.student.studentNo,
        classId: task.student.classId,
        className: task.className,
        subjectLabel: task.subjectLabel,
        sessionKey: task.sessionKey,
        roomId: room.id,
        roomName: roomNumber,
        roomNumber,
        roomLocation,
        seatNo: seatNumbers.get(task) || 1,
        admissionNo: `${datePrefix}${String(sessionIndex + 1).padStart(2, "0")}${String(index + 1).padStart(4, "0")}`,
      };
    });
}

export function generateExamAssignments(
  input: ExamArrangementInput,
  context: ExamArrangementContext,
): ExamSeatAssignment[] {
  const name = input.name?.trim();
  if (!name) throw new Error("请填写考试名称");
  if (!context.students.length) throw new Error("所选年级暂无在读学生");
  const subjects = uniqueStrings(input.subjects || []);
  if (subjects.length === 0) throw new Error("请至少配置一个考试科目");
  if (subjects.length > 30) throw new Error("考试科目不能超过 30 个");
  const invalidSeparate = uniqueStrings(input.separateSubjects || []).filter((subject) => !subjects.includes(subject));
  if (invalidSeparate.length > 0) throw new Error(`独立排考科目不存在：${invalidSeparate.join("、")}`);
  const rooms = normalizeRooms(input.rooms || []);
  const rules = normalizeRules(input, context, subjects, rooms);
  const selections = normalizeSelections(input, context, rules, subjects);
  const tasks = buildTasks(input, context, subjects, rooms, rules, selections);
  if (tasks.length === 0) throw new Error("当前设置没有需要安排的考生");

  const sessions = [...new Set(tasks.map((task) => task.sessionKey))];
  return sessions.flatMap((sessionKey, sessionIndex) => allocateSession(
    tasks.filter((task) => task.sessionKey === sessionKey),
    rooms,
    sessionIndex,
    input,
    context,
  ));
}
