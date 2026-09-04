import type {
  Student,
  StudentInteraction,
  StudentInteractionAttachment,
  StudentInteractionView,
  InteractionType,
  Teacher,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { classService } from "./class.js";

export interface InteractionInput {
  studentId: string;
  type: InteractionType;
  content: string;
  attachments?: StudentInteractionAttachment[];
  attitude?: number;
  statusTag?: string;
  shareWithHomeroom?: boolean;
}

interface StudentInteractionFollow {
  id: string;
  teacherId: string;
  schoolId: string;
  studentId: string;
  createdAt: string;
}

const MAX_CHAT_ATTACHMENTS = 6;

function normalizeAttachments(
  type: InteractionType,
  attachments: StudentInteractionAttachment[] | undefined,
): StudentInteractionAttachment[] {
  if (!attachments) return [];
  if (!Array.isArray(attachments)) throw new Error("聊天图片格式不正确");
  if (attachments.length > MAX_CHAT_ATTACHMENTS) {
    throw new Error(`聊天图片不能超过 ${MAX_CHAT_ATTACHMENTS} 张`);
  }
  if (type !== "chat" && attachments.length > 0) {
    throw new Error("只有聊天记录可以添加图片");
  }
  return attachments.map((attachment) => {
    if (!attachment || typeof attachment !== "object") throw new Error("聊天图片格式不正确");
    const id = String(attachment.id || "").trim();
    const name = String(attachment.name || "").trim().slice(0, 200) || "聊天图片";
    const url = String(attachment.url || "").trim();
    const mimeType = String(attachment.mimeType || "").trim().slice(0, 120);
    const size = Number(attachment.size);
    if (!id || !/^\/api\/files\/[^/?#]+$/.test(url) || url !== `/api/files/${id}`) {
      throw new Error("聊天图片信息不一致");
    }
    if (!mimeType.startsWith("image/")) throw new Error("聊天记录只能上传图片");
    if (!Number.isFinite(size) || size < 0) throw new Error("聊天图片大小不正确");
    return { id, name, url, mimeType, size };
  });
}

async function requireStudentAccess(teacher: Teacher, studentId: string): Promise<void> {
  const students = await classService.listMyStudents(teacher.schoolId, teacher.id);
  if (!students.some((student) => student.id === studentId)) {
    throw new Error("只能访问自己任教班级或个人教学班的学生");
  }
}

function getHomeroomClassIds(teacher: Teacher, schoolId: string): Set<string> {
  const affiliation = teacher.affiliations?.find((item) => item.schoolId === schoolId)
    || teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return new Set(affiliation?.homeroomClassIds || teacher.homeroomClassIds || []);
}

function isHomeroomTeacherForStudent(teacher: Teacher, student: Student | undefined): boolean {
  if (!student || student.schoolId !== teacher.schoolId) return false;
  return getHomeroomClassIds(teacher, student.schoolId).has(student.classId);
}

function toVisibleInteraction(
  interaction: StudentInteraction,
  teacher: Teacher,
): StudentInteractionView {
  if (interaction.teacherId === teacher.id) {
    return {
      ...interaction,
      isAnonymous: false,
      canDelete: true,
    };
  }
  const { teacherId: _teacherId, ...anonymousInteraction } = interaction;
  return {
    ...anonymousInteraction,
    isAnonymous: true,
    canDelete: false,
  };
}

function canViewInteraction(
  interaction: StudentInteraction,
  teacher: Teacher,
  student: Student | undefined,
): boolean {
  return interaction.teacherId === teacher.id
    || (interaction.sharedWithHomeroom === true && isHomeroomTeacherForStudent(teacher, student));
}

export const studentInteractionService = {
  async listByStudent(studentId: string, teacher: Teacher): Promise<StudentInteractionView[]> {
    await delay(200);
    await requireStudentAccess(teacher, studentId);
    const student = db.read("students").find((item: Student) => item.id === studentId);
    return db
      .read("studentInteractions")
      .filter((interaction: StudentInteraction) =>
        interaction.studentId === studentId
        && canViewInteraction(interaction, teacher, student),
      )
      .sort((a: StudentInteraction, b: StudentInteraction) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((interaction: StudentInteraction) => toVisibleInteraction(interaction, teacher));
  },

  async listByTeacher(teacherId: string, teacher: Teacher): Promise<StudentInteractionView[]> {
    await delay(200);
    if (teacherId !== teacher.id) throw new Error("只能查看自己的师生互动页面");
    const students = new Map<string, Student>(
      db.read("students").map((student: Student) => [student.id, student]),
    );
    return db
      .read("studentInteractions")
      .filter((interaction: StudentInteraction) =>
        canViewInteraction(interaction, teacher, students.get(interaction.studentId)),
      )
      .sort((a: StudentInteraction, b: StudentInteraction) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((interaction: StudentInteraction) => toVisibleInteraction(interaction, teacher));
  },

  async listFollowedStudentIds(teacher: Teacher): Promise<string[]> {
    const accessibleStudents = await classService.listMyStudents(teacher.schoolId, teacher.id);
    const accessibleIds = new Set(accessibleStudents.map((student) => student.id));
    const follows = (db.read("studentInteractionFollows") || []) as StudentInteractionFollow[];
    return follows
      .filter((follow) => follow.teacherId === teacher.id && accessibleIds.has(follow.studentId))
      .map((follow) => follow.studentId);
  },

  async setStudentFollowed(studentId: string, followed: boolean, teacher: Teacher): Promise<void> {
    await requireStudentAccess(teacher, studentId);
    const current = (db.read("studentInteractionFollows") || []) as StudentInteractionFollow[];
    const exists = current.some((follow) => follow.teacherId === teacher.id && follow.studentId === studentId);
    if (followed && !exists) {
      if (!teacher.schoolId) throw new Error("当前教师未加入学校");
      const record: StudentInteractionFollow = {
        id: genId("sif"),
        teacherId: teacher.id,
        schoolId: teacher.schoolId,
        studentId,
        createdAt: new Date().toISOString(),
      };
      db.update("studentInteractionFollows", (list: StudentInteractionFollow[] = []) => [record, ...list]);
    } else if (!followed && exists) {
      db.update("studentInteractionFollows", (list: StudentInteractionFollow[] = []) => list.filter((follow) => (
        follow.teacherId !== teacher.id || follow.studentId !== studentId
      )));
    }
  },

  async createInteraction(
    teacherId: string,
    schoolId: string,
    input: InteractionInput,
    teacher: Teacher,
  ): Promise<StudentInteraction> {
    await delay(300);
    maybeThrowError();
    await requireStudentAccess(teacher, input.studentId);
    const content = typeof input.content === "string" ? input.content.trim() : "";
    const attachments = normalizeAttachments(input.type, input.attachments);
    if (!content && attachments.length === 0) throw new Error("请输入内容或添加图片");
    const now = new Date().toISOString();
    const interaction: StudentInteraction = {
      id: genId("si"),
      teacherId,
      schoolId,
      studentId: input.studentId,
      type: input.type,
      content,
      attachments: attachments.length > 0 ? attachments : undefined,
      attitude: input.attitude,
      statusTag: input.statusTag,
      sharedWithHomeroom: input.shareWithHomeroom === true,
      createdAt: now,
    };
    db.update("studentInteractions", (list) => [interaction, ...list]);
    return interaction;
  },

  async deleteInteraction(id: string, teacher: Teacher): Promise<void> {
    await delay(200);
    const interaction = db
      .read("studentInteractions")
      .find((item: StudentInteraction) => item.id === id);
    if (interaction && interaction.teacherId !== teacher.id) {
      throw new Error("不能删除其他教师的互动记录");
    }
    db.update("studentInteractions", (list) => list.filter((i) => i.id !== id));
  },
};
