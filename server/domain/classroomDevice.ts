import { createHash } from "node:crypto";
import type {
  ClassroomDevice,
  ClassroomDeviceControlState,
  ClassroomDeviceCurrentPage,
  ClassroomDevicePermissions,
  ClassroomDeviceSnapshot,
  ClassroomDeviceTimeRange,
  ClassroomHomework,
  ClassroomNotice,
  LessonCourseware,
  SchoolClass,
  Student,
  Teacher,
  TeacherAffiliation,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";

interface StoredClassroomDevice extends Omit<ClassroomDevice, "effectiveState" | "scheduleAllowsUse" | "permissions"> {
  deviceTokenHash: string;
}

export interface ClassroomDeviceBindInput {
  classId: string;
  deviceToken: string;
  installationId: string;
  deviceName?: string;
}

export interface ClassroomDeviceHeartbeatInput {
  path?: string;
  title?: string;
  screenshot?: string;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SCREENSHOT_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,/i;
const MAX_SCREENSHOT_LENGTH = 350_000;

function activeAffiliation(teacher: Teacher): TeacherAffiliation | null {
  return teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent)
    || null;
}

function accountRole(teacher: Teacher): "teacher" | "school_admin" | "platform_admin" {
  return activeAffiliation(teacher)?.role || teacher.role;
}

function currentSchoolId(teacher: Teacher): string | null {
  return activeAffiliation(teacher)?.schoolId || teacher.schoolId || null;
}

function assignedClassIds(teacher: Teacher): { teaching: Set<string>; homeroom: Set<string> } {
  const affiliation = activeAffiliation(teacher);
  return {
    teaching: new Set(affiliation?.teachingClassIds || teacher.teachingClassIds || []),
    homeroom: new Set(affiliation?.homeroomClassIds || teacher.homeroomClassIds || []),
  };
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeToken(token: string): string {
  const value = String(token || "").trim();
  if (value.length < 24 || value.length > 256) throw new Error("教室设备凭证无效");
  return value;
}

function findStoredByToken(token: string): StoredClassroomDevice {
  const hashed = tokenHash(normalizeToken(token));
  const device = (db.read("classroomDevices") as StoredClassroomDevice[])
    .find((item) => item.deviceTokenHash === hashed);
  if (!device) throw new Error("教室一体机尚未绑定或已解绑");
  return device;
}

function normalizeTimeRanges(input: ClassroomDeviceTimeRange[]): ClassroomDeviceTimeRange[] {
  if (!Array.isArray(input)) throw new Error("可使用时间段格式不正确");
  if (input.length > 20) throw new Error("可使用时间段不能超过 20 个");
  return input.map((range, index) => {
    const start = String(range.start || "").trim();
    const end = String(range.end || "").trim();
    if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end) || start >= end) {
      throw new Error("可使用时间段的起止时间不正确");
    }
    const weekdays = [...new Set((range.weekdays || []).map(Number))]
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      .sort((a, b) => a - b);
    if (weekdays.length === 0) throw new Error("每个时间段至少选择一天");
    return {
      id: String(range.id || `range-${index + 1}`).slice(0, 80),
      weekdays,
      start,
      end,
    };
  });
}

function scheduleAllowsUse(ranges: ClassroomDeviceTimeRange[], now = new Date()): boolean {
  if (!ranges.length) return true;
  const weekday = now.getDay();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return ranges.some((range) => range.weekdays.includes(weekday) && range.start <= time && time < range.end);
}

function nextScheduledStart(ranges: ClassroomDeviceTimeRange[], now = new Date()): string | undefined {
  if (!ranges.length) return undefined;
  let next: Date | undefined;
  for (let offset = 0; offset <= 7; offset += 1) {
    for (const range of ranges) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);
      if (!range.weekdays.includes(candidate.getDay())) continue;
      const [hour, minute] = range.start.split(":").map(Number);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate <= now) continue;
      if (!next || candidate < next) next = candidate;
    }
  }
  return next?.toISOString();
}

function publicDevice(
  stored: StoredClassroomDevice,
  permissions?: ClassroomDevicePermissions,
  now = new Date(),
): ClassroomDevice {
  const scheduled = scheduleAllowsUse(stored.allowedTimeRanges || [], now);
  const manualOverride = Boolean(stored.manualUnlockUntil && new Date(stored.manualUnlockUntil).getTime() > now.getTime());
  const allowed = scheduled || manualOverride;
  const effectiveState: ClassroomDeviceControlState = stored.controlState === "active" && !allowed
    ? "locked"
    : stored.controlState;
  const { deviceTokenHash: _deviceTokenHash, ...safe } = stored;
  return {
    ...safe,
    allowedTimeRanges: stored.allowedTimeRanges || [],
    effectiveState,
    scheduleAllowsUse: allowed,
    ...(permissions ? { permissions } : {}),
  };
}

function managerPermissions(teacher: Teacher, device: StoredClassroomDevice): ClassroomDevicePermissions {
  const role = accountRole(teacher);
  const schoolId = currentSchoolId(teacher);
  const { teaching, homeroom } = assignedClassIds(teacher);
  const platform = role === "platform_admin";
  const schoolAdmin = role === "school_admin" && schoolId === device.schoolId;
  const homeroomTeacher = schoolId === device.schoolId && homeroom.has(device.classId);
  const subjectTeacher = schoolId === device.schoolId && teaching.has(device.classId);
  const canView = platform || schoolAdmin || homeroomTeacher || subjectTeacher;
  return {
    canView,
    canUnlock: canView,
    canLock: schoolAdmin || homeroomTeacher,
    canClose: schoolAdmin || homeroomTeacher,
    canUnbind: platform || schoolAdmin,
    canEditSchedule: schoolAdmin,
  };
}

function requireDevicePermission(
  teacher: Teacher,
  deviceId: string,
  permission: keyof ClassroomDevicePermissions,
): StoredClassroomDevice {
  const device = (db.read("classroomDevices") as StoredClassroomDevice[]).find((item) => item.id === deviceId);
  if (!device) throw new Error("教室一体机不存在或已解绑");
  if (!managerPermissions(teacher, device)[permission]) throw new Error("无权执行该教室一体机操作");
  return device;
}

function currentClassroomContent(device: StoredClassroomDevice): Omit<ClassroomDeviceSnapshot, "device" | "classroom"> {
  const now = new Date();
  const nowMs = now.getTime();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const lessons = (db.read("lessonCoursewares") as LessonCourseware[])
    .filter((item) => (
      item.schoolId === device.schoolId
      && item.classIds.includes(device.classId)
      && item.status === "published"
      && (item.lifecycleStatus || "active") === "active"
    ))
    .sort((a, b) => new Date(b.publishedAt || b.updatedAt).getTime() - new Date(a.publishedAt || a.updatedAt).getTime());
  const allHomeworks = (db.read("classroomHomeworks") as ClassroomHomework[])
    .filter((item) => (
      item.schoolId === device.schoolId
      && item.classIds.includes(device.classId)
      && new Date(item.publishAt).getTime() <= nowMs
    ))
    .sort((a, b) => b.assignedDate.localeCompare(a.assignedDate)
      || new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime());
  const homeworks = allHomeworks.filter((item) => item.assignedDate === today);
  const homeworkHistory = allHomeworks.filter((item) => item.assignedDate < today);
  const notices = (db.read("classroomNotices") as ClassroomNotice[])
    .filter((item) => (
      item.schoolId === device.schoolId
      && item.classIds.includes(device.classId)
      && new Date(item.startsAt).getTime() <= nowMs
      && new Date(item.endsAt).getTime() >= nowMs
    ))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const students = (db.read("students") as Student[])
    .filter((item) => item.schoolId === device.schoolId && item.classId === device.classId && item.status === "active")
    .map((item) => ({ id: item.id, name: item.name }));
  return { lessons, homeworks, homeworkHistory, notices, students };
}

function classroomForDevice(device: StoredClassroomDevice): SchoolClass {
  const classroom = (db.read("schoolClasses") as SchoolClass[]).find((item) => item.id === device.classId);
  if (!classroom || classroom.status === "deleted" || classroom.status === "graduated") {
    throw new Error("绑定的班级已不可用，请联系管理员重新绑定");
  }
  return classroom;
}

export const classroomDeviceService = {
  async getDeviceSession(deviceToken: string) {
    await delay(30);
    const device = findStoredByToken(deviceToken);
    return { device: publicDevice(device), classroom: classroomForDevice(device) };
  },

  async getClassroomSnapshot(deviceToken: string): Promise<ClassroomDeviceSnapshot> {
    await delay(40);
    const device = findStoredByToken(deviceToken);
    const classroom = classroomForDevice(device);
    return {
      device: publicDevice(device),
      classroom,
      ...currentClassroomContent(device),
    };
  },

  async reportHeartbeat(deviceToken: string, input: ClassroomDeviceHeartbeatInput = {}) {
    const device = findStoredByToken(deviceToken);
    const now = new Date().toISOString();
    const path = String(input.path || device.currentPage?.path || "/classroom").slice(0, 500);
    const title = String(input.title || device.currentPage?.title || "教室首页").slice(0, 200);
    const screenshot = typeof input.screenshot === "string"
      && input.screenshot.length <= MAX_SCREENSHOT_LENGTH
      && SCREENSHOT_PATTERN.test(input.screenshot)
      ? input.screenshot
      : device.currentPage?.screenshot;
    const currentPage: ClassroomDeviceCurrentPage = {
      path,
      title,
      ...(screenshot ? { screenshot } : {}),
      updatedAt: now,
    };
    db.update("classroomDevices", (items: StoredClassroomDevice[]) => items.map((item) => (
      item.id === device.id ? { ...item, lastSeenAt: now, currentPage, updatedAt: now } : item
    )));
    const updated = { ...device, lastSeenAt: now, currentPage, updatedAt: now };
    return publicDevice(updated);
  },

  async bindDevice(input: ClassroomDeviceBindInput, teacher: Teacher): Promise<ClassroomDevice> {
    await delay(80);
    maybeThrowError();
    const classroom = (db.read("schoolClasses") as SchoolClass[]).find((item) => item.id === input.classId);
    if (!classroom || classroom.status === "deleted" || classroom.status === "graduated") throw new Error("班级不存在或已不可用");
    const role = accountRole(teacher);
    const schoolId = currentSchoolId(teacher);
    if (role !== "platform_admin" && !(role === "school_admin" && schoolId === classroom.schoolId)) {
      throw new Error("首次绑定需要该校管理员账号");
    }
    const token = normalizeToken(input.deviceToken);
    const installationId = String(input.installationId || "").trim();
    if (installationId.length < 8 || installationId.length > 160) throw new Error("设备安装标识无效");
    const devices = db.read("classroomDevices") as StoredClassroomDevice[];
    const existing = devices.find((item) => item.classId === classroom.id);
    if (existing && existing.installationId !== installationId) {
      throw new Error("该班级教室已绑定其他一体机，请先在“我的教室”中解绑");
    }
    const school = (db.read("schools") as Array<{ id: string; name: string }>).find((item) => item.id === classroom.schoolId);
    const now = new Date().toISOString();
    const record: StoredClassroomDevice = {
      id: existing?.id || genId("classroom-device"),
      schoolId: classroom.schoolId,
      classId: classroom.id,
      schoolName: school?.name || "学校",
      className: classroom.name,
      grade: classroom.grade,
      deviceName: String(input.deviceName || `${classroom.grade}${classroom.name}一体机`).trim().slice(0, 80) || `${classroom.name}一体机`,
      installationId,
      deviceTokenHash: tokenHash(token),
      boundByTeacherId: teacher.id,
      boundByTeacherName: teacher.name,
      boundAt: existing?.boundAt || now,
      controlState: existing?.controlState || "active",
      allowedTimeRanges: existing?.allowedTimeRanges || [],
      lastSeenAt: now,
      currentPage: existing?.currentPage,
      updatedAt: now,
    };
    db.update("classroomDevices", (items: StoredClassroomDevice[]) => [
      ...items.filter((item) => item.id !== record.id),
      record,
    ]);
    return publicDevice(record, managerPermissions(teacher, record));
  },

  async listManagedDevices(targetSchoolId: string | undefined, teacher: Teacher): Promise<ClassroomDevice[]> {
    await delay(50);
    const role = accountRole(teacher);
    const schoolId = currentSchoolId(teacher);
    if (!schoolId && role !== "platform_admin") return [];
    if (role !== "platform_admin" && targetSchoolId && targetSchoolId !== schoolId) {
      throw new Error("无权查看其他学校的一体机");
    }
    const requestedSchoolId = role === "platform_admin" ? targetSchoolId : schoolId || undefined;
    return (db.read("classroomDevices") as StoredClassroomDevice[])
      .filter((device) => !requestedSchoolId || device.schoolId === requestedSchoolId)
      .map((device) => ({ device, permissions: managerPermissions(teacher, device) }))
      .filter(({ permissions }) => permissions.canView)
      .map(({ device, permissions }) => publicDevice(device, permissions))
      .sort((a, b) => `${a.grade}${a.className}`.localeCompare(`${b.grade}${b.className}`, "zh-CN"));
  },

  async unlockDevice(deviceId: string, teacher: Teacher): Promise<ClassroomDevice> {
    const device = requireDevicePermission(teacher, deviceId, "canUnlock");
    const now = new Date().toISOString();
    const nowDate = new Date();
    const manualUnlockUntil = scheduleAllowsUse(device.allowedTimeRanges || [], nowDate)
      ? undefined
      : nextScheduledStart(device.allowedTimeRanges || [], nowDate);
    const updated = { ...device, controlState: "active" as const, manualUnlockUntil, updatedAt: now };
    db.update("classroomDevices", (items: StoredClassroomDevice[]) => items.map((item) => item.id === deviceId ? updated : item));
    return publicDevice(updated, managerPermissions(teacher, updated));
  },

  async lockDevice(deviceId: string, teacher: Teacher): Promise<ClassroomDevice> {
    const device = requireDevicePermission(teacher, deviceId, "canLock");
    const now = new Date().toISOString();
    const updated = { ...device, controlState: "locked" as const, manualUnlockUntil: undefined, updatedAt: now };
    db.update("classroomDevices", (items: StoredClassroomDevice[]) => items.map((item) => item.id === deviceId ? updated : item));
    return publicDevice(updated, managerPermissions(teacher, updated));
  },

  async closeDevice(deviceId: string, teacher: Teacher): Promise<ClassroomDevice> {
    const device = requireDevicePermission(teacher, deviceId, "canClose");
    const now = new Date().toISOString();
    const updated = { ...device, controlState: "closed" as const, manualUnlockUntil: undefined, updatedAt: now };
    db.update("classroomDevices", (items: StoredClassroomDevice[]) => items.map((item) => item.id === deviceId ? updated : item));
    return publicDevice(updated, managerPermissions(teacher, updated));
  },

  async updateDeviceSchedule(
    deviceId: string,
    ranges: ClassroomDeviceTimeRange[],
    teacher: Teacher,
  ): Promise<ClassroomDevice> {
    const device = requireDevicePermission(teacher, deviceId, "canEditSchedule");
    const allowedTimeRanges = normalizeTimeRanges(ranges);
    const now = new Date().toISOString();
    const updated = { ...device, allowedTimeRanges, manualUnlockUntil: undefined, updatedAt: now };
    db.update("classroomDevices", (items: StoredClassroomDevice[]) => items.map((item) => item.id === deviceId ? updated : item));
    return publicDevice(updated, managerPermissions(teacher, updated));
  },

  async unbindDevice(deviceId: string, teacher: Teacher): Promise<void> {
    requireDevicePermission(teacher, deviceId, "canUnbind");
    db.update("classroomDevices", (items: StoredClassroomDevice[]) => items.filter((item) => item.id !== deviceId));
  },
};
