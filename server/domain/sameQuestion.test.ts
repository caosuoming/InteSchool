import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { AnswerRecord, Question, ShareRecord } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { linkSameQuestions, sameQuestionIds } from "./sameQuestion.js";
import { questionService } from "./question.js";
import { analyticsService } from "./analytics.js";
import { examPublishService } from "./examPublish.js";
import { shareService } from "./share.js";

const now = "2026-11-07T10:00:00.000Z";
const stem = "已知二次函数 f(x)=x²，求当 x=0 时的最小值";

function question(id: string, teacherId = "teacher-a", schoolId = "school-a", overrides: Partial<Question> = {}): Question {
  return {
    id, teacherId, schoolId, type: "short", stem,
    answer: "0", analysis: `不同的解析-${id}`, summary: `总结-${id}`,
    chapterIds: [], knowledgePointIds: [], difficulty: 2, recommendation: 3,
    usageCount: 0, remark: "", isShared: false, createdAt: now, updatedAt: now,
    ...overrides,
  };
}
function teacher(id: string, schoolId: string) {
  return {
    id, email: `${id}@example.com`, name: id, nickname: id, avatar: "",
    schoolId, subject: "数学", status: "active" as const, role: "teacher" as const,
    roles: ["teacher"], subjectGroupIds: [], prepGroupIds: [], affiliations: [],
    currentAffiliationId: null, createdAt: now,
  };
}
function state(questions: Question[] = [question("q-a"), question("q-b", "teacher-b")]): AppState {
  return {
    teachers: [teacher("teacher-a", "school-a"), teacher("teacher-b", "school-a"),
      teacher("teacher-c", "school-b")],
    currentTeacherId: "teacher-a", questions, answerRecords: [],
    examPublications: [], shareRecords: [], students: [], schoolClasses: [],
    personalClasses: [], examPapers: [], lectures: [], coursewares: [], materials: [],
    schoolBackups: [], chapters: [], knowledgePoints: [], schoolChapters: [],
    schoolKnowledgePoints: [], resourceFolders: [], platformResourceSettings: [],
    platformResourceCorrections: [],
  };
}

describe("same-question identity", () => {
  it("links transitively without changing the independent IDs, answers or analyses", () => {
    const input = state([question("a", "teacher-a"), question("b", "teacher-b", "school-a", { answer: "零" }),
      question("c", "teacher-c", "school-b"), question("d", "teacher-c", "school-b")]);
    runWithState(input, () => {
      linkSameQuestions((input.questions as Question[])[0], (input.questions as Question[])[1]);
      linkSameQuestions((input.questions as Question[])[2], (input.questions as Question[])[3]);
      linkSameQuestions((input.questions as Question[])[1], (input.questions as Question[])[2]);
      expect(new Set((input.questions as Question[]).map((q) => q.sameQuestionGroupId)).size).toBe(1);
      expect(sameQuestionIds(["a"], (input.questions as Question[]))).toEqual(new Set(["a", "b", "c", "d"]));
      expect((input.questions as Question[]).map((q) => q.id)).toEqual(["a", "b", "c", "d"]);
      expect((input.questions as Question[])[1].answer).toBe("零");
      expect((input.questions as Question[])[0].analysis).toBe("不同的解析-a");
    });
  });

  it("propagates exam concealment and restores it on revocation", async () => {
    const input = state();
    await runWithState(input, async () => {
      linkSameQuestions((input.questions as Question[])[0], (input.questions as Question[])[1]);
      const published = await examPublishService.publishExam({
        examPaperId: "paper", publisherId: "teacher-a", publisherSchoolId: "school-a",
        title: "期中考试", targetType: "otherSchool", questionIds: ["q-a"],
      });
      expect((input.questions as Question[]).every((q) => q.hiddenByExamIds?.includes(published.id))).toBe(true);
      await examPublishService.revokePublication(published.id);
      expect((input.questions as Question[]).every((q) => (q.hiddenByExamIds || []).length === 0)).toBe(true);
    });
  });

  it("recognizes the student's previous answer under a linked question after class regrouping", async () => {
    const input = state();
    input.answerRecords = [{ id: "answer-a", studentId: "student-1", questionId: "q-a",
      lectureId: "manual", score: "correct", isCorrect: true, source: "manual", answeredAt: now }] as AnswerRecord[];
    await runWithState(input, async () => {
      linkSameQuestions((input.questions as Question[])[0], (input.questions as Question[])[1]);
      const done = await analyticsService.getAnsweredQuestionIds(["student-1"]);
      expect(done.has("q-b")).toBe(true);
      expect((await analyticsService.getQuestionWeaknessScore("school-a", ["student-1"])).get("q-b")).toBeGreaterThanOrEqual(0);
      expect((input.answerRecords as AnswerRecord[])[0].questionId).toBe("q-a");
    });
  });

  it("rejects unrelated question linking and recommends local knowledge tags by name", async () => {
    const input = state();
    (input.questions as Question[])[1].knowledgePointIds = ["kp-other"];
    input.knowledgePoints = [
      { id: "kp-other", schoolId: "school-a", parentId: null, name: "二次函数", level: 0, order: 0 },
      { id: "kp-local", schoolId: "school-a", parentId: null, name: "二次函数", level: 0, order: 1 },
    ] as AppState["knowledgePoints"];
    await runWithState(input, async () => {
      await questionService.markSameQuestion("q-a", "q-b", "teacher-a");
      expect(await questionService.getSameQuestionKnowledgeSuggestions("q-a", "teacher-a"))
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: "kp-local" })]));
      await expect(questionService.markSameQuestion("q-b", "q-a", "teacher-c"))
        .rejects.toThrow("无权标记");
      await expect(questionService.markSameQuestion("q-a", "q-unknown", "teacher-a"))
        .rejects.toThrow("不存在");
    });
  });

  it("accepts a shared same question without duplicating it, but requires explicit conflict review", async () => {
    const input = state();
    await runWithState(input, async () => {
      const share = await shareService.createShare({ fromTeacherId: "teacher-a", fromSchoolId: "school-a",
        toTeacherId: "teacher-b", toSchoolId: "school-a", scope: "friends", resourceType: "question",
        resourceId: "q-a", resourceTitle: "数学题" });
      expect((await shareService.checkShareQuestionDuplicates(share.id, "teacher-b", "school-a"))[0])
        .toMatchObject({ targetResourceId: "q-b" });
      await expect(shareService.acceptShare(share.id, "teacher-b", "school-a"))
        .rejects.toThrow("相似题目");
      const result = await shareService.acceptShare(share.id, "teacher-b", "school-a", {
        action: "same", targetResourceId: "q-b",
      });
      expect(result.newResourceId).toBe("q-b");
      expect((input.questions as Question[])).toHaveLength(2);
      expect((input.questions as Question[])[0].sameQuestionGroupId).toBe((input.questions as Question[])[1].sameQuestionGroupId);
      expect((input.shareRecords as ShareRecord[])[0].status).toBe("accepted");
    });
  });

  it("marks a platform resource as the same existing personal question without merging or copying", async () => {
    const input = state();
    await runWithState(input, async () => {
      const [donation] = await shareService.donateResources("teacher-a", "school-a", [{
        resourceType: "question", resourceId: "q-a",
      }]);
      const check = await shareService.checkSaveAsOwnResource(donation.id, "teacher-b", "school-a");
      expect(check.conflict?.targetResourceId).toBe("q-b");
      const saved = await shareService.saveDonationAsOwnResource(donation.id, "teacher-b", "school-a", {
        action: "same", targetResourceId: "q-b",
        fields: { stem: "target", answer: "target", analysis: "target", summary: "target" },
      });
      expect(saved).toMatchObject({ linked: true, merged: false, resourceId: "q-b" });
      expect(input.questions).toHaveLength(2);
      expect((input.questions as Question[])[1].analysis).toBe("不同的解析-q-b");
      expect(await shareService.checkSaveAsOwnResource(donation.id, "teacher-b", "school-a"))
        .toMatchObject({ alreadySaved: true, canSave: false });
    });
  });

  it("links matching platform donations while keeping two independent snapshots", async () => {
    const input = state();
    await runWithState(input, async () => {
      const [first] = await shareService.donateResources("teacher-a", "school-a", [{
        resourceType: "question", resourceId: "q-a",
      }]);
      const [second] = await shareService.donateResources("teacher-b", "school-a", [{
        resourceType: "question", resourceId: "q-b", duplicateAction: "same", duplicateTargetDonationId: first.id,
      }]);
      expect(first.id).not.toBe(second.id);
      expect((input.questions as Question[])[0].sameQuestionGroupId).toBe((input.questions as Question[])[1].sameQuestionGroupId);
      expect((input.shareRecords as ShareRecord[]).filter((r) => r.kind === "donation")).toHaveLength(2);
      expect((input.questions as Question[])[0].analysis).not.toBe((input.questions as Question[])[1].analysis);
    });
  });
});
