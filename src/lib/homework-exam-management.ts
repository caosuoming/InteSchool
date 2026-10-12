import type { ClassroomHomework, ExamPublication, HomeworkClassOverviewRecord } from "@/types";

export function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function homeworkTitle(homework: ClassroomHomework): string {
  return homework.title?.trim() || homework.content.split("\n").find((line) => line.trim())?.trim().slice(0, 80)
    || `附件作业（${homework.attachments?.length || 0} 个附件）`;
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
export function homeworkSubmissionCounts(
  homework: ClassroomHomework,
  recordsByClass: Map<string, HomeworkClassOverviewRecord[]>,
): { submitted: number; missing: number } | null {
  if (!homework.classIds.length || (homework.assignedEndDate || homework.assignedDate) !== homework.assignedDate) {
    return null;
  }
  let submitted = 0;
  let missing = 0;
  for (const classId of new Set(homework.classIds)) {
    const record = recordsByClass.get(classId)?.find((item) =>
      item.homeworkDate === homework.assignedDate && item.attendanceTaken);
    if (!record) return null;
    const students = new Set(record.studentIds);
    const handedIn = new Set(record.submittedStudentIds.filter((id) => students.has(id)));
    const absent = new Set(record.absentStudentIds);
    submitted += handedIn.size;
    missing += [...students].filter((id) => !handedIn.has(id) && !absent.has(id)).length;
  }
  return { submitted, missing };
}
