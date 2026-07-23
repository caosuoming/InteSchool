import type {
  School, Teacher, SchoolClass, PersonalClass, Student,
  Chapter, KnowledgePoint, Question, Lecture, Basket,
  DocumentRecord, RecognitionResult, AnswerRecord, SchoolApplication,
  SubjectGroup, PrepGroup, OnlineResource,
  PrepTask, QuestionReference, SchoolSetting,
  ExamPaper, Courseware, Material,
  ShareRecord, ExamPublication, LessonCourseware,
  Reflection, StudentInteraction, SchoolResourceBackup,
  ClassTypeCategory, ExamPaperType, LectureType,
} from "@/types";
import {
  seedSchools, seedTeachers, seedSchoolClasses, seedPersonalClasses, seedStudents,
  seedChapters, seedKnowledgePoints, seedQuestions, seedLectures, seedBaskets,
  seedDocuments, seedRecognitions, seedAnswerRecords, seedApplications,
  seedSubjectGroups, seedPrepGroups, seedOnlineResources,
  seedPrepTasks, seedQuestionReferences, seedSchoolSettings,
  seedExamPapers, seedCoursewares, seedMaterials, seedClassTypeCategories,
  seedExamPaperTypes, seedLectureTypes,
} from "./seed";
import { storage } from "./_shared";

// 数据库表结构
export interface DBSchema {
  schools: School[];
  teachers: Teacher[];
  applications: SchoolApplication[];
  schoolClasses: SchoolClass[];
  personalClasses: PersonalClass[];
  classTypeCategories: ClassTypeCategory[];
  students: Student[];
  chapters: Chapter[];
  knowledgePoints: KnowledgePoint[];
  questions: Question[];
  lectures: Lecture[];
  examPapers: ExamPaper[];
  coursewares: Courseware[];
  materials: Material[];
  baskets: Basket[];
  documents: DocumentRecord[];
  recognitions: RecognitionResult[];
  answerRecords: AnswerRecord[];
  subjectGroups: SubjectGroup[];
  prepGroups: PrepGroup[];
  onlineResources: OnlineResource[];
  prepTasks: PrepTask[];
  questionReferences: QuestionReference[];
  schoolSettings: SchoolSetting[];
  examPaperTypes: ExamPaperType[];
  lectureTypes: LectureType[];
  shareRecords: ShareRecord[];
  examPublications: ExamPublication[];
  lessonCoursewares: LessonCourseware[];
  reflections: Reflection[];
  studentInteractions: StudentInteraction[];
  schoolBackups: SchoolResourceBackup[];
  currentTeacherId: string | null;
}

const DB_KEY = "db";
const DB_VERSION_KEY = "db-version";
const CURRENT_DB_VERSION = "2026-07-19-v1";

// 默认种子数据
function getSeedData(): DBSchema {
  return {
    schools: seedSchools,
    teachers: seedTeachers,
    applications: seedApplications,
    schoolClasses: seedSchoolClasses,
    personalClasses: seedPersonalClasses,
    classTypeCategories: seedClassTypeCategories,
    students: seedStudents,
    chapters: seedChapters,
    knowledgePoints: seedKnowledgePoints,
    questions: seedQuestions,
    lectures: seedLectures,
    examPapers: seedExamPapers,
    coursewares: seedCoursewares,
    materials: seedMaterials,
    baskets: seedBaskets,
    documents: seedDocuments,
    recognitions: seedRecognitions,
    answerRecords: seedAnswerRecords,
    subjectGroups: seedSubjectGroups,
    prepGroups: seedPrepGroups,
    onlineResources: seedOnlineResources,
    prepTasks: seedPrepTasks,
    questionReferences: seedQuestionReferences,
    schoolSettings: seedSchoolSettings,
    examPaperTypes: seedExamPaperTypes,
    lectureTypes: seedLectureTypes,
    shareRecords: [],
    examPublications: [],
    lessonCoursewares: [],
    reflections: [],
    studentInteractions: [],
    schoolBackups: [],
    currentTeacherId: null,
  };
}

let inMemoryDB: DBSchema | null = null;

/**
 * 计算题目查重哈希
 * 基于题干+选项+答案的归一化文本生成简易哈希
 * 用于入库时检测重复题目
 */
export function computeDuplicateHash(
  stem: string,
  answer: string,
  options?: string[],
): string {
  const normalize = (s: string) =>
    s
      .replace(/\s+/g, "")
      .replace(/[，。、；：！？“”"'（）()【】]/g, "")
      .split("[").join("")
      .split("]").join("")
      .toLowerCase();
  const parts = [normalize(stem)];
  if (options && options.length > 0) {
    parts.push(options.map(normalize).join("|"));
  }
  parts.push(normalize(answer));
  const content = parts.join("::");

  // 简易哈希函数（djb2）
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) + hash) + content.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return "qh" + Math.abs(hash).toString(36);
}

function addDefaultFields(db: DBSchema): DBSchema {
  // 用答题记录中的最新答题时间为题目设置 lastUsedAt
  const questionLastUsed = new Map<string, string>();
  db.answerRecords.forEach((a) => {
    const qid = a.questionId;
    if (!questionLastUsed.has(qid) || a.answeredAt > questionLastUsed.get(qid)!) {
      questionLastUsed.set(qid, a.answeredAt);
    }
  });

  db.questions = db.questions.map((q, i) => {
    const remarks = q.remark ? [{
      id: `rm-${q.id}-1`,
      content: q.remark,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }] : [];
    return {
      grade: "高一",
      schoolYear: "2025-2026",
      sourceType: (["imported", "manual", "shared"] as const)[i % 3],
      category: (["practice", "exam", "homework", "review"] as const)[i % 4],
      lastUsedAt: questionLastUsed.get(q.id) || (q.usageCount > 0 ? q.updatedAt : undefined),
      remarks,
      sectionOrder: (q as any).sectionOrder || ["chapter", "knowledge", "remark"],
      ...q,
    };
  });
  // 兼容老数据：给教师补充 roles/subjectGroupIds/prepGroupIds
  db.teachers = db.teachers.map((t) => ({
    ...t,
    roles: (t as any).roles || ["teacher"],
    subjectGroupIds: (t as any).subjectGroupIds || [],
    prepGroupIds: (t as any).prepGroupIds || [],
  }));
  // 兼容老数据：给教师补充 affiliations 和 currentAffiliationId
  db.teachers = db.teachers.map((t) => {
    if (t.affiliations && t.affiliations.length > 0) return t;
    const defaultAff = {
      id: `aff-default-${t.id}`,
      teacherId: t.id,
      schoolId: t.schoolId,
      schoolName: t.schoolId
        ? db.schools.find((s) => s.id === t.schoolId)?.name || null
        : null,
      subject: t.subject,
      employeeNo: t.employeeNo,
      status: t.status,
      role: t.role,
      roles: t.roles,
      subjectGroupIds: t.subjectGroupIds,
      prepGroupIds: t.prepGroupIds,
      isCurrent: true,
      joinedAt: t.createdAt,
    };
    return {
      ...t,
      affiliations: [defaultAff],
      currentAffiliationId: defaultAff.id,
    };
  });
  // 兼容老数据：补充新表
  if (!db.examPapers) db.examPapers = [];
  if (!db.coursewares) db.coursewares = [];
  if (!db.materials) db.materials = [];
  if (!db.shareRecords) db.shareRecords = [];
  if (!db.examPublications) db.examPublications = [];
  if (!db.lessonCoursewares) db.lessonCoursewares = [];
  if (!db.reflections) db.reflections = [];
  if (!db.studentInteractions) db.studentInteractions = [];
  if (!db.schoolBackups) db.schoolBackups = [];
  if (!db.classTypeCategories) db.classTypeCategories = seedClassTypeCategories;
  if (!db.examPaperTypes) db.examPaperTypes = seedExamPaperTypes;
  if (!db.lectureTypes) db.lectureTypes = seedLectureTypes;

  // 兼容老数据：给班级补充 gradeYear / gradYear / classTypeId
  const currentYear = new Date().getFullYear();
  const gradeYearMap: Record<string, number> = {
    "高三": currentYear,
    "高二": currentYear + 1,
    "高一": currentYear + 2,
    "初三": currentYear,
    "初二": currentYear + 1,
    "初一": currentYear + 2,
  };
  db.schoolClasses = db.schoolClasses.map((c) => {
    if (c.gradeYear && c.gradYear && c.classTypeId) return c;
    const gy = c.gradeYear ?? gradeYearMap[c.grade] ?? currentYear;
    return {
      ...c,
      gradeYear: gy,
      gradYear: c.gradYear ?? gy + 3,
      classTypeId: c.classTypeId,
    };
  });

  // 为已有题目计算查重哈希（如未设置）
  db.questions = db.questions.map((q) => ({
    ...q,
    duplicateHash: q.duplicateHash || computeDuplicateHash(q.stem, q.answer, q.options),
    hiddenByExamIds: q.hiddenByExamIds || [],
  }));

  // 注入示例校本资源备份数据（若空）
  if (!db.schoolBackups || db.schoolBackups.length === 0) {
    db.schoolBackups = generateSeedSchoolBackups();
  }

  // 兼容老数据：给已有试题篮补充 materialIds 字段
  db.baskets = db.baskets.map((b) => ({
    ...b,
    materialIds: (b as any).materialIds || [],
  }));

  // 兼容老数据：给学生补充 status 字段
  db.students = db.students.map((s) => ({
    ...s,
    status: (s as any).status || "active",
  }));

  // 同步学生年级与班级年级（处理班级升级后学生年级未更新的情况）
  const classGradeMap = new Map(db.schoolClasses.map((c) => [c.id, c.grade]));
  db.students = db.students.map((s) => {
    const classGrade = classGradeMap.get(s.classId);
    if (classGrade && classGrade !== s.grade) {
      return { ...s, grade: classGrade };
    }
    return s;
  });

  return db;
}

/**
 * 生成示例校本资源备份数据
 * 模拟"教师将资源发布给非自己所教班级时自动备份"的场景
 */
function generateSeedSchoolBackups(): SchoolResourceBackup[] {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString();
  return [
    {
      id: "sbk-seed-1",
      schoolId: "sch-1",
      resourceType: "examPaper",
      sourceResourceId: "exam-1",
      title: "高一数学期中模拟试卷",
      description: "覆盖函数与基本初等函数章节",
      contentSnapshot: JSON.stringify({
        questions: 18,
        totalScore: 150,
        duration: 120,
      }),
      fromTeacherId: "tch-1",
      backupReason: "试卷发布到非所教班级（2 个班级）",
      targetClassIds: ["cls-3", "cls-4"],
      chapterIds: [],
      knowledgePointIds: [],
      grade: "高一",
      schoolYear: "2025-2026",
      meta: {
        题目数: "18",
        总分: "150",
        时长: "120分钟",
        状态: "已发布",
      },
      createdAt: lastWeek,
      updatedAt: lastWeek,
    },
    {
      id: "sbk-seed-2",
      schoolId: "sch-1",
      resourceType: "lecture",
      sourceResourceId: "lec-1",
      title: "函数的概念与性质",
      description: "高一数学必修一第一章讲义",
      contentSnapshot: JSON.stringify({ sections: 5 }),
      fromTeacherId: "tch-1",
      backupReason: "校内分享：函数的概念与性质",
      targetClassIds: [],
      chapterIds: [],
      knowledgePointIds: [],
      grade: "高一",
      schoolYear: "2025-2026",
      meta: {
        节数: "5",
        状态: "已发布",
      },
      createdAt: yesterday,
      updatedAt: yesterday,
    },
    {
      id: "sbk-seed-3",
      schoolId: "sch-1",
      resourceType: "courseware",
      sourceResourceId: "cw-1",
      title: "指数函数与对数函数课件",
      description: "包含图像、性质、应用三个部分",
      contentSnapshot: "指数函数 y=a^x (a>0, a≠1) 的图像与性质...",
      fromTeacherId: "tch-1",
      backupReason: "公开分享：指数函数与对数函数课件",
      targetClassIds: [],
      chapterIds: [],
      knowledgePointIds: [],
      grade: "高一",
      schoolYear: "2025-2026",
      meta: {
        类型: "ppt",
        标签: "函数、指数、对数",
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export const db = {
  init(): void {
    if (inMemoryDB) return;
    const stored = storage.get<DBSchema | null>(DB_KEY, null);
    if (!stored) {
      inMemoryDB = addDefaultFields(getSeedData());
    } else {
      // 无论版本号是否变化，都在已有数据上补齐字段，避免升级时覆盖用户数据。
      inMemoryDB = addDefaultFields(stored);
    }
    storage.set(DB_KEY, inMemoryDB);
    storage.set(DB_VERSION_KEY, CURRENT_DB_VERSION);
  },

  read<T extends keyof DBSchema>(key: T): DBSchema[T] {
    this.init();
    return (inMemoryDB as DBSchema)[key];
  },

  write<T extends keyof DBSchema>(key: T, value: DBSchema[T]): void {
    this.init();
    (inMemoryDB as DBSchema)[key] = value;
    storage.set(DB_KEY, inMemoryDB);
  },

  update<T extends keyof DBSchema>(key: T, updater: (value: DBSchema[T]) => DBSchema[T]): void {
    this.init();
    const current = (inMemoryDB as DBSchema)[key];
    (inMemoryDB as DBSchema)[key] = updater(current);
    storage.set(DB_KEY, inMemoryDB);
  },

  reset(): void {
    inMemoryDB = addDefaultFields(getSeedData());
    storage.set(DB_KEY, inMemoryDB);
    storage.set(DB_VERSION_KEY, CURRENT_DB_VERSION);
  },

  snapshot(): DBSchema {
    this.init();
    return JSON.parse(JSON.stringify(inMemoryDB as DBSchema));
  },
};

// 启动时初始化
db.init();
