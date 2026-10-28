import { describe, expect, it } from "vitest";
import type { ExamPaper, LessonCourseware } from "@/types";
import type { ScannerPageRecord } from "@/services/scanner";
import { pendingCoursewares, pendingScanPapers } from "./dashboard-todos";

const courseware = (id: string, patch: Partial<LessonCourseware> = {}) => ({
  id, teacherId: "teacher1", schoolId: "school1", lifecycleStatus: "active", status: "draft",
  ...patch,
}) as LessonCourseware;

const paper = (id: string, patch: Partial<ExamPaper> = {}) => ({
  id, teacherId: "teacher1", schoolId: "school1", status: "published",
  managementCategory: "homework", assignedDate: "2026-10-28", answerSheetPublishedAt: "2026-10-27T12:00:00Z",
  ...patch,
}) as ExamPaper;

const scan = (sheetId: string, patch: Partial<ScannerPageRecord> = {}) => ({
  id: `scan-${sheetId}`, sheetId, schoolId: "school1", sheetType: "paper", status: "assigned",
  ...patch,
}) as ScannerPageRecord;

describe("dashboard pending work", () => {
  it("only shows this teacher's active draft coursewares", () => {
    const result = pendingCoursewares([
      courseware("draft"), courseware("legacy", { lifecycleStatus: undefined }),
      courseware("published", { status: "published" }),
      courseware("finished", { lifecycleStatus: "completed" }),
      courseware("trashed", { lifecycleStatus: "trashed" }),
      courseware("other-school", { schoolId: "school2" }),
      courseware("other-teacher", { teacherId: "teacher2" }),
    ], "teacher1", "school1");
    expect(result.map((item) => item.id)).toEqual(["draft", "legacy"]);
  });

  it("only shows assigned published homework sheets with no scans", () => {
    const result = pendingScanPapers([
      paper("pending"), paper("scanned"), paper("draft", { status: "draft" }),
      paper("exam", { managementCategory: "exam" }),
      paper("unassigned", { assignedDate: undefined }),
      paper("unpublished", { answerSheetPublishedAt: undefined }),
      paper("other-school", { schoolId: "school2" }),
      paper("other-teacher", { teacherId: "teacher2" }),
    ], [scan("scanned"), scan("pending", { sheetType: "lecture" }),
      scan("pending", { schoolId: "school2" })], "teacher1", "school1");
    expect(result.map((item) => item.id)).toEqual(["pending"]);
  });
});
