import type { ExamArrangement, ExamSeatAssignment } from "@/types";

export interface ExamDeskLabelGroup {
  key: string;
  roomId: string;
  roomNumber: string;
  roomLocation: string;
  seatNo: number;
  assignments: ExamSeatAssignment[];
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "考场安排";
}

function compareAssignments(left: ExamSeatAssignment, right: ExamSeatAssignment): number {
  return left.className.localeCompare(right.className, "zh-CN")
    || left.studentNo.localeCompare(right.studentNo, "zh-CN")
    || left.sessionKey.localeCompare(right.sessionKey, "zh-CN");
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

export async function downloadClassArrangement(
  arrangement: ExamArrangement,
  classId: string,
  className: string,
): Promise<void> {
  const assignments = arrangement.assignments
    .filter((item) => item.classId === classId)
    .sort((left, right) => left.studentNo.localeCompare(right.studentNo, "zh-CN")
      || left.sessionKey.localeCompare(right.sessionKey, "zh-CN"));
  if (assignments.length === 0) throw new Error("该班级暂无考场安排");
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const { header, cell } = spreadsheetCells();
  const columns = ["班级", "姓名", "学号", "考试科目", "考场号", "考场位置", "座位号", "准考证号"];
  await writeXlsxFile([{
    sheet: className.slice(0, 31),
    data: [
      columns.map(header),
      ...assignments.map((item) => [
        item.className,
        item.studentName,
        item.studentNo,
        item.subjectLabel,
        item.roomNumber || item.roomName,
        item.roomLocation || item.roomName,
        item.seatNo,
        item.admissionNo,
      ].map(cell)),
    ],
    stickyRowsCount: 1,
    columns: [14, 12, 14, 22, 14, 20, 10, 20].map((width) => ({ width })),
  }]).toFile(`${safeFileName(arrangement.name)}_${safeFileName(className)}_考场安排.xlsx`);
}

export async function downloadDeskLabels(arrangement: ExamArrangement): Promise<void> {
  const groups = groupDeskLabels(arrangement.assignments);
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
  }]).toFile(`${safeFileName(arrangement.name)}_桌贴.xlsx`);
}
