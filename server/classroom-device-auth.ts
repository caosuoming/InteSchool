import { createHash } from "node:crypto";
import type { AppState } from "./types.js";

export const CLASSROOM_DEVICE_COOKIE = "inteschool_classroom_device";
export const CLASSROOM_DEVICE_COOKIE_MAX_AGE = 365 * 86400;

export interface ClassroomDeviceRpcInput {
  service: string;
  method: string;
  args: unknown[];
}

interface ClassroomDeviceIdentity {
  schoolId: string;
  classId: string;
}

export function classroomDeviceTokenFromRpc(input: ClassroomDeviceRpcInput): string | null {
  if (input.service !== "classroomDevice") return null;
  if (["getDeviceSession", "getClassroomSnapshot", "reportHeartbeat"].includes(input.method)) {
    return typeof input.args[0] === "string" ? input.args[0] : null;
  }
  if (input.method !== "bindDevice") return null;
  const bindInput = input.args[0];
  if (!bindInput || typeof bindInput !== "object" || Array.isArray(bindInput)) return null;
  const deviceToken = (bindInput as Record<string, unknown>).deviceToken;
  return typeof deviceToken === "string" ? deviceToken : null;
}

function referencesStoredFile(value: unknown, fileId: string, depth = 0): boolean {
  if (depth > 12 || value === null || value === undefined) return false;
  const prefix = `/api/files/${fileId}`;
  if (typeof value === "string") return value.includes(prefix);
  if (Array.isArray(value)) return value.some((item) => referencesStoredFile(item, fileId, depth + 1));
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>)
    .some((item) => referencesStoredFile(item, fileId, depth + 1));
}

function classroomDeviceForToken(
  state: AppState,
  token: string | undefined,
): ClassroomDeviceIdentity | null {
  if (!token || token.length < 24 || token.length > 256) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return ((state.classroomDevices || []) as Array<ClassroomDeviceIdentity & { deviceTokenHash: string }>)
    .find((item) => item.deviceTokenHash === tokenHash) || null;
}

export function isClassroomDeviceTokenValid(state: AppState, token: string | undefined): boolean {
  return classroomDeviceForToken(state, token) !== null;
}

export function canClassroomDeviceReadFile(
  state: AppState,
  token: string | undefined,
  fileId: string,
): boolean {
  const device = classroomDeviceForToken(state, token);
  if (!device) return false;

  const now = Date.now();
  const lessons = ((state.lessonCoursewares || []) as Array<Record<string, unknown>>).filter((item) => (
    item.schoolId === device.schoolId
    && Array.isArray(item.classIds)
    && item.classIds.includes(device.classId)
    && item.status === "published"
    && (!item.lifecycleStatus || item.lifecycleStatus === "active")
  ));
  const homeworks = ((state.classroomHomeworks || []) as Array<Record<string, unknown>>).filter((item) => (
    item.schoolId === device.schoolId
    && Array.isArray(item.classIds)
    && item.classIds.includes(device.classId)
    && typeof item.publishAt === "string"
    && new Date(item.publishAt).getTime() <= now
  ));
  return [...lessons, ...homeworks].some((record) => referencesStoredFile(record, fileId));
}
