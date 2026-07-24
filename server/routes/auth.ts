import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { DatabaseStore } from "../database.js";
import type { ServerConfig } from "../config.js";
import type { AppState, SessionUser, TeacherRecord } from "../types.js";
import { withSerializedState } from "../rpc.js";

export const SESSION_COOKIE = "inteschool_session";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const registerSchema = loginSchema.extend({
  password: z.string().min(10).max(128),
  name: z.string().trim().min(2).max(50),
});

const applicationSchema = z.object({
  schoolId: z.string().min(1).max(100),
  employeeNo: z.string().trim().min(1).max(100),
  subject: z.string().trim().min(1).max(50),
  proofFileId: z.string().uuid(),
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
  subject: string,
): TeacherRecord {
  const schools = state.schools as Array<{ id: string; name: string }>;
  const schoolName = schools.find((school) => school.id === schoolId)?.name || null;
  const existing = teacher.affiliations.find((item) => item.schoolId === schoolId);
  const affiliationId = typeof existing?.id === "string" ? existing.id : randomUUID();
  const active = {
    ...(existing || {}),
    id: affiliationId,
    teacherId: teacher.id,
    schoolId,
    schoolName,
    subject,
    employeeNo,
    status: "active",
    role: existing?.role || "teacher",
    roles: existing?.roles || ["teacher"],
    subjectGroupIds: existing?.subjectGroupIds || [],
    prepGroupIds: existing?.prepGroupIds || [],
    isCurrent: true,
    joinedAt: existing?.joinedAt || new Date().toISOString(),
  };
  const affiliations = teacher.affiliations
    .filter((item) => item.id !== affiliationId)
    .map((item) => ({ ...item, isCurrent: false }));
  return {
    ...teacher,
    schoolId,
    subject,
    employeeNo,
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
  app.post("/api/auth/register", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const now = new Date().toISOString();
    const teacherId = randomUUID();
    const affiliationId = randomUUID();
    const teacher: TeacherRecord = {
      id: teacherId,
      email: input.email.toLowerCase(),
      name: input.name,
      avatar: input.name.charAt(0),
      schoolId: null,
      subject: "",
      status: "pending",
      role: "teacher",
      roles: ["teacher"],
      subjectGroupIds: [],
      prepGroupIds: [],
      affiliations: [{
        id: affiliationId,
        teacherId,
        schoolId: null,
        schoolName: null,
        subject: "",
        status: "active",
        role: "teacher",
        roles: ["teacher"],
        subjectGroupIds: [],
        prepGroupIds: [],
        isCurrent: true,
        joinedAt: now,
      }],
      currentAffiliationId: affiliationId,
      createdAt: now,
    };
    store.createAccount(teacher, input.password);
    const user = store.authenticate(input.email, input.password);
    if (!user) throw new Error("账号创建失败");
    const { token, session } = store.createSession(user);
    setSessionCookie(reply, token, config);
    return { teacher: publicTeacher(teacher), csrfToken: session.csrfToken };
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = store.authenticate(input.email, input.password);
    if (!user) {
      reply.code(401);
      throw new Error("邮箱或密码错误");
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

  app.post("/api/auth/applications", async (request) => {
    const session = requireSession(request, store);
    requireCsrf(request, session);
    const input = applicationSchema.parse(request.body);
    const file = store.getFile(input.proofFileId);
    if (!file || file.ownerId !== session.teacherId) throw new Error("证明文件不存在或无权使用");

    return withSerializedState(store, (state) => {
      const schools = state.schools as Array<{ id: string; name: string }>;
      if (!schools.some((school) => school.id === input.schoolId)) throw new Error("学校不存在");
      const applications = state.applications as Array<Record<string, unknown>>;
      if (applications.some((item) => item.teacherId === session.teacherId && item.schoolId === input.schoolId && item.status === "pending")) {
        throw new Error("已有待审核的认证申请");
      }
      const now = new Date().toISOString();
      const application: Record<string, unknown> = {
        id: randomUUID(),
        teacherId: session.teacherId,
        schoolId: input.schoolId,
        employeeNo: input.employeeNo,
        subject: input.subject,
        proofFileId: input.proofFileId,
        proofFileName: file.originalName,
        status: config.autoApproveApplications ? "approved" : "pending",
        createdAt: now,
      };
      applications.push(application);
      if (config.autoApproveApplications) {
        const teachers = state.teachers;
        const index = teachers.findIndex((teacher) => teacher.id === session.teacherId);
        teachers[index] = activateAffiliation(state, teachers[index], input.schoolId, input.employeeNo, input.subject);
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
    return (state.applications as Array<Record<string, unknown>>)
      .filter((item) => item.schoolId === teacher.schoolId && item.status === "pending");
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
      if (!application || application.schoolId !== reviewer.schoolId) throw new Error("申请记录不存在");
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
          String(application.employeeNo),
          String(application.subject),
        );
      }
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
