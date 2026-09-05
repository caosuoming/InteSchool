import { createHash } from "node:crypto";
import type {
  ClassroomDevice,
  ClassroomDeviceAccessPolicy,
  ClassroomDeviceAccessRule,
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
  classId?: string;
  publicClassroom?: boolean;
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
const PUBLIC_CLASSROOM_ID = "__public_classroom__";
const MAX_ACCESS_RULES = 100;
const MAX_ACCESS_TARGET_LENGTH = 500;

const EMPTY_ACCESS_POLICY: ClassroomDeviceAccessPolicy = { blacklist: [], whitelist: [] };

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

function normalizeAccessRules(input: ClassroomDeviceAccessRule[], listName: string): ClassroomDeviceAccessRule[] {
  if (!Array.isArray(input)) throw new Error(`${listName}格式不正确`);
  if (input.length > MAX_ACCESS_RULES) throw new Error(`${listName}不能超过 ${MAX_ACCESS_RULES} 项`);
  const seen = new Set<string>();
  return input.map((rule, index) => {
    const kind = rule?.kind === "app" || rule?.kind === "website" ? rule.kind : null;
    if (!kind) throw new Error(`${listName}第 ${index + 1} 项类型不正确`);
    let target = String(rule?.target || "").trim();
    if (!target || target.length > MAX_ACCESS_TARGET_LENGTH) throw new Error(`${listName}第 ${index + 1} 项内容不正确`);
    if (kind === "website") {
      try {
        const url = new URL(target.includes("://") ? target : `https://${target}`);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid protocol");
        target = url.toString();
      } catch {
        throw new Error(`${listName}第 ${index + 1} 项网页地址不正确`);
      }
    }
    const key = `${kind}:${target.toLocaleLowerCase()}`;
    if (seen.has(key)) throw new Error(`${listName}存在重复项`);
    seen.add(key);
    const label = String(rule?.label || "").trim().slice(0, 80);
    return {
      id: String(rule?.id || `access-${index + 1}`).trim().slice(0, 80) || `access-${index + 1}`,
      kind,
      target,
      ...(label ? { label } : {}),
    };
  });
}

function normalizeAccessPolicy(input: ClassroomDeviceAccessPolicy): ClassroomDeviceAccessPolicy {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("黑白名单格式不正确");
  const blacklist = normalizeAccessRules(input.blacklist, "黑名单");
  const whitelist = normalizeAccessRules(input.whitelist, "白名单");
  const blocked = new Set(blacklist.map((rule) => `${rule.kind}:${rule.target.toLocaleLowerCase()}`));
  if (whitelist.some((rule) => blocked.has(`${rule.kind}:${rule.target.toLocaleLowerCase()}`))) {
    throw new Error("同一应用或网页不能同时加入黑名单和白名单");
  }
  return { blacklist, whitelist };
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
    publicClassroom: Boolean(stored.publicClassroom),
    allowedTimeRanges: stored.allowedTimeRanges || [],
    accessPolicy: stored.accessPolicy || EMPTY_ACCESS_POLICY,
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
    canEditAccessPolicy: schoolAdmin,
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

function currentClassroomContent(
  device: StoredClassroomDevice,
  classId: string,
): Omit<ClassroomDeviceSnapshot, "device" | "classroom" | "availableClassrooms"> {
  const now = new Date();
  const nowMs = now.getTime();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const lessons = (db.read("lessonCoursewares") as LessonCourseware[])
    .filter((item) => (
      item.schoolId === device.schoolId
      && item.classIds.includes(classId)
      && item.status === "published"
      && (item.lifecycleStatus || "active") === "active"
    ))
    .sort((a, b) => new Date(b.publishedAt || b.updatedAt).getTime() - new Date(a.publishedAt || a.updatedAt).getTime());
  const allHomeworks = (db.read("classroomHomeworks") as ClassroomHomework[])
    .filter((item) => (
      item.schoolId === device.schoolId
      && item.classIds.includes(classId)
      && new Date(item.publishAt).getTime() <= nowMs
    ))
    .sort((a, b) => b.assignedDate.localeCompare(a.assignedDate)
      || new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime());
  const homeworks = allHomeworks.filter((item) => item.assignedDate === today);
  const homeworkHistory = allHomeworks.filter((item) => item.assignedDate < today);
  const notices = (db.read("classroomNotices") as ClassroomNotice[])
    .filter((item) => (
      item.schoolId === device.schoolId
      && item.classIds.includes(classId)
      && new Date(item.startsAt).getTime() <= nowMs
      && new Date(item.endsAt).getTime() >= nowMs
    ))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const students = (db.read("students") as Student[])
    .filter((item) => item.schoolId === device.schoolId && item.classId === classId && item.status === "active")
    .map((item) => ({ id: item.id, name: item.name }));
  return { lessons, homeworks, homeworkHistory, notices, students };
}

function availableClassroomsForDevice(device: StoredClassroomDevice): SchoolClass[] {
  const classes = (db.read("schoolClasses") as SchoolClass[])
    .filter((item) => item.schoolId === device.schoolId && item.status !== "deleted" && item.status !== "graduated")
    .sort((a, b) => `${a.grade}${a.name}`.localeCompare(`${b.grade}${b.name}`, "zh-CN"));
  if (device.publicClassroom) return classes;
  return classes.filter((item) => item.id === device.classId);
}

function classroomForDevice(device: StoredClassroomDevice, requestedClassId?: string): SchoolClass {
  const available = availableClassroomsForDevice(device);
  const classroom = device.publicClassroom
    ? available.find((item) => item.id === requestedClassId) || available[0]
    : available[0];
  if (!classroom) {
    throw new Error(device.publicClassroom
      ? "该校暂无可用于公共教室的班级"
      : "绑定的班级已不可用，请联系管理员重新绑定");
  }
  if (device.publicClassroom && requestedClassId && classroom.id !== requestedClassId) {
    throw new Error("所选班级不属于当前公共教室学校");
  }
  return classroom;
}

export const classroomDeviceService = {
  async getDeviceSession(deviceToken: string) {
    await delay(30);
    const device = findStoredByToken(deviceToken);
    const classroom = classroomForDevice(device);
    return {
      device: publicDevice(device),
      classroom,
      availableClassrooms: availableClassroomsForDevice(device),
    };
  },

  async getClassroomSnapshot(deviceToken: string, requestedClassId?: string): Promise<ClassroomDeviceSnapshot> {
    await delay(40);
    const device = findStoredByToken(deviceToken);
    const classroom = classroomForDevice(device, requestedClassId);
    return {
      device: publicDevice(device),
      classroom,
      availableClassrooms: availableClassroomsForDevice(device),
      ...currentClassroomContent(device, classroom.id),
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
    const role = accountRole(teacher);
    const teacherSchoolId = currentSchoolId(teacher);
    if (role !== "platform_admin" && role !== "school_admin") {
      throw new Error("首次绑定需要该校管理员账号");
    }

    const publicClassroom = Boolean(input.publicClassroom);
    let classroom: SchoolClass | undefined;
    let bindingSchoolId = teacherSchoolId || "";
    if (publicClassroom) {
      if (!bindingSchoolId) throw new Error("绑定公共班级前请先切换到学校身份");
      classroom = (db.read("schoolClasses") as SchoolClass[])
        .find((item) => item.schoolId === bindingSchoolId && item.status !== "deleted" && item.status !== "graduated");
      if (!classroom) throw new Error("该校暂无可用于公共教室的班级");
    } else {
      classroom = (db.read("schoolClasses") as SchoolClass[]).find((item) => item.id === input.classId);
      if (!classroom || classroom.status === "deleted" || classroom.status === "graduated") {
        throw new Error("班级不存在或已不可用");
      }
      bindingSchoolId = classroom.schoolId;
    }
    if (role === "school_admin" && teacherSchoolId !== bindingSchoolId) {
      throw new Error("首次绑定需要该校管理员账号");
    }

    const token = normalizeToken(input.deviceToken);
    const installationId = String(input.installationId || "").trim();
    if (installationId.length < 8 || installationId.length > 160) throw new Error("设备安装标识无效");
    const devices = db.read("classroomDevices") as StoredClassroomDevice[];
    const existing = devices.find((item) => item.installationId === installationId);
    if (!publicClassroom) {
      const occupied = devices.find((item) => (
        !item.publicClassroom
        && item.classId === classroom?.id
        && item.id !== existing?.id
      ));
      if (occupied) throw new Error("该班级教室已绑定其他一体机，请先在“我的教室”中解绑");
    }

    const school = (db.read("schools") as Array<{ id: string; name: string }>).find((item) => item.id === bindingSchoolId);
    const now = new Date().toISOString();
    const classId = publicClassroom ? PUBLIC_CLASSROOM_ID : classroom.id;
    const className = publicClassroom ? "公共班级" : classroom.name;
    const grade = publicClassroom ? "公共教室" : classroom.grade;
    const defaultDeviceName = publicClassroom ? "公共教室一体机" : `${classroom.grade}${classroom.name}一体机`;
    const record: StoredClassroomDevice = {
      id: existing?.id || genId("classroom-device"),
      schoolId: bindingSchoolId,
      classId,
      schoolName: school?.name || "学校",
      className,
      grade,
      publicClassroom,
      deviceName: String(input.deviceName || defaultDeviceName).trim().slice(0, 80) || defaultDeviceName,
      installationId,
      deviceTokenHash: tokenHash(token),
      boundByTeacherId: teacher.id,
      boundByTeacherName: teacher.name,
      boundAt: existing?.boundAt || now,
      controlState: existing?.controlState || "active",
      allowedTimeRanges: existing?.allowedTimeRanges || [],
      accessPolicy: existing?.accessPolicy || EMPTY_ACCESS_POLICY,
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

  async updateDeviceAccessPolicy(
    deviceId: string,
    policy: ClassroomDeviceAccessPolicy,
    teacher: Teacher,
  ): Promise<ClassroomDevice> {
    const device = requireDevicePermission(teacher, deviceId, "canEditAccessPolicy");
    const accessPolicy = normalizeAccessPolicy(policy);
    const now = new Date().toISOString();
    const updated = { ...device, accessPolicy, updatedAt: now };
    db.update("classroomDevices", (items: StoredClassroomDevice[]) => items.map((item) => item.id === deviceId ? updated : item));
    return publicDevice(updated, managerPermissions(teacher, updated));
  },

  async unbindDevice(deviceId: string, teacher: Teacher): Promise<void> {
    requireDevicePermission(teacher, deviceId, "canUnbind");
    db.update("classroomDevices", (items: StoredClassroomDevice[]) => items.filter((item) => item.id !== deviceId));
  },
};
