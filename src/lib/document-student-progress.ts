import type { AnswerRecord, ExamPaper, Lecture, LectureSection } from "@/types";

type DocumentQuestion = { key: string; questionId?: string };

export type PendingQuestionAssignment = { studentId: string; questionId: string };

function lectureQuestions(sections: LectureSection[]): DocumentQuestion[] {
  return sections.flatMap((section) => [
    ...(section.type === "question"
      ? [{ key: section.id, questionId: section.questionId || section.id }]
      : []),
    ...lectureQuestions(section.children || []),
  ]);
}

export function documentQuestionRefs(document: ExamPaper | Lecture): DocumentQuestion[] {
  const blockQuestionIds = new Map(
    (document.contentBlocks || [])
      .filter((block) => block.type === "question" && block.examPaperQuestionId && block.questionId)
      .map((block) => [block.examPaperQuestionId!, block.questionId!]),
  );
  const questions = "questions" in document
    ? document.questions.map((item) => ({
      key: item.id,
      questionId: item.questionId || blockQuestionIds.get(item.id) || item.id,
    }))
    : lectureQuestions(document.sections);
  if (questions.length) return questions;
  return (document.contentBlocks || [])
    .filter((block) => block.type === "question")
    .map((block) => ({ key: block.id, questionId: block.questionId || block.examPaperQuestionId || block.id }));
}

export function documentStudentProgress(
  document: ExamPaper | Lecture,
  studentIds: string[],
  records: AnswerRecord[],
  pendingAssignments: PendingQuestionAssignment[],
): { done: number; pending: number; undone: number } {
  const selectedStudents = new Set(studentIds);
  if (selectedStudents.size === 0) return { done: 0, pending: 0, undone: 0 };

  const answeredQuestionIds = new Set(
    records
      .filter((record) => selectedStudents.has(record.studentId))
      .map((record) => record.questionId),
  );
  const pendingQuestionIds = new Set(
    pendingAssignments
      .filter((assignment) => selectedStudents.has(assignment.studentId))
      .map((assignment) => assignment.questionId),
  );
  let done = 0;
  let pending = 0;
  let undone = 0;
  for (const question of documentQuestionRefs(document)) {
    if (question.questionId && answeredQuestionIds.has(question.questionId)) done += 1;
    else if (question.questionId && pendingQuestionIds.has(question.questionId)) pending += 1;
    else undone += 1;
  }
  return { done, pending, undone };
}

export function documentStudentProgressLabel(
  document: ExamPaper | Lecture,
  studentIds: string[],
  records: AnswerRecord[],
  pendingAssignments: PendingQuestionAssignment[],
): string {
  const { done, pending, undone } = documentStudentProgress(document, studentIds, records, pendingAssignments);
  return `做过 ${done} 题 · 待做 ${pending} 题 · 未做 ${undone} 题`;
}
