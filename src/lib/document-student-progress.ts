import type { AnswerRecord, ExamPaper, Lecture, LectureSection } from "@/types";

type DocumentQuestion = { key: string; questionId?: string };

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
): { done: number; pending: number } {
  const questions = documentQuestionRefs(document);
  const answered = new Set(
    records
      .filter((record) => studentIds.includes(record.studentId))
      .map((record) => `${record.studentId}:${record.questionId}`),
  );
  let done = 0;
  for (const studentId of studentIds) {
    for (const question of questions) {
      if (question.questionId && answered.has(`${studentId}:${question.questionId}`)) done += 1;
    }
  }
  return { done, pending: questions.length * studentIds.length - done };
}

export function documentStudentProgressLabel(
  document: ExamPaper | Lecture,
  studentIds: string[],
  records: AnswerRecord[],
): string {
  const { done, pending } = documentStudentProgress(document, studentIds, records);
  const unit = studentIds.length > 1 ? "题次" : "题";
  return `已做 ${done} ${unit} · 待做 ${pending} ${unit}`;
}
