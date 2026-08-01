import { basketService } from "./basket";
import { coursewareService } from "./courseware";
import { examPaperService } from "./examPaper";
import { lectureService } from "./lecture";
import { materialService } from "./material";
import { questionService } from "./question";

import type {
  Basket,
  Courseware,
  ExamPaper,
  Lecture,
  Material,
  Question,
} from "@/types";

const DATABASE_NAME = "inteschool-local-resource-backup";
const DATABASE_VERSION = 1;
const HANDLE_STORE_NAME = "directory-handles";
const BACKUP_ROOT_NAME = "InteSchool-我的资源";
const MANIFEST_FILE_NAME = ".inteschool-backup.json";
const STATE_STORAGE_PREFIX = "inteschool.local-resource-backup.";

export type LocalBackupResourceType =
  | "question"
  | "examPaper"
  | "lecture"
  | "courseware"
  | "material"
  | "basket";

export interface BackupWritableFile {
  write(data: Blob | string): Promise<void>;
  close(): Promise<void>;
}

export interface BackupFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<BackupWritableFile>;
}

export interface BackupDirectoryHandle {
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<BackupDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BackupFileHandle>;
  queryPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: "read" | "readwrite" }): Promise<PermissionState>;
}

interface BackupResource {
  type: LocalBackupResourceType;
  id: string;
  title: string;
  updatedAt: string;
  data: Question | ExamPaper | Lecture | Courseware | Material | Basket;
  fileUrl?: string;
  fileName?: string;
}

interface BackupManifestEntry {
  fingerprint: string;
  updatedAt: string;
  metadataPath: string;
  attachmentPath?: string;
}

interface BackupManifest {
  version: 1;
  teacherId: string;
  schoolId: string | null;
  directoryName: string;
  lastCompletedAt: string | null;
  entries: Record<string, BackupManifestEntry>;
}

export interface LocalBackupResult {
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  completedAt: string;
  directoryName: string;
  errors: string[];
}

export interface LocalBackupState {
  directoryName: string;
  lastCompletedAt: string | null;
  lastResult: Omit<LocalBackupResult, "errors"> | null;
}

export interface LocalBackupContext {
  teacherId: string;
  schoolId: string | null;
}

export interface LocalBackupSnapshot {
  running: boolean;
  state: LocalBackupState;
}

type BackupListener = (key: string, snapshot: LocalBackupSnapshot) => void;

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<BackupDirectoryHandle>;
};

const memoryHandles = new Map<string, BackupDirectoryHandle>();
const runningBackups = new Map<string, Promise<LocalBackupResult>>();
const listeners = new Set<BackupListener>();

const resourceDirectoryNames: Record<LocalBackupResourceType, string> = {
  question: "题目",
  examPaper: "试卷",
  lecture: "讲义",
  courseware: "课件",
  material: "素材",
  basket: "资源篮",
};

function emptyState(): LocalBackupState {
  return {
    directoryName: "",
    lastCompletedAt: null,
    lastResult: null,
  };
}

export function localBackupKey(context: LocalBackupContext): string {
  return `${context.teacherId}:${context.schoolId || "personal"}`;
}

function stateStorageKey(key: string): string {
  return `${STATE_STORAGE_PREFIX}${key}`;
}

export function getLocalBackupState(key: string): LocalBackupState {
  if (typeof localStorage === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(stateStorageKey(key));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LocalBackupState>;
    return {
      directoryName: typeof parsed.directoryName === "string" ? parsed.directoryName : "",
      lastCompletedAt: typeof parsed.lastCompletedAt === "string" ? parsed.lastCompletedAt : null,
      lastResult: parsed.lastResult && typeof parsed.lastResult === "object"
        ? parsed.lastResult as LocalBackupState["lastResult"]
        : null,
    };
  } catch {
    return emptyState();
  }
}

function saveLocalBackupState(key: string, state: LocalBackupState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(stateStorageKey(key), JSON.stringify(state));
}

export function getLocalBackupSnapshot(key: string): LocalBackupSnapshot {
  return {
    running: runningBackups.has(key),
    state: getLocalBackupState(key),
  };
}

function notifyListeners(key: string): void {
  const snapshot = getLocalBackupSnapshot(key);
  listeners.forEach((listener) => listener(key, snapshot));
}

export function subscribeLocalBackup(listener: BackupListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isLocalBackupSupported(): boolean {
  return typeof window !== "undefined"
    && typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export async function pickLocalBackupDirectory(): Promise<BackupDirectoryHandle> {
  const pickerWindow = typeof window === "undefined"
    ? undefined
    : window as DirectoryPickerWindow;
  const picker = pickerWindow?.showDirectoryPicker;
  if (!picker) {
    throw new Error("当前浏览器不支持本地文件夹备份，请使用最新版 Chrome 或 Edge");
  }
  return picker.call(pickerWindow, { id: "inteschool-my-resources", mode: "readwrite" });
}

function openHandleDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        database.createObjectStore(HANDLE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地备份数据库"));
  });
}

export async function saveLocalBackupDirectory(
  key: string,
  handle: BackupDirectoryHandle,
): Promise<void> {
  memoryHandles.set(key, handle);
  saveLocalBackupState(key, {
    ...getLocalBackupState(key),
    directoryName: handle.name,
  });
  notifyListeners(key);
  const database = await openHandleDatabase().catch(() => null);
  if (!database) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE_NAME, "readwrite");
      transaction.objectStore(HANDLE_STORE_NAME).put(handle, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("无法保存备份文件夹授权"));
    });
  } catch {
    // The in-memory handle still supports the current backup when persistence is unavailable.
  } finally {
    database.close();
  }
}

export async function loadLocalBackupDirectory(key: string): Promise<BackupDirectoryHandle | null> {
  const memoryHandle = memoryHandles.get(key);
  if (memoryHandle) return memoryHandle;
  const database = await openHandleDatabase().catch(() => null);
  if (!database) return null;
  return new Promise<BackupDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE_NAME, "readonly");
    const request = transaction.objectStore(HANDLE_STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as BackupDirectoryHandle | undefined) || null);
    request.onerror = () => reject(request.error || new Error("无法读取备份文件夹授权"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  }).catch(() => null);
}

export async function ensureLocalBackupPermission(handle: BackupDirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission && !handle.requestPermission) return true;
  const current = await handle.queryPermission?.({ mode: "readwrite" });
  if (current === "granted") return true;
  const requested = await handle.requestPermission?.({ mode: "readwrite" });
  return requested === "granted";
}

function sanitizeName(value: string, fallback: string): string {
  const withoutControlCharacters = Array.from(value, (character) => (
    character.charCodeAt(0) < 32 ? "_" : character
  )).join("");
  const sanitized = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 120);
  return sanitized || fallback;
}

function plainQuestionTitle(question: Question): string {
  const text = question.stem.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 60) || "题目";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

async function fingerprintResource(resource: BackupResource): Promise<string> {
  const serialized = stableStringify({
    type: resource.type,
    data: resource.data,
    fileUrl: resource.fileUrl || null,
    fileName: resource.fileName || null,
  });
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(serialized),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function readManifest(root: BackupDirectoryHandle): Promise<BackupManifest | null> {
  try {
    const handle = await root.getFileHandle(MANIFEST_FILE_NAME);
    const file = await handle.getFile();
    const parsed = JSON.parse(await file.text()) as BackupManifest;
    return parsed.version === 1 && parsed.entries ? parsed : null;
  } catch {
    return null;
  }
}

async function writeFile(
  directory: BackupDirectoryHandle,
  fileName: string,
  content: Blob | string,
): Promise<void> {
  const handle = await directory.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeJson(
  directory: BackupDirectoryHandle,
  fileName: string,
  value: unknown,
): Promise<void> {
  await writeFile(directory, fileName, `${JSON.stringify(value, null, 2)}\n`);
}

function fileExtensionForMime(mimeType: string): string {
  const mapping: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.ms-powerpoint": ".ppt",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
  };
  return mapping[mimeType] || "";
}

async function downloadAttachment(resource: BackupResource): Promise<{ blob: Blob; fileName: string } | null> {
  if (!resource.fileUrl) return null;
  const response = await fetch(resource.fileUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`附件下载失败（${response.status}）`);
  }
  const blob = await response.blob();
  const fallbackName = `${sanitizeName(resource.title, "资源文件")}${fileExtensionForMime(blob.type)}`;
  return {
    blob,
    fileName: sanitizeName(resource.fileName || fallbackName, "资源文件"),
  };
}

async function loadBackupResources(context: LocalBackupContext): Promise<BackupResource[]> {
  const filter = {
    teacherId: context.teacherId,
    schoolId: context.schoolId || undefined,
  };
  const [questions, examPapers, lectures, coursewares, materials, baskets] = await Promise.all([
    questionService.listQuestions(filter),
    examPaperService.listPapers(filter),
    lectureService.listLectures(filter),
    coursewareService.listCoursewares(filter),
    materialService.listMaterials(filter),
    basketService.listBaskets(context.teacherId),
  ]);

  return [
    ...(questions || []).map((resource): BackupResource => ({
      type: "question",
      id: resource.id,
      title: plainQuestionTitle(resource),
      updatedAt: resource.updatedAt,
      data: resource,
    })),
    ...(examPapers || []).map((resource): BackupResource => ({
      type: "examPaper",
      id: resource.id,
      title: resource.title,
      updatedAt: resource.updatedAt,
      data: resource,
      fileUrl: resource.originalFileUrl,
      fileName: resource.originalFileName,
    })),
    ...(lectures || []).map((resource): BackupResource => ({
      type: "lecture",
      id: resource.id,
      title: resource.title,
      updatedAt: resource.updatedAt,
      data: resource,
      fileUrl: resource.originalFileUrl,
      fileName: resource.originalFileName,
    })),
    ...(coursewares || []).map((resource): BackupResource => ({
      type: "courseware",
      id: resource.id,
      title: resource.title,
      updatedAt: resource.updatedAt,
      data: resource,
      fileUrl: resource.fileUrl,
      fileName: resource.fileName,
    })),
    ...(materials || []).map((resource): BackupResource => ({
      type: "material",
      id: resource.id,
      title: resource.title,
      updatedAt: resource.updatedAt,
      data: resource,
      fileUrl: resource.fileUrl,
    })),
    ...(baskets || []).map((resource): BackupResource => ({
      type: "basket",
      id: resource.id,
      title: resource.name,
      updatedAt: resource.updatedAt,
      data: resource,
    })),
  ];
}

function createManifest(
  context: LocalBackupContext,
  directoryName: string,
  previous: BackupManifest | null,
): BackupManifest {
  if (previous?.teacherId === context.teacherId && previous.schoolId === context.schoolId) {
    return { ...previous, directoryName };
  }
  return {
    version: 1,
    teacherId: context.teacherId,
    schoolId: context.schoolId,
    directoryName,
    lastCompletedAt: null,
    entries: {},
  };
}

export async function runLocalResourceBackup(
  context: LocalBackupContext,
  directory: BackupDirectoryHandle,
): Promise<LocalBackupResult> {
  const backupRoot = await directory.getDirectoryHandle(BACKUP_ROOT_NAME, { create: true });
  const manifest = createManifest(context, directory.name, await readManifest(backupRoot));
  const resources = await loadBackupResources(context);
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const resource of resources) {
    const key = `${resource.type}:${resource.id}`;
    const fingerprint = await fingerprintResource(resource);
    if (manifest.entries[key]?.fingerprint === fingerprint) {
      skipped += 1;
      continue;
    }

    try {
      const typeDirectory = await backupRoot.getDirectoryHandle(
        resourceDirectoryNames[resource.type],
        { create: true },
      );
      const resourceDirectory = await typeDirectory.getDirectoryHandle(
        sanitizeName(resource.id, "resource"),
        { create: true },
      );
      await writeJson(resourceDirectory, "资源.json", {
        backupVersion: 1,
        resourceType: resource.type,
        title: resource.title,
        resource: resource.data,
      });

      const attachment = await downloadAttachment(resource);
      let attachmentPath: string | undefined;
      if (attachment) {
        await writeFile(resourceDirectory, attachment.fileName, attachment.blob);
        attachmentPath = `${resourceDirectoryNames[resource.type]}/${resource.id}/${attachment.fileName}`;
      }

      manifest.entries[key] = {
        fingerprint,
        updatedAt: resource.updatedAt,
        metadataPath: `${resourceDirectoryNames[resource.type]}/${resource.id}/资源.json`,
        attachmentPath,
      };
      updated += 1;
    } catch (error) {
      failed += 1;
      errors.push(`${resourceDirectoryNames[resource.type]}“${resource.title}”：${error instanceof Error ? error.message : "备份失败"}`);
    }
  }

  const completedAt = new Date().toISOString();
  manifest.lastCompletedAt = completedAt;
  await writeJson(backupRoot, MANIFEST_FILE_NAME, manifest);

  const result: LocalBackupResult = {
    total: resources.length,
    updated,
    skipped,
    failed,
    completedAt,
    directoryName: directory.name,
    errors,
  };
  saveLocalBackupState(localBackupKey(context), {
    directoryName: directory.name,
    lastCompletedAt: completedAt,
    lastResult: {
      total: result.total,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      completedAt: result.completedAt,
      directoryName: result.directoryName,
    },
  });
  return result;
}

export function startLocalResourceBackup(
  context: LocalBackupContext,
  directory: BackupDirectoryHandle,
): Promise<LocalBackupResult> {
  const key = localBackupKey(context);
  const existing = runningBackups.get(key);
  if (existing) return existing;

  const job = runLocalResourceBackup(context, directory)
    .finally(() => {
      runningBackups.delete(key);
      notifyListeners(key);
    });
  runningBackups.set(key, job);
  notifyListeners(key);
  return job;
}
