import type {
  ClassroomHomework,
  ClassroomHomeworkAnswer,
  ExamPaper,
  HomeworkAttitudeRecord,
  HomeworkClassOverviewRecord,
  Student,
  Teacher,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";

interface ScannedPaper {
  schoolId: string;
  sheetType: string;
  sheetId: string;
  createdAt: string;
  reviewedAt?: string | null;
  studentId?: string | null;
}

/** A dated correction or evaluation releases the answers for that class's entire homework day. */
export function classroomHomeworkAnswers(schoolId: string, classId: string): ClassroomHomeworkAnswer[] {
  const classExists = (db.read("schoolClasses") as Array<{ id: string; schoolId: string }>)
    .some((item) => item.id === classId && item.schoolId === schoolId);
  if (!classExists) return [];

  const correctedDays = new Set(
    ((db.read("homeworkClassOverviewRecords") || []) as HomeworkClassOverviewRecord[])
      .filter((item) => item.schoolId === schoolId && item.classId === classId
        && (Boolean(item.summary?.trim()) || Boolean(item.images?.length)))
      .map((item) => `${item.teacherId}: ${item.homeworkDate}`),
  );

  // A student-level dated evaluation is also a correction. Attendance-only entries
  // must never release answer keys.
  const classStudentIds = new Set(
    ((db.read("students") || []) as Student[])
      .filter((student) => student.schoolId === schoolId && student.classId === classId)
      .map((student) => student.id),
  );
  for (const record of ((db.read("homeworkAttitudeRecords") || []) as HomeworkAttitudeRecord[])) {
    if (record.schoolId === schoolId && classStudentIds.has(record.studentId)
      && record.homeworkDate && (record.keywords?.length || record.evaluation?.trim())) {
      correctedDays.add(`${record.teacherId}: ${record.homeworkDate}`);
    }
  }

  const reviewedScans = ((db.read("scannerPages") || []) as ScannedPaper[])
    .filter((scan) => scan.schoolId === schoolId && scan.sheetType === "paper" && !!scan.reviewedAt);

  // A paper assigned through a classroom homework may not carry its own date.
  const linkedDates = new Map<string, Set<string>>();
  for (const homework of ((db.read("classroomHomeworks") || []) as ClassroomHomework[])) {
    if (homework.schoolId !== schoolId || homework.managementCategory === "exam"
      || !homework.classIds.includes(classId) || !homework.assignedDate) continue;
    for (const paperId of homework.examPaperIds || []) {
      const key = `${homework.teacherId}:${paperId}`;
      const dates = linkedDates.get(key) || new Set<string>();
      dates.add(homework.assignedDate);
      linkedDates.set(key, dates);
    }
  }
  const teachers = new Map(
    (db.read("teachers") as Teacher[]).map((item) => [item.id, item.subject]),
  );

  return ((db.read("examPapers") || []) as ExamPaper[])
    .flatMap((paper): ClassroomHomeworkAnswer[] => {
      if (paper.schoolId !== schoolId || paper.managementCategory === "exam"
        || paper.isExtractCopy || !(paper.classIds || []).includes(classId)
        || !paper.questions?.some((question) => question.answer?.trim())) return [];

      const scheduledDates = [...new Set([
        ...(paper.assignedDate ? [paper.assignedDate] : []),
        ...(linkedDates.get(`${paper.teacherId}:${paper.id}`) || []),
      ])].sort((a, b) => b.localeCompare(a));
      const reviewedForClass = reviewedScans.some((scan) => scan.sheetId === paper.id
        && (scan.studentId ? classStudentIds.has(scan.studentId)
          : paper.classIds?.length === 1 && paper.classIds[0] === classId));
      const assignedDate = scheduledDates.find((date) =>
        correctedDays.has(`${paper.teacherId}: ${date}`))
        || (reviewedForClass ? scheduledDates[0] : undefined);
      if (!assignedDate) return [];

      return [{
        id: paper.id,
        title: paper.title,
        subject: paper.subject?.trim() || teachers.get(paper.teacherId) || "其他学科",
        assignedDate,
        questions: paper.questions.map((question, index) => ({
          id: question.id,
          number: index + 1,
          answer: question.answer?.trim() || "",
        })),
      }];
    })
    .sort((a, b) => b.assignedDate.localeCompare(a.assignedDate)
      || a.title.localeCompare(b.title, "zh-CN") || a.id.localeCompare(b.id));
}
