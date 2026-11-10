import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { examPaperService } from "./examPaper.js";

function state(): AppState {
  return { teachers: [], currentTeacherId: null, examPapers: [], lectures: [], answerRecords: [], questions: [] } as AppState;
}

async function paper() {
  return examPaperService.createPaper("teacher-1", "school-1", {
    title: "测试试卷", chapterIds: [], knowledgePointIds: [], grade: "高一",
    schoolYear: "2026-2027", duration: 60, totalScore: 5,
    questions: [{ id: "item-1", questionId: "bank-1", type: "single", stem: "题目", answer: "A", analysis: "解析", score: 5 }],
  });
}

describe("exam-paper export locks", () => {
  it("locks paper structure after download and allows metadata and score updates", async () => {
    await runWithState(state(), async () => {
      const created = await paper();
      const locked = await examPaperService.markPaperDownloaded(created.id);
      expect(locked.paperDownloadedAt).toBeTruthy();
      await expect(examPaperService.updatePaper(created.id, { layoutMode: "flat" }))
        .rejects.toThrow("不能调整题目编排方式");
      await expect(examPaperService.updatePaper(created.id, { projects: [{ id: "p1", name: "项目一" }] }))
        .rejects.toThrow("不能调整项目编排");
      await expect(examPaperService.updatePaper(created.id, { questions: [...created.questions, { ...created.questions[0], id: "item-2" }] }))
        .rejects.toThrow("不能换题");
      await expect(examPaperService.updatePaper(created.id, { questions: [{ ...created.questions[0], projectId: "p1" }] }))
        .rejects.toThrow("不能换题");
      await examPaperService.updatePaper(created.id, { title: "改名", questions: [{ ...created.questions[0], score: 7 }] });
      await examPaperService.updatePaper(created.id, { paperDownloadedAt: undefined, answerSheetExportedAt: undefined });
      expect((await examPaperService.getPaper(created.id))?.paperDownloadedAt).toBeTruthy();
      await expect(examPaperService.updatePaper(created.id, { layoutMode: "flat" }))
        .rejects.toThrow();
      await examPaperService.invalidatePaperDownload(created.id);
      const edited = await examPaperService.updatePaper(created.id, { layoutMode: "flat" });
      expect(edited.layoutMode).toBe("flat");
      expect(edited.questions[0].score).toBe(7);
    });
  });

  it("keeps structure locked until both paper and answer sheet exports are voided", async () => {
    await runWithState(state(), async () => {
      const created = await paper();
      await examPaperService.markPaperDownloaded(created.id);
      await examPaperService.markAnswerSheetCreated(created.id);
      const exported = await examPaperService.markAnswerSheetExported(created.id);
      expect(exported.answerSheetExportedAt).toBeTruthy();
      await examPaperService.invalidatePaperDownload(created.id);
      await expect(examPaperService.updatePaper(created.id, { layoutMode: "flat" })).rejects.toThrow();
      const voided = await examPaperService.invalidateAnswerSheet(created.id);
      expect(voided.answerSheetExportedAt).toBeUndefined();
      expect(voided.hasAnswerSheet).toBeUndefined();
      expect(voided.answerSheetRevisionId).toBeUndefined();
      await examPaperService.updatePaper(created.id, { layoutMode: "flat" });
    });
  });

  it("invalidates unexported answer sheets when a type heading changes and locks it after export", async () => {
    await runWithState(state(), async () => {
      const created = await paper();
      await examPaperService.markAnswerSheetCreated(created.id);
      const renamed = await examPaperService.updatePaper(created.id, {
        questionTypeLabels: { single: "客观题" },
      });
      expect(renamed.questionTypeLabels).toEqual({ single: "客观题" });
      expect(renamed.hasAnswerSheet).toBeUndefined();
      await examPaperService.markAnswerSheetCreated(created.id);
      await examPaperService.markAnswerSheetExported(created.id);
      await expect(examPaperService.updatePaper(created.id, {
        questionTypeLabels: { single: "选择题" },
      })).rejects.toThrow("不能修改题型标题");
    });
  });

  it("cannot void an already published answer sheet", async () => {
    await runWithState(state(), async () => {
      const created = await paper();
      await examPaperService.markAnswerSheetCreated(created.id);
      await examPaperService.markAnswerSheetExported(created.id);
      await examPaperService.publishAnswerSheet(created.id);
      await expect(examPaperService.invalidateAnswerSheet(created.id)).rejects.toThrow("先撤回发布");
      await examPaperService.unpublishAnswerSheet(created.id);
      await expect(examPaperService.invalidateAnswerSheet(created.id)).resolves.toMatchObject({ answerSheetExportedAt: undefined });
    });
  });
});
