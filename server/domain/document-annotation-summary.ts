import type { ExamPaper, Lecture, LectureSection, Question, QuestionAnnotationSummary } from "../../src/types/index.js";
import { db } from "../runtime-db.js";

function lectureQuestionIds(sections: LectureSection[]): (string | undefined)[] {
  return sections.flatMap((section) => [
    ...(section.type === "question" ? [section.questionId] : []),
    ...lectureQuestionIds(section.children || []),
  ]);
}

function paperQuestionIds(paper: ExamPaper): (string | undefined)[] {
  if (paper.questions.length > 0) return paper.questions.map((question) => question.questionId);
  return paper.contentBlocks?.filter((block) => block.type === "question").map((block) => block.questionId) || [];
}

function getLectureQuestionIds(lecture: Lecture): (string | undefined)[] {
  const ids = lectureQuestionIds(lecture.sections);
  return ids.length > 0 ? ids : lecture.contentBlocks?.filter((block) => block.type === "question").map((block) => block.questionId) || [];
}

function countMissing(
  questionIds: (string | undefined)[],
  questions: Map<string, Pick<Question, "chapterIds" | "knowledgePointIds">>,
): QuestionAnnotationSummary {
  let missingChapterCount = 0;
  let missingKnowledgePointCount = 0;
  for (const id of questionIds) {
    const question = id ? questions.get(id) : undefined;
    if (!question?.chapterIds?.length) missingChapterCount++;
    if (!question?.knowledgePointIds?.length) missingKnowledgePointCount++;
  }
  return { totalQuestions: questionIds.length, missingChapterCount, missingKnowledgePointCount };
}

function questionIndex(): Map<string, Question> {
  return new Map(((db.read("questions") || []) as Question[]).map((question) => [question.id, question]));
}

export function withPaperAnnotationSummary(papers: ExamPaper[]): ExamPaper[] {
  const questions = questionIndex();
  const extracts = new Map<string, ExamPaper>();
  for (const paper of (db.read("examPapers") || []) as ExamPaper[]) {
    if (paper.isExtractCopy && paper.sourceResourceId) {
      const previous = extracts.get(paper.sourceResourceId);
      if (!previous || previous.updatedAt < paper.updatedAt) extracts.set(paper.sourceResourceId, paper);
    }
  }
  return papers.map((paper) => {
    const content = !paper.isExtractCopy ? extracts.get(paper.id) || paper : paper;
    return { ...paper, annotationSummary: countMissing(paperQuestionIds(content), questions) };
  });
}

export function withLectureAnnotationSummary(lectures: Lecture[]): Lecture[] {
  const questions = questionIndex();
  const extracts = new Map<string, Lecture>();
  for (const lecture of (db.read("lectures") || []) as Lecture[]) {
    if (lecture.isExtractCopy && lecture.sourceResourceId) {
      const previous = extracts.get(lecture.sourceResourceId);
      if (!previous || previous.updatedAt < lecture.updatedAt) extracts.set(lecture.sourceResourceId, lecture);
    }
  }
  return lectures.map((lecture) => {
    const content = !lecture.isExtractCopy ? extracts.get(lecture.id) || lecture : lecture;
    return { ...lecture, annotationSummary: countMissing(getLectureQuestionIds(content), questions) };
  });
}
