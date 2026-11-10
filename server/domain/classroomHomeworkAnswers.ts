import type {
  ClassroomHomework,
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

interface HomeworkAssignment {
  date: string;
  teacherId: string;
  homeworkTitle: string;
  published: boolean;
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

  // A written assignment and its attached paper constitute one homework on
  // the assignment date. The paper's own assignedDate may be absent or stale.
  const linkedAssignments = new Map<string, HomeworkAssignment[]>();
  for (const homework of ((db.read("classroomHomeworks") || []) as ClassroomHomework[])) {
    if (homework.schoolId !== schoolId || homework.managementCategory === "exam"
      || !homework.classIds?.includes(classId) || !homework.examPaperIds?.length) continue;
    for (const paperId of homework.examPaperIds) {
      const assignments = linkedAssignments.get(paperId) || [];
      assignments.push({
        date: homework.assignedDate,
        published: new Date(homework.publishAt).getTime() <= Date.now(),
        teacherId: homework.teacherId,
        homeworkTitle: homework.title?.trim() || homework.content.trim().split("\n")[0]?.slice(0, 80) || "",
      });
      linkedAssignments.set(paperId, assignments);
    }
  }
  const teachers = new Map(
    (db.read("teachers") as Teacher[]).map((item) => [item.id, item.subject]),
  );

  return ((db.read("examPapers") || []) as ExamPaper[])
    .filter((paper) => paper.schoolId === schoolId
      && paper.status === "published"
      && paper.managementCategory !== "exam"
      && !paper.isExtractCopy
      && (paper.classIds || []).includes(classId)
      && paper.questions?.some((question) => question.answer?.trim()))
    .flatMap((paper) => {
      const assignments = linkedAssignments.get(paper.id);
      // A linked paper must have a record for the *combined homework's* date
      // and teacher. A scan or an unrelated record must not release it early.
      const eligible = assignments
        ? assignments.filter((item) => item.published && recorded.has(`${item.teacherId}: ${item.date}`))
        : (paper.assignedDate && recorded.has(`${paper.teacherId}: ${paper.assignedDate}`))
          || scans.has(paper.id)
          ? [{ date: paper.assignedDate || scans.get(paper.id)!.slice(0, 10), homeworkTitle: "" }]
          : [];
      const dates = new Set<string>();
      return eligible.flatMap((item) => {
        if (dates.has(item.date)) return [];
        dates.add(item.date);
        return [{
          id: `${paper.id}:${item.date}`,
          title: paper.title,
          homeworkTitle: item.homeworkTitle || undefined,
          subject: paper.subject?.trim() || teachers.get(paper.teacherId) || "其他学科",
          assignedDate: item.date,
          questions: paper.questions.map((question, index) => ({
            id: question.id,
            number: index + 1,
            answer: question.answer?.trim() || "",
          })),
        }];
      });
    })
    .sort((a, b) => b.assignedDate.localeCompare(a.assignedDate)
      || a.title.localeCompare(b.title, "zh-CN") || a.id.localeCompare(b.id));
}
