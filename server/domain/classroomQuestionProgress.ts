import type { AnswerRecord, AnswerScore, LessonCourseware, Lecture, Question, SchoolClass, Student } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { genId } from "../domain-shared.js";

export interface ClassroomQuestionProgressInput {
  coursewareId: string;
  classId: string;
  questionId: string;
  studentId?: string;
  score?: "correct" | "partial" | "wrong";
}

/** Persist an actual classroom question, not an arbitrary client-supplied student roster. */
export function recordClassroomQuestionProgress(input: ClassroomQuestionProgressInput, schoolId: string): AnswerRecord[] {
  const courseware = (db.read("lessonCoursewares") as LessonCourseware[]).find((item) => (
    item.id === input?.coursewareId && item.schoolId === schoolId
    && item.status === "published" && (item.lifecycleStatus || "active") === "active"
    && item.classIds.includes(input.classId)
  ));
  if (!courseware) throw new Error("课件不存在或未向该班级发布");
  const classroom = (db.read("schoolClasses") as SchoolClass[]).find((item) => (
    item.id === input.classId && item.schoolId === schoolId
    && item.status !== "deleted" && item.status !== "graduated"
  ));
  if (!classroom) throw new Error("班级不存在或已停用");
  if (!courseware.slides.some((slide) => slide.type === "question"
    && slide.questionId === input.questionId
    && !(slide.hiddenClassIds || []).includes(input.classId))) {
    throw new Error("当前课件没有向该班级展示这道题目");
  }
  if (!(db.read("questions") as Question[]).some((question) => (
    question.id === input.questionId && question.schoolId === schoolId
  ))) throw new Error("题库中不存在这道题目");

  const scored = input.score !== undefined;
  if (scored && !(["correct", "partial", "wrong"] as AnswerScore[]).includes(input.score!)) {
    throw new Error("掌握情况无效");
  }
  if (scored !== Boolean(input.studentId)) throw new Error("请选择有效的学生及掌握情况");
  const students = (db.read("students") as Student[]).filter((student) => (
    student.schoolId === schoolId && student.classId === input.classId && student.status === "active"
  ));
  const participants = scored
    ? students.filter((student) => student.id === input.studentId)
    : students;
  if (scored && participants.length === 0) throw new Error("学生不属于该班级");

  let documentId = courseware.id;
  if (courseware.sourceType === "lecture" && courseware.sourceId) {
    const lecture = (db.read("lectures") as Lecture[]).find((item) => (
      item.id === courseware.sourceId && item.schoolId === schoolId
    ));
    if (!lecture) throw new Error("来源讲义不存在");
    documentId = lecture.id;
  } else if (courseware.sourceType === "examPaper" && courseware.sourceId) {
    documentId = courseware.sourceId;
  }

  const now = new Date().toISOString();
  const changed: AnswerRecord[] = [];
  const keys = new Set(participants.map((student) => student.id));
  db.update("answerRecords", (records) => {
    const existingByStudent = new Map<string, AnswerRecord>(records.filter((record) => (
      record.questionId === input.questionId && record.lectureId === documentId
      && keys.has(record.studentId)
    )).map((record) => [record.studentId, record]));
    const additions: AnswerRecord[] = [];
    const updates = new Map<string, AnswerRecord>();
    for (const student of participants) {
      const existing = existingByStudent.get(student.id);
      // The automatic "done" mark must never erase a teacher's scored evaluation.
      if (existing && !scored) continue;
      const score: AnswerScore = scored ? input.score! : "done";
      if (existing?.score === score) continue;
      const record: AnswerRecord = existing
        ? { ...existing, score, isCorrect: score === "correct", source: "manual", answeredAt: now }
        : {
            id: genId("ar"), studentId: student.id, questionId: input.questionId,
            lectureId: documentId, score, isCorrect: score === "correct",
            source: "manual", answeredAt: now,
          };
      changed.push(record);
      if (existing) updates.set(existing.id, record);
      else additions.push(record);
    }
    if (!changed.length) return records;
    return [...records.map((record) => updates.get(record.id) || record), ...additions];
  });

  if (!scored && courseware.sourceType === "lecture" && courseware.sourceId) {
    db.update("lectures", (lectures) => lectures.map((lecture) => (
      lecture.id === documentId && !lecture.classIds.includes(input.classId)
        ? { ...lecture, classIds: [...lecture.classIds, input.classId], updatedAt: now }
        : lecture
    )));
  }
  if (changed.length) {
    db.update("questions", (questions) => questions.map((question) => (
      question.id === input.questionId ? { ...question, lastUsedAt: now } : question
    )));
  }
  return changed;
}
