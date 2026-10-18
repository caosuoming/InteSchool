import { describe, expect, it } from "vitest";
import type { ClassroomHomework, ExamPaper, ExamPublication, HomeworkClassOverviewRecord } from "@/types";
import { homeworkStatus, homeworkSubmissionDetails, homeworkSubmissionCounts, homeworkTitle, paperHomeworkStatus, publicationStatus } from "./homework-exam-management";

const homework: ClassroomHomework = {
  id: "hw-1", teacherId: "teacher-1", teacherName: "王老师", schoolId: "school-1", subject: "数学",
  content: "函数练习\n完成第六题", classIds: ["a", "b"], assignedDate: "2026-10-12",
  publishAt: "2026-10-12T01:00:00Z", createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z",
};
const record = (classId: string, overrides: Partial<HomeworkClassOverviewRecord> = {}): HomeworkClassOverviewRecord => ({
  id: classId, schoolId: "school-1", teacherId: "teacher-1", classId, homeworkDate: "2026-10-12",
  summary: "", studentIds: ["1", "2", "3"], submittedStudentIds: ["1"], absentStudentIds: ["2"],
  attendanceTaken: true, createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z", ...overrides,
});

describe("作业考试管理展示", () => {
  it("uses the explicit title or the first meaningful line for legacy homework", () => {
    expect(homeworkTitle({ ...homework, title: "  周末作业  " })).toBe("周末作业");
    expect(homeworkTitle({ ...homework, content: "\n 函数练习\n完成第六题" })).toBe("函数练习");
    expect(homeworkTitle({ ...homework, content: "", attachments: [] })).toBe("附件作业（0 个附件）");
  });

  it("distinguishes scheduled, upcoming, ongoing, and completed homeworks", () => {
    const now = new Date("2026-10-12T12:00:00+08:00");
    expect(homeworkStatus({ ...homework, publishAt: "2026-10-12T06:00:00Z" }, now)).toBe("待发布");
    expect(homeworkStatus({ ...homework, assignedDate: "2026-10-13" }, now)).toBe("待开始");
    expect(homeworkStatus(homework, now)).toBe("进行中");
    expect(homeworkStatus({ ...homework, assignedDate: "2026-10-11" }, now)).toBe("已结束");
    expect(homeworkStatus({ ...homework, assignedEndDate: "2026-10-14" }, now)).toBe("进行中");
  });

  it("only counts attendance actually recorded for every class and excludes absences", () => {
    const data = new Map([["a", [record("a")]], ["b", [record("b", { submittedStudentIds: ["1", "3"] })]]]);
    expect(homeworkSubmissionCounts(homework, data)).toEqual({ submitted: 3, missing: 1 });
    expect(homeworkSubmissionDetails(homework, data)).toEqual({ submitted: 3, missing: 1, missingStudents: [
      { classId: "a", studentId: "3" },
    ] });
    expect(homeworkSubmissionCounts(homework, new Map([["a", [record("a")]]]))).toBeNull();
    expect(homeworkSubmissionDetails(homework, new Map([["a", [record("a")]]]))).toBeNull();
    expect(homeworkSubmissionCounts(homework, new Map([["a", [record("a")]], ["b", [record("b", { attendanceTaken: false })]]]))).toBeNull();
    expect(homeworkSubmissionCounts({ ...homework, assignedEndDate: "2026-10-13" }, data)).toBeNull();
  });

  it("does not claim that a library draft was assigned to students", () => {
    const paper = { status: "draft", assignedDate: "2026-10-12", assignedEndDate: "2026-10-13" } as ExamPaper;
    const now = new Date("2026-10-12T12:00:00+08:00");
    expect(paperHomeworkStatus(paper, now)).toBe("草稿");
    expect(paperHomeworkStatus({ ...paper, status: "published" }, now)).toBe("进行中");
  });

  it("uses publication lifecycle and unlock date without inventing an exam date", () => {
    const exam = { status: "active", unlockAt: "2026-10-14T00:00:00Z" } as ExamPublication;
    const now = new Date("2026-10-12T12:00:00+08:00");
    expect(publicationStatus(exam, now)).toBe("保密中");
    expect(publicationStatus({ ...exam, unlockAt: undefined }, now)).toBe("已发布");
    expect(publicationStatus({ ...exam, status: "expired" }, now)).toBe("已到期");
    expect(publicationStatus({ ...exam, status: "revoked" }, now)).toBe("已撤回");
  });
});
