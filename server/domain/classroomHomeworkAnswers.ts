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

  // Only actual corrections release answers; merely recording attendance does not.
  const correctedDays = new Set(
    ((db.read("homeworkClassOverviewRecords") || []) as HomeworkClassOverviewRecord[])
      .filter((item) => item.schoolId === schoolId && item.classId === classId
        && (Boolean(item.summary?.trim()) || Boolean(item.images?.length)))
      .map((item) => `${item.teacherId}: ${item.homeworkDate}`),
  );

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

  // A linked paper uses the published classroom assignment's teacher and date,
  // even if the source paper belongs to another teacher or has a stale date.
  const linkedAssignments = new Map<string, HomeworkAssignment[]>();
  for (const homework of ((db.read("classroomHomeworks") || []) as ClassroomHomework[])) {
    if (homework.schoolId !== schoolId || homework.managementCategory === "exam"
      || !homework.classIds?.includes(classId) || !homework.examPaperIds?.length) continue;
    for (const paperId of homework.examPaperIds) {
      const assignments = linkedAssignments.get(paperId) || [];
      assignments.push({
        date: homework.assignedDate,
        teacherId: homework.teacherId,
        published: new Date(homework.publishAt).getTime() <= Date.now(),
        homeworkTitle: homework.title?.trim() || homework.content.trim().split("\n")[0]?.slice(0, 80) || "",
      });
      linkedAssignments.set(paperId, assignments);
    }
  }

  const teachers = new Map(
    (db.read("teachers") as Teacher[]).map((teacher) => [teacher.id, teacher.subject]),
  );
  return ((db.read("examPapers") || []) as ExamPaper[])
    .flatMap((paper): ClassroomHomeworkAnswer[] => {
      if (paper.schoolId !== schoolId || paper.managementCategory === "exam"
        || paper.isExtractCopy || !(paper.classIds || []).includes(classId)
        || !paper.questions?.some((question) => question.answer?.trim())) return [];

      const assignments = linkedAssignments.get(paper.id);
      let eligible: Array<{ date: string; homeworkTitle: string }>;
      if (assignments?.length) {
        // Linked papers cannot be unlocked by scans or unrelated records.
        eligible = assignments.filter((item) =>
          item.published && !!item.date && correctedDays.has(`${item.teacherId}: ${item.date}`));
      } else {
        const reviewed = reviewedScans.find((scan) => scan.sheetId === paper.id
          && (scan.studentId ? classStudentIds.has(scan.studentId)
            : paper.classIds?.length === 1 && paper.classIds[0] === classId));
        const corrected = !!paper.assignedDate && correctedDays.has(`${paper.teacherId}: ${paper.assignedDate}`);
        const date = paper.assignedDate || reviewed?.createdAt.slice(0, 10);
        eligible = (date && (corrected || !!reviewed)) ? [{ date, homeworkTitle: "" }] : [];
      }

      const seenDates = new Set<string>();
      return eligible.flatMap((item) => {
        if (seenDates.has(item.date)) return [];
        seenDates.add(item.date);
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
