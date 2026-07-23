import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestionInput } from "@/services/question";
import { questionService } from "@/services/question";
import { computeDuplicateHash, db } from "@/services/db";

const input: QuestionInput = {
  type: "single",
  stem: "1 + 1 = ?",
  options: ["1", "2", "3", "4"],
  answer: "2",
  analysis: "基础加法",
  chapterIds: [],
  knowledgePointIds: [],
  difficulty: 1,
  recommendation: 5,
};

describe("question service", () => {
  beforeEach(() => {
    db.reset();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  it("adds duplicate-detection metadata during batch import", async () => {
    const [question] = await questionService.batchImport("tch-1", "sch-1", [input]);

    expect(question.duplicateHash).toBe(computeDuplicateHash(input.stem, input.answer, input.options));
    expect(question.hiddenByExamIds).toEqual([]);
    expect(question.summary).toBe("");
  });

  it("recomputes the duplicate hash when duplicate-relevant content changes", async () => {
    const question = await questionService.createQuestion("tch-1", "sch-1", input);
    const oldHash = question.duplicateHash;

    const updated = await questionService.updateQuestion(question.id, { stem: "2 + 2 = ?", answer: "4" });

    expect(updated.duplicateHash).toBe(computeDuplicateHash("2 + 2 = ?", "4", input.options));
    expect(updated.duplicateHash).not.toBe(oldHash);
  });

  it("supports filtering and duplicate lookup", async () => {
    const question = await questionService.createQuestion("tch-1", "sch-1", input);

    await expect(questionService.listQuestions({ keyword: "基础加法", teacherId: "tch-1" }))
      .resolves.toContainEqual(question);
    await expect(questionService.checkDuplicate(input.stem, input.answer, input.options, "sch-1"))
      .resolves.toContainEqual(question);
  });

  it("maintains remark and usage metadata through its lifecycle", async () => {
    const question = await questionService.createQuestion("tch-1", "sch-1", input);
    const remark = await questionService.addRemark(question.id, "第一次备注");
    const updatedRemark = await questionService.updateRemark(question.id, remark.id, "更新后的备注");
    expect(updatedRemark.content).toBe("更新后的备注");
    expect(await questionService.getQuestion(question.id)).toMatchObject({
      remark: "更新后的备注",
    });

    await questionService.incrementUsage(question.id);
    const usedQuestion = await questionService.getQuestion(question.id);
    expect(usedQuestion).toMatchObject({ usageCount: 1, lastUsedAt: expect.any(String) });

    await questionService.deleteRemark(question.id, remark.id);
    expect(await questionService.getQuestion(question.id)).toMatchObject({ remark: "", remarks: [] });

    await questionService.deleteQuestion(question.id);
    expect(await questionService.getQuestion(question.id)).toBeNull();
  });
});
