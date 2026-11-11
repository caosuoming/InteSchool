import type { ExamArrangement, ExamSeatAssignment } from "@/types";

const REPORT_SUBJECT_ORDER = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "政治", "地理"];

export interface ExamPrintRoomStatisticsRoom {
  roomId: string;
  roomNumber: string;
  roomLocation: string;
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

function countSubjectByRoom(
  arrangement: ExamArrangement,
  subject: string,
  roomIds: string[],
): number[] {
  const roomStudentIds = new Map(roomIds.map((roomId) => [roomId, new Set<string>()]));

  // The seat assignment itself identifies the subjects taken in this room. Session keys
  // are grouping identifiers (combined, seat, seat-session, simultaneous, etc.), not
  // reliable indicators of which subjects an individual student is taking.
  for (const assignment of arrangement.assignments) {
    if (assignmentSubjects(assignment).includes(subject)) {
      roomStudentIds.get(assignment.roomId)?.add(assignment.studentId);
    }
  }

  return roomIds.map((roomId) => roomStudentIds.get(roomId)?.size || 0);
}

export function buildExamPrintRoomStatistics(arrangement: ExamArrangement): ExamPrintRoomStatistics {
  const usedRoomIds = new Set(arrangement.assignments.map((assignment) => assignment.roomId));
  const roomDetails = new Map<string, { roomNumber: string; roomLocation: string }>();
  const configuredRooms = new Map(arrangement.rooms.map((room) => [room.id, room]));
  for (const assignment of arrangement.assignments) {
    if (!usedRoomIds.has(assignment.roomId) || roomDetails.has(assignment.roomId)) continue;
    const physicalRoom = configuredRooms.get(assignment.physicalRoomId || assignment.roomId);
    roomDetails.set(assignment.roomId, {
      roomNumber: assignment.physicalRoomId
        ? assignment.roomNumber || assignment.roomName
        : physicalRoom?.number || physicalRoom?.name || assignment.roomNumber || assignment.roomName,
      roomLocation: physicalRoom?.location || assignment.roomLocation || assignment.roomName,
    });
  }
  const rooms = [...roomDetails.entries()].map(([roomId, room]) => ({ roomId, ...room }));

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

  return { rooms, rows: subjectRows };
}
