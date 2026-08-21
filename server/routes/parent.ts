import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ServerConfig } from "../config.js";
import type { DatabaseStore } from "../database.js";
import type { AppState, ParentSessionUser } from "../types.js";
import type { GradeExam, GradeScoreRecord, Question, Student } from "../../src/types/index.js";

export const PARENT_SESSION_COOKIE = "inteschool_parent_session";

interface ParentAuthorization {
  id: string;
  phone: string;
  guardianName?: string;
  studentId: string;
  schoolId: string;
}

function normalizePhone(value: string): string {
  return value.trim().replace(/[\s()-]/g, "").replace(/^\+86/, "");
}

const phoneSchema = z.string().transform(normalizePhone).refine(
  (value) => /^1[3-9]\d{9}$/.test(value),
  "请输入有效的中国大陆手机号",
);

const credentialSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1).max(128),
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(50),
  phone: phoneSchema,
  password: z.string().min(10).max(128),
});

function setParentSessionCookie(reply: FastifyReply, token: string, config: ServerConfig): void {
  reply.setCookie(PARENT_SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: config.sessionDays * 86400,
  });
}

async function getParentSession(request: FastifyRequest, store: DatabaseStore): Promise<ParentSessionUser | null> {
  return store.getParentSession(request.cookies[PARENT_SESSION_COOKIE]);
}

async function requireParentSession(request: FastifyRequest, store: DatabaseStore): Promise<ParentSessionUser> {
  const session = await getParentSession(request, store);
  if (!session) throw new Error("请先登录家长账号");
  return session;
}

function requireParentCsrf(request: FastifyRequest, session: ParentSessionUser): void {
  const token = request.headers["x-inteschool-csrf"];
  if (typeof token !== "string" || token !== session.csrfToken) {
    throw new Error("请求校验失败，请刷新页面后重试");
  }
}

function authorizationsForPhone(state: AppState, phone: string): ParentAuthorization[] {
  return ((state.parentAuthorizations || []) as ParentAuthorization[])
    .filter((item) => item.phone === phone);
}

function authorizedStudent(state: AppState, phone: string, studentId: string): Student {
  const authorization = authorizationsForPhone(state, phone)
    .find((item) => item.studentId === studentId);
  if (!authorization) throw new Error("无权查看该学生信息");
  const student = ((state.students || []) as Student[])
    .find((item) => item.id === studentId && item.schoolId === authorization.schoolId && item.status !== "deleted");
  if (!student) throw new Error("学生不存在或已从学校名单删除");
  return student;
}

function childViews(state: AppState, phone: string) {
  const students = (state.students || []) as Student[];
  const schools = (state.schools || []) as Array<{ id: string; name: string }>;
  const classes = (state.schoolClasses || []) as Array<{ id: string; name: string }>;
  const result = new Map<string, Record<string, unknown>>();
  for (const authorization of authorizationsForPhone(state, phone)) {
    const student = students.find((item) => (
      item.id === authorization.studentId
      && item.schoolId === authorization.schoolId
      && item.status !== "deleted"
    ));
    if (!student) continue;
    const school = schools.find((item) => item.id === student.schoolId);
    const schoolClass = classes.find((item) => item.id === student.classId);
    result.set(student.id, {
      id: student.id,
      name: student.name,
      studentNo: student.studentNo,
      grade: student.grade,
      schoolId: student.schoolId,
      schoolName: school?.name || "未知学校",
      classId: student.classId,
      className: schoolClass?.name || "未知班级",
      guardianName: authorization.guardianName || "",
    });
  }
  return [...result.values()];
}

function scoreForRecord(record: GradeScoreRecord) {
  return {
    studentId: record.studentId,
    studentName: record.studentName,
    studentNo: record.studentNo,
    classId: record.classId,
    className: record.className,
    scores: record.scores,
    assignedScores: record.assignedScores,
    rawTotal: record.rawTotal,
    assignedTotal: record.assignedTotal,
    classRank: record.classRank,
    gradeRank: record.gradeRank,
  };
}

type MasteryDimension = "chapter" | "knowledge";

function buildLearningDimension(state: AppState, student: Student, dimension: MasteryDimension) {
  const questions = ((state.questions || []) as Question[]).filter((item) => item.schoolId === student.schoolId);
  const questionMap = new Map(questions.map((item) => [item.id, item] as const));
  const studentIds = new Set(
    ((state.students || []) as Student[])
      .filter((item) => item.schoolId === student.schoolId && item.grade === student.grade && item.status === "active")
      .map((item) => item.id),
  );
  const records = (state.answerRecords || []) as Array<{
    studentId: string;
    questionId: string;
    score?: "correct" | "partial" | "wrong" | "done";
    isCorrect?: boolean;
  }>;
  const collections = dimension === "chapter"
    ? [...((state.chapters || []) as Array<{ id: string; name: string; parentId?: string }>), ...((state.schoolChapters || []) as Array<{ id: string; name: string; parentId?: string }>)]
    : [...((state.knowledgePoints || []) as Array<{ id: string; name: string; parentId?: string }>), ...((state.schoolKnowledgePoints || []) as Array<{ id: string; name: string; parentId?: string }>)] ;
  const names = new Map(collections.map((item) => [item.id, item.name] as const));

  const studentStats = new Map<string, { attempts: number; correct: number }>();
  const gradeStats = new Map<string, { attempts: number; correct: number }>();
  const add = (map: Map<string, { attempts: number; correct: number }>, nodeId: string, correct: boolean) => {
    const current = map.get(nodeId) || { attempts: 0, correct: 0 };
    current.attempts += 1;
    if (correct) current.correct += 1;
    map.set(nodeId, current);
  };

  for (const record of records) {
    if (record.score === "done") continue;
    const question = questionMap.get(record.questionId);
    if (!question) continue;
    const ids = dimension === "chapter" ? question.chapterIds : question.knowledgePointIds;
    const correct = record.score ? record.score === "correct" : Boolean(record.isCorrect);
    if (studentIds.has(record.studentId)) ids.forEach((id) => add(gradeStats, id, correct));
    if (record.studentId === student.id) ids.forEach((id) => add(studentStats, id, correct));
  }

  return [...studentStats.entries()]
    .filter(([, stat]) => stat.attempts > 0)
    .map(([id, stat]) => {
      const gradeStat = gradeStats.get(id) || { attempts: 0, correct: 0 };
      const correctRate = stat.correct / stat.attempts;
      const gradeCorrectRate = gradeStat.attempts > 0 ? gradeStat.correct / gradeStat.attempts : 0;
      return {
        id,
        name: names.get(id) || "未命名内容",
        totalAttempts: stat.attempts,
        correctRate,
        gradeCorrectRate,
        gap: correctRate - gradeCorrectRate,
        masteryLevel: correctRate >= 0.8 ? "mastered" : correctRate >= 0.6 ? "basic" : "weak",
      };
    })
    .sort((left, right) => right.totalAttempts - left.totalAttempts || left.name.localeCompare(right.name, "zh-CN"));
}

export async function registerParentRoutes(
  app: FastifyInstance,
  store: DatabaseStore,
  config: ServerConfig,
): Promise<void> {
  app.get("/api/parent/registration-context", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (request) => {
    const phone = phoneSchema.parse((request.query as { phone?: string }).phone);
    const state = store.loadState();
    const children = childViews(state, phone);
    if (children.length === 0) {
      const error = new Error("该手机号未在任何学生的家长授权名单中") as Error & { statusCode: number };
      error.statusCode = 403;
      throw error;
    }
    return { phone, children, registered: Boolean(await store.getParentUserByPhone(phone)) };
  });

  app.post("/api/parent/register", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const phone = phoneSchema.parse(input.phone);
    const state = store.loadState();
    if (childViews(state, phone).length === 0) {
      const error = new Error("该手机号未获得家长注册授权") as Error & { statusCode: number };
      error.statusCode = 403;
      throw error;
    }
    const { user, parent } = await store.createParentAccount({ ...input, phone });
    const { token, session } = await store.createParentSession(user);
    setParentSessionCookie(reply, token, config);
    return { parent, csrfToken: session.csrfToken };
  });

  app.post("/api/parent/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request, reply) => {
    const input = credentialSchema.parse(request.body);
    const phone = phoneSchema.parse(input.phone);
    const user = await store.authenticateParent(phone, input.password);
    if (!user) {
      reply.code(401);
      throw new Error("手机号或密码错误");
    }
    const parent = store.getParentById(user.parent_id);
    if (!parent) throw new Error("账号关联的家长资料不存在");
    const { token, session } = await store.createParentSession(user);
    setParentSessionCookie(reply, token, config);
    return { parent, csrfToken: session.csrfToken };
  });

  app.get("/api/parent/current", async (request) => {
    const session = await getParentSession(request, store);
    if (!session) return { parent: null, csrfToken: null };
    const parent = store.getParentById(session.parentId);
    return { parent, csrfToken: session.csrfToken };
  });

  app.post("/api/parent/logout", async (request, reply) => {
    const session = await requireParentSession(request, store);
    requireParentCsrf(request, session);
    await store.deleteParentSession(request.cookies[PARENT_SESSION_COOKIE]);
    reply.clearCookie(PARENT_SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/parent/children", async (request) => {
    const session = await requireParentSession(request, store);
    return childViews(store.loadState(), session.phone);
  });

  app.get("/api/parent/children/:studentId/grades", async (request) => {
    const session = await requireParentSession(request, store);
    const studentId = z.string().min(1).max(100).parse((request.params as { studentId?: string }).studentId);
    const state = store.loadState();
    const student = authorizedStudent(state, session.phone, studentId);
    const exams = ((state.gradeExams || []) as GradeExam[])
      .filter((exam) => exam.schoolId === student.schoolId && exam.publication?.publishToParents)
      .flatMap((exam) => {
        const record = exam.records.find((item) => item.studentId === student.id);
        if (!record) return [];
        return [{
          examId: exam.id,
          examName: exam.name,
          examDate: exam.examDate,
          cohortLabel: exam.cohortLabel,
          subjects: exam.subjects,
          publishedAt: exam.publication!.publishedAt,
          result: scoreForRecord(record),
        }];
      })
      .sort((left, right) => String(right.examDate || right.publishedAt).localeCompare(String(left.examDate || left.publishedAt)));
    return exams;
  });

  app.get("/api/parent/children/:studentId/learning", async (request) => {
    const session = await requireParentSession(request, store);
    const studentId = z.string().min(1).max(100).parse((request.params as { studentId?: string }).studentId);
    const state = store.loadState();
    const student = authorizedStudent(state, session.phone, studentId);
    return {
      chapter: buildLearningDimension(state, student, "chapter"),
      knowledge: buildLearningDimension(state, student, "knowledge"),
    };
  });
}
