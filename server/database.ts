import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import Database from "better-sqlite3";
import type {
  AppState,
  ParentAccountRecord,
  ParentSessionUser,
  RegistrationAuthorizationRecord,
  SessionUser,
  StoredFile,
  TeacherRecord,
} from "./types.js";
import type { ServerConfig } from "./config.js";
import { hashPassword, verifyPassword } from "./lib/password.js";
import { DEFAULT_QUESTION_TYPES } from "../src/types/index.js";

export const COLLECTIONS = [
  "schools", "teachers", "applications", "schoolClasses", "personalClasses",
  "schoolGrades", "classTypeCategories", "students", "chapters", "knowledgePoints",
  "schoolChapters", "schoolKnowledgePoints", "questions",
  "lectures", "lectureColumnTemplates", "examPapers", "coursewares", "materials", "resourceFolders", "baskets", "documents",
  "recognitions", "answerRecords", "subjectGroups", "prepGroups", "organizationDepartments", "onlineResources",
  "prepTasks", "questionReferences", "schoolSettings", "examPaperTypes", "lectureTypes",
  "shareRecords", "examPublications", "lessonCoursewares", "reflections",
  "classroomHomeworks", "classroomNotices",
  "studentInteractions", "studentArchiveRecords", "schoolBackups", "platformResourceSettings", "platformResourceCorrections", "schoolAdminApplications",
  "schoolCreationApplications",
  "gradeExams", "gradePublications", "gradeTemplateProfiles", "gradeCohortSettings", "examArrangements",
  "notifications", "parentAuthorizations", "parentAccounts",
] as const;

type CollectionName = (typeof COLLECTIONS)[number];
type JsonRecord = { id: string; [key: string]: unknown };

interface UserRow {
  id: string;
  teacher_id: string;
  email: string | null;
  phone: string | null;
  password_hash: string;
}

interface SessionRow extends UserRow {
  csrf_token: string;
  expires_at: string;
}

interface ParentUserRow {
  id: string;
  parent_id: string;
  phone: string;
  password_hash: string;
}

interface ParentSessionRow extends ParentUserRow {
  csrf_token: string;
  expires_at: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s()-]/g, "").replace(/^\+86/, "");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function recordScope(record: JsonRecord): { schoolId: string | null; ownerId: string | null } {
  const schoolId = typeof record.schoolId === "string"
    ? record.schoolId
    : typeof record.publisherSchoolId === "string"
      ? record.publisherSchoolId
      : typeof record.fromSchoolId === "string"
        ? record.fromSchoolId
        : null;
  const ownerId = ["teacherId", "ownerId", "createdBy", "fromTeacherId", "publisherId"]
    .map((key) => record[key])
    .find((value): value is string => typeof value === "string") || null;
  return { schoolId, ownerId };
}

function publicTeacher(teacher: TeacherRecord): TeacherRecord {
  const copy = structuredClone(teacher);
  delete copy.password;
  delete copy.wechatOpenId;
  delete copy.wechatUnionId;
  delete copy.wecomUserId;
  delete copy.wecomCorpId;
  return copy;
}

export class DuplicateAccountError extends Error {}

export class DatabaseStore {
  readonly sqlite: Database.Database;
  private readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    mkdirSync(dirname(config.databasePath), { recursive: true });
    mkdirSync(config.uploadsDir, { recursive: true });
    this.sqlite = new Database(config.databasePath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.pragma("busy_timeout = 5000");
    this.migrate();
    this.seed();
    this.migrateAppData();
    this.ensureBootstrapAdmin();
  }

  close(): void {
    this.sqlite.close();
  }

  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS app_records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        school_id TEXT,
        owner_id TEXT,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS idx_records_collection_school
        ON app_records(collection, school_id);
      CREATE INDEX IF NOT EXISTS idx_records_collection_owner
        ON app_records(collection, owner_id);

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE COLLATE NOCASE,
        phone TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS parent_users (
        id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS parent_sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        parent_user_id TEXT NOT NULL REFERENCES parent_users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_parent_sessions_expiry ON parent_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        school_id TEXT,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);

      CREATE TABLE IF NOT EXISTS registration_authorizations (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('admin', 'guarantee')),
        school_id TEXT NOT NULL,
        created_by_teacher_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        consumed_by_teacher_id TEXT,
        consumed_at TEXT,
        revoked_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_registration_authorizations_active_phone
        ON registration_authorizations(phone)
        WHERE consumed_at IS NULL AND revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_registration_authorizations_school
        ON registration_authorizations(school_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_registration_authorizations_creator
        ON registration_authorizations(created_by_teacher_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    let userColumns = this.sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string; notnull: number }>;
    if (!userColumns.some((column) => column.name === "phone")) {
      this.sqlite.exec("ALTER TABLE users ADD COLUMN phone TEXT");
      this.sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL");
      userColumns = this.sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string; notnull: number }>;
    }
    if (userColumns.find((column) => column.name === "email")?.notnull === 1) {
      const foreignKeysEnabled = this.sqlite.pragma("foreign_keys", { simple: true }) === 1;
      this.sqlite.pragma("foreign_keys = OFF");
      try {
        this.sqlite.transaction(() => {
          this.sqlite.exec(`
            CREATE TABLE users_email_optional (
              id TEXT PRIMARY KEY,
              teacher_id TEXT NOT NULL UNIQUE,
              email TEXT UNIQUE COLLATE NOCASE,
              phone TEXT UNIQUE,
              password_hash TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            INSERT INTO users_email_optional(
              id, teacher_id, email, phone, password_hash, created_at, updated_at
            )
            SELECT id, teacher_id, email, phone, password_hash, created_at, updated_at FROM users;
            DROP TABLE users;
            ALTER TABLE users_email_optional RENAME TO users;
          `);
        })();
      } finally {
        if (foreignKeysEnabled) this.sqlite.pragma("foreign_keys = ON");
      }
    }
  }

  private seed(): void {
    const count = this.sqlite.prepare("SELECT COUNT(*) AS count FROM app_records").get() as { count: number };
    if (count.count === 0) {
      const seed = this.config.seedDemoData
        ? JSON.parse(readFileSync(this.config.seedStatePath, "utf8")) as AppState
        : ({ teachers: [], currentTeacherId: null } as AppState);
      const now = new Date().toISOString();
      const insert = this.sqlite.prepare(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      this.sqlite.transaction(() => {
        for (const collection of COLLECTIONS) {
          const records = Array.isArray(seed[collection]) ? seed[collection] as JsonRecord[] : [];
          for (const input of records) {
            const record = structuredClone(input);
            if (collection === "teachers") {
              delete record.password;
              delete record.wechatOpenId;
              delete record.wechatUnionId;
              delete record.wecomUserId;
              delete record.wecomCorpId;
            }
            const scope = recordScope(record);
            insert.run(collection, record.id, scope.schoolId, scope.ownerId, JSON.stringify(record), now, now);
          }
        }
        this.sqlite.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', '1')").run();
      })();
    }

    if (this.config.enableDemoAccount) {
      const teacher = this.getTeacherByEmail(this.config.demoEmail);
      if (teacher && !this.getUserByEmail(this.config.demoEmail)) {
        this.createUser(teacher.id, this.config.demoEmail, this.config.demoPassword);
      }
    }
  }

  private ensureDefaultQuestionTypes(schoolId: string, now: string): void {
    const rows = this.sqlite.prepare(
      "SELECT id, data_json FROM app_records WHERE collection = 'schoolSettings' AND school_id = ?",
    ).all(schoolId) as Array<{ id: string; data_json: string }>;
    const questionTypeSettings = rows
      .map((row) => JSON.parse(row.data_json) as JsonRecord)
      .filter((setting) => setting.type === "questionType" && typeof setting.value === "string");
    const existing = new Map(
      questionTypeSettings.map((setting) => [setting.value as string, setting]),
    );
    const legacyNames: Record<string, string[]> = {
      single: ["单选", "单选题"],
      multiple: ["多选", "多选题"],
      short: ["填空", "填空题", "简答题"],
      essay: ["解答", "解答题", "论述题"],
      judge: ["判断", "判断题"],
    };
    const isUntouchedLegacySet = questionTypeSettings.length === 5
      && questionTypeSettings.every((setting) => {
        const value = setting.value as string;
        return legacyNames[value]?.includes(String(setting.name));
      });
    let nextSortOrder = questionTypeSettings.reduce(
      (maximum, setting) => Math.max(maximum, Number(setting.sortOrder) || 0),
      0,
    );
    const update = this.sqlite.prepare(`
      UPDATE app_records
      SET school_id = ?, data_json = ?, updated_at = ?
      WHERE collection = 'schoolSettings' AND id = ?
    `);
    const insert = this.sqlite.prepare(`
      INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
      VALUES ('schoolSettings', ?, ?, NULL, ?, ?, ?)
    `);

    DEFAULT_QUESTION_TYPES.forEach((option, index) => {
      const current = existing.get(option.value);
      if (current) {
        const normalized = {
          ...current,
          schoolId,
          ...(isUntouchedLegacySet ? {
            name: option.label,
            sortOrder: index + 1,
          } : {}),
          updatedAt: now,
        };
        update.run(schoolId, JSON.stringify(normalized), now, current.id);
        return;
      }

      nextSortOrder += 1;
      const setting = {
        id: `setting-${randomUUID()}`,
        schoolId,
        type: "questionType",
        name: option.label,
        value: option.value,
        sortOrder: isUntouchedLegacySet ? index + 1 : nextSortOrder,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      insert.run(setting.id, schoolId, JSON.stringify(setting), now, now);
    });
  }

  private migrateAppData(): void {
    const row = this.sqlite.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get() as { value?: string } | undefined;
    let version = Number.parseInt(row?.value || "1", 10);

    if (version < 2) {
      const resourceCollections = [
        "questions",
        "examPapers",
        "lectures",
        "coursewares",
        "materials",
        "lessonCoursewares",
        "schoolBackups",
      ];
      const select = this.sqlite.prepare(
        `SELECT collection, id, data_json FROM app_records WHERE collection IN (${resourceCollections.map(() => "?").join(",")})`,
      );
      const update = this.sqlite.prepare(
        "UPDATE app_records SET data_json = ?, updated_at = ? WHERE collection = ? AND id = ?",
      );
      const rows = select.all(...resourceCollections) as Array<{ collection: string; id: string; data_json: string }>;
      const now = new Date().toISOString();

      this.sqlite.transaction(() => {
        for (const record of rows) {
          const data = JSON.parse(record.data_json) as JsonRecord;
          if (data.semester === undefined) {
            data.semester = "上学期";
            update.run(JSON.stringify(data), now, record.collection, record.id);
          }
        }
        const shareRows = this.sqlite.prepare(
          "SELECT collection, id, data_json FROM app_records WHERE collection = 'shareRecords'",
        ).all() as Array<{ collection: string; id: string; data_json: string }>;
        for (const record of shareRows) {
          const data = JSON.parse(record.data_json) as JsonRecord;
          const snapshot = data.resourceSnapshot as JsonRecord | undefined;
          if (snapshot && snapshot.semester === undefined) {
            snapshot.semester = "上学期";
            update.run(JSON.stringify(data), now, record.collection, record.id);
          }
        }
        this.sqlite.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', '2')").run();
      })();
      version = 2;
    }

    if (version < 3) {
      const schoolRows = this.sqlite.prepare(
        "SELECT id FROM app_records WHERE collection = 'schools'",
      ).all() as Array<{ id: string }>;
      const now = new Date().toISOString();
      this.sqlite.transaction(() => {
        for (const school of schoolRows) {
          this.ensureDefaultQuestionTypes(school.id, now);
        }
        this.sqlite.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', '3')").run();
      })();
      version = 3;
    }

    if (version < 4) {
      const now = new Date().toISOString();
      const classRows = this.sqlite.prepare(
        "SELECT id, data_json FROM app_records WHERE collection = 'schoolClasses'",
      ).all() as Array<{ id: string; data_json: string }>;
      const gradeRows = this.sqlite.prepare(
        "SELECT id, data_json FROM app_records WHERE collection = 'schoolGrades'",
      ).all() as Array<{ id: string; data_json: string }>;
      const gradesByCohort = new Map<string, JsonRecord>();
      gradeRows.forEach((row) => {
        const grade = JSON.parse(row.data_json) as JsonRecord;
        gradesByCohort.set(`${grade.schoolId}:${grade.gradYear}`, grade);
      });
      const insertRecord = this.sqlite.prepare(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const updateRecord = this.sqlite.prepare(`
        UPDATE app_records
        SET school_id = ?, owner_id = ?, data_json = ?, updated_at = ?
        WHERE collection = ? AND id = ?
      `);

      this.sqlite.transaction(() => {
        for (const row of classRows) {
          const schoolClass = JSON.parse(row.data_json) as JsonRecord;
          if (typeof schoolClass.gradeId === "string" && schoolClass.gradeId) continue;
          const schoolId = String(schoolClass.schoolId || "");
          const gradeLabel = String(schoolClass.grade || "高一");
          const explicitGradYear = Number(schoolClass.gradYear);
          const gradeYear = Number(schoolClass.gradeYear);
          const fallbackOffset = gradeLabel === "高三" ? 0 : gradeLabel === "高二" ? 1 : 2;
          const gradYear = Number.isInteger(explicitGradYear) && explicitGradYear > 0
            ? explicitGradYear
            : Number.isInteger(gradeYear) && gradeYear > 0
              ? gradeYear + 3
              : new Date().getFullYear() + fallbackOffset;
          const cohortKey = `${schoolId}:${gradYear}`;
          let grade = gradesByCohort.get(cohortKey);
          if (!grade) {
            grade = {
              id: `grade-${randomUUID()}`,
              schoolId,
              name: `${gradYear}届${gradeLabel}`,
              grade: gradeLabel,
              gradYear,
              status: schoolClass.status === "graduated" ? "graduated" : "active",
              createdBy: String(schoolClass.createdBy || "migration"),
              createdAt: String(schoolClass.createdAt || now),
              updatedAt: now,
            };
            gradesByCohort.set(cohortKey, grade);
            insertRecord.run(
              "schoolGrades",
              grade.id,
              schoolId,
              grade.createdBy,
              JSON.stringify(grade),
              grade.createdAt,
              now,
            );
          }
          schoolClass.gradeId = grade.id;
          schoolClass.gradYear = gradYear;
          if (!schoolClass.gradeYear) schoolClass.gradeYear = gradYear - 3;
          updateRecord.run(
            schoolId,
            typeof schoolClass.createdBy === "string" ? schoolClass.createdBy : null,
            JSON.stringify(schoolClass),
            now,
            "schoolClasses",
            row.id,
          );
        }

        const targetEmail = "104848931@qq.com";
        const teacherRow = this.sqlite.prepare(
          "SELECT id, data_json FROM app_records WHERE collection = 'teachers' AND lower(json_extract(data_json, '$.email')) = lower(?) LIMIT 1",
        ).get(targetEmail) as { id: string; data_json: string } | undefined;
        const schoolRow = this.sqlite.prepare(
          "SELECT id, data_json FROM app_records WHERE collection = 'schools' AND json_extract(data_json, '$.name') = ? LIMIT 1",
        ).get("江苏省前黄高级中学") as { id: string; data_json: string } | undefined;
        if (teacherRow && schoolRow) {
          const teacher = JSON.parse(teacherRow.data_json) as TeacherRecord;
          const school = JSON.parse(schoolRow.data_json) as { id: string; name: string };
          const affiliations: Array<Record<string, unknown>> = Array.isArray(teacher.affiliations)
            ? teacher.affiliations.map((item) => ({ ...item, isCurrent: false }))
            : [];
          const existingIndex = affiliations.findIndex((item) => item.schoolId === school.id);
          const current: Record<string, unknown> = existingIndex >= 0 ? affiliations[existingIndex] : {};
          const affiliationId = typeof current.id === "string" ? current.id : `aff-${randomUUID()}`;
          const promotedAffiliation = {
            ...current,
            id: affiliationId,
            teacherId: teacher.id,
            schoolId: school.id,
            schoolName: school.name,
            subject: typeof current.subject === "string" ? current.subject : "管理",
            status: "active",
            role: "platform_admin",
            roles: Array.from(new Set([...(Array.isArray(current.roles) ? current.roles : []), "principal"])),
            subjectGroupIds: Array.isArray(current.subjectGroupIds) ? current.subjectGroupIds : [],
            prepGroupIds: Array.isArray(current.prepGroupIds) ? current.prepGroupIds : [],
            isCurrent: true,
            joinedAt: typeof current.joinedAt === "string" ? current.joinedAt : now,
          };
          if (existingIndex >= 0) affiliations[existingIndex] = promotedAffiliation;
          else affiliations.push(promotedAffiliation);
          const promotedTeacher: TeacherRecord = {
            ...teacher,
            schoolId: school.id,
            status: "active",
            role: "platform_admin",
            roles: Array.from(new Set([...(Array.isArray(teacher.roles) ? teacher.roles : []), "principal"])),
            affiliations,
            currentAffiliationId: affiliationId,
          };
          updateRecord.run(
            school.id,
            teacher.id,
            JSON.stringify(promotedTeacher),
            now,
            "teachers",
            teacherRow.id,
          );
        }

        this.sqlite.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', '4')").run();
      })();
      version = 4;
    }

    if (version < 5) {
      const now = new Date().toISOString();
      const applicationRows = this.sqlite.prepare(
        "SELECT data_json FROM app_records WHERE collection = 'applications'",
      ).all() as Array<{ data_json: string }>;
      const registrationApplications = applicationRows
        .map((record) => JSON.parse(record.data_json) as JsonRecord)
        .filter((application) => application.registrationApplication === true);
      const applicationByTeacher = new Map(
        registrationApplications.map((application) => [String(application.teacherId || ""), application]),
      );
      const teacherRows = this.sqlite.prepare(
        "SELECT id, data_json FROM app_records WHERE collection = 'teachers'",
      ).all() as Array<{ id: string; data_json: string }>;
      const updateTeacher = this.sqlite.prepare(`
        UPDATE app_records
        SET school_id = NULL, owner_id = ?, data_json = ?, updated_at = ?
        WHERE collection = 'teachers' AND id = ?
      `);

      this.sqlite.transaction(() => {
        for (const row of teacherRows) {
          const teacher = JSON.parse(row.data_json) as TeacherRecord;
          const application = applicationByTeacher.get(teacher.id);
          if (!application || !["pending", "rejected"].includes(String(application.status))) continue;
          const personal = teacher.affiliations?.find((item) => item.schoolId == null && item.status === "active");
          if (!personal || typeof personal.id !== "string") continue;
          const affiliations = teacher.affiliations.map((item) => ({
            ...item,
            isCurrent: item.id === personal.id,
          }));
          const migrated: TeacherRecord = {
            ...teacher,
            schoolId: null,
            subject: typeof personal.subject === "string" ? personal.subject : teacher.subject,
            teachingGrades: Array.isArray(personal.teachingGrades) ? personal.teachingGrades as string[] : [],
            teachingClassIds: Array.isArray(personal.teachingClassIds) ? personal.teachingClassIds as string[] : [],
            homeroomClassIds: Array.isArray(personal.homeroomClassIds) ? personal.homeroomClassIds as string[] : [],
            status: "active",
            role: (personal.role || "teacher") as TeacherRecord["role"],
            roles: Array.isArray(personal.roles) ? personal.roles as string[] : ["teacher"],
            subjectGroupIds: Array.isArray(personal.subjectGroupIds) ? personal.subjectGroupIds as string[] : [],
            prepGroupIds: Array.isArray(personal.prepGroupIds) ? personal.prepGroupIds as string[] : [],
            affiliations,
            currentAffiliationId: personal.id,
          };
          updateTeacher.run(teacher.id, JSON.stringify(migrated), now, row.id);
        }
        this.sqlite.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES ('schema_version', '5')").run();
      })();
    }
  }

  private ensureBootstrapAdmin(): void {
    const email = this.config.bootstrapAdminEmail.trim().toLowerCase();
    const password = this.config.bootstrapAdminPassword;
    if (!email && !password) {
      const users = this.sqlite.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
      if (!this.config.seedDemoData && users.count === 0) {
        throw new Error("生产空库必须设置 bootstrap 管理员邮箱和密码");
      }
      return;
    }
    if (!email || !password) {
      throw new Error("bootstrap 管理员邮箱和密码必须同时设置");
    }
    if (password.length < 12) {
      throw new Error("bootstrap 管理员密码至少需要 12 位");
    }
    if (this.getUserByEmail(email)) return;

    let schoolRow = this.sqlite.prepare(
      "SELECT data_json FROM app_records WHERE collection = 'schools' AND id = ?",
    ).get(this.config.bootstrapSchoolId) as { data_json: string } | undefined;
    if (!schoolRow) {
      const now = new Date().toISOString();
      const school = {
        id: this.config.bootstrapSchoolId,
        name: this.config.bootstrapSchoolName,
        code: this.config.bootstrapSchoolCode,
        logo: this.config.bootstrapSchoolName.charAt(0) || "校",
        description: "由生产环境 bootstrap 配置创建",
        teacherCount: 1,
        studentCount: 0,
        city: this.config.bootstrapSchoolCity,
      };
      this.sqlite.prepare(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('schools', ?, ?, NULL, ?, ?, ?)
      `).run(school.id, school.id, JSON.stringify(school), now, now);
      this.ensureDefaultQuestionTypes(school.id, now);
      schoolRow = { data_json: JSON.stringify(school) };
    }
    const school = JSON.parse(schoolRow.data_json) as { id: string; name: string };
    const now = new Date().toISOString();
    const existing = this.getTeacherByEmail(email);
    const teacherId = existing?.id || randomUUID();
    const affiliationId = existing?.currentAffiliationId || randomUUID();
    const teacher: TeacherRecord = {
      ...(existing || {}),
      id: teacherId,
      email,
      name: this.config.bootstrapAdminName,
      nickname: existing?.nickname || "",
      avatar: this.config.bootstrapAdminName.charAt(0) || "管",
      schoolId: school.id,
      subject: existing?.subject || "管理",
      status: "active",
      role: "platform_admin",
      roles: ["principal"],
      subjectGroupIds: existing?.subjectGroupIds || [],
      prepGroupIds: existing?.prepGroupIds || [],
      affiliations: [{
        id: affiliationId,
        teacherId,
        schoolId: school.id,
        schoolName: school.name,
        subject: existing?.subject || "管理",
        status: "active",
        role: "platform_admin",
        roles: ["principal"],
        subjectGroupIds: existing?.subjectGroupIds || [],
        prepGroupIds: existing?.prepGroupIds || [],
        isCurrent: true,
        joinedAt: now,
      }],
      currentAffiliationId: affiliationId,
      createdAt: existing?.createdAt || now,
    };

    this.sqlite.transaction(() => {
      const scope = recordScope(teacher as JsonRecord);
      this.sqlite.prepare(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('teachers', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(collection, id) DO UPDATE SET
          school_id = excluded.school_id,
          owner_id = excluded.owner_id,
          data_json = excluded.data_json,
          updated_at = excluded.updated_at
      `).run(teacher.id, scope.schoolId, teacher.id, JSON.stringify(teacher), teacher.createdAt, now);
      this.createUser(teacher.id, email, password);
    })();
  }

  loadState(): AppState {
    const state: AppState = { teachers: [], currentTeacherId: null };
    for (const collection of COLLECTIONS) state[collection] = [];
    const rows = this.sqlite.prepare("SELECT collection, data_json FROM app_records ORDER BY rowid").all() as Array<{ collection: CollectionName; data_json: string }>;
    for (const row of rows) {
      const list = state[row.collection] as JsonRecord[];
      list.push(JSON.parse(row.data_json) as JsonRecord);
    }
    state.teachers = (state.teachers || []).map(publicTeacher);
    return state;
  }

  saveState(before: AppState, after: AppState): void {
    const insert = this.sqlite.prepare(`
      INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(collection, id) DO UPDATE SET
        school_id = excluded.school_id,
        owner_id = excluded.owner_id,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `);
    const remove = this.sqlite.prepare("DELETE FROM app_records WHERE collection = ? AND id = ?");
    const now = new Date().toISOString();

    this.sqlite.transaction(() => {
      for (const collection of COLLECTIONS) {
        const oldRecords = new Map(((before[collection] || []) as JsonRecord[]).map((item) => [item.id, item]));
        const newRecords = new Map(((after[collection] || []) as JsonRecord[]).map((item) => [item.id, item]));
        for (const [id] of oldRecords) {
          if (!newRecords.has(id)) remove.run(collection, id);
        }
        for (const [id, input] of newRecords) {
          const record = structuredClone(input);
          if (collection === "teachers") {
            delete record.password;
            delete record.wechatOpenId;
            delete record.wechatUnionId;
            delete record.wecomUserId;
            delete record.wecomCorpId;
          }
          if (JSON.stringify(oldRecords.get(id)) === JSON.stringify(record)) continue;
          const scope = recordScope(record);
          const createdAt = typeof record.createdAt === "string" ? record.createdAt : now;
          insert.run(collection, id, scope.schoolId, scope.ownerId, JSON.stringify(record), createdAt, now);
        }
      }
    })();
  }

  getTeacherByEmail(email: string): TeacherRecord | null {
    const row = this.sqlite.prepare(
      "SELECT data_json FROM app_records WHERE collection = 'teachers' AND lower(json_extract(data_json, '$.email')) = lower(?) LIMIT 1",
    ).get(normalizeEmail(email)) as { data_json: string } | undefined;
    return row ? publicTeacher(JSON.parse(row.data_json) as TeacherRecord) : null;
  }

  getTeacherById(id: string): TeacherRecord | null {
    const row = this.sqlite.prepare(
      "SELECT data_json FROM app_records WHERE collection = 'teachers' AND id = ?",
    ).get(id) as { data_json: string } | undefined;
    return row ? publicTeacher(JSON.parse(row.data_json) as TeacherRecord) : null;
  }

  private getUserByEmail(email: string): UserRow | null {
    if (!email.trim()) return null;
    return (this.sqlite.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(normalizeEmail(email)) as UserRow | undefined) || null;
  }

  createUser(teacherId: string, email: string | null | undefined, password: string, phone: string | null = null): string {
    const normalized = email?.trim() ? normalizeEmail(email) : null;
    if (normalized && this.getUserByEmail(normalized)) throw new DuplicateAccountError("该邮箱已注册");
    if (phone && this.getUserByPhone(phone)) throw new DuplicateAccountError("该手机号已注册");
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      this.sqlite.prepare(`
        INSERT INTO users(id, teacher_id, email, phone, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, teacherId, normalized, phone, hashPassword(password), now, now);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        if (phone && this.getUserByPhone(phone)) throw new DuplicateAccountError("该手机号已注册");
        if (normalized && this.getUserByEmail(normalized)) throw new DuplicateAccountError("该邮箱已注册");
        throw new DuplicateAccountError("账号已存在");
      }
      throw error;
    }
    return id;
  }

  createAccount(teacher: TeacherRecord, password: string): string {
    return this.sqlite.transaction(() => {
      this.insertTeacher(teacher);
      return this.createUser(teacher.id, teacher.email, password);
    })();
  }

  getAvailableRegistrationAuthorization(phone: string): RegistrationAuthorizationRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id FROM registration_authorizations
      WHERE phone = ? AND consumed_at IS NULL AND revoked_at IS NULL
      LIMIT 1
    `).get(phone) as { id: string } | undefined;
    return row ? this.getRegistrationAuthorization(row.id) : null;
  }

  createAuthorizedAccount(
    teacher: TeacherRecord,
    password: string,
    phone: string,
    options: {
      newSchool?: {
        id: string;
        name: string;
        code: string;
        logo: string;
        description: string;
        teacherCount: number;
        studentCount: number;
        city: string;
      };
    } = {},
  ): string {
    return this.sqlite.transaction(() => {
      if (this.getUserByPhone(phone)) throw new DuplicateAccountError("该手机号已注册");
      const authorization = this.getAvailableRegistrationAuthorization(phone);
      if (!authorization) {
        const error = new Error("该手机号尚未获得注册授权，请联系学校管理员或现有教师担保") as Error & { statusCode: number };
        error.statusCode = 403;
        throw error;
      }

      const now = new Date().toISOString();
      if (options.newSchool) {
        const duplicate = this.sqlite.prepare(`
          SELECT 1 FROM app_records
          WHERE collection = 'schools'
            AND (lower(json_extract(data_json, '$.code')) = lower(?)
              OR lower(json_extract(data_json, '$.name')) = lower(?))
          LIMIT 1
        `).get(options.newSchool.code, options.newSchool.name);
        if (duplicate) throw new DuplicateAccountError("学校名称或代码已存在");
        this.sqlite.prepare(`
          INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
          VALUES ('schools', ?, ?, NULL, ?, ?, ?)
        `).run(
          options.newSchool.id,
          options.newSchool.id,
          JSON.stringify(options.newSchool),
          now,
          now,
        );
      } else if (teacher.schoolId && teacher.status === "active") {
        const row = this.sqlite.prepare(`
          SELECT data_json FROM app_records WHERE collection = 'schools' AND id = ?
        `).get(teacher.schoolId) as { data_json: string } | undefined;
        if (!row) throw new Error("学校不存在");
        const school = JSON.parse(row.data_json) as Record<string, unknown>;
        school.teacherCount = Number(school.teacherCount || 0) + 1;
        this.sqlite.prepare(`
          UPDATE app_records SET data_json = ?, updated_at = ?
          WHERE collection = 'schools' AND id = ?
        `).run(JSON.stringify(school), now, teacher.schoolId);
      }

      this.insertTeacher(teacher);
      const userId = this.createUser(teacher.id, teacher.email, password, phone);
      const result = this.sqlite.prepare(`
        UPDATE registration_authorizations
        SET consumed_by_teacher_id = ?, consumed_at = ?
        WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL
      `).run(teacher.id, now, authorization.id);
      if (result.changes !== 1) {
        const error = new Error("注册授权已被使用，请联系学校管理员重新添加") as Error & { statusCode: number };
        error.statusCode = 409;
        throw error;
      }
      return userId;
    })();
  }

  authenticate(identifier: string, password: string): UserRow | null {
    const normalizedPhone = normalizePhone(identifier);
    const user = /^1[3-9]\d{9}$/.test(normalizedPhone)
      ? this.getUserByPhone(normalizedPhone)
      : this.getUserByEmail(identifier);
    if (!user || !verifyPassword(password, user.password_hash)) return null;
    return user;
  }

  getUserByPhone(phone: string): UserRow | null {
    return (this.sqlite.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as UserRow | undefined) || null;
  }

  bindAccountEmail(userId: string, teacherId: string, email: string): TeacherRecord {
    const normalized = normalizeEmail(email);
    const existing = this.getUserByEmail(normalized);
    if (existing && existing.id !== userId) throw new DuplicateAccountError("该邮箱已注册");

    try {
      return this.sqlite.transaction(() => {
        const row = this.sqlite.prepare(
          "SELECT data_json FROM app_records WHERE collection = 'teachers' AND id = ?",
        ).get(teacherId) as { data_json: string } | undefined;
        if (!row) throw new Error("教师不存在");
        const teacher = JSON.parse(row.data_json) as TeacherRecord;
        teacher.email = normalized;
        const now = new Date().toISOString();
        this.sqlite.prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ?")
          .run(normalized, now, userId);
        this.sqlite.prepare(`
          UPDATE app_records SET data_json = ?, updated_at = ?
          WHERE collection = 'teachers' AND id = ?
        `).run(JSON.stringify(teacher), now, teacherId);
        return publicTeacher(teacher);
      })();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        throw new DuplicateAccountError("该邮箱已注册");
      }
      throw error;
    }
  }

  createRegistrationAuthorization(input: Omit<RegistrationAuthorizationRecord, "createdByName" | "consumedByName">): RegistrationAuthorizationRecord {
    if (this.getUserByPhone(input.phone)) throw new DuplicateAccountError("该手机号已注册");
    try {
      this.sqlite.prepare(`
        INSERT INTO registration_authorizations(
          id, phone, kind, school_id, created_by_teacher_id, created_at,
          consumed_by_teacher_id, consumed_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      `).run(
        input.id,
        input.phone,
        input.kind,
        input.schoolId,
        input.createdByTeacherId,
        input.createdAt,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) {
        const conflict = new Error("该手机号已在注册授权名单中") as Error & { statusCode: number };
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    }
    return this.getRegistrationAuthorization(input.id)!;
  }

  private getRegistrationAuthorization(id: string): RegistrationAuthorizationRecord | null {
    const row = this.sqlite.prepare(`
      SELECT
        authorization.id,
        authorization.phone,
        authorization.kind,
        authorization.school_id AS schoolId,
        authorization.created_by_teacher_id AS createdByTeacherId,
        authorization.created_at AS createdAt,
        authorization.consumed_by_teacher_id AS consumedByTeacherId,
        authorization.consumed_at AS consumedAt,
        authorization.revoked_at AS revokedAt,
        json_extract(creator.data_json, '$.name') AS createdByName,
        json_extract(consumer.data_json, '$.name') AS consumedByName
      FROM registration_authorizations authorization
      LEFT JOIN app_records creator
        ON creator.collection = 'teachers' AND creator.id = authorization.created_by_teacher_id
      LEFT JOIN app_records consumer
        ON consumer.collection = 'teachers' AND consumer.id = authorization.consumed_by_teacher_id
      WHERE authorization.id = ?
    `).get(id) as RegistrationAuthorizationRecord | undefined;
    return row || null;
  }

  listRegistrationAuthorizations(input: {
    schoolId: string;
    requesterTeacherId: string;
    canManageSchool: boolean;
  }): RegistrationAuthorizationRecord[] {
    const where = input.canManageSchool
      ? "authorization.school_id = ?"
      : "authorization.created_by_teacher_id = ?";
    const parameter = input.canManageSchool ? input.schoolId : input.requesterTeacherId;
    return this.sqlite.prepare(`
      SELECT
        authorization.id,
        authorization.phone,
        authorization.kind,
        authorization.school_id AS schoolId,
        authorization.created_by_teacher_id AS createdByTeacherId,
        authorization.created_at AS createdAt,
        authorization.consumed_by_teacher_id AS consumedByTeacherId,
        authorization.consumed_at AS consumedAt,
        authorization.revoked_at AS revokedAt,
        json_extract(creator.data_json, '$.name') AS createdByName,
        json_extract(consumer.data_json, '$.name') AS consumedByName
      FROM registration_authorizations authorization
      LEFT JOIN app_records creator
        ON creator.collection = 'teachers' AND creator.id = authorization.created_by_teacher_id
      LEFT JOIN app_records consumer
        ON consumer.collection = 'teachers' AND consumer.id = authorization.consumed_by_teacher_id
      WHERE ${where} AND authorization.revoked_at IS NULL
      ORDER BY authorization.created_at DESC
    `).all(parameter) as RegistrationAuthorizationRecord[];
  }

  revokeRegistrationAuthorization(input: {
    id: string;
    schoolId: string;
    requesterTeacherId: string;
    canManageSchool: boolean;
  }): void {
    const authorization = this.getRegistrationAuthorization(input.id);
    if (!authorization || authorization.revokedAt) throw new Error("注册授权不存在");
    const canRevoke = input.canManageSchool
      ? authorization.schoolId === input.schoolId
      : authorization.createdByTeacherId === input.requesterTeacherId;
    if (!canRevoke) throw new Error("无权撤销该注册授权");
    if (authorization.consumedAt) throw new Error("已使用的注册授权不能撤销");
    this.sqlite.prepare(`
      UPDATE registration_authorizations SET revoked_at = ?
      WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL
    `).run(new Date().toISOString(), input.id);
  }

  getParentUserByPhone(phone: string): ParentUserRow | null {
    const normalized = normalizePhone(phone);
    return (this.sqlite.prepare("SELECT * FROM parent_users WHERE phone = ?").get(normalized) as ParentUserRow | undefined) || null;
  }

  getParentById(id: string): ParentAccountRecord | null {
    const row = this.sqlite.prepare(
      "SELECT data_json FROM app_records WHERE collection = 'parentAccounts' AND id = ?",
    ).get(id) as { data_json: string } | undefined;
    return row ? JSON.parse(row.data_json) as ParentAccountRecord : null;
  }

  createParentAccount(input: { name: string; phone: string; password: string }): { user: ParentUserRow; parent: ParentAccountRecord } {
    const phone = normalizePhone(input.phone);
    if (this.getParentUserByPhone(phone)) throw new DuplicateAccountError("该手机号已注册家长账号");
    const now = new Date().toISOString();
    const parent: ParentAccountRecord = {
      id: randomUUID(),
      name: input.name.trim(),
      phone,
      createdAt: now,
      updatedAt: now,
    };
    const user: ParentUserRow = {
      id: randomUUID(),
      parent_id: parent.id,
      phone,
      password_hash: hashPassword(input.password),
    };

    this.sqlite.transaction(() => {
      this.sqlite.prepare(`
        INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
        VALUES ('parentAccounts', ?, NULL, ?, ?, ?, ?)
      `).run(parent.id, parent.id, JSON.stringify(parent), now, now);
      this.sqlite.prepare(`
        INSERT INTO parent_users(id, parent_id, phone, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(user.id, user.parent_id, user.phone, user.password_hash, now, now);
    })();
    return { user, parent };
  }

  authenticateParent(phone: string, password: string): ParentUserRow | null {
    const user = this.getParentUserByPhone(phone);
    if (!user || !verifyPassword(password, user.password_hash)) return null;
    return user;
  }

  createParentSession(user: ParentUserRow): { token: string; session: ParentSessionUser } {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const now = new Date();
    const expires = new Date(now.getTime() + this.config.sessionDays * 86400000);
    const sessionId = randomUUID();
    this.sqlite.prepare(`
      INSERT INTO parent_sessions(id, token_hash, csrf_token, parent_user_id, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, hashToken(token), csrfToken, user.id, expires.toISOString(), now.toISOString(), now.toISOString());
    return {
      token,
      session: {
        userId: user.id,
        parentId: user.parent_id,
        phone: user.phone,
        csrfToken,
        expiresAt: expires.toISOString(),
      },
    };
  }

  getParentSession(token: string | undefined): ParentSessionUser | null {
    if (!token) return null;
    const now = new Date().toISOString();
    const row = this.sqlite.prepare(`
      SELECT parent_users.id, parent_users.parent_id, parent_users.phone, parent_users.password_hash,
             parent_sessions.csrf_token, parent_sessions.expires_at
      FROM parent_sessions JOIN parent_users ON parent_users.id = parent_sessions.parent_user_id
      WHERE parent_sessions.token_hash = ? AND parent_sessions.expires_at > ?
    `).get(hashToken(token), now) as ParentSessionRow | undefined;
    if (!row) return null;
    this.sqlite.prepare("UPDATE parent_sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, hashToken(token));
    return {
      userId: row.id,
      parentId: row.parent_id,
      phone: row.phone,
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
    };
  }

  deleteParentSession(token: string | undefined): void {
    if (token) this.sqlite.prepare("DELETE FROM parent_sessions WHERE token_hash = ?").run(hashToken(token));
  }

  changePassword(userId: string, currentPassword: string, newPassword: string): void {
    const user = this.sqlite.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      throw new Error("当前密码错误");
    }
    this.sqlite.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(hashPassword(newPassword), new Date().toISOString(), userId);
    this.sqlite.prepare("DELETE FROM sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT 1)")
      .run(userId, userId);
  }

  resetPasswordByTeacherId(teacherId: string, newPassword: string): void {
    const user = this.sqlite.prepare("SELECT id FROM users WHERE teacher_id = ?").get(teacherId) as { id: string } | undefined;
    if (!user) throw new Error("该教师尚未创建登录账号");
    const now = new Date().toISOString();
    this.sqlite.transaction(() => {
      this.sqlite.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .run(hashPassword(newPassword), now, user.id);
      this.sqlite.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    })();
  }

  createSession(user: UserRow): { token: string; session: SessionUser } {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    const now = new Date();
    const expires = new Date(now.getTime() + this.config.sessionDays * 86400000);
    const sessionId = randomUUID();
    this.sqlite.prepare(`
      INSERT INTO sessions(id, token_hash, csrf_token, user_id, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, hashToken(token), csrfToken, user.id, expires.toISOString(), now.toISOString(), now.toISOString());
    return {
      token,
      session: {
        userId: user.id,
        teacherId: user.teacher_id,
        email: user.email,
        csrfToken,
        expiresAt: expires.toISOString(),
      },
    };
  }

  getSession(token: string | undefined): SessionUser | null {
    if (!token) return null;
    const now = new Date().toISOString();
    const row = this.sqlite.prepare(`
      SELECT users.id, users.teacher_id, users.email, users.password_hash,
             sessions.csrf_token, sessions.expires_at
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashToken(token), now) as SessionRow | undefined;
    if (!row) return null;
    this.sqlite.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, hashToken(token));
    return {
      userId: row.id,
      teacherId: row.teacher_id,
      email: row.email,
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
    };
  }

  deleteSession(token: string | undefined): void {
    if (token) this.sqlite.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }

  cleanupSessions(): void {
    this.sqlite.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(new Date().toISOString());
    this.sqlite.prepare("DELETE FROM parent_sessions WHERE expires_at <= ?").run(new Date().toISOString());
  }

  insertTeacher(teacher: TeacherRecord): void {
    const clean = publicTeacher(teacher);
    const now = new Date().toISOString();
    const scope = recordScope(clean as JsonRecord);
    this.sqlite.prepare(`
      INSERT INTO app_records(collection, id, school_id, owner_id, data_json, created_at, updated_at)
      VALUES ('teachers', ?, ?, ?, ?, ?, ?)
    `).run(clean.id, scope.schoolId, clean.id, JSON.stringify(clean), clean.createdAt || now, now);
  }

  saveFile(file: StoredFile): void {
    this.sqlite.prepare(`
      INSERT INTO files(id, owner_id, school_id, original_name, mime_type, size, storage_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(file.id, file.ownerId, file.schoolId, file.originalName, file.mimeType, file.size, file.storageName, file.createdAt);
  }

  getFile(id: string): StoredFile | null {
    const row = this.sqlite.prepare(`
      SELECT id, owner_id AS ownerId, school_id AS schoolId, original_name AS originalName,
             mime_type AS mimeType, size, storage_name AS storageName, created_at AS createdAt
      FROM files WHERE id = ?
    `).get(id) as StoredFile | undefined;
    return row || null;
  }
}
