import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { DatabaseStore } from "../database.js";
import type { ServerConfig } from "../config.js";
import type { AppState, SessionUser, TeacherRecord } from "../types.js";
import { withSerializedState } from "../rpc.js";
import { canManageTeachingProfiles } from "../../src/lib/teaching-profile-permissions.js";
import { normalizeTeacherRoles, TEACHER_ROLES } from "../../src/lib/teacher-roles.js";
import type { TeacherRole } from "../../src/types/index.js";
import { createNotificationInState } from "../domain/notification.js";

export const SESSION_COOKIE = "inteschool_session";

function normalizePhone(value: string): string {
  return value.trim().replace(/[\s()-]/g, "").replace(/^\+86/, "");
}

const loginIdentifierSchema = z.string().trim().min(1).max(254).refine((value) => (
  z.string().email().safeParse(value).success || /^1[3-9]\d{9}$/.test(normalizePhone(value))
), "请输入有效的邮箱或手机号");

const loginSchema = z.object({
  identifier: loginIdentifierSchema.optional(),
  email: loginIdentifierSchema.optional(),
  phone: loginIdentifierSchema.optional(),
  password: z.string().min(1).max(128),
}).superRefine((input, context) => {
  if (!input.identifier && !input.email && !input.phone) {
    context.addIssue({
      code: "custom",
      path: ["identifier"],
      message: "请输入邮箱或手机号",
    });
  }
}).transform((input) => ({
  identifier: input.identifier || input.email || input.phone || "",
  password: input.password,
}));

const phoneSchema = z.string().transform(normalizePhone).refine(
  (value) => /^1[3-9]\d{9}$/.test(value),
  "请输入有效的中国大陆手机号",
);

const optionalEmailSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().email().max(254).optional(),
);

const schoolDraftSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(30).regex(/^[A-Za-z0-9_-]+$/),
  city: z.string().trim().min(2).max(50),
  description: z.string().trim().max(300).optional().default(""),
});

const teachingFieldsSchema = z.object({
  subject: z.string().trim().min(1).max(50),
  teachingGrades: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  teachingClassIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  homeroomClassIds: z.array(z.string().min(1).max(100)).max(20).default([]),
});

const registerSchema = z.object({
  email: optionalEmailSchema,
  password: z.string().min(10).max(128),
  name: z.string().trim().min(2).max(50),
  phone: phoneSchema,
  schoolId: z.string().min(1).max(100).optional(),
  newSchool: schoolDraftSchema.optional(),
  subject: teachingFieldsSchema.shape.subject,
  teachingGrades: teachingFieldsSchema.shape.teachingGrades,
  teachingClassIds: teachingFieldsSchema.shape.teachingClassIds,
  roles: z.array(z.enum(TEACHER_ROLES)).min(1).max(TEACHER_ROLES.length).optional().default(["teacher"]),
  requestSchoolAdmin: z.boolean().optional().default(false),
}).refine((input) => Boolean(input.schoolId) !== Boolean(input.newSchool), {
  message: "请选择已有学校或创建新学校",
}).transform((input) => ({ ...input, roles: normalizeTeacherRoles(input.roles) }));

const registrationAuthorizationSchema = z.object({
  phone: phoneSchema,
  kind: z.enum(["admin", "guarantee"]),
});

const emailBindingSchema = z.object({
  email: z.string().trim().email().max(254),
});

const applicationSchema = z.object({
  schoolId: z.string().min(1).max(100),
  employeeNo: z.string().trim().max(100).optional().default(""),
  subjects: z.array(z.string().trim().min(1).max(50)).min(1).max(20).optional(),
  subject: z.string().trim().min(1).max(50).optional(),
  teachingGrades: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  teachingClassIds: z.array(z.string().min(1).max(100)).max(100).default([]),
  position: z.string().trim().max(50).optional().default(""),
  roles: z.array(z.enum(TEACHER_ROLES)).min(1).max(TEACHER_ROLES.length).optional().default(["teacher"]),
  proofFileId: z.string().uuid().optional(),
  requestSchoolAdmin: z.boolean().optional().default(false),
}).superRefine((input, context) => {
  if (!input.subjects?.length && !input.subject) {
    context.addIssue({
      code: "custom",
      path: ["subjects"],
      message: "请至少选择一个任教学科",
    });
  }
}).transform((input) => {
  const subjects = [...new Set(input.subjects?.length ? input.subjects : [input.subject!])];
  return {
    ...input,
    subjects,
    subject: subjects[0],
    roles: normalizeTeacherRoles(input.roles),
  };
});

const profileSchema = z.object({
  nickname: z.string().trim().min(1).max(20).optional(),
  subject: z.string().trim().min(1).max(50).optional(),
  teachingGrades: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  teachingClassIds: z.array(z.string().min(1).max(100)).max(100).optional(),
}).refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "至少需要修改一项资料",
});

const adminApplicationSchema = z.object({
  reason: z.string().trim().min(5).max(300),
});

const roleApplicationSchema = z.object({
  roles: z.array(z.enum(TEACHER_ROLES)).min(1).max(TEACHER_ROLES.length),
  reason: z.string().trim().min(5).max(300),
}).transform((input) => ({ ...input, roles: normalizeTeacherRoles(input.roles) }));

const managedTeachingProfileSchema = z.object({
  subject: z.string().trim().min(1).max(50).optional(),
  teachingGrades: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  teachingClassIds: z.array(z.string().min(1).max(100)).max(100).optional(),
  homeroomClassIds: z.array(z.string().min(1).max(100)).max(20).optional(),
}).refine((input) => Object.values(input).some((value) => value !== undefined), {
  message: "至少需要修改一项教学资料",
});

function publicTeacher(teacher: TeacherRecord): TeacherRecord {
  const copy = structuredClone(teacher);
  delete copy.password;
  delete copy.wechatOpenId;
  delete copy.wechatUnionId;
  delete copy.wecomUserId;
  delete copy.wecomCorpId;
  return copy;
}

function activeRole(teacher: TeacherRecord): string {
  const affiliation = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return typeof affiliation?.role === "string" ? affiliation.role : teacher.role;
}

function requireAdmin(teacher: TeacherRecord): void {
  if (!["school_admin", "platform_admin"].includes(activeRole(teacher))) {
    throw new Error("该操作需要学校管理员权限");
  }
}

function requireTeachingProfileManager(teacher: TeacherRecord): void {
  const affiliation = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent)
    || null;
  if (!canManageTeachingProfiles(teacher, affiliation)) {
    throw new Error("该操作需要年级组长、教务主任、副校长、校长或学校管理员权限");
  }
}

function activeAffiliation(teacher: TeacherRecord): Record<string, unknown> | null {
  return teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent)
    || null;
}

function activeTeacherRoles(teacher: TeacherRecord): string[] {
  const affiliation = activeAffiliation(teacher);
  return Array.isArray(affiliation?.roles)
    ? affiliation.roles.filter((role): role is string => typeof role === "string")
    : teacher.roles;
}

function requireTeachingProfileTargetScope(
  state: AppState,
  manager: TeacherRecord,
  target: TeacherRecord,
  patch: {
    teachingGrades?: string[];
    teachingClassIds?: string[];
    homeroomClassIds?: string[];
  },
): void {
  if (["school_admin", "platform_admin"].includes(activeRole(manager))) return;
  const roles = activeTeacherRoles(manager);
  if (roles.some((role) => ["dean", "vicePrincipal", "principal"].includes(role))) return;
  if (!roles.includes("gradeLeader")) throw new Error("无权管理该教师的教学资料");
  if (!manager.schoolId) throw new Error("当前账号没有学校身份");

  const managerAffiliation = activeAffiliation(manager);
  const managerGrades = new Set(
    Array.isArray(managerAffiliation?.teachingGrades)
      ? managerAffiliation.teachingGrades.filter((grade): grade is string => typeof grade === "string")
      : manager.teachingGrades || [],
  );
  if (managerGrades.size === 0) throw new Error("请先为年级负责人配置可管理年级");

  const targetAffiliation = target.affiliations.find((item) => item.schoolId === manager.schoolId) || null;
  const affiliationGrades = Array.isArray(targetAffiliation?.teachingGrades)
    ? targetAffiliation.teachingGrades.filter((grade): grade is string => typeof grade === "string")
    : [];
  const nextGrades = patch.teachingGrades
    ?? (affiliationGrades.length > 0 ? affiliationGrades : target.teachingGrades || []);
  if (nextGrades.length === 0 || nextGrades.some((grade) => !managerGrades.has(grade))) {
    throw new Error("年级负责人只能管理本人负责年级的教师");
  }

  const classIds = [...(patch.teachingClassIds || []), ...(patch.homeroomClassIds || [])];
  if (classIds.length > 0) {
    const classes = state.schoolClasses as Array<{ id: string; schoolId: string; grade?: string }>;
    const invalid = classIds.some((classId) => {
      const schoolClass = classes.find((item) => item.id === classId && item.schoolId === manager.schoolId);
      return !schoolClass?.grade || !managerGrades.has(schoolClass.grade);
    });
    if (invalid) throw new Error("年级负责人只能分配本人负责年级的班级");
  }
}

const TEACHING_CLASS_ASSIGNMENT_ERROR = "任教班级只能由年级组长、教务主任、副校长、校长或学校管理员设置";

function requirePlatformAdmin(teacher: TeacherRecord): void {
  if (activeRole(teacher) !== "platform_admin") {
    throw new Error("该操作需要平台管理员权限");
  }
}

function requireSchoolAdmin(teacher: TeacherRecord): void {
  if (activeRole(teacher) !== "school_admin") {
    throw new Error("该操作需要本校管理员权限");
  }
}

function validateTeachingClassIds(
  state: AppState,
  schoolId: string | null,
  classIds: string[],
): void {
  if (classIds.length === 0) return;
  if (!schoolId) throw new Error("个人身份不能关联本校班级");
  const classes = state.schoolClasses as Array<{ id: string; schoolId: string }>;
  const validIds = new Set(classes.filter((item) => item.schoolId === schoolId).map((item) => item.id));
  if (classIds.some((id) => !validIds.has(id))) throw new Error("任教班级不属于当前学校");
}

function updateTeacherTeachingProfile(
  teacher: TeacherRecord,
  schoolId: string | null,
  patch: {
    subject?: string;
    teachingGrades?: string[];
    teachingClassIds?: string[];
    homeroomClassIds?: string[];
  },
): TeacherRecord {
  const affiliationIndex = teacher.affiliations.findIndex((item) => item.schoolId === schoolId);
  if (affiliationIndex < 0) throw new Error("所属单位不存在");
  const affiliations = teacher.affiliations.map((item, index) => {
    if (index !== affiliationIndex) return item;
    const currentRoles = Array.isArray(item.roles) ? item.roles.filter((role): role is string => typeof role === "string") : [];
    const nextRoles = patch.homeroomClassIds === undefined
      ? currentRoles
      : patch.homeroomClassIds.length > 0
        ? [...new Set([...currentRoles, "headTeacher"])]
        : currentRoles.filter((role) => role !== "headTeacher");
    return {
      ...item,
      ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
      ...(patch.teachingGrades !== undefined ? { teachingGrades: patch.teachingGrades } : {}),
      ...(patch.teachingClassIds !== undefined ? { teachingClassIds: patch.teachingClassIds } : {}),
      ...(patch.homeroomClassIds !== undefined ? { homeroomClassIds: patch.homeroomClassIds } : {}),
      roles: nextRoles,
    };
  });
  const target = affiliations[affiliationIndex];
  const isCurrent = target.id === teacher.currentAffiliationId || target.isCurrent === true;
  return {
    ...teacher,
    ...(isCurrent && patch.subject !== undefined ? { subject: patch.subject } : {}),
    ...(isCurrent && patch.teachingGrades !== undefined ? { teachingGrades: patch.teachingGrades } : {}),
    ...(isCurrent && patch.teachingClassIds !== undefined ? { teachingClassIds: patch.teachingClassIds } : {}),
    ...(isCurrent && patch.homeroomClassIds !== undefined ? { homeroomClassIds: patch.homeroomClassIds } : {}),
    ...(isCurrent ? { roles: target.roles as string[] } : {}),
    affiliations,
  };
}

function sessionTeacher(store: DatabaseStore, session: SessionUser): TeacherRecord {
  const teacher = store.getTeacherById(session.teacherId);
  if (!teacher) throw new Error("账号关联的教师资料不存在");
  return teacher;
}

function setSessionCookie(reply: FastifyReply, token: string, config: ServerConfig): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: config.sessionDays * 86400,
  });
}

export function getSession(request: FastifyRequest, store: DatabaseStore): SessionUser | null {
  return store.getSession(request.cookies[SESSION_COOKIE]);
}

export function requireSession(request: FastifyRequest, store: DatabaseStore): SessionUser {
  const session = getSession(request, store);
  if (!session) throw new Error("请先登录");
  return session;
}

export function requireCsrf(request: FastifyRequest, session: SessionUser): void {
  const token = request.headers["x-inteschool-csrf"];
  if (typeof token !== "string" || token !== session.csrfToken) {
    throw new Error("请求校验失败，请刷新页面后重试");
  }
}

function activateAffiliation(
  state: AppState,
  teacher: TeacherRecord,
  schoolId: string,
  employeeNo: string,
  subjects: string[],
  teachingGrades: string[] = [],
  teachingClassIds: string[] = [],
  position = "",
  requestSchoolAdmin = false,
  roles: TeacherRole[] = ["teacher"],
): TeacherRecord {
  const subject = subjects[0];
  const schools = state.schools as Array<{ id: string; name: string }>;
  const schoolName = schools.find((school) => school.id === schoolId)?.name || null;
  const existing = teacher.affiliations.find((item) => item.schoolId === schoolId);
  const affiliationId = typeof existing?.id === "string" ? existing.id : randomUUID();
  const role = requestSchoolAdmin ? "school_admin" : existing?.role || "teacher";
  const active = {
    ...(existing || {}),
    id: affiliationId,
    teacherId: teacher.id,
    schoolId,
    schoolName,
    subject,
    subjects,
    teachingGrades,
    teachingClassIds,
    employeeNo,
    position,
    status: "active",
    role,
    roles: normalizeTeacherRoles(roles),
    subjectGroupIds: existing?.subjectGroupIds || [],
    prepGroupIds: existing?.prepGroupIds || [],
    isCurrent: true,
    joinedAt: existing?.joinedAt || new Date().toISOString(),
  };
  const affiliations = teacher.affiliations
    .filter((item) => item.id !== affiliationId)
    .map((item) => ({ ...item, isCurrent: false }));
  if (!existing || existing.status !== "active") {
    const school = schools.find((item) => item.id === schoolId) as ({ teacherCount?: number } & { id: string; name: string }) | undefined;
    if (school) school.teacherCount = Number(school.teacherCount || 0) + 1;
  }
  return {
    ...teacher,
    schoolId,
    subject,
    subjects,
    teachingGrades,
    teachingClassIds,
    employeeNo,
    position,
    status: "active",
    role: active.role as TeacherRecord["role"],
    roles: active.roles as string[],
    subjectGroupIds: active.subjectGroupIds as string[],
    prepGroupIds: active.prepGroupIds as string[],
    affiliations: [...affiliations, active],
    currentAffiliationId: affiliationId,
  };
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  store: DatabaseStore,
  config: ServerConfig,
): Promise<void> {
  app.get("/api/auth/registration-context", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (request) => {
    const phone = phoneSchema.parse((request.query as { phone?: string }).phone);
    const authorization = store.getAvailableRegistrationAuthorization(phone);
    if (!authorization) {
      const error = new Error("该手机号尚未获得注册授权，请联系学校管理员或现有教师担保") as Error & { statusCode: number };
      error.statusCode = 403;
      throw error;
    }
    const state = store.loadState();
    const schools = state.schools as Array<Record<string, unknown>>;
    const authorizedSchool = schools.find((school) => school.id === authorization.schoolId);
    if (!authorizedSchool) throw new Error("注册授权关联的学校不存在");
    return {
      authorization: {
        kind: authorization.kind,
        schoolId: authorization.schoolId,
        schoolName: String(authorizedSchool.name),
      },
      schools,
    };
  });

  app.post("/api/auth/register", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    if (input.teachingClassIds.length > 0) throw new Error(TEACHING_CLASS_ASSIGNMENT_ERROR);
    if (store.getUserByPhone(input.phone)) {
      const error = new Error("该手机号已注册") as Error & { statusCode: number };
      error.statusCode = 409;
      throw error;
    }
    const authorization = store.getAvailableRegistrationAuthorization(input.phone);
    if (!authorization) {
      const error = new Error("该手机号尚未获得注册授权，请联系学校管理员或现有教师担保") as Error & { statusCode: number };
      error.statusCode = 403;
      throw error;
    }

    const state = store.loadState();
    const now = new Date().toISOString();
    const teacherId = randomUUID();
    const schoolAffiliationId = randomUUID();
    const personalAffiliationId = randomUUID();
    let schoolId: string;
    let schoolName: string;
    let newSchool: {
      id: string;
      name: string;
      code: string;
      logo: string;
      description: string;
      teacherCount: number;
      studentCount: number;
      city: string;
    } | undefined;

    if (input.newSchool) {
      schoolId = randomUUID();
      schoolName = input.newSchool.name;
      newSchool = {
        id: schoolId,
        name: schoolName,
        code: input.newSchool.code.toUpperCase(),
        logo: schoolName.charAt(0) || "校",
        description: input.newSchool.description || "由教师注册时创建",
        teacherCount: 1,
        studentCount: 0,
        city: input.newSchool.city,
      };
    } else {
      schoolId = input.schoolId!;
      if (schoolId !== authorization.schoolId) {
        const error = new Error("该手机号的注册授权不属于所选学校") as Error & { statusCode: number };
        error.statusCode = 403;
        throw error;
      }
      const school = (state.schools as Array<{ id: string; name: string }>).find((item) => item.id === schoolId);
      if (!school) throw new Error("学校不存在");
      schoolName = school.name;
    }
    validateTeachingClassIds(state, schoolId, input.teachingClassIds);

    const requiresReview = !input.newSchool;
    const teacher: TeacherRecord = {
      id: teacherId,
      email: input.email?.toLowerCase() || "",
      name: input.name,
      nickname: "",
      avatar: input.name.charAt(0),
      schoolId: requiresReview ? null : schoolId,
      subject: input.subject,
      teachingGrades: requiresReview ? [] : input.teachingGrades,
      teachingClassIds: input.teachingClassIds,
      status: "active",
      role: "teacher",
      roles: ["teacher"],
      subjectGroupIds: [],
      prepGroupIds: [],
      affiliations: [
        {
          id: schoolAffiliationId,
          teacherId,
          schoolId,
          schoolName,
          subject: input.subject,
          teachingGrades: input.teachingGrades,
          teachingClassIds: input.teachingClassIds,
          status: requiresReview ? "pending" : "active",
          role: "teacher",
          roles: ["teacher"],
          subjectGroupIds: [],
          prepGroupIds: [],
          isCurrent: !requiresReview,
          joinedAt: now,
        },
        {
          id: personalAffiliationId,
          teacherId,
          schoolId: null,
          schoolName: null,
          subject: input.subject,
          teachingGrades: [],
          teachingClassIds: [],
          status: "active",
          role: "teacher",
          roles: ["teacher"],
          subjectGroupIds: [],
          prepGroupIds: [],
          isCurrent: requiresReview,
          joinedAt: now,
        },
      ],
      currentAffiliationId: requiresReview ? personalAffiliationId : schoolAffiliationId,
      createdAt: now,
    };
    store.createAuthorizedAccount(teacher, input.password, input.phone, { newSchool });
    if (requiresReview) {
      await withSerializedState(store, (latestState) => {
        const applications = latestState.applications as Array<Record<string, unknown>>;
        applications.push({
          id: randomUUID(),
          teacherId,
          teacherName: input.name,
          schoolId,
          schoolName,
          employeeNo: "",
          subject: input.subject,
          subjects: [input.subject],
          teachingGrades: input.teachingGrades,
          teachingClassIds: [],
          position: "",
          roles: input.roles,
          proofFileId: null,
          proofFileName: "",
          requestSchoolAdmin: input.requestSchoolAdmin,
          registrationApplication: true,
          status: "pending",
          createdAt: now,
        });
      });
      reply.code(202);
      return { teacher: null, csrfToken: null, pending: true };
    }
    const user = store.authenticate(input.phone, input.password);
    if (!user) throw new Error("账号创建失败");
    const { token, session } = store.createSession(user);
    setSessionCookie(reply, token, config);
    return { teacher: publicTeacher(teacher), csrfToken: session.csrfToken };
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = store.authenticate(input.identifier, input.password);
    if (!user) {
      reply.code(401);
      throw new Error("邮箱、手机号或密码错误");
    }
    const teacher = store.getTeacherById(user.teacher_id);
    if (!teacher) throw new Error("账号关联的教师资料不存在");
    const { token, session } = store.createSession(user);
    setSessionCookie(reply, token, config);
    return { teacher: publicTeacher(teacher), csrfToken: session.csrfToken };
  });

  app.get("/api/auth/current", async (request) => {
    const session = getSession(request, store);
    if (!session) return { teacher: null, csrfToken: null };
    const teacher = sessionTeacher(store, session);
    return { teacher: publicTeacher(teacher), csrfToken: session.csrfToken };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    store.deleteSession(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/registration-authorizations", async (request) => {
    const session = requireSession(request, store);
    const teacher = sessionTeacher(store, session);
    if (!teacher.schoolId || teacher.status !== "active") throw new Error("仅已加入学校的教师可以管理注册授权");
    const canManageSchool = ["school_admin", "platform_admin"].includes(activeRole(teacher));
    return store.listRegistrationAuthorizations({
      schoolId: teacher.schoolId,
      requesterTeacherId: teacher.id,
      canManageSchool,
    });
  });

  app.post("/api/auth/registration-authorizations", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const teacher = sessionTeacher(store, session);
    if (!teacher.schoolId || teacher.status !== "active") throw new Error("仅已加入学校的教师可以添加注册授权");
    const input = registrationAuthorizationSchema.parse(request.body);
    const canManageSchool = ["school_admin", "platform_admin"].includes(activeRole(teacher));
    if (input.kind === "admin" && !canManageSchool) throw new Error("管理员预授权需要学校管理员权限");
    return store.createRegistrationAuthorization({
      id: randomUUID(),
      phone: input.phone,
      kind: input.kind,
      schoolId: teacher.schoolId,
      createdByTeacherId: teacher.id,
      createdAt: new Date().toISOString(),
      consumedByTeacherId: null,
      consumedAt: null,
      revokedAt: null,
    });
  });

  app.delete("/api/auth/registration-authorizations/:id", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const teacher = sessionTeacher(store, session);
    if (!teacher.schoolId || teacher.status !== "active") throw new Error("仅已加入学校的教师可以撤销注册授权");
    const id = z.string().uuid().parse((request.params as { id?: string }).id);
    const canManageSchool = ["school_admin", "platform_admin"].includes(activeRole(teacher));
    store.revokeRegistrationAuthorization({
      id,
      schoolId: teacher.schoolId,
      requesterTeacherId: teacher.id,
      canManageSchool,
    });
    return { ok: true };
  });

  app.post("/api/auth/password", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const input = z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(10).max(128),
    }).parse(request.body);
    store.changePassword(session.userId, input.currentPassword, input.newPassword);
    return { ok: true };
  });

  app.patch("/api/auth/email", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const input = emailBindingSchema.parse(request.body);
    return store.bindAccountEmail(session.userId, session.teacherId, input.email);
  });

  app.patch("/api/auth/profile", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const input = profileSchema.parse(request.body);
    if (input.teachingClassIds !== undefined) throw new Error(TEACHING_CLASS_ASSIGNMENT_ERROR);
    return withSerializedState(store, (state) => {
      const index = state.teachers.findIndex((teacher) => teacher.id === session.teacherId);
      if (index < 0) throw new Error("教师不存在");
      let teacher = state.teachers[index];
      const current = teacher.affiliations.find((item) => item.id === teacher.currentAffiliationId)
        || teacher.affiliations.find((item) => item.isCurrent);
      if (input.subject !== undefined || input.teachingGrades !== undefined) {
        teacher = updateTeacherTeachingProfile(
          teacher,
          (current?.schoolId as string | null | undefined) ?? null,
          { subject: input.subject, teachingGrades: input.teachingGrades },
        );
      }
      if (input.nickname !== undefined) teacher = { ...teacher, nickname: input.nickname };
      state.teachers[index] = teacher;
      return publicTeacher(teacher);
    });
  });

  app.post("/api/auth/admin-applications", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const teacher = sessionTeacher(store, session);
    const input = adminApplicationSchema.parse(request.body);
    if (!teacher.schoolId || teacher.status !== "active") throw new Error("请先加入学校");
    if (["school_admin", "platform_admin"].includes(activeRole(teacher))) throw new Error("当前账号已经是管理员");
    return withSerializedState(store, (state) => {
      const applications = state.schoolAdminApplications as Array<Record<string, unknown>>;
      if (applications.some((item) => item.kind !== "teacher_roles" && item.teacherId === teacher.id && item.schoolId === teacher.schoolId && item.status === "pending")) {
        throw new Error("已有待审核的学校管理员申请");
      }
      const school = (state.schools as Array<{ id: string; name: string }>).find((item) => item.id === teacher.schoolId);
      if (!school) throw new Error("学校不存在");
      const application = {
        id: randomUUID(),
        teacherId: teacher.id,
        teacherName: teacher.name,
        schoolId: school.id,
        schoolName: school.name,
        reason: input.reason,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      applications.push(application);
      return application;
    });
  });

  app.get("/api/auth/admin-applications/mine", async (request) => {
    const session = requireSession(request, store);
    const state = store.loadState();
    return (state.schoolAdminApplications as Array<Record<string, unknown>>)
      .filter((item) => item.kind !== "teacher_roles" && item.teacherId === session.teacherId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  });

  app.get("/api/auth/admin-applications/pending", async (request) => {
    const session = requireSession(request, store);
    const reviewer = sessionTeacher(store, session);
    requirePlatformAdmin(reviewer);
    const state = store.loadState();
    return (state.schoolAdminApplications as Array<Record<string, unknown>>)
      .filter((item) => item.kind !== "teacher_roles" && item.status === "pending")
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  });

  app.post("/api/auth/admin-applications/:id/review", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const reviewer = sessionTeacher(store, session);
    requirePlatformAdmin(reviewer);
    const id = z.string().uuid().parse((request.params as { id?: string }).id);
    const approved = z.object({ approved: z.boolean() }).parse(request.body).approved;
    return withSerializedState(store, (state) => {
      const applications = state.schoolAdminApplications as Array<Record<string, unknown>>;
      const application = applications.find((item) => item.id === id);
      if (!application || application.status !== "pending") throw new Error("管理员申请不存在或已处理");
      application.status = approved ? "approved" : "rejected";
      application.reviewedAt = new Date().toISOString();
      application.reviewedBy = reviewer.id;
      if (approved) {
        const teacherIndex = state.teachers.findIndex((item) => item.id === application.teacherId);
        if (teacherIndex < 0) throw new Error("申请教师不存在");
        const target = state.teachers[teacherIndex];
        const affiliations = target.affiliations.map((item) => item.schoolId === application.schoolId
          ? { ...item, role: "school_admin" }
          : item);
        const current = affiliations.find((item) => item.id === target.currentAffiliationId)
          || affiliations.find((item) => item.isCurrent);
        state.teachers[teacherIndex] = {
          ...target,
          affiliations,
          role: (current?.role || target.role) as TeacherRecord["role"],
        };
      }
      createNotificationInState(state, {
        recipientTeacherId: String(application.teacherId),
        type: "approval",
        title: approved ? "学校管理员申请已通过" : "学校管理员申请未通过",
        content: approved
          ? `你在 ${String(application.schoolName || "当前学校")} 的学校管理员申请已通过。`
          : `你在 ${String(application.schoolName || "当前学校")} 的学校管理员申请未通过。`,
        actionUrl: approved ? "/admin" : "/profile",
      });
      return { ok: true };
    });
  });

  app.post("/api/auth/role-applications", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const teacher = sessionTeacher(store, session);
    const input = roleApplicationSchema.parse(request.body);
    if (!teacher.schoolId || teacher.status !== "active") throw new Error("请先加入学校");
    if (activeRole(teacher) === "platform_admin") throw new Error("平台超级管理员不能申请校内教师权限");
    const currentRoles = new Set(activeTeacherRoles(teacher));
    const requestedRoles = input.roles.filter((role) => role !== "teacher" && !currentRoles.has(role));
    if (requestedRoles.length === 0) throw new Error("请选择尚未拥有的职务权限");
    return withSerializedState(store, (state) => {
      const applications = state.schoolAdminApplications as Array<Record<string, unknown>>;
      if (applications.some((item) => (
        item.kind === "teacher_roles"
        && item.teacherId === teacher.id
        && item.schoolId === teacher.schoolId
        && item.status === "pending"
      ))) {
        throw new Error("已有待审核的教师权限申请");
      }
      const school = (state.schools as Array<{ id: string; name: string }>).find((item) => item.id === teacher.schoolId);
      if (!school) throw new Error("学校不存在");
      const application = {
        id: randomUUID(),
        kind: "teacher_roles",
        teacherId: teacher.id,
        teacherName: teacher.name,
        schoolId: school.id,
        schoolName: school.name,
        requestedRoles,
        reason: input.reason,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      applications.push(application);
      return application;
    });
  });

  app.get("/api/auth/role-applications/mine", async (request) => {
    const session = requireSession(request, store);
    const state = store.loadState();
    return (state.schoolAdminApplications as Array<Record<string, unknown>>)
      .filter((item) => item.kind === "teacher_roles" && item.teacherId === session.teacherId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  });

  app.get("/api/auth/role-applications/pending", async (request) => {
    const session = requireSession(request, store);
    const reviewer = sessionTeacher(store, session);
    requireSchoolAdmin(reviewer);
    if (!reviewer.schoolId) throw new Error("当前管理员没有学校身份");
    const state = store.loadState();
    return (state.schoolAdminApplications as Array<Record<string, unknown>>)
      .filter((item) => item.kind === "teacher_roles" && item.status === "pending" && item.schoolId === reviewer.schoolId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  });

  app.post("/api/auth/role-applications/:id/review", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const reviewer = sessionTeacher(store, session);
    requireSchoolAdmin(reviewer);
    if (!reviewer.schoolId) throw new Error("当前管理员没有学校身份");
    const id = z.string().uuid().parse((request.params as { id?: string }).id);
    const approved = z.object({ approved: z.boolean() }).parse(request.body).approved;
    return withSerializedState(store, (state) => {
      const applications = state.schoolAdminApplications as Array<Record<string, unknown>>;
      const application = applications.find((item) => item.id === id && item.kind === "teacher_roles");
      if (!application || application.status !== "pending" || application.schoolId !== reviewer.schoolId) {
        throw new Error("教师权限申请不存在或已处理");
      }
      application.status = approved ? "approved" : "rejected";
      application.reviewedAt = new Date().toISOString();
      application.reviewedBy = reviewer.id;
      if (approved) {
        const teacherIndex = state.teachers.findIndex((item) => item.id === application.teacherId);
        if (teacherIndex < 0) throw new Error("申请教师不存在");
        const target = state.teachers[teacherIndex];
        const requestedRoles = Array.isArray(application.requestedRoles)
          ? application.requestedRoles.filter((role): role is TeacherRole => TEACHER_ROLES.includes(role as TeacherRole))
          : [];
        const affiliations = target.affiliations.map((item) => {
          if (item.schoolId !== reviewer.schoolId) return item;
          const directRoles = Array.isArray(item.assignedRoles) && item.assignedRoles.length > 0
            ? item.assignedRoles.filter((role): role is TeacherRole => TEACHER_ROLES.includes(role as TeacherRole))
            : Array.isArray(item.roles)
              ? item.roles.filter((role): role is TeacherRole => TEACHER_ROLES.includes(role as TeacherRole))
              : ["teacher" as TeacherRole];
          const assignedRoles = normalizeTeacherRoles([...directRoles, ...requestedRoles]);
          const effectiveRoles = normalizeTeacherRoles([
            ...(Array.isArray(item.roles)
              ? item.roles.filter((role): role is TeacherRole => TEACHER_ROLES.includes(role as TeacherRole))
              : directRoles),
            ...requestedRoles,
          ]);
          return { ...item, assignedRoles, roles: effectiveRoles };
        });
        const current = affiliations.find((item) => item.id === target.currentAffiliationId)
          || affiliations.find((item) => item.isCurrent);
        state.teachers[teacherIndex] = {
          ...target,
          affiliations,
          roles: Array.isArray(current?.roles) ? current.roles as string[] : target.roles,
        };
      }
      createNotificationInState(state, {
        recipientTeacherId: String(application.teacherId),
        type: "approval",
        title: approved ? "教师权限申请已通过" : "教师权限申请未通过",
        content: approved
          ? "你申请的校内职务权限已由本校管理员通过。"
          : "你申请的校内职务权限未通过。",
        actionUrl: "/admin/permission-applications",
      });
      return { ok: true };
    });
  });

  app.patch("/api/auth/teachers/:id/teaching-profile", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const manager = sessionTeacher(store, session);
    requireTeachingProfileManager(manager);
    if (!manager.schoolId) throw new Error("当前管理员没有学校身份");
    const teacherId = z.string().min(1).max(100).parse((request.params as { id?: string }).id);
    const input = managedTeachingProfileSchema.parse(request.body);
    return withSerializedState(store, (state) => {
      const index = state.teachers.findIndex((item) => item.id === teacherId);
      if (index < 0) throw new Error("教师不存在");
      const target = state.teachers[index];
      if (!target.affiliations.some((item) => item.schoolId === manager.schoolId)) throw new Error("无权管理其他学校的教师");
      requireTeachingProfileTargetScope(state, manager, target, input);
      const classIds = input.teachingClassIds
        ?? (target.affiliations.find((item) => item.schoolId === manager.schoolId)?.teachingClassIds as string[] | undefined)
        ?? [];
      const homeroomClassIds = input.homeroomClassIds
        ?? (target.affiliations.find((item) => item.schoolId === manager.schoolId)?.homeroomClassIds as string[] | undefined)
        ?? [];
      validateTeachingClassIds(state, manager.schoolId, classIds);
      validateTeachingClassIds(state, manager.schoolId, homeroomClassIds);
      state.teachers[index] = updateTeacherTeachingProfile(target, manager.schoolId, input);
      return publicTeacher(state.teachers[index]);
    });
  });

  app.post("/api/auth/applications", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const input = applicationSchema.parse(request.body);
    if (input.teachingClassIds.length > 0) throw new Error(TEACHING_CLASS_ASSIGNMENT_ERROR);
    const file = input.proofFileId ? store.getFile(input.proofFileId) : null;
    if (input.proofFileId && (!file || file.ownerId !== session.teacherId)) {
      throw new Error("证明文件不存在或无权使用");
    }

    return withSerializedState(store, (state) => {
      const schools = state.schools as Array<{ id: string; name: string }>;
      const school = schools.find((item) => item.id === input.schoolId);
      if (!school) throw new Error("学校不存在");
      const applications = state.applications as Array<Record<string, unknown>>;
      const currentTeacher = state.teachers.find((teacher) => teacher.id === session.teacherId);
      if (!currentTeacher) throw new Error("申请教师不存在");
      if (currentTeacher?.affiliations.some((affiliation) => affiliation.schoolId === input.schoolId && affiliation.status === "active")) {
        throw new Error("已加入该学校，无需重复申请");
      }
      if (applications.some((item) => item.teacherId === session.teacherId && item.schoolId === input.schoolId)) {
        throw new Error("已提交过该学校的认证申请，不能重复申请；后续权限调整请在后台设置中提交");
      }
      const now = new Date().toISOString();
      const application: Record<string, unknown> = {
        id: randomUUID(),
        teacherId: session.teacherId,
        teacherName: currentTeacher.name,
        schoolId: input.schoolId,
        schoolName: school.name,
        employeeNo: input.employeeNo,
        subject: input.subject,
        subjects: input.subjects,
        teachingGrades: input.teachingGrades,
        teachingClassIds: input.teachingClassIds,
        position: input.position,
        roles: input.roles,
        proofFileId: input.proofFileId || null,
        proofFileName: file?.originalName || "",
        requestSchoolAdmin: input.requestSchoolAdmin,
        status: config.autoApproveApplications ? "approved" : "pending",
        createdAt: now,
      };
      applications.push(application);
      if (config.autoApproveApplications) {
        const teachers = state.teachers;
        const index = teachers.findIndex((teacher) => teacher.id === session.teacherId);
        validateTeachingClassIds(state, input.schoolId, input.teachingClassIds);
        teachers[index] = activateAffiliation(
          state,
          teachers[index],
          input.schoolId,
          input.employeeNo,
          input.subjects,
          input.teachingGrades,
          input.teachingClassIds,
          input.position,
          input.requestSchoolAdmin,
          input.roles,
        );
        createNotificationInState(state, {
          recipientTeacherId: session.teacherId,
          type: "approval",
          title: "学校认证已通过",
          content: `你加入 ${school.name} 的认证已自动通过。`,
          actionUrl: "/dashboard",
        });
      }
      return application;
    });
  });

  app.get("/api/auth/applications/mine", async (request) => {
    const session = requireSession(request, store);
    const state = store.loadState();
    return (state.applications as Array<Record<string, unknown>>)
      .filter((item) => item.teacherId === session.teacherId);
  });

  app.get("/api/auth/applications/pending", async (request) => {
    const session = requireSession(request, store);
    const teacher = sessionTeacher(store, session);
    requireAdmin(teacher);
    const state = store.loadState();
    const platformAdmin = activeRole(teacher) === "platform_admin";
    const schools = state.schools as Array<{ id: string; name: string }>;
    return (state.applications as Array<Record<string, unknown>>)
      .filter((item) => item.status === "pending" && (platformAdmin || item.schoolId === teacher.schoolId))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((item) => ({
        ...item,
        teacherName: item.teacherName
          || state.teachers.find((candidate) => candidate.id === item.teacherId)?.name
          || "未知教师",
        schoolName: item.schoolName
          || schools.find((school) => school.id === item.schoolId)?.name
          || "未知学校",
      }));
  });

  app.post("/api/auth/applications/:id/review", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const reviewer = sessionTeacher(store, session);
    requireAdmin(reviewer);
    const id = z.string().min(1).parse((request.params as { id?: string }).id);
    const approved = z.object({ approved: z.boolean() }).parse(request.body).approved;
    return withSerializedState(store, (state) => {
      const applications = state.applications as Array<Record<string, unknown>>;
      const application = applications.find((item) => item.id === id);
      const platformAdmin = activeRole(reviewer) === "platform_admin";
      if (!application || (!platformAdmin && application.schoolId !== reviewer.schoolId)) {
        throw new Error("申请记录不存在");
      }
      if (application.status !== "pending") throw new Error("申请记录不存在或已处理");
      application.status = approved ? "approved" : "rejected";
      application.reviewedAt = new Date().toISOString();
      application.reviewedBy = reviewer.id;
      if (approved) {
        const teachers = state.teachers;
        const index = teachers.findIndex((teacher) => teacher.id === application.teacherId);
        if (index < 0) throw new Error("申请教师不存在");
        teachers[index] = activateAffiliation(
          state,
          teachers[index],
          String(application.schoolId),
          typeof application.employeeNo === "string" ? application.employeeNo : "",
          Array.isArray(application.subjects)
            ? application.subjects.filter((item): item is string => typeof item === "string")
            : [String(application.subject)],
          Array.isArray(application.teachingGrades) ? application.teachingGrades as string[] : [],
          Array.isArray(application.teachingClassIds) ? application.teachingClassIds as string[] : [],
          typeof application.position === "string" ? application.position : "",
          application.requestSchoolAdmin === true && platformAdmin,
          Array.isArray(application.roles)
            ? normalizeTeacherRoles(application.roles.filter(
              (item): item is TeacherRole => TEACHER_ROLES.includes(item as TeacherRole),
            ))
            : ["teacher"],
        );
        if (application.requestSchoolAdmin === true && !platformAdmin) {
          const adminApplications = state.schoolAdminApplications as Array<Record<string, unknown>>;
          const alreadyPending = adminApplications.some((item) =>
            item.kind !== "teacher_roles"
            && item.teacherId === application.teacherId
            && item.schoolId === application.schoolId
            && item.status === "pending",
          );
          if (!alreadyPending) {
            adminApplications.push({
              id: randomUUID(),
              teacherId: application.teacherId,
              teacherName: application.teacherName,
              schoolId: application.schoolId,
              schoolName: application.schoolName,
              reason: "注册或入校时申请学校管理员权限",
              status: "pending",
              createdAt: new Date().toISOString(),
            });
          }
        }
      } else if (application.registrationApplication === true) {
        const teacherIndex = state.teachers.findIndex((teacher) => teacher.id === application.teacherId);
        if (teacherIndex >= 0) {
          const target = state.teachers[teacherIndex];
          state.teachers[teacherIndex] = {
            ...target,
            affiliations: target.affiliations.map((item) => item.schoolId === application.schoolId
              ? { ...item, status: "rejected" }
              : item),
          };
        }
      }
      createNotificationInState(state, {
        recipientTeacherId: String(application.teacherId),
        type: "approval",
        title: approved ? "学校认证已通过" : "学校认证未通过",
        content: approved
          ? `你加入 ${String(application.schoolName || "学校")} 的认证已通过。`
          : `你加入 ${String(application.schoolName || "学校")} 的认证未通过。`,
        actionUrl: approved ? "/dashboard" : "/school-auth",
      });
      return { ok: true };
    });
  });

  app.post("/api/auth/affiliations/:id/activate", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const affiliationId = z.string().min(1).parse((request.params as { id?: string }).id);
    return withSerializedState(store, (state) => {
      const index = state.teachers.findIndex((teacher) => teacher.id === session.teacherId);
      if (index < 0) throw new Error("教师不存在");
      const teacher = state.teachers[index];
      const target = teacher.affiliations.find((item) => item.id === affiliationId);
      if (!target || target.status !== "active") throw new Error("所属单位不存在或不可用");
      const affiliations = teacher.affiliations.map((item) => ({ ...item, isCurrent: item.id === affiliationId }));
      state.teachers[index] = {
        ...teacher,
        schoolId: (target.schoolId as string | null) || null,
        subject: String(target.subject || ""),
        teachingGrades: Array.isArray(target.teachingGrades) ? target.teachingGrades as string[] : [],
        teachingClassIds: Array.isArray(target.teachingClassIds) ? target.teachingClassIds as string[] : [],
        homeroomClassIds: Array.isArray(target.homeroomClassIds) ? target.homeroomClassIds as string[] : [],
        employeeNo: typeof target.employeeNo === "string" ? target.employeeNo : undefined,
        status: target.status as TeacherRecord["status"],
        role: target.role as TeacherRecord["role"],
        roles: target.roles as string[],
        subjectGroupIds: target.subjectGroupIds as string[],
        prepGroupIds: target.prepGroupIds as string[],
        affiliations,
        currentAffiliationId: affiliationId,
      };
      return publicTeacher(state.teachers[index]);
    });
  });

  app.get("/api/auth/teachers", async (request) => {
    const session = requireSession(request, store);
    const teacher = sessionTeacher(store, session);
    const state = store.loadState();
    return state.teachers
      .filter((item) => item.schoolId === teacher.schoolId)
      .map(publicTeacher);
  });
}
