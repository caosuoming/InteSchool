import type { AppState, SessionUser, TeacherRecord } from "./types.js";
import { runWithState } from "./runtime-db.js";
import { serviceRegistry, type ServiceName } from "./service-registry.js";
import { serviceParameters } from "./service-metadata.js";
import type { DatabaseStore } from "./database.js";
import { EXAM_MANAGER_ROLES } from "../src/lib/exam-permissions.js";

const PUBLIC_CALLS = new Set([
  "school.listSchools",
  "school.searchSchools",
  "school.getSchool",
  "class.listClassroomChoices",
]);

const ADMIN_SERVICE_MUTATIONS = new Set(["settings", "organization"]);
const EXAM_MANAGER_MUTATIONS = new Set([
  "importExam",
  "saveCohortTemplateProfile",
  "saveCohortSettings",
  "copyCohortSettings",
  "updateExamSettings",
  "deleteExam",
]);
const READ_PREFIXES = ["list", "get", "search", "check", "is", "verify", "annotate"];
const READ_METHODS = new Set([
  "webAnalyzeQuestion",
  "generateKnowledgePoint",
]);

const TARGET_COLLECTION: Partial<Record<ServiceName, string>> = {
  ai: "documents",
  basket: "baskets",
  class: "schoolClasses",
  courseware: "coursewares",
  examArrangement: "examArrangements",
  examPaper: "examPapers",
  examPublish: "examPublications",
  grade: "gradeExams",
  knowledge: "knowledgePoints",
  lecture: "lectures",
  lessonCourseware: "lessonCoursewares",
  material: "materials",
  organization: "subjectGroups",
  prep: "prepTasks",
  question: "questions",
  reflection: "reflections",
  schoolBackup: "schoolBackups",
  settings: "schoolSettings",
  share: "shareRecords",
  studentInteraction: "studentInteractions",
};

const SHARE_RESOURCE_COLLECTIONS: Record<string, string> = {
  question: "questions",
  examPaper: "examPapers",
  lecture: "lectures",
  courseware: "coursewares",
  material: "materials",
};

const OWNER_KEYS = ["teacherId", "ownerId", "createdBy", "fromTeacherId", "publisherId"];
const SCHOOL_KEYS = ["schoolId", "publisherSchoolId", "fromSchoolId"];
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "viewPassword",
  "wechatOpenId",
  "wechatUnionId",
  "wecomUserId",
  "wecomCorpId",
]);

const ADMIN_TARGET_TEACHER_CALLS = new Set([
  "organization.addMember",
  "organization.removeMember",
  "organization.addPrepMember",
  "organization.removePrepMember",
  "organization.updateTeacherRoles",
]);

class SerialExecutor {
  private tail = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

const executor = new SerialExecutor();

export function withSerializedState<T>(
  store: DatabaseStore,
  task: (state: AppState) => Promise<T> | T,
): Promise<T> {
  return executor.run(async () => {
    const state = store.loadState();
    const before = structuredClone(state);
    const result = await task(state);
    store.saveState(before, state);
    return result;
  });
}

function isReadOnly(method: string): boolean {
  return READ_METHODS.has(method) || READ_PREFIXES.some((prefix) => method.startsWith(prefix));
}

function activeRole(teacher: TeacherRecord): string {
  const affiliation = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return typeof affiliation?.role === "string" ? affiliation.role : teacher.role;
}

function isAdmin(teacher: TeacherRecord): boolean {
  return ["school_admin", "platform_admin"].includes(activeRole(teacher));
}

function canManageExams(teacher: TeacherRecord): boolean {
  if (isAdmin(teacher)) return true;
  const affiliation = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  const roles = Array.isArray(affiliation?.roles) ? affiliation.roles : teacher.roles;
  return roles.some((role) => EXAM_MANAGER_ROLES.includes(role as (typeof EXAM_MANAGER_ROLES)[number]));
}

function findRecord(state: AppState, id: string): Record<string, unknown> | null {
  for (const value of Object.values(state)) {
    if (!Array.isArray(value)) continue;
    const found = value.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === id);
    if (found) return found as Record<string, unknown>;
  }
  return null;
}

function recordOwner(record: Record<string, unknown>): string | null {
  for (const key of OWNER_KEYS) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return null;
}

function recordSchool(record: Record<string, unknown>): string | null {
  for (const key of SCHOOL_KEYS) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  return null;
}

function canReadQuestion(record: Record<string, unknown>, teacher: TeacherRecord): boolean {
  return recordOwner(record) === teacher.id || record.isShared === true;
}

function isShareRecipient(record: Record<string, unknown>, teacher: TeacherRecord): boolean {
  if (typeof record.toTeacherId === "string") return record.toTeacherId === teacher.id;
  if (record.scope === "public") return true;
  if (record.scope === "school") {
    const targetSchoolId = typeof record.toSchoolId === "string"
      ? record.toSchoolId
      : record.fromSchoolId;
    return targetSchoolId === teacher.schoolId;
  }
  return false;
}

function filterAuthorizedResult(
  service: ServiceName,
  method: string,
  result: unknown,
  teacher: TeacherRecord | null,
): unknown {
  if (
    teacher
    && service === "question"
    && ["listQuestions", "checkDuplicate"].includes(method)
    && Array.isArray(result)
  ) {
    return result.filter((item) =>
      Boolean(item)
      && typeof item === "object"
      && canReadQuestion(item as Record<string, unknown>, teacher));
  }
  return result;
}

function validateEmbeddedIdentity(
  value: unknown,
  teacher: TeacherRecord,
  admin: boolean,
  key?: string,
): void {
  if (Array.isArray(value)) {
    for (const item of value) validateEmbeddedIdentity(item, teacher, admin, key);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    if (OWNER_KEYS.includes(childKey) && typeof childValue === "string" && childValue !== teacher.id) {
      throw new Error("无权以其他教师身份执行操作");
    }
    if (SCHOOL_KEYS.includes(childKey) && typeof childValue === "string" && childValue !== teacher.schoolId) {
      throw new Error("无权访问其他学校的数据");
    }
    validateEmbeddedIdentity(childValue, teacher, admin, childKey);
  }
}

function authorize(
  state: AppState,
  session: SessionUser | null,
  service: ServiceName,
  method: string,
  args: unknown[],
): { teacher: TeacherRecord | null; args: unknown[] } {
  const call = `${service}.${method}`;
  if (!session) {
    if (PUBLIC_CALLS.has(call)) return { teacher: null, args };
    throw new Error("请先登录");
  }

  const teacher = state.teachers.find((item) => item.id === session.teacherId) || null;
  if (!teacher) throw new Error("账号关联的教师资料不存在");
  const admin = isAdmin(teacher);
  const params = (serviceParameters as Record<string, Record<string, readonly string[]>>)[service]?.[method] || [];
  const normalizedArgs = [...args];

  params.forEach((name, index) => {
    const value = normalizedArgs[index];
    if (name === "teacher") {
      normalizedArgs[index] = teacher;
      return;
    }
    if (name === "onProgress") {
      normalizedArgs[index] = undefined;
      return;
    }
    if (
      OWNER_KEYS.includes(name)
      && typeof value === "string"
      && value !== teacher.id
      && !(admin && ADMIN_TARGET_TEACHER_CALLS.has(call))
    ) {
      throw new Error("无权以其他教师身份执行操作");
    }
    if (SCHOOL_KEYS.includes(name) && typeof value === "string" && value !== teacher.schoolId) {
      throw new Error("无权访问其他学校的数据");
    }
    if (name === "schoolIdOrTeacherId" && value !== teacher.id && value !== teacher.schoolId) {
      throw new Error("无权访问该范围的数据");
    }
    validateEmbeddedIdentity(value, teacher, admin, name);
  });

  if (service !== "school" && !teacher.schoolId) {
    throw new Error("请先完成学校认证");
  }

  if (service === "share" && method === "createShare") {
    const input = normalizedArgs[0];
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("分享参数不合法");
    }
    const params = input as Record<string, unknown>;
    const collection = typeof params.resourceType === "string"
      ? SHARE_RESOURCE_COLLECTIONS[params.resourceType]
      : undefined;
    const resource = collection && typeof params.resourceId === "string"
      ? ((state[collection] || []) as Array<Record<string, unknown>>)
        .find((item) => item.id === params.resourceId)
      : undefined;
    if (!resource) throw new Error("分享资源不存在");
    if (recordOwner(resource) !== teacher.id || recordSchool(resource) !== teacher.schoolId) {
      throw new Error("无权分享不属于自己的资源");
    }
    normalizedArgs[0] = {
      ...params,
      fromTeacherId: teacher.id,
      fromSchoolId: teacher.schoolId,
    };
  }

  if (ADMIN_SERVICE_MUTATIONS.has(service) && !isReadOnly(method) && !admin) {
    throw new Error("该操作需要学校管理员权限");
  }
  if (service === "grade" && EXAM_MANAGER_MUTATIONS.has(method) && !canManageExams(teacher)) {
    throw new Error("该操作需要年级组长或学校管理员权限");
  }
  if (service === "examArrangement" && !canManageExams(teacher)) {
    throw new Error("该操作需要年级组长或学校管理员权限");
  }
  if (service === "class" && ["createSchoolClass", "updateSchoolClass"].includes(method) && !admin) {
    throw new Error("该操作需要学校管理员权限");
  }
  if (service === "ai" && typeof normalizedArgs[0] === "string") {
    const firstId = normalizedArgs[0];
    const recognition = (state.recognitions as Array<Record<string, unknown>>)
      .find((item) => item.id === firstId);
    const documentId = recognition && typeof recognition.documentId === "string"
      ? recognition.documentId
      : firstId;
    const document = (state.documents as Array<Record<string, unknown>>)
      .find((item) => item.id === documentId);
    if (document && document.teacherId !== teacher.id) {
      throw new Error("无权访问其他教师的文档识别记录");
    }
  }

  const targetCollection = TARGET_COLLECTION[service];
  const firstArg = normalizedArgs[0];
  if (targetCollection && typeof firstArg === "string") {
    const targetRecord = ((state[targetCollection] || []) as Array<Record<string, unknown>>)
      .find((item) => item.id === firstArg);
    const record = targetRecord || findRecord(state, firstArg);
    if (record) {
      let authorizedShareMutation = false;
      if (service === "share" && ["acceptShare", "rejectShare", "revokeShare"].includes(method)) {
        if (record.status !== "pending") throw new Error("该分享已处理");
        if (typeof record.expiresAt === "string" && new Date(record.expiresAt) <= new Date()) {
          throw new Error("该分享已过期");
        }
        if (method === "revokeShare") {
          if (record.fromTeacherId !== teacher.id) throw new Error("无权撤回该分享");
        } else if (!isShareRecipient(record, teacher)) {
          throw new Error("无权处理该分享");
        }
        if (method === "acceptShare") {
          normalizedArgs[1] = teacher.id;
          normalizedArgs[2] = teacher.schoolId;
        }
        authorizedShareMutation = true;
      }
      const owner = recordOwner(record);
      const school = recordSchool(record);
      const shared = record.isShared === true || record.scope === "platform" || record.scope === "school";
      if (service === "question" && targetRecord && !canReadQuestion(record, teacher)) {
        throw new Error("无权访问该资源");
      }
      if (!authorizedShareMutation && school && school !== teacher.schoolId && owner !== teacher.id && !shared) {
        throw new Error("无权访问该资源");
      }
      if (!authorizedShareMutation && !isReadOnly(method) && owner && owner !== teacher.id && !admin) {
        const allowedSharedMutation = service === "question" && method === "incrementUsage";
        if (!allowedSharedMutation) throw new Error("无权修改其他教师的资源");
      }
    }
  }

  return { teacher, args: normalizedArgs };
}

function sanitize(value: unknown): unknown {
  if (value instanceof Set) {
    return { __rpcType: "Set", values: [...value].map(sanitize) };
  }
  if (value instanceof Map) {
    return { __rpcType: "Map", entries: [...value.entries()].map(([key, child]) => [sanitize(key), sanitize(child)]) };
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key)) {
      if (key === "viewPassword" && child) output.hasViewPassword = true;
      continue;
    }
    output[key] = sanitize(child);
  }
  return output;
}

export async function invokeRpc(
  store: DatabaseStore,
  session: SessionUser | null,
  serviceName: string,
  methodName: string,
  args: unknown[],
): Promise<unknown> {
  if (!(serviceName in serviceRegistry)) throw new Error("未知服务");
  const service = serviceRegistry[serviceName as ServiceName] as Record<string, unknown>;
  const method = service[methodName];
  if (typeof method !== "function" || methodName.startsWith("_")) throw new Error("未知服务方法");

  return withSerializedState(store, async (state) => {
    const authorized = authorize(state, session, serviceName as ServiceName, methodName, args);
    const result = await runWithState(state, () => Reflect.apply(
      method as (...values: unknown[]) => unknown,
      service,
      authorized.args,
    ));
    return sanitize(filterAuthorizedResult(
      serviceName as ServiceName,
      methodName,
      result,
      authorized.teacher,
    ));
  });
}
