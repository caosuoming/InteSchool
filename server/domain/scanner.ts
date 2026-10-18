import { db } from "../runtime-db.js";
import type { ExamPaper, Lecture } from "../../src/types/index.js";

export interface PublishedScannerSheet {
  id: string;
  type: "paper" | "lecture";
  title: string;
  grade: string;
  schoolYear: string;
  publishedAt: string;
}

export const scannerService = {
  async listPublishedAnswerSheets(schoolId: string): Promise<PublishedScannerSheet[]> {
    if (typeof schoolId !== "string" || !schoolId || schoolId.length > 160) {
      throw new Error("请选择有效的学校");
    }
    if (!db.read("schools").some((school) => school.id === schoolId)) {
      throw new Error("学校不存在");
    }

    const papers = (db.read("examPapers") as ExamPaper[])
      .filter((item) => item.schoolId === schoolId && item.hasAnswerSheet && item.answerSheetPublishedAt)
      .map((item) => ({
        id: item.id, type: "paper" as const, title: item.title, grade: item.grade,
        schoolYear: item.schoolYear, publishedAt: item.answerSheetPublishedAt!,
      }));
    const lectures = (db.read("lectures") as Lecture[])
      .filter((item) => item.schoolId === schoolId && item.hasAnswerSheet && item.answerSheetPublishedAt)
      .map((item) => ({
        id: item.id, type: "lecture" as const, title: item.title, grade: item.grade,
        schoolYear: item.schoolYear, publishedAt: item.answerSheetPublishedAt!,
      }));
    return [...papers, ...lectures]
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  },
};
