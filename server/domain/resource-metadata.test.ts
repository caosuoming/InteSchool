import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { examPaperService } from "./examPaper.js";
import { lectureService } from "./lecture.js";

describe("document resource metadata", () => {
  it("tracks created answer sheets without copying the marker to new document copies", async () => {
    const state: AppState = {
      teachers: [],
      currentTeacherId: null,
      examPapers: [],
      lectures: [],
      reflections: [],
    };

    await runWithState(state, async () => {
      const paper = await examPaperService.createPaper("teacher-1", "school-1", {
        title: "函数测试",
        chapterIds: ["chapter-1"],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        duration: 60,
        totalScore: 100,
        questions: [],
      });
      const lecture = await lectureService.createLecture("teacher-1", "school-1", {
        title: "函数讲义",
        chapterIds: ["chapter-1"],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        classIds: [],
        studentIds: [],
        sections: [],
      });

      const settings = {
        paperSize: "A3" as const,
        mode: "with-questions" as const,
        studentNumberDigits: 8,
        choiceLayout: "concentrated" as const,
      };
      const markedPaper = await examPaperService.markAnswerSheetCreated(paper.id, settings);
      const markedLecture = await lectureService.markAnswerSheetCreated(lecture.id, settings);
      expect(markedPaper).toMatchObject({ hasAnswerSheet: true, answerSheetSettings: settings });
      expect(markedLecture).toMatchObject({ hasAnswerSheet: true, answerSheetSettings: settings });
      expect(markedPaper?.answerSheetCreatedAt).toBeTruthy();
      expect(markedLecture?.answerSheetCreatedAt).toBeTruthy();

      const paperTimestamp = markedPaper!.answerSheetCreatedAt;
      const lectureTimestamp = markedLecture!.answerSheetCreatedAt;
      await expect(examPaperService.markAnswerSheetCreated(paper.id))
        .resolves.toEqual(expect.objectContaining({ answerSheetCreatedAt: paperTimestamp }));
      await expect(lectureService.markAnswerSheetCreated(lecture.id))
        .resolves.toEqual(expect.objectContaining({ answerSheetCreatedAt: lectureTimestamp }));

      const duplicatedPaper = await examPaperService.duplicatePaper(paper.id);
      const duplicatedLecture = await lectureService.duplicateLecture(lecture.id);
      const extractedPaper = await examPaperService.createExtractCopy(paper.id);
      const extractedLecture = await lectureService.createExtractCopy(lecture.id);
      for (const copy of [duplicatedPaper, duplicatedLecture, extractedPaper, extractedLecture]) {
        expect(copy.hasAnswerSheet).toBeUndefined();
        expect(copy.answerSheetCreatedAt).toBeUndefined();
        expect(copy.answerSheetSettings).toBeUndefined();
      }
    });
  });

  it("moves exam documents without losing metadata and gives copies independent homework status", async () => {
    const state: AppState = { teachers: [], currentTeacherId: null, examPapers: [], reflections: [] };
    await runWithState(state, async () => {
      const paper = await examPaperService.createPaper("teacher-1", "school-1", {
        title: "函数练习", chapterIds: [], knowledgePointIds: [], grade: "高一",
        schoolYear: "2026-2027", duration: 45, totalScore: 0, questions: [],
      });
      expect(paper.managementCategory).toBe("homework");
      const moved = await examPaperService.updatePaper(paper.id, {
        managementCategory: "exam", assignedDate: "2026-10-20",
        assignedEndDate: "2026-10-25", classIds: ["class-1"],
      });
      expect(moved).toMatchObject({
        managementCategory: "exam", assignedDate: "2026-10-20",
        assignedEndDate: "2026-10-25", classIds: ["class-1"],
      });
      expect(await examPaperService.getPaper(paper.id)).toMatchObject({ managementCategory: "exam" });
      await expect(examPaperService.updatePaper(paper.id, {
        assignedDate: "2026-10-26", assignedEndDate: "2026-10-25",
      })).rejects.toThrow("结束日期");
      await expect(examPaperService.updatePaper(paper.id, {
        managementCategory: "invalid" as "exam",
      })).rejects.toThrow("管理目录");
      const copied = await examPaperService.duplicatePaper(paper.id);
      expect(copied.managementCategory).toBe("homework");
      expect(copied.assignedDate).toBeUndefined();
    });
  });

  it("publishes only created answer sheets and locks document content until withdrawal", async () => {
    const state: AppState = {
      teachers: [], currentTeacherId: null, examPapers: [], lectures: [], reflections: [],
    };
    await runWithState(state, async () => {
      const paper = await examPaperService.createPaper("teacher-1", "school-1", {
        title: "试题", chapterIds: [], knowledgePointIds: [], grade: "高一", schoolYear: "2026-2027",
        duration: 60, totalScore: 0, questions: [],
      });
      const lecture = await lectureService.createLecture("teacher-1", "school-1", {
        title: "讲义", chapterIds: [], knowledgePointIds: [], grade: "高一", schoolYear: "2026-2027",
        classIds: [], studentIds: [], sections: [],
      });
      await expect(examPaperService.publishAnswerSheet(paper.id)).rejects.toThrow("请先制作答题卡");
      await expect(lectureService.publishAnswerSheet(lecture.id)).rejects.toThrow("请先制作答题卡");
      await examPaperService.markAnswerSheetCreated(paper.id);
      await lectureService.markAnswerSheetCreated(lecture.id);
      expect(await examPaperService.listPublishedAnswerSheets()).toEqual([]);
      expect(await lectureService.listPublishedAnswerSheets()).toEqual([]);
      expect(await examPaperService.getPublishedAnswerSheet(paper.id)).toBeNull();
      expect(await lectureService.getPublishedAnswerSheet(lecture.id)).toBeNull();

      const settings = {
        paperSize: "A4" as const, mode: "blank" as const,
        studentNumberDigits: 8, choiceLayout: "inline" as const,
      };
      const publishedPaper = await examPaperService.publishAnswerSheet(paper.id, settings);
      const publishedLecture = await lectureService.publishAnswerSheet(lecture.id, settings);
      expect(publishedPaper.answerSheetPublishedAt).toBeTruthy();
      expect(publishedLecture.answerSheetPublishedAt).toBeTruthy();
      expect((await examPaperService.listPublishedAnswerSheets()).map((item) => item.id)).toEqual([paper.id]);
      expect((await lectureService.listPublishedAnswerSheets()).map((item) => item.id)).toEqual([lecture.id]);
      expect(await examPaperService.getPublishedAnswerSheet(paper.id)).toMatchObject({ answerSheetSettings: settings });
      expect(await lectureService.getPublishedAnswerSheet(lecture.id)).toMatchObject({ answerSheetSettings: settings });

      await expect(examPaperService.updatePaper(paper.id, { title: "修改" })).rejects.toThrow("撤回发布");
      await expect(lectureService.updateLecture(lecture.id, { title: "修改" })).rejects.toThrow("撤回发布");
      await expect(examPaperService.deletePaper(paper.id)).rejects.toThrow("撤回发布");
      await expect(examPaperService.convertToLecture(paper.id)).rejects.toThrow("撤回发布");
      await expect(lectureService.convertToExamPaper(lecture.id)).rejects.toThrow("撤回发布");
      await expect(examPaperService.createExtractCopy(paper.id)).rejects.toThrow("撤回发布");
      await expect(lectureService.createExtractCopy(lecture.id)).rejects.toThrow("撤回发布");
      await expect(lectureService.deleteLecture(lecture.id)).rejects.toThrow("撤回发布");
      await expect(examPaperService.markAnswerSheetCreated(paper.id, { ...settings, studentNumberDigits: 10 }))
        .rejects.toThrow("撤回发布");
      await expect(lectureService.markAnswerSheetCreated(lecture.id, { ...settings, studentNumberDigits: 10 }))
        .rejects.toThrow("撤回发布");
      expect((await examPaperService.duplicatePaper(paper.id)).answerSheetPublishedAt).toBeUndefined();
      expect((await lectureService.duplicateLecture(lecture.id)).answerSheetPublishedAt).toBeUndefined();

      await examPaperService.unpublishAnswerSheet(paper.id);
      await lectureService.unpublishAnswerSheet(lecture.id);
      expect(await examPaperService.getPublishedAnswerSheet(paper.id)).toBeNull();
      expect(await lectureService.getPublishedAnswerSheet(lecture.id)).toBeNull();
      expect(await examPaperService.listPublishedAnswerSheets()).toEqual([]);
      expect(await lectureService.listPublishedAnswerSheets()).toEqual([]);
      await expect(examPaperService.updatePaper(paper.id, { title: "修改成功" })).resolves.toMatchObject({ title: "修改成功" });
      await expect(lectureService.updateLecture(lecture.id, { title: "修改成功" })).resolves.toMatchObject({ title: "修改成功" });
    });
  });

  it("stores configured types and filters papers and lectures by type", async () => {
    const state: AppState = {
      teachers: [],
      currentTeacherId: null,
      examPapers: [],
      lectures: [],
    };

    await runWithState(state, async () => {
      const paper = await examPaperService.createPaper("teacher-1", "school-1", {
        title: "阶段检测",
        chapterIds: [],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        semester: "上学期",
        duration: 90,
        totalScore: 100,
        questions: [],
        typeId: "paper-type-stage",
        questionSourceType: "school-upload",
        questionCategory: "stage-test",
      });
      await examPaperService.createPaper("teacher-1", "school-1", {
        title: "晚间作业",
        chapterIds: [],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        duration: 30,
        totalScore: 20,
        questions: [],
        typeId: "paper-type-homework",
      });

      const lecture = await lectureService.createLecture("teacher-1", "school-1", {
        title: "函数学案",
        chapterIds: [],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        semester: "上学期",
        classIds: [],
        studentIds: [],
        sections: [],
        typeId: "lecture-type-workbook",
        questionSourceType: "school-upload",
        questionCategory: "class-practice",
      });

      expect(paper).toMatchObject({
        typeId: "paper-type-stage",
        questionSourceType: "school-upload",
        questionCategory: "stage-test",
      });
      expect(lecture).toMatchObject({
        typeId: "lecture-type-workbook",
        questionSourceType: "school-upload",
        questionCategory: "class-practice",
      });
      await expect(examPaperService.listPapers({ typeId: "paper-type-stage" }))
        .resolves.toEqual([expect.objectContaining({ id: paper.id })]);
      await expect(lectureService.listLectures({ typeId: "lecture-type-workbook" }))
        .resolves.toEqual([expect.objectContaining({ id: lecture.id })]);
    });
  });

  it("filters papers and lectures by knowledge points from their contained questions", async () => {
    const state: AppState = {
      teachers: [],
      currentTeacherId: null,
      questions: [{
        id: "question-contained",
        schoolId: "school-1",
        chapterIds: [],
        knowledgePointIds: ["knowledge-contained"],
      } as any],
      examPapers: [],
      lectures: [],
    };

    await runWithState(state, async () => {
      const paper = await examPaperService.createPaper("teacher-1", "school-1", {
        title: "函数试卷",
        chapterIds: ["chapter-paper"],
        knowledgePointIds: ["knowledge-document"],
        grade: "高一",
        schoolYear: "2026-2027",
        duration: 60,
        totalScore: 100,
        questions: [{
          id: "paper-question-1",
          questionId: "question-contained",
          stem: "题目",
          answer: "答案",
          analysis: "",
          score: 10,
          type: "single",
        }],
      });
      const lecture = await lectureService.createLecture("teacher-1", "school-1", {
        title: "函数讲义",
        chapterIds: ["chapter-lecture"],
        knowledgePointIds: ["knowledge-document"],
        grade: "高一",
        schoolYear: "2026-2027",
        classIds: [],
        studentIds: [],
        sections: [{
          id: "section-question-1",
          title: "例题",
          type: "question",
          content: "",
          questionId: "question-contained",
          children: [],
        }],
      });

      expect(paper.knowledgePointIds).toEqual(["knowledge-contained"]);
      expect(lecture.knowledgePointIds).toEqual(["knowledge-contained"]);

      await expect(examPaperService.listPapers({ knowledgePointIds: ["knowledge-contained"] }))
        .resolves.toEqual([expect.objectContaining({ id: paper.id })]);
      await expect(lectureService.listLectures({ knowledgePointIds: ["knowledge-contained"] }))
        .resolves.toEqual([expect.objectContaining({ id: lecture.id })]);
      await expect(examPaperService.listPapers({ knowledgePointIds: ["knowledge-document"] }))
        .resolves.toEqual([]);
      await expect(lectureService.listLectures({ knowledgePointIds: ["knowledge-document"] }))
        .resolves.toEqual([]);

      await expect(examPaperService.listPapers({ chapterIds: ["chapter-paper"] }))
        .resolves.toEqual([expect.objectContaining({ id: paper.id })]);
      await expect(lectureService.listLectures({ chapterIds: ["chapter-lecture"] }))
        .resolves.toEqual([expect.objectContaining({ id: lecture.id })]);

      state.questions![0].knowledgePointIds = [];
      await expect(examPaperService.getPaper(paper.id))
        .resolves.toEqual(expect.objectContaining({ knowledgePointIds: [] }));
      await expect(lectureService.getLecture(lecture.id))
        .resolves.toEqual(expect.objectContaining({ knowledgePointIds: [] }));
      await expect(examPaperService.listPapers({ knowledgePointIds: ["knowledge-document"] }))
        .resolves.toEqual([]);
      await expect(lectureService.listLectures({ knowledgePointIds: ["knowledge-document"] }))
        .resolves.toEqual([]);
    });
  });

});
