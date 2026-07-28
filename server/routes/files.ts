import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import type { DatabaseStore } from "../database.js";
import type { ServerConfig } from "../config.js";
import type { StoredFile, TeacherRecord } from "../types.js";
import { requireCsrf, requireSession } from "./auth.js";
import { extractDocument } from "../lib/document-extractor.js";
import { withSerializedState } from "../rpc.js";

function buildSections(text: string): Array<{
  id: string;
  title: string;
  content: string;
  level: number;
  children: never[];
}> {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const headingPattern = /^(?:第[一二三四五六七八九十百]+[章节部分]|[一二三四五六七八九十]+[、.]|\d+[、.]|#+\s+)\s*(.+)$/;
  const sections: Array<{ id: string; title: string; content: string; level: number; children: never[] }> = [];
  let title = "文档正文";
  let buffer: string[] = [];
  const flush = () => {
    const content = buffer.join("\n").trim();
    if (!content && title === "文档正文") return;
    sections.push({ id: randomUUID(), title, content, level: 1, children: [] });
    buffer = [];
  };
  for (const line of normalized.split("\n")) {
    const match = line.trim().match(headingPattern);
    if (match && (buffer.length > 0 || sections.length > 0)) {
      flush();
      title = match[0].replace(/^#+\s*/, "").trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections.filter((section) => section.content.length > 0 || section.title !== "文档正文");
}

const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
  ".md", ".txt", ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".mp3", ".mp4", ".wav", ".webm",
]);

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".webm": "video/webm",
};

const INLINE_EXTENSIONS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".mp3", ".mp4", ".wav", ".webm",
]);

function safeMimeType(name: string): string {
  return MIME_TYPES[extname(name).toLowerCase()] || "application/octet-stream";
}

function safeOriginalName(name: string): string {
  const sanitized = [...basename(name)]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  return sanitized.slice(0, 200) || "upload";
}

function activeRole(teacher: TeacherRecord): string {
  const affiliation = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return typeof affiliation?.role === "string" ? affiliation.role : teacher.role;
}

function canReviewApplicationProof(
  store: DatabaseStore,
  teacher: TeacherRecord,
  fileId: string,
): boolean {
  if (!["school_admin", "platform_admin"].includes(activeRole(teacher))) return false;
  return (store.loadState().applications as Array<Record<string, unknown>>).some((application) =>
    application.proofFileId === fileId && application.schoolId === teacher.schoolId);
}

function canReadFile(
  store: DatabaseStore,
  teacher: TeacherRecord | null,
  file: StoredFile,
): boolean {
  if (!teacher) return false;
  if (file.ownerId === teacher.id || (file.schoolId && file.schoolId === teacher.schoolId)) return true;
  return canReviewApplicationProof(store, teacher, file.id);
}

export async function registerFileRoutes(
  app: FastifyInstance,
  store: DatabaseStore,
  config: ServerConfig,
): Promise<void> {
  app.post("/api/files", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const part = await request.file();
    if (!part) throw new Error("请选择文件");

    const originalName = safeOriginalName(part.filename);
    const extension = extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error("不支持该文件类型");

    const id = randomUUID();
    const storageName = `${id}${extension}`;
    const finalPath = join(config.uploadsDir, storageName);
    const temporaryPath = `${finalPath}.uploading`;
    try {
      await pipeline(part.file, createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }));
      if (part.file.truncated) throw new Error(`文件不能超过 ${Math.floor(config.maxUploadBytes / 1024 / 1024)} MB`);
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }

    const teacher = store.getTeacherById(session.teacherId);
    if (!teacher) {
      await rm(finalPath, { force: true });
      throw new Error("教师资料不存在");
    }
    const fileStat = await stat(finalPath);
    const file: StoredFile = {
      id,
      ownerId: session.teacherId,
      schoolId: teacher.schoolId,
      originalName,
      mimeType: safeMimeType(originalName),
      size: fileStat.size,
      storageName,
      createdAt: new Date().toISOString(),
    };
    store.saveFile(file);
    return { ...file, url: `/api/files/${file.id}` };
  });

  app.get("/api/files/:id/content", async (request, reply) => {
    const session = requireSession(request, store);
    const id = (request.params as { id: string }).id;
    const file = store.getFile(id);
    if (!file) return reply.code(404).send({ error: "文件不存在" });
    const teacher = store.getTeacherById(session.teacherId);
    if (!canReadFile(store, teacher, file)) {
      return reply.code(403).send({ error: "无权访问该文件" });
    }
    return extractDocument(join(config.uploadsDir, file.storageName));
  });

  app.post("/api/files/:id/import", async (request, reply) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const id = (request.params as { id: string }).id;
    const file = store.getFile(id);
    if (!file) return reply.code(404).send({ error: "文件不存在" });
    if (file.ownerId !== session.teacherId) return reply.code(403).send({ error: "只能导入自己上传的文件" });
    const teacher = store.getTeacherById(session.teacherId);
    if (!teacher?.schoolId) throw new Error("请先完成学校认证");
    const extracted = await extractDocument(join(config.uploadsDir, file.storageName));
    const extension = extname(file.originalName).toLowerCase();
    const fileType = extension === ".pdf" ? "pdf" : extension === ".md" || extension === ".txt" ? "markdown" : "word";
    return withSerializedState(store, (state) => {
      const document = {
        id: randomUUID(),
        teacherId: teacher.id,
        schoolId: teacher.schoolId,
        fileId: file.id,
        fileUrl: `/api/files/${file.id}`,
        fileName: file.originalName,
        fileType,
        fileSize: file.size,
        sections: buildSections(extracted.text),
        status: "uploaded",
        createdAt: new Date().toISOString(),
      };
      (state.documents as Array<typeof document>).unshift(document);
      return document;
    });
  });

  app.get("/api/files/:id", async (request, reply) => {
    const session = requireSession(request, store);
    const id = (request.params as { id: string }).id;
    const file = store.getFile(id);
    if (!file) return reply.code(404).send({ error: "文件不存在" });
    const teacher = store.getTeacherById(session.teacherId);
    if (!canReadFile(store, teacher, file)) {
      return reply.code(403).send({ error: "无权访问该文件" });
    }
    const extension = extname(file.originalName).toLowerCase();
    reply.type(safeMimeType(file.originalName));
    reply.header("Content-Length", file.size);
    const disposition = INLINE_EXTENSIONS.has(extension) ? "inline" : "attachment";
    reply.header("Content-Disposition", `${disposition}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "sandbox; default-src 'none'");
    return reply.send(createReadStream(join(config.uploadsDir, file.storageName)));
  });
}
