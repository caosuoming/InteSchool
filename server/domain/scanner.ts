import { randomUUID } from "node:crypto";
import { db } from "../runtime-db.js";
import type { TeacherRecord } from "../types.js";
import type { ExamPaper, Lecture } from "../../src/types/index.js";
import type { ThirdPartyCard, CardRegion, CardRegionType } from "../../src/types/scanner.js";

export interface PublishedScannerSheet {
  id: string;
  type: "paper" | "lecture";
  title: string;
  grade: string;
  schoolYear: string;
  publishedAt: string;
  answerSheetRevisionId?: string;
  subject: string;
  classes: { id: string; name: string }[];
}

const REGION_TYPES: CardRegionType[] = ["name", "studentNumber", "barcode", "qrCode", "choice", "fill", "essay"];

function verifySchool(schoolId: string): void {
  if (typeof schoolId !== "string" || !schoolId || schoolId.length > 160) {
    throw new Error("请选择有效的学校");
  }
  if (!(db.read("schools") || []).some((school: { id: string }) => school.id === schoolId)) {
    throw new Error("学校不存在");
  }
}

function requireTeacher(teacher: TeacherRecord): string {
  if (!teacher?.schoolId) throw new Error("请先完成学校认证");
  return teacher.schoolId;
}

function validateName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 160) throw new Error("文件名须为 1 至 160 字");
  return value.trim();
}

function validateRegions(value: unknown): CardRegion[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("标注区域不能超过 100 个");
  return value.map((region: unknown) => {
    if (!region || typeof region !== "object") throw new Error("标注区域格式不正确");
    const item = region as Record<string, unknown>;
    if (!REGION_TYPES.includes(item.type as CardRegionType)) throw new Error("未知标注区域类型");
    if (typeof item.id !== "string" || !/^[\w-]{1,80}$/.test(item.id)) throw new Error("标注区域标识无效");
    for (const coord of ["x", "y", "width", "height"] as const) {
      if (typeof item[coord] !== "number" || !Number.isFinite(item[coord]) || item[coord] < 0 || item[coord] > 1) {
        throw new Error("标注坐标应在 0 至 1 之间");
      }
    }
    const { x, y, width, height } = item as { x: number; y: number; width: number; height: number };
    if (width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) throw new Error("标注区域超出了图像边界");
    return { id: item.id, type: item.type as CardRegionType, x, y, width, height };
  });
}

export const scannerService = {
  async listPublishedAnswerSheets(schoolId: string): Promise<PublishedScannerSheet[]> {
    verifySchool(schoolId);
    const teachers = (db.read("teachers") || []) as TeacherRecord[];
    const classes = (db.read("schoolClasses") || []) as Array<{ id: string; schoolId: string; name: string; grade: string }>;
    const mapItem = (item: ExamPaper | Lecture, type: "paper" | "lecture"): PublishedScannerSheet => ({
      id: item.id, type, title: item.title, grade: item.grade, schoolYear: item.schoolYear,
      publishedAt: item.answerSheetPublishedAt!,
      ...(item.answerSheetRevisionId ? { answerSheetRevisionId: item.answerSheetRevisionId } : {}),
      subject: teachers.find((teacher) => teacher.id === item.teacherId)?.subject || "未分类",
      classes: (item.classIds || []).flatMap((id) => {
        const found = classes.find((entry) => entry.id === id && entry.schoolId === schoolId);
        return found ? [{ id, name: `${found.grade} · ${found.name}` }] : [];
      }),
    });
    const papers = (db.read("examPapers") as ExamPaper[])
      .filter((item) => item.schoolId === schoolId && item.hasAnswerSheet && item.answerSheetPublishedAt)
      .map((item) => mapItem(item, "paper"));
    const lectures = (db.read("lectures") as Lecture[])
      .filter((item) => item.schoolId === schoolId && item.hasAnswerSheet && item.answerSheetPublishedAt)
      .map((item) => mapItem(item, "lecture"));
    return [...papers, ...lectures]
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  },

  async listThirdPartyCards(schoolId: string, teacher: TeacherRecord): Promise<ThirdPartyCard[]> {
    if (requireTeacher(teacher) !== schoolId) throw new Error("无权访问其他学校的数据");
    return ((db.read("thirdPartyCards") || []) as ThirdPartyCard[])
      .filter((card) => card.schoolId === schoolId && card.teacherId === teacher.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async updateThirdPartyCard(cardId: string, patch: { fileName?: string; paperId?: string | null; regions?: CardRegion[] }, teacher: TeacherRecord): Promise<ThirdPartyCard> {
    const schoolId = requireTeacher(teacher);
    const cards = (db.read("thirdPartyCards") || []) as ThirdPartyCard[];
    const card = cards.find((entry) => entry.id === cardId && entry.schoolId === schoolId && entry.teacherId === teacher.id);
    if (!card) throw new Error("扫描记录不存在或无权操作");
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("更新数据不正确");
    const fileName = patch.fileName === undefined ? card.fileName : validateName(patch.fileName);
    const paperId = patch.paperId === undefined ? card.paperId : patch.paperId || undefined;
    if (paperId !== undefined && (typeof paperId !== "string" || !((db.read("examPapers") || []) as ExamPaper[]).some((paper) =>
      paper.id === paperId && paper.schoolId === schoolId && paper.teacherId === teacher.id))) {
      throw new Error("所选试卷不存在或无权关联");
    }
    const regions = patch.regions === undefined ? card.regions : validateRegions(patch.regions);
    const updated: ThirdPartyCard = { ...card, fileName, paperId, regions, updatedAt: new Date().toISOString() };
    db.write("thirdPartyCards", cards.map((entry) => entry.id === cardId ? updated : entry));
    return updated;
  },
};

export async function createThirdPartyCard(input: { fileId: string; fileName: string }, teacher: TeacherRecord): Promise<ThirdPartyCard> {
  const schoolId = requireTeacher(teacher);
  if (typeof input?.fileId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.fileId)) throw new Error("扫描文件无效");
  const now = new Date().toISOString();
  const card: ThirdPartyCard = {
    id: randomUUID(), schoolId, teacherId: teacher.id, fileId: input.fileId,
    fileName: validateName(input.fileName), imageUrl: `/api/files/${input.fileId}`,
    regions: [], createdAt: now, updatedAt: now,
  };
  db.update("thirdPartyCards", (items: ThirdPartyCard[] = []) => [...items, card]);
  return card;
}
