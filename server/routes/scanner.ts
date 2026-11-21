import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DatabaseStore } from "../database.js";
import type { ServerConfig } from "../config.js";
import type { StoredFile } from "../types.js";
import { requireCsrf, requireSession } from "./auth.js";
import { withReadOnlyState, withSerializedState } from "../rpc.js";
import { buildAnswerSheetQrPayload } from "../../src/lib/answer-sheet-qr.js";
import { scoreScanMark } from "../../src/lib/scanner-grading.js";
import type { ScannerGradingEntry, ScannerGradingQuestion } from "../../src/lib/scanner-grading.js";
import type { ExamPaperQuestion } from "../../src/types/index.js";

interface ScannerPageRecord {
  id: string;
  schoolId: string;
  teacherId: string;
  sheetType: "paper" | "lecture";
  sheetId: string;
  fileId: string;
  qrPayload: string | null;
  verified: boolean;
  studentId: string | null;
  status: "pending" | "assigned";
  studentClassId?: string | null;
  studentClassName?: string | null;
  qrCurrent?: boolean;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  manualVerifiedAt?: string | null;
  manualVerifiedBy?: string | null;
  manualVerifiedRevisionId?: string | null;
  createdAt: string;
  gradingEntries?: ScannerGradingEntry[];
  gradingUpdatedAt?: string | null;
  gradingUpdatedBy?: string | null;
  gradingRevisionId?: string | null;
  gradingRevisionCurrent?: boolean;
}

const querySchema = z.object({ schoolId: z.string().min(1).max(160) });
const scanSchema = z.object({
  schoolId: z.string().min(1).max(160),
  sheetType: z.enum(["paper", "lecture"]),
  sheetId: z.string().min(1).max(160),
  qrPayload: z.string().max(500).optional(),
});
const assignmentSchema = z.object({
  studentId: z.string().min(1).max(160).nullable().optional(),
  reviewed: z.boolean().optional(),
  manualVerified: z.boolean().optional(),
}).refine((value) => value.studentId !== undefined || value.reviewed !== undefined || value.manualVerified !== undefined, {
  message: "至少需要修改一项扫描记录信息",
});
const gradingInputSchema = z.object({
  entries: z.array(z.object({
    questionId: z.string().min(1).max(160),
    observedMark: z.string().max(100).default(""),
    observedBox: z.string().max(100).default(""),
    confirmedScore: z.number().finite().min(0).max(1000).multipleOf(0.01).nullable().default(null),
  })).max(200),
});
const RECORD_MIME = new Map([["image/png", ".png"], ["image/jpeg", ".jpg"]]);

function sheetFor(state: Record<string, unknown>, type: "paper" | "lecture", id: string) {
  const key = type === "paper" ? "examPapers" : "lectures";
  return (state[key] as Array<{ id: string; schoolId: string; hasAnswerSheet?: boolean; answerSheetPublishedAt?: string; answerSheetRevisionId?: string }> || [])
    .find((item) => item.id === id && ((item.hasAnswerSheet && item.answerSheetPublishedAt)
      || (state.answerRecords as Array<{ lectureId: string }> || []).some((record) => record.lectureId === id)));
}
function qrFor(type: "paper" | "lecture", id: string, revisionId?: string) {
  return buildAnswerSheetQrPayload(type === "paper" ? "exam-paper" : "lecture", id, revisionId);
}
function withStudentClass(record: ScannerPageRecord, state: Record<string, unknown>): ScannerPageRecord {
  const student = record.studentId && (state.students as Array<{
    id: string; schoolId: string; classId: string;
  }> || []).find((item) => item.id === record.studentId && item.schoolId === record.schoolId);
  const schoolClass = student && (state.schoolClasses as Array<{
    id: string; schoolId: string; name: string; grade: string;
  }> || []).find((item) => item.id === student.classId && item.schoolId === record.schoolId);
  const sheet = sheetFor(state, record.sheetType, record.sheetId);
  const qrCurrent = Boolean(sheet && sheet.schoolId === record.schoolId
    && ((record.verified && record.qrPayload === qrFor(record.sheetType, record.sheetId, sheet.answerSheetRevisionId))
      || (record.manualVerifiedAt
        && (record.manualVerifiedRevisionId || null) === (sheet.answerSheetRevisionId || null))));
  return {
    ...record,
    qrCurrent,
    gradingRevisionCurrent: Boolean(record.gradingUpdatedAt
      && record.gradingRevisionId === (sheet?.answerSheetRevisionId || null) && qrCurrent),
    studentClassId: schoolClass?.id || null,
    studentClassName: schoolClass ? [schoolClass.grade, schoolClass.name].filter(Boolean).join(" · ") : null,
  };
}

function gradingQuestions(state: Record<string, unknown>, sheetId: string, schoolId: string) {
  const paper = (state.examPapers as Array<{
    id: string; schoolId: string; questions?: ExamPaperQuestion[];
    answerSheetRevisionId?: string; answerSheetPublishedAt?: string;
  }> || []).find((item) => item.id === sheetId && item.schoolId === schoolId && item.answerSheetPublishedAt);
  if (!paper) throw new Error("已发布试卷不存在或无权访问");
  return {
    revisionId: paper.answerSheetRevisionId || null,
    questions: (paper.questions || []).map((question, number) => ({
      id: question.id,
      number: number + 1,
      kind: (question.type === "single" || question.type === "multiple") ? "choice"
        : (question.type === "short" || question.type === "conceptFill") ? "fill" : "essay",
      fullScore: question.score,
      answer: question.answer,
    })),
  };
}

function signatureMime(data: Buffer) {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  return null;
}

export async function registerScannerRoutes(app: FastifyInstance, store: DatabaseStore, config: ServerConfig) {
  app.get("/api/scanner/pages", async (request) => {
    const session = await requireSession(request, store);
    const { schoolId } = querySchema.parse(request.query);
    const teacher = store.getTeacherById(session.teacherId);
    if (!teacher || teacher.schoolId !== schoolId) throw new Error("无权查看该校扫描记录");
    return withReadOnlyState(store, (state) => (state.scannerPages as ScannerPageRecord[] || [])
      .filter((item) => item.schoolId === schoolId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => withStudentClass(item, state)));
  });

  app.post("/api/scanner/pages", async (request) => {
    const session = await requireSession(request, store);
    requireCsrf(request, session);
    const teacher = store.getTeacherById(session.teacherId);
    if (!teacher?.schoolId) throw new Error("仅已登录的学校教师可上传扫描件");
    // Context travels in query, independently of multipart field ordering.
    const input = scanSchema.parse(request.query);
    if (input.schoolId !== teacher.schoolId) throw new Error("无权上传其他学校的扫描件");
    const canUpload = await withReadOnlyState(store, (state) => {
      const sheet = sheetFor(state, input.sheetType, input.sheetId);
      if (!sheet || sheet.schoolId !== teacher.schoolId) return false;
      if (input.qrPayload && input.qrPayload !== qrFor(input.sheetType, input.sheetId, sheet.answerSheetRevisionId)) {
        throw new Error("二维码与所选答题卡版本不一致，请重新确认");
      }
      return true;
    });
    if (!canUpload) throw new Error("该校答题卡不存在或已撤回发布");
    const part = await request.file();
    if (!part || !RECORD_MIME.has(part.mimetype)) throw new Error("扫描件须为 PNG 或 JPEG 图像");
    const id = randomUUID();
    const extension = RECORD_MIME.get(part.mimetype)!;
    const filename = `${id}${extension}`;
    const path = join(config.uploadsDir, filename);
    const tmp = `${path}.uploading`;
    try {
      await pipeline(part.file, createWriteStream(tmp, { flags: "wx", mode: 0o600 }));
      if (part.file.truncated) throw new Error("扫描件超过上传大小限制");
      const data = await readFile(tmp);
      if (!data.length || data.length > 25 * 1024 * 1024 || signatureMime(data) !== part.mimetype) throw new Error("扫描图像无效或超过 25 MB");
      await rename(tmp, path);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
    const file: StoredFile = {
      id, ownerId: teacher.id, schoolId: teacher.schoolId,
      originalName: `scan-${input.sheetId}-${id}${extension}`, mimeType: part.mimetype,
      size: (await stat(path)).size, storageName: filename, createdAt: new Date().toISOString(),
    };
    const record: ScannerPageRecord = {
      id: randomUUID(), schoolId: teacher.schoolId, teacherId: teacher.id,
      sheetId: input.sheetId, sheetType: input.sheetType, fileId: id,
      qrPayload: input.qrPayload ?? null, verified: false,
      studentId: null, status: "pending", reviewedAt: null, reviewedBy: null, createdAt: file.createdAt,
    };
    try {
      await store.saveFile(file);
      await withSerializedState(store, (state) => {
        // Recheck publication to avoid a race with withdrawal during upload.
        const sheet = sheetFor(state, input.sheetType, input.sheetId);
        if (sheet?.schoolId !== teacher.schoolId) throw new Error("答题卡已撤回发布");
        const expectedQr = qrFor(input.sheetType, input.sheetId, sheet.answerSheetRevisionId);
        if (input.qrPayload && input.qrPayload !== expectedQr) throw new Error("答题卡版本已变更，请重新扫描");
        record.verified = input.qrPayload === expectedQr;
        (state.scannerPages as ScannerPageRecord[]).push(record);
      });
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
    return withReadOnlyState(store, (state) => withStudentClass(record, state));
  });

  app.get("/api/scanner/pages/:id/grading-questions", async (request) => {
    const session = await requireSession(request, store);
    const teacher = store.getTeacherById(session.teacherId);
    if (!teacher?.schoolId) throw new Error("无权查看试卷评分信息");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return withReadOnlyState(store, (state) => {
      const record = (state.scannerPages as ScannerPageRecord[]).find(
        (item) => item.id === id && item.schoolId === teacher.schoolId,
      );
      if (!record) throw new Error("扫描记录不存在");
      if (record.sheetType !== "paper") throw new Error("仅试卷扫描件支持逐题评分草稿");
      const rubric = gradingQuestions(state, record.sheetId, teacher.schoolId!);
      return rubric.questions.map(({ answer: _answer, ...question }) => question) as ScannerGradingQuestion[];
    });
  });

  app.patch("/api/scanner/pages/:id/grading-draft", async (request) => {
    const session = await requireSession(request, store);
    requireCsrf(request, session);
    const teacher = store.getTeacherById(session.teacherId);
    if (!teacher?.schoolId) throw new Error("无权编辑扫描件评分草稿");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { entries } = gradingInputSchema.parse(request.body);
    if (new Set(entries.map((entry) => entry.questionId)).size !== entries.length) {
      throw new Error("不能重复录入同一题目");
    }
    return withSerializedState(store, (state) => {
      const record = (state.scannerPages as ScannerPageRecord[]).find(
        (item) => item.id === id && item.schoolId === teacher.schoolId,
      );
      if (!record) throw new Error("扫描记录不存在");
      if (record.sheetType !== "paper") throw new Error("仅试卷扫描件支持逐题评分草稿");
      const sheet = sheetFor(state, record.sheetType, record.sheetId);
      if (!sheet || sheet.schoolId !== teacher.schoolId
        || !withStudentClass(record, state).qrCurrent) {
        throw new Error("请先核对当前版本二维码，再编辑评分草稿");
      }
      const rubric = gradingQuestions(state, record.sheetId, teacher.schoolId!);
      const questions = new Map(rubric.questions.map((question) => [question.id, question]));
      const next: ScannerGradingEntry[] = entries.map((entry) => {
        const question = questions.get(entry.questionId);
        if (!question || !(question.fullScore > 0)) throw new Error("题目不存在或满分不合法");
        if (entry.confirmedScore !== null && entry.confirmedScore > question.fullScore) {
          throw new Error("人工复核分数不能超过题目满分");
        }
        const scored = scoreScanMark(question.kind as "choice" | "fill" | "essay",
          entry.observedMark, entry.observedBox, question.fullScore, question.answer);
        return {
          questionId: entry.questionId,
          observedMark: entry.observedMark,
          observedBox: entry.observedBox,
          confirmedScore: entry.confirmedScore,
          ...scored,
        };
      });
      // Purely an audit/review draft. The student gradebook is never modified here.
      record.gradingEntries = next;
      record.gradingRevisionId = rubric.revisionId;
      record.gradingUpdatedBy = teacher.id;
      record.gradingUpdatedAt = new Date().toISOString();
      return withStudentClass(record, state);
    });
  });

  app.patch("/api/scanner/pages/:id", async (request) => {
    const session = await requireSession(request, store);
    requireCsrf(request, session);
    const teacher = store.getTeacherById(session.teacherId);
    if (!teacher?.schoolId) throw new Error("无权修改扫描记录");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { studentId, reviewed, manualVerified } = assignmentSchema.parse(request.body);
    return withSerializedState(store, (state) => {
      const record = (state.scannerPages as ScannerPageRecord[]).find((item) => item.id === id && item.schoolId === teacher.schoolId);
      if (!record) throw new Error("扫描记录不存在");
      if (studentId !== undefined) {
        if (studentId && !(state.students as Array<{ id: string; schoolId: string }>).some((item) => item.id === studentId && item.schoolId === teacher.schoolId)) {
          throw new Error("学生不属于当前学校");
        }
        if (record.studentId !== studentId) {
          record.reviewedAt = null;
          record.reviewedBy = null;
          record.gradingEntries = record.gradingEntries?.map((entry) => ({ ...entry, confirmedScore: null }));
        }
        record.studentId = studentId;
        record.status = studentId ? "assigned" : "pending";
      }
      if (manualVerified !== undefined) {
        const sheet = sheetFor(state, record.sheetType, record.sheetId);
        if (manualVerified && (!sheet || sheet.schoolId !== teacher.schoolId)) {
          throw new Error("答题卡已撤回，无法人工确认");
        }
        record.manualVerifiedAt = manualVerified ? new Date().toISOString() : null;
        record.manualVerifiedBy = manualVerified ? teacher.id : null;
        record.manualVerifiedRevisionId = manualVerified ? (sheet?.answerSheetRevisionId || null) : null;
        if (!manualVerified) {
          record.reviewedAt = null;
          record.reviewedBy = null;
          record.gradingEntries = record.gradingEntries?.map((entry) => ({ ...entry, confirmedScore: null }));
        }
      }
      if (reviewed !== undefined) {
        if (reviewed && !record.studentId) throw new Error("请先匹配学生再确认复查");
        record.reviewedAt = reviewed ? new Date().toISOString() : null;
        record.reviewedBy = reviewed ? teacher.id : null;
      }
      return withStudentClass(record, state);
    });
  });
}
