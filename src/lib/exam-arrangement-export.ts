import type { ExamArrangement, ExamSeatAssignment } from "@/types";
import type { SheetData } from "write-excel-file/browser";
import { buildExamPrintRoomStatistics } from "./exam-print-room-statistics";
import {
  buildExamInvigilationTable,
  examInvigilationPeriodLabel,
  formatExamDateWithWeekday,
  formatExamTimeRange,
  wrapInvigilationHeaderLabel,
} from "./exam-invigilation";

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

export interface ExamDeskLabelDisplayOptions {
  showStudentNo?: boolean;
  showAdmissionNo?: boolean;
}

export type ExamPdfPaperSize = "A4" | "8K";

const PDF_PAPER_SIZES: Record<ExamPdfPaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  "8K": { width: 260, height: 370 },
};

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim() || "考场安排";
}

function consecutiveRowSpan<T>(items: T[], index: number, keyFor: (item: T) => string): number {
  const key = keyFor(items[index]);
  if (index > 0 && keyFor(items[index - 1]) === key) return 0;
  let span = 1;
  while (index + span < items.length && keyFor(items[index + span]) === key) span += 1;
  return span;
}

export async function downloadExamPreviewPdf(
  pages: HTMLElement[],
  fileName: string,
  paperSize: ExamPdfPaperSize,
): Promise<void> {
  if (pages.length === 0) throw new Error("暂无可下载的预览内容");

  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const paper = PDF_PAPER_SIZES[paperSize];
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [paper.width, paper.height],
    compress: true,
  });
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${paper.width}mm`,
    background: "#fff",
    pointerEvents: "none",
  });
  document.body.append(host);

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const windowWidth = Math.round((paper.width / 25.4) * 96);
    const windowHeight = Math.round((paper.height / 25.4) * 96);

    for (const [index, source] of pages.entries()) {
      if (index > 0) pdf.addPage([paper.width, paper.height], "portrait");
      const page = source.cloneNode(true) as HTMLElement;
      page.style.breakAfter = "auto";
      host.replaceChildren(page);
      const canvas = await html2canvas(page, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: 2,
        useCORS: true,
        windowWidth,
        windowHeight,
      });
      pdf.addImage(canvas, "PNG", 0, 0, paper.width, paper.height, undefined, "FAST");
    }

    pdf.save(`${safeFileName(fileName)}.pdf`);
  } finally {
    host.remove();
  }
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

export async function downloadExamPrintRoomStatistics(arrangement: ExamArrangement): Promise<void> {
  const statistics = buildExamPrintRoomStatistics(arrangement);
  if (statistics.rooms.length === 0) throw new Error("当前考试方案暂无已安排考场");

  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const { header, cell } = spreadsheetCells();
  const centeredCell = (value: string | number) => ({
    ...cell(value),
    align: "center" as const,
  });
  const countCell = (value: number) => ({
    ...centeredCell(value || ""),
    backgroundColor: value ? undefined : "#FFF59D",
  });
  const totalCell = (value: number) => ({
    ...centeredCell(value),
    fontWeight: "bold" as const,
    backgroundColor: "#F1F4F8",
  });

  const sheets: Array<{
    sheet: string;
    data: SheetData;
    stickyRowsCount: number;
    columns: Array<{ width: number }>;
  }> = [{
    sheet: "表一、文印室统计表",
    data: [
      [header("考场号"), ...statistics.rooms.map((room) => header(room.roomNumber)), header("合计")],
      [header("考试地点"), ...statistics.rooms.map((room) => centeredCell(room.roomLocation)), centeredCell("")],
      [header("组合"), ...statistics.rooms.map((room) => centeredCell(room.selectionLabel)), centeredCell("")],
      ...statistics.rows.map((row) => [
        header(row.label),
        ...row.counts.map(countCell),
        totalCell(row.total),
      ]),
    ],
    stickyRowsCount: 3,
    columns: [
      { width: 16 },
      ...statistics.rooms.map(() => ({ width: 14 })),
      { width: 14 },
    ],
  }];

  if (arrangement.invigilation) {
    const invigilation = buildExamInvigilationTable(arrangement, arrangement.invigilation);
    if (invigilation.rows.length > 0) {
      const teacherMap = new Map(arrangement.invigilation.teachers.map((teacher) => [teacher.id, teacher.name]));
      const invigilationHeader = (value: string) => ({ ...header(value), backgroundColor: "#DCECEF", wrap: true, height: 36 });
      const invigilationInfoCell = (value: string | number) => ({ ...centeredCell(value), backgroundColor: "#E5F0F2" });
      const patrolNames = invigilation.patrolTeacherIds.map((id) => teacherMap.get(id)).filter(Boolean).join("、");
      const invigilationRows = invigilation.rows.map((row, index) => {
        const dateRowSpan = consecutiveRowSpan(invigilation.rows, index, (item) => item.date);
        const periodRowSpan = consecutiveRowSpan(invigilation.rows, index, (item) => `${item.date}\u0000${item.period}`);
        const locationTeacherCells = invigilation.roomLocationGroups.map((group) => {
          const roomId = group.roomIds.find((id) => (row.roomStudentCounts[id] || 0) > 0);
          return centeredCell(roomId ? teacherMap.get(row.roomTeacherIds[roomId] || "") || "" : "");
        });
        return [
          dateRowSpan > 0 ? { ...invigilationInfoCell(formatExamDateWithWeekday(row.date).replace(" ", "\n")), rowSpan: dateRowSpan } : null,
          periodRowSpan > 0 ? { ...invigilationInfoCell(examInvigilationPeriodLabel(row.period)), rowSpan: periodRowSpan } : null,
          invigilationInfoCell(formatExamTimeRange(row.time, row.durationMinutes)),
          invigilationInfoCell(row.subjectLabel),
          ...locationTeacherCells,
          centeredCell(row.outsideTeacherIds.map((id) => teacherMap.get(id)).filter(Boolean).join("\n")),
          index === 0 ? { ...invigilationInfoCell(patrolNames), rowSpan: invigilation.rows.length } : null,
        ];
      });

      sheets.push({
        sheet: "表二、监考表",
        data: [
          [
            { ...invigilationHeader("考试安排"), columnSpan: 4 }, null, null, null,
            ...invigilation.roomLocationGroups.map((group) => invigilationHeader(wrapInvigilationHeaderLabel(group.roomLocation).join("\n"))),
            { ...invigilationHeader("场外监考"), rowSpan: 3 },
            { ...invigilationHeader("巡回"), rowSpan: 3 },
          ],
          [
            invigilationHeader("时间"),
            invigilationHeader("时段"),
            invigilationHeader("考试时间"),
            invigilationHeader("学科"),
            ...invigilation.roomLocationGroups.map((group) => invigilationHeader(group.roomNumbers.join("、"))),
            null,
            null,
          ],
          [
            { ...invigilationHeader("试场人数"), columnSpan: 4 }, null, null, null,
            ...invigilation.roomLocationGroups.map((group) => invigilationInfoCell(group.studentCount)),
            null,
            null,
          ],
          ...invigilationRows,
          [
            {
              ...cell(arrangement.invigilation.footerNote || ""),
              columnSpan: invigilation.roomLocationGroups.length + 6,
              height: 48,
              align: "left" as const,
              alignVertical: "top" as const,
              wrap: true,
            },
            ...Array(invigilation.roomLocationGroups.length + 5).fill(null),
          ],
        ],
        stickyRowsCount: 3,
        columns: [
          { width: 24 },
          { width: 10 },
          { width: 18 },
          { width: 16 },
          ...invigilation.roomLocationGroups.map(() => ({ width: 14 })),
          { width: 16 },
          { width: 22 },
        ],
      });
    }
  }

  await writeXlsxFile(sheets).toFile(`${safeFileName(arrangement.name)}_文印室统计表.xlsx`);
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

export async function downloadDeskLabels(
  arrangement: ExamArrangement,
  roomIds?: Iterable<string>,
  options: ExamDeskLabelDisplayOptions = {},
): Promise<void> {
  const selectedRoomIds = roomIds ? new Set(roomIds) : null;
  const groups = groupDeskLabels(arrangement.assignments)
    .filter((group) => !selectedRoomIds || selectedRoomIds.has(group.roomId));
  if (groups.length === 0) throw new Error("暂无可下载的桌贴");

  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const { header, cell } = spreadsheetCells();
  const showStudentNo = options.showStudentNo ?? true;
  const showAdmissionNo = options.showAdmissionNo ?? true;
  const columns = [
    "考场号",
    "考场位置",
    "座位号",
    "考试科目与考生",
    "班级",
    ...(showStudentNo ? ["学号"] : []),
    ...(showAdmissionNo ? ["准考证号"] : []),
  ];
  const columnWidths = [
    14,
    20,
    10,
    34,
    20,
    ...(showStudentNo ? [18] : []),
    ...(showAdmissionNo ? [24] : []),
  ];
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
        ...(showStudentNo ? [group.assignments.map((item) => item.studentNo).join("\n")] : []),
        ...(showAdmissionNo ? [group.assignments.map((item) => item.admissionNo).join("\n")] : []),
      ].map(cell)),
    ],
    stickyRowsCount: 1,
    columns: columnWidths.map((width) => ({ width })),
  }]).toFile(`${safeFileName(arrangement.name)}${selectedRoomIds ? `_${new Set(groups.map((group) => group.roomId)).size}个考场` : ""}_桌贴.xlsx`);
}
