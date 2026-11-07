import type {
  ClassroomHomeworkAnswer,
  ExamPaper,
  HomeworkClassOverviewRecord,
  Teacher,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";

interface ScannedPaper {
  schoolId: string;
  sheetType: string;
  sheetId: string;
  createdAt: string;
}

export function classroomHomeworkAnswers(schoolId: string, classId: string): ClassroomHomeworkAnswer[] {
  const classExists = (db.read("schoolClasses") as Array<{ id: string; schoolId: string }>)
    .some((item) => item.id === classId && item.schoolId === schoolId);
  if (!classExists) return [];

  const recorded = new Set(
    ((db.read("homeworkClassOverviewRecords") || []) as HomeworkClassOverviewRecord[])
      .filter((item) => item.schoolId === schoolId && item.classId === classId
        && (item.attendanceTaken || Boolean(item.summary?.trim()) || Boolean(item.images?.length)))
      .map((item) => `${item.teacherId}: ${item.homeworkDate}`),
  );
  const scans = new Map<string, string>();
  for (const scan of ((db.read("scannerPages") || []) as ScannedPaper[])) {
    if (scan.schoolId !== schoolId || scan.sheetType !== "paper") continue;
    const last = scans.get(scan.sheetId);
    if (!last || scan.createdAt > last) scans.set(scan.sheetId, scan.createdAt);
  }
  const teachers = new Map(
    (db.read("teachers") as Teacher[]).map((item) => [item.id, item.subject]),
  );

  return ((db.read("examPapers") || []) as ExamPaper[])
    .filter((paper) => paper.schoolId === schoolId
      && paper.managementCategory !== "exam"
      && !paper.isExtractCopy
      && (paper.classIds || []).includes(classId)
      && paper.questions?.some((question) => question.answer?.trim())
      && (scans.has(paper.id)
        || Boolean(paper.assignedDate && recorded.has(`${paper.teacherId}: ${paper.assignedDate}`))))
    .map((paper) => ({
      id: paper.id,
      title: paper.title,
      subject: paper.subject?.trim() || teachers.get(paper.teacherId) || "其他学科",
      assignedDate: paper.assignedDate || scans.get(paper.id)!.slice(0, 10),
      questions: paper.questions.map((question, index) => ({
        id: question.id,
        number: index + 1,
        answer: question.answer?.trim() || "",
      })),
    }))
    .sort((a, b) => b.assignedDate.localeCompare(a.assignedDate)
      || a.title.localeCompare(b.title, "zh-CN") || a.id.localeCompare(b.id));
}
