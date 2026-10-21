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
  createdAt: string;
}

const querySchema = z.object({ schoolId: z.string().min(1).max(160) });
const scanSchema = z.object({
  schoolId: z.string().min(1).max(160),
  sheetType: z.enum(["paper", "lecture"]),
  sheetId: z.string().min(1).max(160),
  qrPayload: z.string().max(500).optional(),
});
const assignmentSchema = z.object({ studentId: z.string().min(1).max(160).nullable() });
const RECORD_MIME = new Map([["image/png", ".png"], ["image/jpeg", ".jpg"]]);

function sheetFor(state: Record<string, unknown>, type: "paper" | "lecture", id: string) {
  const key = type === "paper" ? "examPapers" : "lectures";
  return (state[key] as Array<{ id: string; schoolId: string; hasAnswerSheet?: boolean; answerSheetPublishedAt?: string; answerSheetRevisionId?: string }> || [])
    .find((item) => item.id === id && item.hasAnswerSheet && item.answerSheetPublishedAt);
}
function qrFor(type: "paper" | "lecture", id: string, revisionId?: string) {
  return buildAnswerSheetQrPayload(type === "paper" ? "exam-paper" : "lecture", id, revisionId);
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
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
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
      studentId: null, status: "pending", createdAt: file.createdAt,
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
    return record;
  });

  app.patch("/api/scanner/pages/:id", async (request) => {
    const session = await requireSession(request, store);
    requireCsrf(request, session);
    const teacher = store.getTeacherById(session.teacherId);
    if (!teacher?.schoolId) throw new Error("无权修改扫描记录");
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { studentId } = assignmentSchema.parse(request.body);
    return withSerializedState(store, (state) => {
      const record = (state.scannerPages as ScannerPageRecord[]).find((item) => item.id === id && item.schoolId === teacher.schoolId);
      if (!record) throw new Error("扫描记录不存在");
      if (studentId && !(state.students as Array<{ id: string; schoolId: string }>).some((item) => item.id === studentId && item.schoolId === teacher.schoolId)) {
        throw new Error("学生不属于当前学校");
      }
      record.studentId = studentId;
      record.status = studentId ? "assigned" : "pending";
      return record;
    });
  });
}
