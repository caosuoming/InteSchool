import type { ExamPaper, Lecture, LectureSection } from "../../src/types/index.js";
import { db } from "../runtime-db.js";

function collectLectureQuestionIds(sections: LectureSection[]): string[] {
  const ids: string[] = [];
  for (const section of sections) {
    if (section.questionId) ids.push(section.questionId);
    if (section.children?.length) ids.push(...collectLectureQuestionIds(section.children));
  }
  return ids;
}

function knowledgePointIdsForQuestionIds(questionIds: Iterable<string>): string[] {
  const wanted = new Set(questionIds);
  if (wanted.size === 0) return [];

  const knowledgePointIds = new Set<string>();
  for (const question of db.read("questions")) {
    if (!wanted.has(question.id)) continue;
    question.knowledgePointIds.forEach((id) => knowledgePointIds.add(id));
  }
  return [...knowledgePointIds];
}

export function examPaperKnowledgePointIds(paper: ExamPaper): string[] {
  let questionIds = paper.questions
    .map((item) => item.questionId)
    .filter((id): id is string => Boolean(id));

  if (questionIds.length === 0 && !paper.isExtractCopy) {
    const extractCopy = db.read("examPapers").find(
      (candidate) => candidate.isExtractCopy && candidate.sourceResourceId === paper.id,
    );
    if (extractCopy) {
      questionIds = extractCopy.questions
        .map((item) => item.questionId)
        .filter((id): id is string => Boolean(id));
    }
  }

  return knowledgePointIdsForQuestionIds(questionIds);
}

export function lectureKnowledgePointIds(lecture: Lecture): string[] {
  let questionIds = collectLectureQuestionIds(lecture.sections);

  if (questionIds.length === 0 && !lecture.isExtractCopy) {
    const extractCopy = db.read("lectures").find(
      (candidate) => candidate.isExtractCopy && candidate.sourceResourceId === lecture.id,
    );
    if (extractCopy) questionIds = collectLectureQuestionIds(extractCopy.sections);
  }

  return knowledgePointIdsForQuestionIds(questionIds);
}
