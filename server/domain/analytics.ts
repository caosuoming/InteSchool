import type { AnswerRecord, AnswerScore, AnswerSource, Question, TreeNode, SchoolClass } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId } from "../domain-shared.js";

/** 知识点掌握情况统计项 */
export interface KnowledgeMastery {
  knowledgePointId: string;
  knowledgePointName: string;
  chapterName: string;
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

  /** 批量获取多个学生在所有题目上的答题记录 */
  async listAnswerRecordsByStudents(studentIds: string[], range?: DateRange): Promise<AnswerRecord[]> {
    await delay(200);
    if (studentIds.length === 0) return [];
    const records = db.read("answerRecords").filter((a) => studentIds.includes(a.studentId));
    return filterByDateRange(records, range);
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
    const results: AnswerRecord[] = [];
    for (const item of items) {
      const r = await this.saveAnswerRecord(item);
      if (r) results.push(r);
    }
    return results;
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
      if (qRecords.length === 0) {
        scoreMap.set(q.id, 0.5);
      } else {
        const correct = qRecords.filter((r) => r.isCorrect).length;
        const wrongRate = 1 - correct / qRecords.length;
        scoreMap.set(q.id, wrongRate * 0.7 + qRecords.length / 20 * 0.3);
      }
    }
    return scoreMap;
  },

  // 为章节/知识点树注入学生已做题数
  async annotateTreeWithStudentProgress(
    tree: TreeNode,
    studentIds: string[],
    type: "chapter" | "knowledge",
    range?: DateRange,
  ): Promise<TreeNode> {
    await delay(100);
    const allQuestions = db.read("questions");
    let answeredRecords = db.read("answerRecords").filter((a) => studentIds.includes(a.studentId));
    answeredRecords = filterByDateRange(answeredRecords, range);
    const answeredIds = new Set(answeredRecords.map((r) => r.questionId));

    const countNode = (node: TreeNode): { count: number; doneCount: number } => {
      const qField = type === "chapter" ? "chapterIds" : "knowledgePointIds";
      let total = 0;
      let done = 0;
      const nodeQuestions = allQuestions.filter((q: Question) => (q as any)[qField]?.includes(node.id));
      total += nodeQuestions.length;
      done += nodeQuestions.filter((q: Question) => answeredIds.has(q.id)).length;
      for (const child of node.children) {
        const c = countNode(child);
        total += c.count;
        done += c.doneCount;
      }
      return { count: total, doneCount: done };
    };

    const annotate = (node: TreeNode): TreeNode => {
      const { count, doneCount } = countNode(node);
      return {
        ...node,
        count,
        doneCount,
        children: node.children.map(annotate),
      };
    };

    return annotate(tree);
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
        const correct = qRecords.filter((r) => r.isCorrect).length;
        return {
          question: q,
          answerCount: qRecords.length,
          correctRate: qRecords.length ? correct / qRecords.length : 0,
          studentIds: Array.from(new Set(qRecords.map((r) => r.studentId))),
        };
      })
      .sort((a, b) => b.question.usageCount - a.question.usageCount);
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
        const correct = sRecords.filter((r) => r.isCorrect).length;
        return {
          student: s,
          answerCount: sRecords.length,
          correctRate: sRecords.length ? correct / sRecords.length : 0,
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
    const knowledgePoints = db.read("knowledgePoints").filter((p) => p.schoolId === schoolId);
    const chapters = db.read("chapters").filter((c) => c.schoolId === schoolId);

    const questionMap = new Map<string, Question>(
      questions.map((q: Question) => [q.id, q] as const),
    );

    // 按知识点聚合答题记录
    const kpStats = new Map<
      string,
      { total: number; correct: number; partial: number; wrong: number }
    >();

    for (const record of records) {
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
    const getChapterName = (chapterId: string) =>
      chapters.find((c) => c.id === chapterId)?.name || "";

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
        chapterName: getChapterName(kp.chapterId),
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
