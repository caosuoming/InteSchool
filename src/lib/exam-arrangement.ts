import type {
  ExamArrangementContext,
  ExamArrangementInput,
  ExamClassRoomRule,
  ExamRoomConfig,
  ExamSeatAssignment,
  ExamStudentSubjectSelection,
  Student,
} from "../types/index.js";

interface SeatTask {
  student: Student;
  className: string;
  subjectLabel: string;
  sessionKey: string;
  eligibleRoomIds: string[];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeRooms(rooms: ExamRoomConfig[]): ExamRoomConfig[] {
  if (!Array.isArray(rooms) || rooms.length === 0) throw new Error("请至少配置一个考场");
  if (rooms.length > 200) throw new Error("单个方案最多配置 200 个考场");
  const ids = new Set<string>();
  const names = new Set<string>();
  return rooms.map((room, index) => {
    const id = room.id?.trim();
    const name = room.name?.trim();
    const capacity = Math.floor(Number(room.capacity));
    if (!id) throw new Error(`第 ${index + 1} 个考场缺少标识`);
    if (!name) throw new Error(`第 ${index + 1} 个考场名称不能为空`);
    if (ids.has(id)) throw new Error(`考场标识「${id}」重复`);
    if (names.has(name)) throw new Error(`考场名称「${name}」重复`);
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 1000) {
      throw new Error(`考场「${name}」容量应为 1 至 1000 人`);
    }
    ids.add(id);
    names.add(name);
    return { id, name, capacity };
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
    for (const subject of subjects) {
      const configured = uniqueStrings(source.subjectRoomIds?.[subject] || []);
      if (configured.some((roomId) => !roomIds.has(roomId))) {
        throw new Error("班级考场规则引用了不存在的考场");
      }
      subjectRoomIds[subject] = configured.length > 0 ? configured : rooms.map((room) => room.id);
    }
    rules.set(source.classId, { classId: source.classId, defaultSubjects, subjectRoomIds });
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
    });
  }
  for (const student of context.students) {
    if (!selections.has(student.id)) {
      selections.set(student.id, {
        studentId: student.id,
        subjects: [...(rules.get(student.classId)?.defaultSubjects || [])],
      });
    }
  }
  return selections;
}

function roomIntersection(roomLists: string[][], fallback: string[]): string[] {
  if (roomLists.length === 0) return fallback;
  return fallback.filter((roomId) => roomLists.every((list) => list.includes(roomId)));
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
  const students = [...context.students].sort((left, right) =>
    left.classId.localeCompare(right.classId) || left.studentNo.localeCompare(right.studentNo, "zh-CN"),
  );
  const tasks: SeatTask[] = [];

  if (input.mode === "subject") {
    for (const subject of subjects) {
      for (const student of students) {
        const selected = selections.get(student.id)?.subjects || [];
        if (!selected.includes(subject)) continue;
        const classItem = classMap.get(student.classId);
        if (!classItem) continue;
        const eligibleRoomIds = rules.get(student.classId)?.subjectRoomIds[subject] || allRoomIds;
        if (eligibleRoomIds.length === 0) {
          throw new Error(`「${classItem.name}」的「${subject}」未配置可用考场`);
        }
        tasks.push({
          student,
          className: classItem.name,
          subjectLabel: subject,
          sessionKey: `subject:${subject}`,
          eligibleRoomIds,
        });
      }
    }
    return tasks;
  }

  for (const student of students) {
    const selected = subjects.filter((subject) => selections.get(student.id)?.subjects.includes(subject));
    if (selected.length === 0) continue;
    const classItem = classMap.get(student.classId);
    if (!classItem) continue;
    const classRule = rules.get(student.classId);
    const eligibleRoomIds = roomIntersection(
      selected.map((subject) => classRule?.subjectRoomIds[subject] || allRoomIds),
      allRoomIds,
    );
    if (eligibleRoomIds.length === 0) {
      throw new Error(`「${classItem.name}」学生 ${student.name} 的选科组合没有共同可用考场`);
    }
    tasks.push({
      student,
      className: classItem.name,
      subjectLabel: selected.join(" / "),
      sessionKey: "combination",
      eligibleRoomIds,
    });
  }
  return tasks;
}

function allocateSession(
  tasks: SeatTask[],
  rooms: ExamRoomConfig[],
  sessionIndex: number,
  examDate?: string,
): ExamSeatAssignment[] {
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  const used = new Map(rooms.map((room) => [room.id, 0]));
  const sorted = [...tasks].sort((left, right) =>
    left.eligibleRoomIds.length - right.eligibleRoomIds.length
    || left.className.localeCompare(right.className, "zh-CN")
    || left.student.studentNo.localeCompare(right.student.studentNo, "zh-CN"),
  );
  const datePrefix = examDate?.replace(/\D/g, "").slice(0, 8) || "00000000";

  return sorted.map((task, index) => {
    const candidates = task.eligibleRoomIds
      .map((roomId) => roomMap.get(roomId))
      .filter((room): room is ExamRoomConfig => Boolean(room))
      .filter((room) => (used.get(room.id) || 0) < room.capacity)
      .sort((left, right) => {
        const leftUsed = used.get(left.id) || 0;
        const rightUsed = used.get(right.id) || 0;
        const ratio = leftUsed / left.capacity - rightUsed / right.capacity;
        return ratio || left.name.localeCompare(right.name, "zh-CN");
      });
    const room = candidates[0];
    if (!room) {
      throw new Error(`「${task.subjectLabel}」考场容量不足，无法安排 ${task.className} ${task.student.name}`);
    }
    const seatNo = (used.get(room.id) || 0) + 1;
    used.set(room.id, seatNo);
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
      roomName: room.name,
      seatNo,
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
  const rooms = normalizeRooms(input.rooms || []);
  const rules = normalizeRules(input, context, subjects, rooms);
  const selections = normalizeSelections(input, context, rules, subjects);
  const tasks = buildTasks(input, context, subjects, rooms, rules, selections);
  if (tasks.length === 0) throw new Error("当前选科设置没有需要安排的学生");

  const sessions = [...new Set(tasks.map((task) => task.sessionKey))];
  return sessions.flatMap((sessionKey, sessionIndex) => allocateSession(
    tasks.filter((task) => task.sessionKey === sessionKey),
    rooms,
    sessionIndex,
    input.examDate,
  ));
}
