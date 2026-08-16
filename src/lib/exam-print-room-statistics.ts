import type { ExamArrangement, ExamSeatAssignment } from "@/types";

const CORE_SUBJECTS = ["语文", "数学", "英语"];
const SUBJECT_SHORT_NAMES: Record<string, string> = {
  语文: "语",
  数学: "数",
  英语: "外",
  物理: "物",
  化学: "化",
  生物: "生",
  历史: "史",
  政治: "政",
  地理: "地",
};
const SELECTION_SUBJECT_ORDER = ["物理", "历史", "化学", "生物", "政治", "地理"];
const REPORT_SUBJECT_ORDER = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "政治", "地理"];

export interface ExamPrintRoomStatisticsRoom {
  roomId: string;
  roomNumber: string;
  roomLocation: string;
  selectionLabel: string;
}

export interface ExamPrintRoomStatisticsRow {
  label: string;
  subjects: string[];
  counts: number[];
  total: number;
}

export interface ExamPrintRoomStatistics {
  rooms: ExamPrintRoomStatisticsRoom[];
  rows: ExamPrintRoomStatisticsRow[];
}

function assignmentSubjects(assignment: ExamSeatAssignment): string[] {
  return assignment.subjectLabel
    .split(/\s*\/\s*/)
    .map((subject) => subject.trim())
    .filter(Boolean);
}

function shortSubject(subject: string): string {
  return SUBJECT_SHORT_NAMES[subject] || subject;
}

function selectionLabel(subjects: string[]): string {
  const selected = new Set(subjects);
  const electives = SELECTION_SUBJECT_ORDER.filter((subject) => selected.has(subject));
  const orderedElectives = [
    ...electives,
    ...subjects.filter((subject) => !CORE_SUBJECTS.includes(subject) && !electives.includes(subject)),
  ];
  const displaySubjects = orderedElectives.length > 0
    ? orderedElectives
    : CORE_SUBJECTS.filter((subject) => selected.has(subject));
  return displaySubjects.map(shortSubject).join("") || "—";
}

function sameCounts(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function countSubjectByRoom(
  arrangement: ExamArrangement,
  subject: string,
  roomIds: string[],
): number[] {
  const separateSubjects = new Set(
    arrangement.separateSubjects
      ?? (arrangement.mode === "subject" ? arrangement.subjects : []),
  );
  const sessionKey = separateSubjects.has(subject) ? `subject:${subject}` : "combined";
  const roomStudentIds = new Map(roomIds.map((roomId) => [roomId, new Set<string>()]));

  for (const assignment of arrangement.assignments) {
    if (assignment.sessionKey !== sessionKey) continue;
    if (!assignmentSubjects(assignment).includes(subject)) continue;
    roomStudentIds.get(assignment.roomId)?.add(assignment.studentId);
  }

  return roomIds.map((roomId) => roomStudentIds.get(roomId)?.size || 0);
}

export function buildExamPrintRoomStatistics(arrangement: ExamArrangement): ExamPrintRoomStatistics {
  const usedRoomIds = new Set(arrangement.assignments.map((assignment) => assignment.roomId));
  const studentSubjects = new Map(
    arrangement.studentSubjects.map((selection) => [selection.studentId, selection.subjects]),
  );
  const combinedAssignments = arrangement.assignments.filter((assignment) => assignment.sessionKey === "combined");
  const selectionAssignments = combinedAssignments.length > 0 ? combinedAssignments : arrangement.assignments;

  const rooms = arrangement.rooms
    .filter((room) => usedRoomIds.has(room.id))
    .map((room) => {
      const labels = new Set<string>();
      const roomCombinedAssignments = selectionAssignments.filter((assignment) => assignment.roomId === room.id);
      const roomSelectionAssignments = roomCombinedAssignments.length > 0
        ? roomCombinedAssignments
        : arrangement.assignments.filter((assignment) => assignment.roomId === room.id);
      for (const assignment of roomSelectionAssignments) {
        labels.add(selectionLabel(studentSubjects.get(assignment.studentId) || assignmentSubjects(assignment)));
      }
      return {
        roomId: room.id,
        roomNumber: room.number || room.name,
        roomLocation: room.location || room.name,
        selectionLabel: [...labels].sort((left, right) => left.localeCompare(right, "zh-CN")).join("、") || "—",
      };
    });

  const roomIds = rooms.map((room) => room.roomId);
  const orderedSubjects = [
    ...REPORT_SUBJECT_ORDER.filter((subject) => arrangement.subjects.includes(subject)),
    ...arrangement.subjects.filter((subject) => !REPORT_SUBJECT_ORDER.includes(subject)),
  ];
  const subjectRows = orderedSubjects.map((subject) => {
    const counts = countSubjectByRoom(arrangement, subject, roomIds);
    return {
      label: subject,
      subjects: [subject],
      counts,
      total: counts.reduce((sum, count) => sum + count, 0),
    } satisfies ExamPrintRoomStatisticsRow;
  });

  const coreRows = CORE_SUBJECTS
    .map((subject) => subjectRows.find((row) => row.label === subject))
    .filter((row): row is ExamPrintRoomStatisticsRow => Boolean(row));
  const canGroupCore = coreRows.length === CORE_SUBJECTS.length
    && coreRows.slice(1).every((row) => sameCounts(coreRows[0].counts, row.counts));

  const rows = canGroupCore
    ? [
        {
          label: "语数外",
          subjects: [...CORE_SUBJECTS],
          counts: [...coreRows[0].counts],
          total: coreRows[0].total,
        },
        ...subjectRows.filter((row) => !CORE_SUBJECTS.includes(row.label)),
      ]
    : subjectRows;

  return { rooms, rows };
}
