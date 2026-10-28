import type { ExamPaper, LessonCourseware } from "@/types";
import type { ScannerPageRecord } from "@/services/scanner";

export function pendingCoursewares(coursewares: LessonCourseware[], teacherId: string, schoolId: string) {
  return coursewares.filter((item) => item.teacherId === teacherId && item.schoolId === schoolId
    && (item.lifecycleStatus === undefined || item.lifecycleStatus === "active") && item.status === "draft");
}

export function pendingScanPapers(papers: ExamPaper[], pages: ScannerPageRecord[], teacherId: string, schoolId: string) {
  const scannedIds = new Set(pages.filter((page) => page.schoolId === schoolId && page.sheetType === "paper").map((page) => page.sheetId));
  return papers.filter((paper) => paper.teacherId === teacherId && paper.schoolId === schoolId
    && paper.managementCategory !== "exam" && paper.status === "published"
    && !!paper.assignedDate && !!paper.answerSheetPublishedAt && !scannedIds.has(paper.id));
}
