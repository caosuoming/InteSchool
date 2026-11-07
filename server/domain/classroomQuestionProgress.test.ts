import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { AnswerRecord, Teacher } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { recordClassroomQuestionProgress } from "./classroomQuestionProgress.js";
import { analyticsService } from "./analytics.js";
import { classroomDeviceService } from "./classroomDevice.js";
import { createHash } from "node:crypto";

const token = "valid-classroom-token-123456789012345";
const input = { coursewareId: "course-1", classId: "class-1", questionId: "question-1" };
const timestamp = "2026-08-01T00:00:00.000Z";

function state(): AppState {
  return {
    teachers: [], currentTeacherId: null,
    schoolClasses: [{ id: "class-1", schoolId: "school-1", status: "active" },
      { id: "class-2", schoolId: "school-1", status: "active" }] as AppState["schoolClasses"],
    students: [
      { id: "alice", classId: "class-1", schoolId: "school-1", status: "active" },
      { id: "bob", classId: "class-1", schoolId: "school-1", status: "active" },
      { id: "inactive", classId: "class-1", schoolId: "school-1", status: "graduated" },
      { id: "outsider", classId: "class-2", schoolId: "school-1", status: "active" },
    ] as AppState["students"],
    questions: [{ id: "question-1", schoolId: "school-1" }] as AppState["questions"],
    lectures: [{ id: "lecture-1", teacherId: "teacher-1", schoolId: "school-1", classIds: [] }] as AppState["lectures"],
    lessonCoursewares: [{ id: "course-1", teacherId: "teacher-1", schoolId: "school-1", sourceType: "lecture",
      sourceId: "lecture-1", classIds: ["class-1"], status: "published", slides: [
        { id: "slide-1", type: "question", questionId: "question-1" },
        { id: "slide-2", type: "question", questionId: "hidden", hiddenClassIds: ["class-1"] },
      ] }] as AppState["lessonCoursewares"],
    classroomDevices: [{ id: "device", classId: "class-1", schoolId: "school-1",
      deviceTokenHash: createHash("sha256").update(token).digest("hex") }] as AppState["classroomDevices"],
    answerRecords: [{ id: "scored", studentId: "alice", questionId: "question-1", lectureId: "lecture-1",
      score: "partial", isCorrect: false, answeredAt: timestamp }],
  } as AppState;
}

describe("classroom example progress", () => {
  it("marks every active class member done, preserves scoring, updates the lecture audience and is idempotent", async () => {
    const snapshot = state();
    await runWithState(snapshot, async () => {
      expect(recordClassroomQuestionProgress(input, "school-1")).toMatchObject([
        { studentId: "bob", score: "done", lectureId: "lecture-1" },
      ]);
      expect(snapshot.answerRecords).toHaveLength(2);
      expect((snapshot.answerRecords as AnswerRecord[]).find((item) => item.studentId === "alice")).toMatchObject({
        id: "scored", score: "partial", answeredAt: timestamp,
      });
      expect(snapshot.lectures[0].classIds).toEqual(["class-1"]);
      expect(recordClassroomQuestionProgress(input, "school-1")).toEqual([]);
      expect(snapshot.answerRecords).toHaveLength(2);
      expect(snapshot.lectures[0].classIds).toEqual(["class-1"]);

      expect(recordClassroomQuestionProgress({ ...input, studentId: "bob", score: "correct" }, "school-1"))
        .toMatchObject([{ studentId: "bob", score: "correct", isCorrect: true }]);
      expect(recordClassroomQuestionProgress(input, "school-1")).toEqual([]);
      expect((snapshot.answerRecords as AnswerRecord[]).find((item) => item.studentId === "bob")?.score).toBe("correct");
    });
  });

  it("rejects forged class, non-student, invisible question and cross-school requests", async () => {
    const snapshot = state();
    await runWithState(snapshot, async () => {
      expect(() => recordClassroomQuestionProgress({ ...input, classId: "class-2" }, "school-1"))
        .toThrow("课件不存在或未向该班级发布");
      expect(() => recordClassroomQuestionProgress({ ...input, questionId: "hidden" }, "school-1"))
        .toThrow("没有向该班级展示");
      expect(() => recordClassroomQuestionProgress({ ...input, studentId: "outsider", score: "wrong" }, "school-1"))
        .toThrow("学生不属于该班级");
      expect(() => recordClassroomQuestionProgress(input, "school-2"))
        .toThrow("课件不存在或未向该班级发布");
      expect(snapshot.answerRecords).toHaveLength(1);
    });
  });

  it("honors authorized classroom device tokens and teacher ownership", async () => {
    const snapshot = state();
    await runWithState(snapshot, async () => {
      await expect(classroomDeviceService.recordClassroomQuestionProgress("invalid-token-1234567890abcdef", input))
        .rejects.toThrow();
      await expect(classroomDeviceService.recordClassroomQuestionProgress(token, { ...input, classId: "class-2" }))
        .rejects.toThrow("无权记录其他班级");
      await expect(classroomDeviceService.recordClassroomQuestionProgress(token, input)).resolves.toHaveLength(1);
      const teacher = { id: "teacher-1", schoolId: "school-1", teachingClassIds: ["class-1"] } as Teacher;
      await expect(analyticsService.recordClassroomQuestionProgress({ ...input, studentId: "bob", score: "wrong" }, teacher))
        .resolves.toMatchObject([{ studentId: "bob", score: "wrong" }]);
      await expect(analyticsService.recordClassroomQuestionProgress(input, { ...teacher, id: "intruder", teachingClassIds: [] }))
        .rejects.toThrow("无权记录");
      expect(snapshot.answerRecords).toHaveLength(2);
    });
  });
});
