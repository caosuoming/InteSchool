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
});
