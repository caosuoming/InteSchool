import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { examPaperService } from "./examPaper.js";
import { lectureService } from "./lecture.js";

describe("document resource metadata", () => {
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
