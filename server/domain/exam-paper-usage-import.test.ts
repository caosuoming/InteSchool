import { describe, expect, it } from "vitest";
import type { AnswerRecord, ExamPaper, Student } from "../../src/types/index.js";
import type { AppState, TeacherRecord } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { examPaperService } from "./examPaper.js";

const teacher = { id: "t1", schoolId: "school1" } as TeacherRecord;
const otherTeacher = { id: "t2", schoolId: "school1" } as TeacherRecord;
const paper = {
  id: "paper1", teacherId: "t1", schoolId: "school1", classIds: ["c1"], studentIds: [],
  questions: [
    { id: "p1", questionId: "bank1", score: 5 },
    { id: "p2", score: 10 },
  ],
  contentBlocks: [],
} as unknown as ExamPaper;
const students = [
  { id: "s1", schoolId: "school1", classId: "c1", status: "active" },
  { id: "s2", schoolId: "school1", classId: "c2", status: "active" },
  { id: "s3", schoolId: "school2", classId: "c1", status: "active" },
] as Student[];

function state(): AppState {
  return {
    teachers: [], currentTeacherId: null, examPapers: [{ ...paper }],
    students, questions: [], answerRecords: [], personalClasses: [],
  } as unknown as AppState;
}

describe("试卷使用数据批量导入", () => {
  it("保存精确得分、小题得分、作答并匹配原题库题目和本地题目", async () => {
    const dbState = state();
    await runWithState(dbState, async () => {
      const result = await examPaperService.importUsageData("paper1", [
        { studentId: "s1", paperQuestionId: "p1", earnedScore: 5, studentAnswer: "A" },
        { studentId: "s1", paperQuestionId: "p2", subScores: { "1": 3, "2": 2 } },
      ], [], teacher);
      expect(result).toEqual({ imported: 2, studentCount: 1 });
      const records = dbState.answerRecords as AnswerRecord[];
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        studentId: "s1", lectureId: "paper1", questionId: "bank1",
        earnedScore: 5, maxScore: 5, studentAnswer: "A", score: "correct", source: "import",
      });
      expect(records[1]).toMatchObject({
        questionId: "exam-item:paper1:p2", earnedScore: 5, maxScore: 10,
        subScores: { "1": 3, "2": 2 }, score: "partial",
      });
      expect((dbState.examPapers as ExamPaper[])[0].answerSheetPublishedAt).toBeTruthy();
      const updated = await examPaperService.importUsageData("paper1", [
        { studentId: "s1", paperQuestionId: "p1", earnedScore: 0 },
      ], [], teacher);
      expect(updated.imported).toBe(1);
      expect(dbState.answerRecords).toHaveLength(2);
      expect((dbState.answerRecords as AnswerRecord[])[0]).toMatchObject({
        earnedScore: 0, studentAnswer: "A", score: "wrong",
      });
    });
  });

  it("禁止越权教师、非班级学生、错误题号和超额分数，并保持原子性", async () => {
    const dbState = state();
    await runWithState(dbState, async () => {
      const correct = { studentId: "s1", paperQuestionId: "p1", earnedScore: 3 };
      await expect(examPaperService.importUsageData("paper1", [correct], [], otherTeacher)).rejects.toThrow("无权");
      await expect(examPaperService.importUsageData("paper1", [correct,
        { ...correct, studentId: "s2" }], [], teacher)).rejects.toThrow("学生");
      await expect(examPaperService.importUsageData("paper1", [{ ...correct, studentId: "s3" }], [], teacher)).rejects.toThrow("学生");
      await expect(examPaperService.importUsageData("paper1", [{ ...correct, paperQuestionId: "fake" }], [], teacher)).rejects.toThrow("题号");
      await expect(examPaperService.importUsageData("paper1", [{ ...correct, earnedScore: 6 }], [], teacher)).rejects.toThrow("满分");
      await expect(examPaperService.importUsageData("paper1", [correct, correct], [], teacher)).rejects.toThrow("重复");
      expect(dbState.answerRecords).toHaveLength(0);
    });
  });
  it("按核对结果同步更新试卷答案、分值和已有答题记录", async () => {
    const dbState = state();
    await runWithState(dbState, async () => {
      await examPaperService.importUsageData("paper1", [
        { studentId: "s1", paperQuestionId: "p1", earnedScore: 3 },
      ], [], teacher);
      const result = await examPaperService.importUsageData("paper1", [
        { studentId: "s1", paperQuestionId: "p2", earnedScore: 8 },
      ], [
        { paperQuestionId: "p1", attribute: "score", expected: "5", value: "4" },
        { paperQuestionId: "p1", attribute: "answer", expected: "", value: "D" },
      ], teacher);
      expect(result.imported).toBe(1);
      expect(result.updatedPaper?.questions[0]).toMatchObject({ score: 4, answer: "D" });
      expect(result.updatedPaper?.totalScore).toBe(14);
      expect((dbState.examPapers as ExamPaper[])[0].questions[0]).toMatchObject({ score: 4, answer: "D" });
      const old = (dbState.answerRecords as AnswerRecord[]).find((record) => record.questionId === "bank1")!;
      expect(old).toMatchObject({ earnedScore: 3, maxScore: 4, score: "partial" });
    });
  });

  it("拒绝过期选项、越权修改、重复更新及小于已记录得分的新满分，不污染数据", async () => {
    const dbState = state();
    await runWithState(dbState, async () => {
      const items = [{ studentId: "s1", paperQuestionId: "p1", earnedScore: 4 }];
      const scoreUpdate = { paperQuestionId: "p1", attribute: "score" as const, expected: "5", value: "3" };
      await expect(examPaperService.importUsageData("paper1", items, [scoreUpdate], otherTeacher)).rejects.toThrow("无权");
      await expect(examPaperService.importUsageData("paper1", items, [{ ...scoreUpdate, expected: "4" }], teacher)).rejects.toThrow("发生变化");
      await expect(examPaperService.importUsageData("paper1", items, [{ ...scoreUpdate, paperQuestionId: "fake" }], teacher)).rejects.toThrow("不属于");
      await expect(examPaperService.importUsageData("paper1", items, [scoreUpdate, scoreUpdate], teacher)).rejects.toThrow("重复");
      await expect(examPaperService.importUsageData("paper1", items, [{ ...scoreUpdate, value: "not-a-number" }], teacher)).rejects.toThrow("满分无效");
      expect((dbState.examPapers as ExamPaper[])[0].questions[0].score).toBe(5);
      expect(dbState.answerRecords).toHaveLength(0);
      await examPaperService.importUsageData("paper1", [{ ...items[0], earnedScore: 5 }], [], teacher);
      await expect(examPaperService.importUsageData("paper1", items, [scoreUpdate], teacher)).rejects.toThrow("已有学生得分");
      expect((dbState.examPapers as ExamPaper[])[0].questions[0].score).toBe(5);
      expect((dbState.answerRecords as AnswerRecord[])[0].earnedScore).toBe(5);
    });
  });

});
