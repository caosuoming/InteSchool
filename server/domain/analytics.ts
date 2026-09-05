import type {
  AnswerRecord,
  AnswerScore,
  AnswerSource,
  ExamPaper,
  KnowledgePoint,
  Lecture,
  LectureSection,
  PersonalClass,
  Question,
  SchoolClass,
  Student,
  TreeNode,
} from "../../src/types/index.js";
import type { TeacherRecord } from "../types.js";
import { db } from "../runtime-db.js";
import { delay, genId } from "../domain-shared.js";
import { annotateTreeWithQuestionCounts } from "./tree-counts.js";

/** 知识点掌握情况统计项 */
export interface KnowledgeMastery {
  knowledgePointId: string;
  knowledgePointName: string;
  knowledgePointPath: string[];
  totalAttempts: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  correctRate: number;
  masteryLevel: "mastered" | "basic" | "weak" | "untrained";
}

/** 学生做题记录（含题目信息） */
export interface StudentAnswerDetail {
  record: AnswerRecord;
  question: Question | null;
  lectureTitle?: string;
}

export interface SchoolQuestionStat {
  questionId: string;
  scoreRate: number | null;
  studentCount: number;
}

/** 根据 isCorrect 推断 score（兼容旧数据） */
export function inferScore(record: AnswerRecord): AnswerScore {
  if (record.score) return record.score;
  return record.isCorrect ? "correct" : "wrong";
}

export interface DateRange {
  start?: string;
  end?: string;
}

function filterByDateRange(records: AnswerRecord[], range?: DateRange): AnswerRecord[] {
  if (!range || (!range.start && !range.end)) return records;
  return records.filter((r) => {
    const t = new Date(r.answeredAt).getTime();
    if (range.start && t < new Date(range.start).getTime()) return false;
    if (range.end && t > new Date(range.end).getTime()) return false;
    return true;
  });
}

export interface PendingQuestionAssignment {
  studentId: string;
  questionId: string;
}

function collectLectureQuestionIds(sections: LectureSection[], ids = new Set<string>()): Set<string> {
  for (const section of sections) {
    if (section.questionId) ids.add(section.questionId);
    if (section.children?.length) collectLectureQuestionIds(section.children, ids);
  }
  return ids;
}

function selectedAudienceStudentIds(
  classIds: string[] | undefined,
  directStudentIds: string[] | undefined,
  students: Student[],
  personalClassIdsByStudent: Map<string, Set<string>>,
): string[] {
  const audienceClassIds = new Set(classIds || []);
  const directIds = new Set(directStudentIds || []);
  return students
    .filter((student) => {
      if (directIds.has(student.id)) return true;
      if (student.classId && audienceClassIds.has(student.classId)) return true;
      const personalClassIds = personalClassIdsByStudent.get(student.id);
      return personalClassIds ? Array.from(personalClassIds).some((id) => audienceClassIds.has(id)) : false;
    })
    .map((student) => student.id);
}

export const analyticsService = {
  async listAnswerRecordsByQuestion(questionId: string, range?: DateRange): Promise<AnswerRecord[]> {
    await delay(200);
    const records = db.read("answerRecords").filter((a) => a.questionId === questionId);
    return filterByDateRange(records, range);
  },

  async listAnswerRecordsByStudent(studentId: string, range?: DateRange): Promise<AnswerRecord[]> {
    await delay(200);
    const records = db.read("answerRecords").filter((a) => a.studentId === studentId);
    return filterByDateRange(records, range);
  },

  async listAnswerRecordsByLecture(lectureId: string, range?: DateRange): Promise<AnswerRecord[]> {
    await delay(200);
    const records = db.read("answerRecords").filter((a) => a.lectureId === lectureId);
    return filterByDateRange(records, range);
  },

  /** 批量判断讲义/试卷是否已经录入过学生答题情况。 */
  async listUsedDocumentIds(documentIds: string[]): Promise<string[]> {
    await delay(150);
    if (documentIds.length === 0) return [];
    const requestedIds = Array.from(new Set(documentIds));
    const requested = new Set(requestedIds);
    const used = new Set(
      db.read("answerRecords")
        .filter((record) => requested.has(record.lectureId))
        .map((record) => record.lectureId),
    );
    return requestedIds.filter((id) => used.has(id));
  },

  /** 批量获取多个学生在所有题目上的答题记录 */
  async listAnswerRecordsByStudents(studentIds: string[], range?: DateRange): Promise<AnswerRecord[]> {
    await delay(200);
    if (studentIds.length === 0) return [];
    const records = db.read("answerRecords").filter((a) => studentIds.includes(a.studentId));
    return filterByDateRange(records, range);
  },

  /**
   * 获取选中学生当前被讲义/试卷使用对象覆盖的题目。
   * 这是派生的“待做”关系，不写入答题记录；调用方应让真实答题/使用记录优先展示。
   */
  async listPendingQuestionAssignments(studentIds: string[]): Promise<PendingQuestionAssignment[]> {
    await delay(150);
    if (studentIds.length === 0) return [];

    const selectedIds = new Set(studentIds);
    const students = (db.read("students") as Student[])
      .filter((student) => selectedIds.has(student.id) && student.status === "active");
    if (students.length === 0) return [];

    const personalClassIdsByStudent = new Map<string, Set<string>>();
    for (const personalClass of (db.read("personalClasses") || []) as PersonalClass[]) {
      for (const studentId of personalClass.studentIds) {
        if (!selectedIds.has(studentId)) continue;
        const ids = personalClassIdsByStudent.get(studentId) || new Set<string>();
        ids.add(personalClass.id);
        personalClassIdsByStudent.set(studentId, ids);
      }
    }

    const pendingByStudent = new Map<string, Set<string>>();
    const addDocumentAssignments = (
      classIds: string[] | undefined,
      directStudentIds: string[] | undefined,
      questionIds: Iterable<string>,
    ) => {
      const audienceStudentIds = selectedAudienceStudentIds(
        classIds,
        directStudentIds,
        students,
        personalClassIdsByStudent,
      );
      if (audienceStudentIds.length === 0) return;
      const ids = Array.from(questionIds);
      if (ids.length === 0) return;
      for (const studentId of audienceStudentIds) {
        const assigned = pendingByStudent.get(studentId) || new Set<string>();
        ids.forEach((questionId) => assigned.add(questionId));
        pendingByStudent.set(studentId, assigned);
      }
    };

    for (const lecture of (db.read("lectures") || []) as Lecture[]) {
      addDocumentAssignments(
        lecture.classIds,
        lecture.studentIds,
        collectLectureQuestionIds(lecture.sections || []),
      );
    }

    for (const paper of (db.read("examPapers") || []) as ExamPaper[]) {
      addDocumentAssignments(
        paper.classIds,
        paper.studentIds,
        paper.questions.map((question) => question.questionId).filter((id): id is string => Boolean(id)),
      );
    }

    return Array.from(pendingByStudent.entries()).flatMap(([studentId, questionIds]) =>
      Array.from(questionIds).map((questionId) => ({ studentId, questionId })),
    );
  },

  /** 获取一道题的所有答题记录（含其他学生，供参考） */
  async listAllAnswerRecordsByQuestion(questionId: string): Promise<AnswerRecord[]> {
    await delay(150);
    return db.read("answerRecords").filter((a) => a.questionId === questionId);
  },

  /** 保存/更新答题记录（全对/半对/做错） */
  async saveAnswerRecord(input: {
    studentId: string;
    questionId: string;
    lectureId: string;
    score?: AnswerScore | null;
    source?: AnswerSource;
  }): Promise<AnswerRecord | null> {
    await delay(200);
    const existing = db
      .read("answerRecords")
      .find(
        (a) =>
          a.studentId === input.studentId &&
          a.questionId === input.questionId &&
          a.lectureId === input.lectureId,
      );

    // score 为 null/undefined 时表示清除答题记录
    if (!input.score) {
      if (existing) {
        db.update("answerRecords", (list) => list.filter((a) => a.id !== existing.id));
      }
      return null;
    }

    const isCorrect = input.score === "correct";
    const now = new Date().toISOString();

    // 更新题目的最近使用时间
    db.update("questions", (list) =>
      list.map((q) =>
        q.id === input.questionId ? { ...q, lastUsedAt: now } : q,
      ),
    );

    if (existing) {
      const updated: AnswerRecord = {
        ...existing,
        score: input.score,
        isCorrect,
        source: input.source ?? existing.source,
        answeredAt: new Date().toISOString(),
      };
      db.update("answerRecords", (list) =>
        list.map((a) => (a.id === existing.id ? updated : a)),
      );
      return updated;
    }

    const record: AnswerRecord = {
      id: genId("ar"),
      studentId: input.studentId,
      questionId: input.questionId,
      lectureId: input.lectureId,
      isCorrect,
      score: input.score,
      source: input.source ?? "manual",
      answeredAt: new Date().toISOString(),
    };
    db.update("answerRecords", (list) => [...list, record]);
    return record;
  },

  /**
   * 批量保存/更新答题记录（支持一次编辑多个学生的同一道题，
   * 或未来扫描仪批量导入多学生×多题目答题数据）
   */
  async batchSaveAnswerRecords(items: Array<{
    studentId: string;
    questionId: string;
    lectureId: string;
    score: AnswerScore;
    source?: AnswerSource;
  }>): Promise<AnswerRecord[]> {
    await delay(300);
    if (items.length === 0) return [];

    const now = new Date().toISOString();
    const current: AnswerRecord[] = db.read("answerRecords");
    const byKey = new Map<string, AnswerRecord>(
      current.map((record) => [
        `${record.studentId}:${record.questionId}:${record.lectureId}`,
        record,
      ] as const),
    );
    const changed = new Map<string, AnswerRecord>();

    for (const item of items) {
      const key = `${item.studentId}:${item.questionId}:${item.lectureId}`;
      const existing = byKey.get(key);
      const record: AnswerRecord = existing
        ? {
            ...existing,
            score: item.score,
            isCorrect: item.score === "correct",
            source: item.source ?? existing.source,
            answeredAt: now,
          }
        : {
            id: genId("ar"),
            studentId: item.studentId,
            questionId: item.questionId,
            lectureId: item.lectureId,
            isCorrect: item.score === "correct",
            score: item.score,
            source: item.source ?? "manual",
            answeredAt: now,
          };
      byKey.set(key, record);
      changed.set(record.id, record);
    }

    db.update("answerRecords", () => Array.from(byKey.values()));
    const touchedQuestionIds = new Set(items.map((item) => item.questionId));
    db.update("questions", (list) =>
      list.map((question) =>
        touchedQuestionIds.has(question.id) ? { ...question, lastUsedAt: now } : question,
      ),
    );
    return Array.from(changed.values());
  },

  // 获取指定学生列表做过的题目 ID 集合
  async getAnsweredQuestionIds(studentIds: string[], range?: DateRange): Promise<Set<string>> {
    await delay(150);
    let records = db.read("answerRecords").filter((a) => studentIds.includes(a.studentId));
    records = filterByDateRange(records, range);
    return new Set(records.map((r) => r.questionId));
  },

  // 获取指定学生列表在每道题上的平均正确率（用于推荐排序）
  async getQuestionWeaknessScore(schoolId: string, studentIds: string[], range?: DateRange): Promise<Map<string, number>> {
    await delay(200);
    const questions = db.read("questions").filter((q) => q.schoolId === schoolId);
    let records = db.read("answerRecords").filter((a) => studentIds.includes(a.studentId));
    records = filterByDateRange(records, range);
    const scoreMap = new Map<string, number>();
    for (const q of questions) {
      const qRecords = records.filter((r) => r.questionId === q.id);
      const scoredRecords = qRecords.filter((r) => r.score !== "done");
      if (scoredRecords.length === 0) {
        scoreMap.set(q.id, 0.5);
      } else {
        const correct = scoredRecords.filter((r) => r.isCorrect).length;
        const wrongRate = 1 - correct / scoredRecords.length;
        scoreMap.set(q.id, wrongRate * 0.7 + scoredRecords.length / 20 * 0.3);
      }
    }
    return scoreMap;
  },

  // 为章节/知识点树注入学生已做题数与掌握率
  async annotateTreeWithStudentProgress(
    tree: TreeNode,
    studentIds: string[],
    type: "chapter" | "knowledge",
    range?: DateRange,
  ): Promise<TreeNode> {
    await delay(100);
    const treeNodeIds = new Set<string>();
    const collectTreeNodeIds = (node: TreeNode) => {
      if (node.id !== "root") treeNodeIds.add(node.id);
      node.children.forEach(collectTreeNodeIds);
    };
    collectTreeNodeIds(tree);

    const allQuestions = db.read("questions").filter((question: Question) => {
      const ids = type === "chapter" ? question.chapterIds : question.knowledgePointIds;
      return ids.some((id) => treeNodeIds.has(id));
    });
    const knowledgePoints = type === "knowledge"
      ? db.read("knowledgePoints").filter((point: { id: string }) => treeNodeIds.has(point.id))
      : [];
    let answeredRecords: AnswerRecord[] = db
      .read("answerRecords")
      .filter((record: AnswerRecord) => studentIds.includes(record.studentId));
    answeredRecords = filterByDateRange(answeredRecords, range);
    const answeredIds = new Set<string>(answeredRecords.map((record) => record.questionId));
    const scoredProgressByQuestionId = new Map<string, { correct: number; total: number }>();
    for (const record of answeredRecords) {
      const score = inferScore(record);
      if (score === "done") continue;
      const progress = scoredProgressByQuestionId.get(record.questionId) ?? { correct: 0, total: 0 };
      progress.total += 1;
      if (score === "correct") progress.correct += 1;
      scoredProgressByQuestionId.set(record.questionId, progress);
    }
    return annotateTreeWithQuestionCounts(
      tree,
      allQuestions,
      type,
      knowledgePoints,
      answeredIds,
      scoredProgressByQuestionId,
    );
  },

  // 题目使用情况统计
  async getQuestionStats(schoolId: string, range?: DateRange) {
    await delay(300);
    const questions = db.read("questions").filter((q) => q.schoolId === schoolId);
    let records = db.read("answerRecords");
    records = filterByDateRange(records, range);
    return questions
      .map((q) => {
        const qRecords = records.filter((r) => r.questionId === q.id);
        const scoredRecords = qRecords.filter((r) => r.score !== "done");
        const correct = scoredRecords.filter((r) => r.isCorrect).length;
        return {
          question: q,
          answerCount: qRecords.length,
          correctRate: scoredRecords.length ? correct / scoredRecords.length : 0,
          studentIds: Array.from(new Set(qRecords.map((r) => r.studentId))),
        };
      })
      .sort((a, b) => b.question.usageCount - a.question.usageCount);
  },

  /**
   * 获取当前学校在指定题目上的校级得分率和作答学生数。
   *
   * 作答人数按学生去重；得分率对每名学生取该题最新的已评分记录，避免重复作答被重复计权。
   * 全对记 1 分、半对记 0.5 分、做错记 0 分；“已做”只计作答人数，不进入得分率分母。
   * 共享题按当前学校学生的答题记录统计，因此切换学校后会得到对应学校的数据。
   */
  async getSchoolQuestionStats(
    schoolId: string,
    questionIds: string[],
    teacher: TeacherRecord,
  ): Promise<SchoolQuestionStat[]> {
    await delay(150);
    const requestedIds = Array.from(new Set(questionIds));
    if (requestedIds.length === 0) return [];

    const requested = new Set(requestedIds);
    const readableQuestionIds = new Set(
      db.read("questions")
        .filter((question) => requested.has(question.id) && (question.teacherId === teacher.id || question.isShared))
        .map((question) => question.id),
    );
    const schoolStudentIds = new Set(
      db.read("students")
        .filter((student) => student.schoolId === schoolId)
        .map((student) => student.id),
    );

    const studentsByQuestion = new Map<string, Set<string>>();
    const latestScoredByStudentAndQuestion = new Map<string, AnswerRecord>();
    for (const record of db.read("answerRecords")) {
      if (!readableQuestionIds.has(record.questionId) || !schoolStudentIds.has(record.studentId)) continue;

      const studentIds = studentsByQuestion.get(record.questionId) || new Set<string>();
      studentIds.add(record.studentId);
      studentsByQuestion.set(record.questionId, studentIds);

      if (inferScore(record) === "done") continue;
      const key = `${record.studentId}:${record.questionId}`;
      const current = latestScoredByStudentAndQuestion.get(key);
      if (!current || new Date(record.answeredAt).getTime() >= new Date(current.answeredAt).getTime()) {
        latestScoredByStudentAndQuestion.set(key, record);
      }
    }

    const aggregates = new Map<string, { earned: number; scoredCount: number }>();
    for (const record of latestScoredByStudentAndQuestion.values()) {
      const aggregate = aggregates.get(record.questionId) || { earned: 0, scoredCount: 0 };
      const score = inferScore(record);
      aggregate.earned += score === "correct" ? 1 : score === "partial" ? 0.5 : 0;
      aggregate.scoredCount += 1;
      aggregates.set(record.questionId, aggregate);
    }

    return requestedIds
      .filter((questionId) => readableQuestionIds.has(questionId))
      .map((questionId) => {
        const aggregate = aggregates.get(questionId) || { earned: 0, scoredCount: 0 };
        return {
          questionId,
          scoreRate: aggregate.scoredCount > 0 ? aggregate.earned / aggregate.scoredCount : null,
          studentCount: studentsByQuestion.get(questionId)?.size || 0,
        };
      });
  },

  // 学生答题统计
  async getStudentStats(schoolId: string, range?: DateRange) {
    await delay(300);
    const students = db.read("students").filter((s) => s.schoolId === schoolId);
    let records = db.read("answerRecords");
    records = filterByDateRange(records, range);
    return students
      .map((s) => {
        const sRecords = records.filter((r) => r.studentId === s.id);
        const scoredRecords = sRecords.filter((r) => r.score !== "done");
        const correct = scoredRecords.filter((r) => r.isCorrect).length;
        return {
          student: s,
          answerCount: sRecords.length,
          correctRate: scoredRecords.length ? correct / scoredRecords.length : 0,
        };
      })
      .filter((s) => s.answerCount > 0)
      .sort((a, b) => b.answerCount - a.answerCount);
  },

  /** 获取指定学生在各知识点上的训练和掌握情况 */
  async getKnowledgeMastery(
    studentIds: string[],
    schoolId: string,
    range?: DateRange,
  ): Promise<KnowledgeMastery[]> {
    await delay(300);
    let records = db
      .read("answerRecords")
      .filter((a) => studentIds.includes(a.studentId));
    records = filterByDateRange(records, range);
    const questions = db.read("questions").filter((q) => q.schoolId === schoolId);
    const knowledgePoints = (db.read("knowledgePoints") as KnowledgePoint[])
      .filter((p) => p.schoolId === schoolId);
    const knowledgePointMap = new Map(knowledgePoints.map((point) => [point.id, point] as const));

    const getKnowledgePointPath = (knowledgePointId: string): string[] => {
      const path: string[] = [];
      const visited = new Set<string>();
      let current = knowledgePointMap.get(knowledgePointId);
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        path.unshift(current.name);
        current = current.parentId ? knowledgePointMap.get(current.parentId) : undefined;
      }
      return path;
    };

    const questionMap = new Map<string, Question>(
      questions.map((q: Question) => [q.id, q] as const),
    );

    // 按知识点聚合答题记录
    const kpStats = new Map<
      string,
      { total: number; correct: number; partial: number; wrong: number }
    >();

    for (const record of records) {
      if (record.score === "done") continue;
      const question = questionMap.get(record.questionId);
      if (!question || !question.knowledgePointIds) continue;
      for (const kpId of question.knowledgePointIds) {
        const stat = kpStats.get(kpId) || { total: 0, correct: 0, partial: 0, wrong: 0 };
        stat.total++;
        const score = record.score || (record.isCorrect ? "correct" : "wrong");
        if (score === "correct") stat.correct++;
        else if (score === "partial") stat.partial++;
        else stat.wrong++;
        kpStats.set(kpId, stat);
      }
    }

    // 构建结果：包含所有知识点（未训练的也列出）
    return knowledgePoints.map((kp) => {
      const stat = kpStats.get(kp.id) || { total: 0, correct: 0, partial: 0, wrong: 0 };
      const correctRate = stat.total > 0 ? stat.correct / stat.total : 0;
      let masteryLevel: KnowledgeMastery["masteryLevel"];
      if (stat.total === 0) masteryLevel = "untrained";
      else if (correctRate >= 0.8) masteryLevel = "mastered";
      else if (correctRate >= 0.6) masteryLevel = "basic";
      else masteryLevel = "weak";

      return {
        knowledgePointId: kp.id,
        knowledgePointName: kp.name,
        knowledgePointPath: getKnowledgePointPath(kp.id),
        totalAttempts: stat.total,
        correctCount: stat.correct,
        partialCount: stat.partial,
        wrongCount: stat.wrong,
        correctRate,
        masteryLevel,
      };
    });
  },

  /**
   * 获取同年级同班型所有班级的知识点平均正确率
   * 用于整班模式下的横向对比
   */
  async getSameGradeTypeAverage(
    classId: string,
    schoolId: string,
    range?: DateRange,
  ): Promise<KnowledgeMastery[]> {
    await delay(250);
    const allClasses = db.read("schoolClasses").filter((c) => c.schoolId === schoolId);
    const targetClass = allClasses.find((c) => c.id === classId);
    if (!targetClass || !targetClass.classTypeId) {
      return this.getKnowledgeMastery([], schoolId, range);
    }

    const sameTypeClasses = allClasses.filter(
      (c) =>
        c.grade === targetClass.grade &&
        c.classTypeId === targetClass.classTypeId &&
        c.id !== classId,
    );

    if (sameTypeClasses.length === 0) {
      return this.getKnowledgeMastery([], schoolId, range);
    }

    const allStudents = db.read("students").filter((s) => s.schoolId === schoolId);
    const classStudentIds = new Set<string>();
    for (const cls of sameTypeClasses) {
      allStudents
        .filter((s) => s.classId === cls.id)
        .forEach((s) => classStudentIds.add(s.id));
    }

    const mastery = await this.getKnowledgeMastery(Array.from(classStudentIds), schoolId, range);
    return mastery;
  },

  /**
   * 获取上一届同班型最好班级的知识点正确率
   * 用于整班模式下的纵向对比
   */
  async getPrevGradeBestClass(
    classId: string,
    schoolId: string,
    range?: DateRange,
  ): Promise<{ mastery: KnowledgeMastery[]; className: string } | null> {
    await delay(250);
    const allClasses = db.read("schoolClasses").filter((c) => c.schoolId === schoolId);
    const targetClass = allClasses.find((c) => c.id === classId);
    if (!targetClass || !targetClass.classTypeId || !targetClass.gradeYear) {
      return null;
    }

    const prevGradeYear = targetClass.gradeYear - 1;
    const prevClasses = allClasses.filter(
      (c) =>
        c.classTypeId === targetClass.classTypeId &&
        c.gradeYear === prevGradeYear,
    );

    if (prevClasses.length === 0) return null;

    const allStudents = db.read("students").filter((s) => s.schoolId === schoolId);

    let bestClass: SchoolClass | null = null;
    let bestAvgRate = -1;

    for (const cls of prevClasses) {
      const studentIds = allStudents
        .filter((s) => s.classId === cls.id)
        .map((s) => s.id);
      if (studentIds.length === 0) continue;

      const mastery = await this.getKnowledgeMastery(studentIds, schoolId, range);
      const trained = mastery.filter((m) => m.totalAttempts > 0);
      const totalAttempts = trained.reduce((sum, m) => sum + m.totalAttempts, 0);
      const totalCorrect = trained.reduce((sum, m) => sum + m.correctCount, 0);
      const avgRate = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

      if (avgRate > bestAvgRate) {
        bestAvgRate = avgRate;
        bestClass = cls;
      }
    }

    if (!bestClass) return null;

    const bestStudentIds = allStudents
      .filter((s) => s.classId === bestClass!.id)
      .map((s) => s.id);
    const mastery = await this.getKnowledgeMastery(bestStudentIds, schoolId, range);
    return { mastery, className: bestClass.name };
  },

  /**
   * 获取班级平均知识点掌握情况
   * 用于个别学生模式下的对比
   */
  async getClassAverageMastery(
    classId: string,
    schoolId: string,
    range?: DateRange,
  ): Promise<KnowledgeMastery[]> {
    await delay(200);
    const allStudents = db.read("students").filter((s) => s.schoolId === schoolId);
    const studentIds = allStudents
      .filter((s) => s.classId === classId)
      .map((s) => s.id);
    return this.getKnowledgeMastery(studentIds, schoolId, range);
  },

  /** 获取指定学生做过的题目列表（含题目信息和答题结果） */
  async getStudentAnswerDetails(
    studentIds: string[],
    range?: DateRange,
  ): Promise<StudentAnswerDetail[]> {
    await delay(300);
    let records = db
      .read("answerRecords")
      .filter((a) => studentIds.includes(a.studentId))
      .sort((a, b) => new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime());
    records = filterByDateRange(records, range);

    const questions = db.read("questions");
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const lectures = db.read("lectures");
    const lectureMap = new Map(lectures.map((l) => [l.id, l.title]));

    return records.map((record) => ({
      record,
      question: questionMap.get(record.questionId) || null,
      lectureTitle: lectureMap.get(record.lectureId),
    }));
  },
};
