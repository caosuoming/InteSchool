import type { ExamArrangement, ExamSeatAssignment } from "@/types";

export interface ExamDeskLabelGroup {
  key: string;
  roomId: string;
  roomNumber: string;
  roomLocation: string;
  seatNo: number;
  assignments: ExamSeatAssignment[];
}

export interface ExamStudentArrangementGroup {
  key: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  classId: string;
  className: string;
  assignments: ExamSeatAssignment[];
}

export interface ExamDeskRoomGroup {
  roomId: string;
  roomNumber: string;
  roomLocation: string;
  labels: ExamDeskLabelGroup[];
}

export interface ExamClassSelection {
  id: string;
  name: string;
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "考场安排";
}

function compareAssignments(left: ExamSeatAssignment, right: ExamSeatAssignment): number {
  return left.className.localeCompare(right.className, "zh-CN")
    || left.studentNo.localeCompare(right.studentNo, "zh-CN")
    || left.sessionKey.localeCompare(right.sessionKey, "zh-CN");
}

export function groupStudentArrangements(assignments: ExamSeatAssignment[]): ExamStudentArrangementGroup[] {
  const groups = new Map<string, ExamStudentArrangementGroup>();
  for (const assignment of assignments) {
    const existing = groups.get(assignment.studentId);
    if (existing) {
      existing.assignments.push(assignment);
      continue;
    }
    groups.set(assignment.studentId, {
      key: assignment.studentId,
      studentId: assignment.studentId,
      studentName: assignment.studentName,
      studentNo: assignment.studentNo,
      classId: assignment.classId,
      className: assignment.className,
      assignments: [assignment],
    });
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      assignments: group.assignments.sort((left, right) => left.sessionKey.localeCompare(right.sessionKey, "zh-CN")),
    }))
    .sort((left, right) => left.className.localeCompare(right.className, "zh-CN")
      || left.studentNo.localeCompare(right.studentNo, "zh-CN")
      || left.studentName.localeCompare(right.studentName, "zh-CN"));
}

export function groupDeskLabels(assignments: ExamSeatAssignment[]): ExamDeskLabelGroup[] {
  const groups = new Map<string, ExamDeskLabelGroup>();
  for (const assignment of assignments) {
    const key = `${assignment.roomId}:${assignment.seatNo}`;
    const existing = groups.get(key);
    if (existing) {
      existing.assignments.push(assignment);
      continue;
    }
    groups.set(key, {
      key,
      roomId: assignment.roomId,
      roomNumber: assignment.roomNumber || assignment.roomName,
      roomLocation: assignment.roomLocation || assignment.roomName,
      seatNo: assignment.seatNo,
      assignments: [assignment],
    });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, assignments: group.assignments.sort(compareAssignments) }))
    .sort((left, right) => left.roomNumber.localeCompare(right.roomNumber, "zh-CN") || left.seatNo - right.seatNo);
}

export function groupDeskLabelsByRoom(assignments: ExamSeatAssignment[]): ExamDeskRoomGroup[] {
  const groups = new Map<string, ExamDeskRoomGroup>();
  for (const label of groupDeskLabels(assignments)) {
    const existing = groups.get(label.roomId);
    if (existing) {
      existing.labels.push(label);
      continue;
    }
    groups.set(label.roomId, {
      roomId: label.roomId,
      roomNumber: label.roomNumber,
      roomLocation: label.roomLocation,
      labels: [label],
    });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, labels: group.labels.sort((left, right) => left.seatNo - right.seatNo) }))
    .sort((left, right) => left.roomNumber.localeCompare(right.roomNumber, "zh-CN"));
}

function spreadsheetCells() {
  const border = { borderStyle: "thin" as const, borderColor: "#D5DBE5" };
  const header = (value: string) => ({
    value,
    fontWeight: "bold" as const,
    backgroundColor: "#F1F4F8",
    textColor: "#24324A",
    align: "center" as const,
    alignVertical: "center" as const,
    height: 24,
    ...border,
  });
  const cell = (value: string | number | undefined) => ({
    value,
    type: typeof value === "number" ? Number : String,
    align: typeof value === "number" ? "center" as const : "left" as const,
    alignVertical: "center" as const,
    wrap: true,
    height: 24,
    ...border,
  });
  return { header, cell };
}

export async function downloadClassArrangements(
  arrangement: ExamArrangement,
  classes: ExamClassSelection[],
): Promise<void> {
  const selected = classes.filter((classItem) => arrangement.assignments.some((item) => item.classId === classItem.id));
  if (selected.length === 0) throw new Error("请至少选择一个有考场安排的班级");

  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const { header, cell } = spreadsheetCells();
  const columns = ["班级", "姓名", "学号", "考试安排（科目 / 考场号 / 考场位置 / 座位号 / 准考证号）"];
  const sheets = selected.map((classItem) => {
    const students = groupStudentArrangements(arrangement.assignments.filter((item) => item.classId === classItem.id));
    return {
      sheet: classItem.name.slice(0, 31),
      data: [
        columns.map(header),
        ...students.map((student) => [
          student.className,
          student.studentName,
          student.studentNo,
          student.assignments.map((item) => [
            item.subjectLabel,
            item.roomNumber || item.roomName,
            item.roomLocation || item.roomName,
            `${item.seatNo} 号`,
            item.admissionNo,
          ].join(" / ")).join("\n"),
        ].map(cell)),
      ],
      stickyRowsCount: 1,
      columns: [16, 14, 16, 72].map((width) => ({ width })),
    };
  });
  const suffix = selected.length === 1 ? `_${safeFileName(selected[0].name)}` : `_${selected.length}个班级`;
  await writeXlsxFile(sheets).toFile(`${safeFileName(arrangement.name)}${suffix}_考场安排.xlsx`);
}

export async function downloadClassArrangement(
  arrangement: ExamArrangement,
  classId: string,
  className: string,
): Promise<void> {
  await downloadClassArrangements(arrangement, [{ id: classId, name: className }]);
}

export async function downloadDeskLabels(arrangement: ExamArrangement, roomIds?: Iterable<string>): Promise<void> {
  const selectedRoomIds = roomIds ? new Set(roomIds) : null;
  const groups = groupDeskLabels(arrangement.assignments)
    .filter((group) => !selectedRoomIds || selectedRoomIds.has(group.roomId));
  if (groups.length === 0) throw new Error("暂无可下载的桌贴");

  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const { header, cell } = spreadsheetCells();
  const columns = ["考场号", "考场位置", "座位号", "考试科目与考生", "班级", "学号", "准考证号"];
  await writeXlsxFile([{
    sheet: "桌贴",
    data: [
      columns.map(header),
      ...groups.map((group) => [
        group.roomNumber,
        group.roomLocation,
        group.seatNo,
        group.assignments.map((item) => `${item.subjectLabel}：${item.studentName}`).join("\n"),
        group.assignments.map((item) => item.className).join("\n"),
        group.assignments.map((item) => item.studentNo).join("\n"),
        group.assignments.map((item) => item.admissionNo).join("\n"),
      ].map(cell)),
    ],
    stickyRowsCount: 1,
    columns: [14, 20, 10, 34, 20, 18, 24].map((width) => ({ width })),
  }]).toFile(`${safeFileName(arrangement.name)}${selectedRoomIds ? `_${new Set(groups.map((group) => group.roomId)).size}个考场` : ""}_桌贴.xlsx`);
}
