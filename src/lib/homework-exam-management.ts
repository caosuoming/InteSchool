import type { ClassroomHomework, ExamPaper, ExamPublication, HomeworkClassOverviewRecord } from "@/types";

export function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function homeworkTitle(homework: ClassroomHomework): string {
  return homework.title?.trim() || homework.content.split("\n").find((line) => line.trim())?.trim().slice(0, 80)
    || (homework.examPaperIds?.length ? `试卷作业（${homework.examPaperIds.length} 份）`
      : `附件作业（${homework.attachments?.length || 0} 个附件）`);
}

export function homeworkStatus(homework: ClassroomHomework, now = new Date()) {
  if (Date.parse(homework.publishAt) > now.getTime()) return "待发布";
  const today = localDate(now);
  if (today < homework.assignedDate) return "待开始";
  if (today > (homework.assignedEndDate || homework.assignedDate)) return "已结束";
  return "进行中";
}

export function publicationStatus(publication: ExamPublication, now = new Date()) {
  if (publication.status === "revoked") return "已撤回";
  if (publication.status === "expired") return "已到期";
  if (publication.unlockAt && Date.parse(publication.unlockAt) > now.getTime()) return "保密中";
  return "已发布";
}

/** 点名按班级和日期记录，不区分同一天发布的不同作业。 */
export function homeworkSubmissionDetails(
  homework: ClassroomHomework,
  recordsByClass: Map<string, HomeworkClassOverviewRecord[]>,
): { submitted: number; missing: number; missingStudents: { classId: string; studentId: string }[] } | null {
  if (!homework.classIds.length || (homework.assignedEndDate || homework.assignedDate) !== homework.assignedDate) {
    return null;
  }
  let submitted = 0;
  const missingStudents: { classId: string; studentId: string }[] = [];
  for (const classId of new Set(homework.classIds)) {
    const record = recordsByClass.get(classId)?.find((item) =>
      item.homeworkDate === homework.assignedDate && item.attendanceTaken);
    if (!record) return null;
    const students = new Set(record.studentIds);
    const handedIn = new Set(record.submittedStudentIds.filter((id) => students.has(id)));
    const absent = new Set(record.absentStudentIds);
    submitted += handedIn.size;
    for (const studentId of students) {
      if (!handedIn.has(studentId) && !absent.has(studentId)) {
        missingStudents.push({ classId, studentId });
      }
    }
  }
  return { submitted, missing: missingStudents.length, missingStudents };
}

export function homeworkSubmissionCounts(
  homework: ClassroomHomework,
  recordsByClass: Map<string, HomeworkClassOverviewRecord[]>,
): { submitted: number; missing: number } | null {
  const details = homeworkSubmissionDetails(homework, recordsByClass);
  return details ? { submitted: details.submitted, missing: details.missing } : null;
}

/** A record aimed only at personal teaching classes belongs in the personal-class view. */
export function isPersonalOnlyHomework(
  item: Pick<ClassroomHomework | ExamPaper, "classIds">,
  personalClassIds: ReadonlySet<string>,
): boolean {
  return !!item.classIds?.length && item.classIds.every((id) => personalClassIds.has(id));
}

type DatedHomework = {
  assignedDate?: string;
  assignedEndDate?: string;
  updatedAt: string;
};

/** Group by the complete scheduled date range, not by the last edited time. */
export function homeworkDateGroupKey(item: DatedHomework): string | null {
  return item.assignedDate ? `${item.assignedDate}|${item.assignedEndDate || item.assignedDate}` : null;
}

export function sortByHomeworkDate<T extends { item: DatedHomework }>(records: T[]): T[] {
  return [...records].sort((left, right) => {
    const leftKey = homeworkDateGroupKey(left.item);
    const rightKey = homeworkDateGroupKey(right.item);
    if (!leftKey) return rightKey ? 1 : right.item.updatedAt.localeCompare(left.item.updatedAt);
    if (!rightKey) return -1;
    return rightKey.localeCompare(leftKey) || right.item.updatedAt.localeCompare(left.item.updatedAt);
  });
}

export function homeworkGroupPosition<T extends { item: DatedHomework }>(records: T[], index: number) {
  const key = homeworkDateGroupKey(records[index].item);
  const hasPrevious = !!key && index > 0 && homeworkDateGroupKey(records[index - 1].item) === key;
  const hasNext = !!key && index + 1 < records.length && homeworkDateGroupKey(records[index + 1].item) === key;
  return { grouped: hasPrevious || hasNext, first: !hasPrevious && hasNext, last: hasPrevious && !hasNext };
}

/** 未排期的试卷文档只是待布置资源，不应被显示为已开始的作业。 */
export function paperHomeworkStatus(paper: ExamPaper, now = new Date()): string {
  if (paper.status !== "published") return "草稿";
  if (!paper.assignedDate) return "已发布";
  const today = localDate(now);
  if (today < paper.assignedDate) return "待开始";
  if (today > (paper.assignedEndDate || paper.assignedDate)) return "已结束";
  return "进行中";
}
