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
  const questions = documentQuestionRefs(document);
  const answered = new Set(
    records
      .filter((record) => studentIds.includes(record.studentId))
      .map((record) => `${record.studentId}:${record.questionId}`),
  );
  const pendingKeys = new Set(pendingAssignments.map((assignment) =>
    `${assignment.studentId}:${assignment.questionId}`,
  ));
  let done = 0;
  let pending = 0;
  let undone = 0;
  for (const studentId of new Set(studentIds)) {
    for (const question of questions) {
      const key = `${studentId}:${question.questionId}`;
      if (question.questionId && answered.has(key)) done += 1;
      else if (question.questionId && pendingKeys.has(key)) pending += 1;
      else undone += 1;
    }
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
  const unit = new Set(studentIds).size > 1 ? "题次" : "题";
  return `做过 ${done} ${unit} · 待做 ${pending} ${unit} · 未做 ${undone} ${unit}`;
}
