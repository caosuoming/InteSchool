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
  groupKey: string;
  examSlotKeys: string[];
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

function examSlotKey(subject: string, groups: string[][]): string {
  const group = groups.find((items) => items.includes(subject));
  return group ? `simultaneous:${group.join("|")}` : `subject:${subject}`;
}

function groupExamSlotKeys(group: ExamGroupSummary, simultaneousGroups: string[][]): string[] {
  return uniqueStrings(group.subjectLabel.split(" / ")).map((subject) => examSlotKey(subject, simultaneousGroups));
}

export function examGroupsShareExamTime(
  input: ExamArrangementInput,
  left: ExamGroupSummary,
  right: ExamGroupSummary,
): boolean {
  const subjects = uniqueStrings(input.subjects || []);
  const simultaneousGroups = normalizeSimultaneousSubjectGroups(input, subjects);
  const leftSlots = new Set(groupExamSlotKeys(left, simultaneousGroups));
  return groupExamSlotKeys(right, simultaneousGroups).some((slotKey) => leftSlots.has(slotKey));
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

function configuredRoomsForGroup(input: ExamArrangementInput, group: ExamGroupSummary): string[] {
  const configured = uniqueStrings(input.groupRoomIds?.[group.key] || []);
  if (configured.length > 0) return configured;
  if (group.sessionKey === "combined") {
    const separateSubjects = new Set(uniqueStrings(input.separateSubjects || []));
    const combinedSubjects = uniqueStrings(input.subjects || []).filter((subject) => !separateSubjects.has(subject));
    const legacy = uniqueStrings(input.groupRoomIds?.[`combined:${combinedSubjects.join("|")}`] || []);
    if (legacy.length > 0) return legacy;
  }
  const defaultRooms = input.rooms
    .filter((room) => !room.classroomClassId || group.classIds.includes(room.classroomClassId))
    .map((room) => room.id);
  return defaultRooms.length > 0 ? defaultRooms : input.rooms.map((room) => room.id);
}

export function normalizeExamRoomSharing(
  input: ExamArrangementInput,
  context: ExamArrangementContext,
): ExamArrangementInput {
  const groups = summarizeExamGroups(input, context);
  if (groups.length === 0 || input.rooms.length === 0) {
    return { ...input, splitRoomIdsBySession: {} };
  }
  const roomMap = new Map(input.rooms.map((room) => [room.id, room]));
  const simultaneousGroups = normalizeSimultaneousSubjectGroups(input, uniqueStrings(input.subjects || []));
  const slotsByGroup = new Map(groups.map((group) => [group.key, groupExamSlotKeys(group, simultaneousGroups)]));
  const roomsByGroup = new Map(groups.map((group) => [group.key, configuredRoomsForGroup(input, group)]));
  try {
    const subjects = uniqueStrings(input.subjects || []);
    const rooms = normalizeRooms(input.rooms || []);
    const rules = normalizeRules(input, context, subjects, rooms);
    const selections = normalizeSelections(input, context, rules, subjects);
    const tasks = buildTasks(input, context, subjects, rooms, rules, selections);
    const eligibleByGroup = new Map<string, Set<string>>();
    for (const task of tasks) {
      const roomIds = eligibleByGroup.get(task.groupKey) || new Set<string>();
      task.eligibleRoomIds.forEach((roomId) => roomIds.add(roomId));
      eligibleByGroup.set(task.groupKey, roomIds);
    }
    for (const group of groups) {
      const eligible = [...(eligibleByGroup.get(group.key) || [])];
      if (eligible.length > 0) roomsByGroup.set(group.key, eligible);
    }
  } catch {
    // Draft editing can temporarily be incomplete; generation performs strict validation later.
  }
  const groupMap = new Map(groups.map((group) => [group.key, group]));
  const effectiveCapacities = new Map<string, Map<string, number>>();
  const totalCapacities = new Map<string, number>();
  const adjustedCapacities: Record<string, Record<string, number>> = structuredClone(input.groupRoomCapacities || {});
  const adjustedRoomIds: Record<string, string[]> = structuredClone(input.groupRoomIds || {});

  for (const group of groups) {
    const capacities = new Map<string, number>();
    for (const roomId of roomsByGroup.get(group.key) || []) {
      const room = roomMap.get(roomId);
      if (!room) continue;
      const explicit = input.groupRoomCapacities?.[group.key]?.[roomId];
      const capacity = explicit === undefined
        ? Math.min(room.capacity, group.studentCount)
        : Math.max(0, Math.min(room.capacity, Math.floor(Number(explicit))));
      capacities.set(roomId, capacity);
    }
    effectiveCapacities.set(group.key, capacities);
    totalCapacities.set(group.key, [...capacities.values()].reduce((sum, capacity) => sum + capacity, 0));
  }

  const sessions = new Map<string, ExamGroupSummary[]>();
  for (const group of groups) {
    const sessionGroups = sessions.get(group.sessionKey) || [];
    sessionGroups.push(group);
    sessions.set(group.sessionKey, sessionGroups);
  }
  const splitCandidates = new Map<string, Set<string>>();

  // Reduce only redundant capacity. This keeps every combination's total configured
  // positions at or above its actual student count whenever the selected rooms permit it.
  for (let pass = 0; pass < Math.max(1, groups.length * input.rooms.length); pass += 1) {
    let changed = false;
    for (const [sessionKey, sessionGroups] of sessions) {
      for (const room of input.rooms) {
        const groupsBySlot = new Map<string, ExamGroupSummary[]>();
        for (const group of sessionGroups) {
          if ((effectiveCapacities.get(group.key)?.get(room.id) || 0) <= 0) continue;
          for (const slotKey of slotsByGroup.get(group.key) || []) {
            const slotGroups = groupsBySlot.get(slotKey) || [];
            slotGroups.push(group);
            groupsBySlot.set(slotKey, slotGroups);
          }
        }
        for (const slotGroups of groupsBySlot.values()) {
          if (slotGroups.length < 2) continue;
          let overflow = slotGroups.reduce((sum, group) => (
            sum + (effectiveCapacities.get(group.key)?.get(room.id) || 0)
          ), 0) - room.capacity;
          if (overflow <= 0) continue;
          const candidates = splitCandidates.get(sessionKey) || new Set<string>();
          candidates.add(room.id);
          splitCandidates.set(sessionKey, candidates);

          while (overflow > 0) {
            const reducible = slotGroups
              .map((group) => {
                const capacity = effectiveCapacities.get(group.key)?.get(room.id) || 0;
                const surplus = Math.max(0, (totalCapacities.get(group.key) || 0) - group.studentCount);
                return { group, capacity, surplus, reducible: Math.min(capacity, surplus) };
              })
              .filter((item) => item.reducible > 0)
              .sort((left, right) => right.reducible - left.reducible
                || right.surplus - left.surplus
                || left.group.key.localeCompare(right.group.key, "zh-CN"));
            const candidate = reducible[0];
            if (!candidate) break;
            const reduction = Math.min(overflow, candidate.reducible);
            const nextCapacity = candidate.capacity - reduction;
            effectiveCapacities.get(candidate.group.key)?.set(room.id, nextCapacity);
            totalCapacities.set(candidate.group.key, (totalCapacities.get(candidate.group.key) || 0) - reduction);
            overflow -= reduction;
            changed = true;
            if (nextCapacity > 0) {
              adjustedCapacities[candidate.group.key] = {
                ...adjustedCapacities[candidate.group.key],
                [room.id]: nextCapacity,
              };
            } else {
              const selected = adjustedRoomIds[candidate.group.key]
                || roomsByGroup.get(candidate.group.key)
                || [];
              adjustedRoomIds[candidate.group.key] = selected.filter((roomId) => roomId !== room.id);
              if (adjustedCapacities[candidate.group.key]) {
                delete adjustedCapacities[candidate.group.key][room.id];
                if (Object.keys(adjustedCapacities[candidate.group.key]).length === 0) {
                  delete adjustedCapacities[candidate.group.key];
                }
              }
            }
          }
        }
      }
    }
    if (!changed) break;
  }

  const splitRoomIdsBySession: Record<string, string[]> = {};
  for (const [sessionKey, roomIds] of splitCandidates) {
    const sessionGroups = sessions.get(sessionKey) || [];
    const valid = [...roomIds].filter((roomId) => {
      const groupsBySlot = new Map<string, string[]>();
      for (const group of sessionGroups) {
        if ((effectiveCapacities.get(group.key)?.get(roomId) || 0) <= 0) continue;
        for (const slotKey of slotsByGroup.get(group.key) || []) {
          const groupKeys = groupsBySlot.get(slotKey) || [];
          groupKeys.push(group.key);
          groupsBySlot.set(slotKey, groupKeys);
        }
      }
      return [...groupsBySlot.values()].some((groupKeys) => new Set(groupKeys).size >= 2);
    });
    if (valid.length > 0) splitRoomIdsBySession[sessionKey] = valid;
  }
  for (const [sessionKey, roomIds] of Object.entries(input.splitRoomIdsBySession || {})) {
    const valid = uniqueStrings(roomIds || []).filter((roomId) => roomMap.has(roomId));
    if (valid.length > 0) {
      splitRoomIdsBySession[sessionKey] = [...new Set([...(splitRoomIdsBySession[sessionKey] || []), ...valid])];
    }
  }

  // Remove empty/stale capacity entries while preserving explicit user limits that
  // were not involved in an automatic conflict adjustment.
  for (const [groupKey, capacities] of Object.entries(adjustedCapacities)) {
    if (!groupMap.has(groupKey)) {
      delete adjustedCapacities[groupKey];
      continue;
    }
    for (const roomId of Object.keys(capacities)) {
      if (!roomMap.has(roomId)) delete capacities[roomId];
    }
    if (Object.keys(capacities).length === 0) delete adjustedCapacities[groupKey];
  }

  return {
    ...input,
    groupRoomIds: adjustedRoomIds,
    groupRoomCapacities: adjustedCapacities,
    splitRoomIdsBySession,
  };
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
    groupKey,
    examSlotKeys: uniqueStrings(selectedSubjects.map((subject) => examSlotKey(subject, simultaneousGroups))),
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
  const usedBySlot = new Map<string, number>();
  const usedTotal = new Map(rooms.map((room) => [room.id, 0]));
  const groupRoomUsed = new Map<string, number>();
  const seatOrder = input.seatOrder || "random";
  const sessionKey = tasks[0]?.sessionKey || String(sessionIndex);
  const seed = `${input.name}:${input.examDate || ""}:${sessionKey}`;
  const splitRoomIds = new Set(input.splitRoomIdsBySession?.[sessionKey] || []);
  const roomCapacityForGroup = (task: SeatTask, room: ExamRoomConfig): number => (
    input.groupRoomCapacities?.[task.groupKey]?.[room.id] ?? room.capacity
  );
  const groupRoomUsageKey = (task: SeatTask, roomId: string) => `${task.groupKey}\0${roomId}`;
  const roomSlotUsageKey = (roomId: string, slotKey: string) => `${roomId}\0${slotKey}`;
  const roomUsageRatio = (task: SeatTask, room: ExamRoomConfig): number => Math.max(
    0,
    ...task.examSlotKeys.map((slotKey) => (usedBySlot.get(roomSlotUsageKey(room.id, slotKey)) || 0) / room.capacity),
  );

  for (const roomId of splitRoomIds) {
    if (!roomMap.has(roomId)) throw new Error(`混合考场引用了不存在的考场：${roomId}`);
  }

  const sorted = [...tasks].sort((left, right) =>
    left.eligibleRoomIds.length - right.eligibleRoomIds.length
    || compareTasks(left, right, seatOrder, context, seed, false),
  );
  const datePrefix = input.examDate?.replace(/\D/g, "").slice(0, 8) || "00000000";

  const planned = sorted.map((task) => {
    const candidates = task.eligibleRoomIds
      .map((roomId) => roomMap.get(roomId))
      .filter((room): room is ExamRoomConfig => Boolean(room))
      .filter((room) => task.examSlotKeys.every((slotKey) => (
        (usedBySlot.get(roomSlotUsageKey(room.id, slotKey)) || 0) < room.capacity
      )))
      .filter((room) => (
        (groupRoomUsed.get(groupRoomUsageKey(task, room.id)) || 0) < roomCapacityForGroup(task, room)
      ))
      .sort((left, right) => {
        const totalRatio = (usedTotal.get(left.id) || 0) / left.capacity - (usedTotal.get(right.id) || 0) / right.capacity;
        const slotRatio = roomUsageRatio(task, left) - roomUsageRatio(task, right);
        return totalRatio || slotRatio || (left.number || left.name).localeCompare(right.number || right.name, "zh-CN");
      });
    const room = candidates[0];
    if (!room) {
      throw new Error(`「${task.subjectLabel}」考场容量不足，无法安排 ${task.className} ${task.student.name}`);
    }
    for (const slotKey of task.examSlotKeys) {
      const usageKey = roomSlotUsageKey(room.id, slotKey);
      usedBySlot.set(usageKey, (usedBySlot.get(usageKey) || 0) + 1);
    }
    usedTotal.set(room.id, (usedTotal.get(room.id) || 0) + 1);
    const usageKey = groupRoomUsageKey(task, room.id);
    groupRoomUsed.set(usageKey, (groupRoomUsed.get(usageKey) || 0) + 1);
    return { task, room };
  });

  const groupOrder = [...new Set(tasks.map((task) => task.groupKey))]
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const splitGroupIndexes = new Map<string, Map<string, number>>();
  for (const room of rooms) {
    if (!splitRoomIds.has(room.id)) continue;
    const roomItems = planned.filter((item) => item.room.id === room.id);
    const groupsBySlot = new Map<string, Set<string>>();
    for (const item of roomItems) {
      for (const slotKey of item.task.examSlotKeys) {
        const groupKeys = groupsBySlot.get(slotKey) || new Set<string>();
        groupKeys.add(item.task.groupKey);
        groupsBySlot.set(slotKey, groupKeys);
      }
    }
    const splitGroups = new Set<string>();
    for (const groupKeys of groupsBySlot.values()) {
      if (groupKeys.size < 2) continue;
      groupKeys.forEach((groupKey) => splitGroups.add(groupKey));
    }
    const orderedGroups = groupOrder.filter((groupKey) => splitGroups.has(groupKey));
    if (orderedGroups.length < 2) continue;
    splitGroupIndexes.set(room.id, new Map(orderedGroups.map((groupKey, index) => [groupKey, index + 1])));
  }
  const resolved = planned.map(({ task, room }) => {
    const mixedIndex = splitGroupIndexes.get(room.id)?.get(task.groupKey);
    const baseRoomNumber = room.number || room.name;
    return {
      task,
      room,
      logicalRoomId: mixedIndex ? `${room.id}::mixed::${encodeURIComponent(task.groupKey)}` : room.id,
      roomNumber: mixedIndex ? `${baseRoomNumber}混${mixedIndex}` : baseRoomNumber,
      physicalRoomId: mixedIndex ? room.id : undefined,
    };
  });

  const seatNumbers = new Map<SeatTask, number>();
  for (const logicalRoomId of [...new Set(resolved.map((item) => item.logicalRoomId))]) {
    const roomItems = resolved
      .filter((item) => item.logicalRoomId === logicalRoomId)
      .sort((left, right) => compareSeatTasks(left.task, right.task, seatOrder, context, seed));
    const capacity = roomItems[0]?.room.capacity || 0;
    if (roomItems.length <= capacity) {
      roomItems.forEach((item, index) => seatNumbers.set(item.task, index + 1));
      continue;
    }
    const occupiedBySlot = new Map<string, Set<number>>();
    for (const item of roomItems) {
      let seatNo = 1;
      while (seatNo <= item.room.capacity && item.task.examSlotKeys.some((slotKey) => (
        occupiedBySlot.get(slotKey)?.has(seatNo)
      ))) {
        seatNo += 1;
      }
      if (seatNo > item.room.capacity) {
        throw new Error(`「${item.task.subjectLabel}」在「${item.room.number || item.room.name}」中没有可复用的座位`);
      }
      seatNumbers.set(item.task, seatNo);
      for (const slotKey of item.task.examSlotKeys) {
        const occupied = occupiedBySlot.get(slotKey) || new Set<number>();
        occupied.add(seatNo);
        occupiedBySlot.set(slotKey, occupied);
      }
    }
  }

  return resolved
    .sort((left, right) => compareTasks(left.task, right.task, seatOrder, context, seed))
    .map(({ task, room, logicalRoomId, roomNumber, physicalRoomId }, index) => {
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
        ...(physicalRoomId ? { physicalRoomId } : {}),
        roomId: logicalRoomId,
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
  input = normalizeExamRoomSharing(input, context);
  const name = input.name?.trim();
  if (!name) throw new Error("请填写考试名称");
  if (!context.students.length) throw new Error("所选年级暂无在读学生");
  const subjects = uniqueStrings(input.subjects || []);
  if (subjects.length === 0) throw new Error("请至少配置一个考试科目");
  if (subjects.length > 30) throw new Error("考试科目不能超过 30 个");
  const invalidSeparate = uniqueStrings(input.separateSubjects || []).filter((subject) => !subjects.includes(subject));
  if (invalidSeparate.length > 0) throw new Error(`独立排考科目不存在：${invalidSeparate.join("、")}`);
  const rooms = normalizeRooms(input.rooms || []);
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  for (const [groupKey, capacities] of Object.entries(input.groupRoomCapacities || {})) {
    for (const [roomId, rawCapacity] of Object.entries(capacities || {})) {
      const room = roomMap.get(roomId);
      if (!room) throw new Error(`考试组合「${groupKey}」人数设置引用了不存在的考场`);
      const capacity = Math.floor(Number(rawCapacity));
      if (!Number.isFinite(capacity) || capacity < 1 || capacity > room.capacity) {
        throw new Error(`考试组合「${groupKey}」在「${room.number || room.name}」的布置人数应为 1 至 ${room.capacity} 人`);
      }
    }
  }
  for (const [sessionKey, roomIds] of Object.entries(input.splitRoomIdsBySession || {})) {
    const normalized = uniqueStrings(roomIds || []);
    const missing = normalized.filter((roomId) => !roomMap.has(roomId));
    if (missing.length > 0) throw new Error(`场次「${sessionKey}」的混合考场引用了不存在的考场`);
  }
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
