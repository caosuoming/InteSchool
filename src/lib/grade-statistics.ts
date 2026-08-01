import type {
  GradeBandRule,
  GradeClassSubjectSetting,
  GradeExamSettings,
  GradeScoreRecord,
  GradeStatisticsTemplate,
  GradeTeacherOption,
} from "../types/index.js";
import {
  buildDefaultCustomGradeColumns,
  validateGradeFormula,
} from "./grade-formula.js";
import {
  ASSIGNABLE_GRADE_SUBJECTS,
  isAssignableGradeSubject,
} from "./grade-subjects.js";

export const CORE_GRADE_SUBJECTS = ["语文", "数学", "英语"] as const;
export const ELECTIVE_GRADE_SUBJECTS = ["物理", "化学", "生物", "政治", "历史", "地理"] as const;
export const ASSIGNMENT_GRADE_SUBJECTS = ASSIGNABLE_GRADE_SUBJECTS;

export const DEFAULT_ASSIGNMENT_RULES: GradeBandRule[] = [
  { label: "A", percentileFrom: 0, percentileTo: 15, assignedMin: 86, assignedMax: 100 },
  { label: "B", percentileFrom: 15, percentileTo: 50, assignedMin: 71, assignedMax: 85 },
  { label: "C", percentileFrom: 50, percentileTo: 85, assignedMin: 56, assignedMax: 70 },
  { label: "D", percentileFrom: 85, percentileTo: 98, assignedMin: 41, assignedMax: 55 },
  { label: "E", percentileFrom: 98, percentileTo: 100, assignedMin: 30, assignedMax: 40 },
];

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function template(
  id: string,
  kind: GradeStatisticsTemplate["kind"],
  name: string,
  scoreMode: GradeStatisticsTemplate["scoreMode"],
  subjects: string[],
  extras: Pick<GradeStatisticsTemplate, "segmentSize" | "bestElectiveCount"> = {},
): GradeStatisticsTemplate {
  return {
    id,
    kind,
    name,
    enabled: true,
    scoreMode,
    subjects,
    ...extras,
  };
}

export function buildDefaultGradeSettings(
  subjects: string[],
  classIds: string[],
  teachers: GradeTeacherOption[] = [],
): GradeExamSettings {
  const normalizedSubjects = unique(subjects);
  const electiveSubjects = normalizedSubjects.filter((subject) =>
    ELECTIVE_GRADE_SUBJECTS.includes(subject as (typeof ELECTIVE_GRADE_SUBJECTS)[number]),
  );
  const assignableSubjects = normalizedSubjects.filter(isAssignableGradeSubject);
  const coreSubjects = normalizedSubjects.filter((subject) =>
    CORE_GRADE_SUBJECTS.includes(subject as (typeof CORE_GRADE_SUBJECTS)[number]),
  );
  const subjectTeacherIds = Object.fromEntries(
    normalizedSubjects.map((subject) => [
      subject,
      teachers.filter((teacher) => teacher.subject === subject).map((teacher) => teacher.id),
    ]),
  );
  const classSubjectTeacherIds = Object.fromEntries(
    unique(classIds).map((classId) => [
      classId,
      Object.fromEntries(normalizedSubjects.map((subject) => [
        subject,
        teachers
          .filter((teacher) => (
            teacher.subject === subject
            && (!teacher.teachingClassIds?.length || teacher.teachingClassIds.includes(classId))
          ))
          .map((teacher) => teacher.id),
      ])),
    ]),
  );
  const assignmentRules = Object.fromEntries(
    assignableSubjects.map((subject) => [
      subject,
      DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule })),
    ]),
  );
  const classSubjects: GradeClassSubjectSetting[] = unique(classIds).map((classId) => ({
    classId,
    examSubjects: [...normalizedSubjects],
    statisticSubjects: [...normalizedSubjects],
    separateRankSubjects: [],
  }));

  return {
    subjectTeacherIds,
    classSubjectTeacherIds,
    assignmentRules,
    classSubjects,
    templates: [
      template("student-ranking", "studentRanking", "学生名次表", "assigned", normalizedSubjects),
      template("class-average", "classAverage", "班级平均分表", "assigned", normalizedSubjects),
      template("total-score-segment", "totalScoreSegment", "总分分数（赋分）", "assigned", normalizedSubjects, {
        segmentSize: 20,
      }),
      template(
        "core-best-elective-segment",
        "coreAndBestElectiveSegment",
        "语数外选1分数段",
        "assigned",
        [...coreSubjects, ...electiveSubjects],
        { segmentSize: 10, bestElectiveCount: 1 },
      ),
      template(
        "elective-grade-segment",
        "electiveGradeSegment",
        "两门选修等级段",
        "assigned",
        electiveSubjects,
        { bestElectiveCount: 2 },
      ),
      {
        ...template("custom-ranking", "customTable", "自定义成绩表", "assigned", normalizedSubjects),
        columns: buildDefaultCustomGradeColumns(normalizedSubjects),
      },
    ],
  };
}

export function validateAssignmentRules(rules: GradeBandRule[]): void {
  if (rules.length === 0) throw new Error("赋分规则不能为空");
  const sorted = [...rules].sort((a, b) => a.percentileFrom - b.percentileFrom);
  if (sorted[0].percentileFrom !== 0 || sorted.at(-1)?.percentileTo !== 100) {
    throw new Error("赋分规则必须完整覆盖 0% 到 100%");
  }
  sorted.forEach((rule, index) => {
    if (
      !Number.isFinite(rule.percentileFrom)
      || !Number.isFinite(rule.percentileTo)
      || rule.percentileFrom < 0
      || rule.percentileTo > 100
      || rule.percentileFrom >= rule.percentileTo
    ) {
      throw new Error(`赋分档位 ${rule.label || index + 1} 的百分位区间不合法`);
    }
    if (
      !Number.isFinite(rule.assignedMin)
      || !Number.isFinite(rule.assignedMax)
      || rule.assignedMin > rule.assignedMax
    ) {
      throw new Error(`赋分档位 ${rule.label || index + 1} 的分值区间不合法`);
    }
    if (index > 0 && sorted[index - 1].percentileTo !== rule.percentileFrom) {
      throw new Error("赋分规则的百分位区间必须首尾相接");
    }
  });
}

export function normalizeGradeSettings(
  settings: GradeExamSettings,
  subjects: string[],
  classIds: string[],
  teacherIds: string[] = [],
): GradeExamSettings {
  const subjectSet = new Set(unique(subjects));
  const classSet = new Set(unique(classIds));
  const teacherSet = new Set(unique(teacherIds));

  const assignmentRules: Record<string, GradeBandRule[]> = {};
  for (const [subject, rules] of Object.entries(settings.assignmentRules || {})) {
    if (!subjectSet.has(subject)) continue;
    if (!ASSIGNMENT_GRADE_SUBJECTS.includes(subject as (typeof ASSIGNMENT_GRADE_SUBJECTS)[number])) continue;
    validateAssignmentRules(rules);
    assignmentRules[subject] = [...rules]
      .sort((a, b) => a.percentileFrom - b.percentileFrom)
      .map((rule) => ({ ...rule, label: rule.label.trim() || "未命名" }));
  }

  const subjectTeacherIds = Object.fromEntries(
    [...subjectSet].map((subject) => [
      subject,
      unique(settings.subjectTeacherIds?.[subject] || []).filter((id) => teacherSet.size === 0 || teacherSet.has(id)),
    ]),
  );
  const classSubjectTeacherIds = Object.fromEntries(
    [...classSet].map((classId) => [
      classId,
      Object.fromEntries([...subjectSet].map((subject) => [
        subject,
        unique(
          settings.classSubjectTeacherIds?.[classId]?.[subject]
            || subjectTeacherIds[subject]
            || [],
        ).filter((id) => teacherSet.size === 0 || teacherSet.has(id)),
      ])),
    ]),
  );

  const byClass = new Map(
    (settings.classSubjects || [])
      .filter((item) => classSet.has(item.classId))
      .map((item) => [item.classId, item]),
  );
  const classSubjects = [...classSet].map((classId) => {
    const current = byClass.get(classId);
    const examSubjects = unique(current?.examSubjects || [...subjectSet]).filter((subject) => subjectSet.has(subject));
    const separateRankSubjects = unique(current?.separateRankSubjects || [])
      .filter((subject) => examSubjects.includes(subject));
    const statisticSubjects = unique(current?.statisticSubjects || examSubjects)
      .filter((subject) => examSubjects.includes(subject) && !separateRankSubjects.includes(subject));
    return { classId, examSubjects, statisticSubjects, separateRankSubjects };
  });

  const templateIds = new Set<string>();
  const templates = (settings.templates || []).slice(0, 30).map((item, index) => {
    const fallbackId = `template-${index + 1}`;
    let id = item.id?.trim() || fallbackId;
    if (templateIds.has(id)) id = `${id}-${index + 1}`;
    templateIds.add(id);
    const columns = item.kind === "customTable"
      ? (item.columns || []).slice(0, 40).map((column, columnIndex) => {
        const name = column.name?.trim() || `列 ${columnIndex + 1}`;
        const formula = column.formula?.trim();
        if (!formula) throw new Error(`模板“${item.name || index + 1}”的“${name}”公式不能为空`);
        validateGradeFormula(formula, [...subjectSet]);
        return {
          id: column.id?.trim() || `column-${columnIndex + 1}`,
          name,
          formula,
          width: Number.isFinite(column.width) ? Math.max(8, Math.min(40, Number(column.width))) : undefined,
        };
      })
      : undefined;
    if (item.kind === "customTable" && columns?.length === 0) {
      throw new Error(`模板“${item.name || index + 1}”至少需要一列`);
    }
    return {
      ...item,
      id,
      name: item.name.trim() || `统计表 ${index + 1}`,
      subjects: unique(item.subjects || []).filter((subject) => subjectSet.has(subject)),
      segmentSize: item.segmentSize && item.segmentSize > 0 ? item.segmentSize : undefined,
      bestElectiveCount: item.bestElectiveCount && item.bestElectiveCount > 0
        ? Math.floor(item.bestElectiveCount)
        : undefined,
      columns,
    };
  });

  return {
    subjectTeacherIds,
    classSubjectTeacherIds,
    assignmentRules,
    classSubjects,
    templates,
  };
}

interface BaseGradeRecord {
  id: string;
  studentId: string;
  studentName: string;
  studentNo: string;
  classId: string;
  className: string;
  subjectSelection?: string;
  classType?: string;
  scores: Record<string, number | null>;
  sourceAssignedScores?: Record<string, number | null>;
}

function competitionRanks<T>(
  records: T[],
  score: (record: T) => number,
  tieBreaker: (record: T) => string,
): Map<T, number> {
  const sorted = [...records].sort((left, right) => {
    const delta = score(right) - score(left);
    return delta || tieBreaker(left).localeCompare(tieBreaker(right), "zh-CN");
  });
  const result = new Map<T, number>();
  let previousScore: number | undefined;
  let previousRank = 0;
  sorted.forEach((record, index) => {
    const value = score(record);
    const rank = previousScore === value ? previousRank : index + 1;
    result.set(record, rank);
    previousScore = value;
    previousRank = rank;
  });
  return result;
}

function assignSubjectScores(
  records: GradeScoreRecord[],
  subject: string,
  rules: GradeBandRule[],
): void {
  const participants = records
    .filter((record) => typeof record.scores[subject] === "number")
    .sort((left, right) => {
      const scoreDelta = (right.scores[subject] as number) - (left.scores[subject] as number);
      return scoreDelta || left.studentId.localeCompare(right.studentId);
    });
  if (participants.length === 0) return;

  const scoreFirstIndex = new Map<number, number>();
  participants.forEach((record, index) => {
    const score = record.scores[subject] as number;
    if (!scoreFirstIndex.has(score)) scoreFirstIndex.set(score, index);
  });

  const groups = new Map<GradeBandRule, GradeScoreRecord[]>();
  participants.forEach((record) => {
    const raw = record.scores[subject] as number;
    const rankIndex = scoreFirstIndex.get(raw) || 0;
    const percentile = participants.length === 1
      ? 0
      : (rankIndex / participants.length) * 100;
    const rule = rules.find((candidate, index) =>
      percentile >= candidate.percentileFrom
      && (percentile < candidate.percentileTo || index === rules.length - 1),
    ) || rules[rules.length - 1];
    const current = groups.get(rule) || [];
    current.push(record);
    groups.set(rule, current);
  });

  for (const [rule, group] of groups) {
    const rawScores = group.map((record) => record.scores[subject] as number);
    const rawMin = Math.min(...rawScores);
    const rawMax = Math.max(...rawScores);
    group.forEach((record) => {
      if (typeof record.sourceAssignedScores?.[subject] === "number") return;
      const raw = record.scores[subject] as number;
      const assigned = rawMax === rawMin
        ? rule.assignedMax
        : rule.assignedMin
          + ((raw - rawMin) / (rawMax - rawMin)) * (rule.assignedMax - rule.assignedMin);
      record.assignedScores[subject] = Math.round(assigned);
    });
  }
}

export function calculateGradeRecords(
  baseRecords: BaseGradeRecord[],
  subjects: string[],
  settings: GradeExamSettings,
): GradeScoreRecord[] {
  const normalizedSubjects = unique(subjects);
  const classSettings = new Map(settings.classSubjects.map((item) => [item.classId, item]));
  const records: GradeScoreRecord[] = baseRecords.map((record) => {
    const sourceAssignedScores = record.sourceAssignedScores
      ? Object.fromEntries(normalizedSubjects.map((subject) => [
          subject,
          record.sourceAssignedScores?.[subject] ?? null,
        ]))
      : undefined;
    return {
      ...record,
      scores: Object.fromEntries(normalizedSubjects.map((subject) => [subject, record.scores[subject] ?? null])),
      sourceAssignedScores,
      assignedScores: Object.fromEntries(normalizedSubjects.map((subject) => {
        const imported = sourceAssignedScores?.[subject];
        return [subject, typeof imported === "number" ? imported : record.scores[subject] ?? null];
      })),
      rawTotal: 0,
      assignedTotal: 0,
      gradeRank: 0,
      classRank: 0,
      subjectRanks: Object.fromEntries(normalizedSubjects.map((subject) => [subject, null])),
      subjectRankScopes: Object.fromEntries(normalizedSubjects.map((subject) => [subject, "cohort" as const])),
    };
  });

  for (const [subject, rules] of Object.entries(settings.assignmentRules)) {
    if (!normalizedSubjects.includes(subject)) continue;
    const unifiedRecords = records.filter((record) =>
      !(classSettings.get(record.classId)?.separateRankSubjects || []).includes(subject),
    );
    assignSubjectScores(unifiedRecords, subject, rules);

    const separateByClass = new Map<string, GradeScoreRecord[]>();
    records.forEach((record) => {
      if (!(classSettings.get(record.classId)?.separateRankSubjects || []).includes(subject)) return;
      const group = separateByClass.get(record.classId) || [];
      group.push(record);
      separateByClass.set(record.classId, group);
    });
    separateByClass.forEach((group) => assignSubjectScores(group, subject, rules));
  }

  normalizedSubjects.forEach((subject) => {
    const unifiedRecords = records.filter((record) => {
      if (typeof record.assignedScores[subject] !== "number") return false;
      const separateSubjects = classSettings.get(record.classId)?.separateRankSubjects || [];
      return !separateSubjects.includes(subject);
    });
    const unifiedRanks = competitionRanks(
      unifiedRecords,
      (record) => record.assignedScores[subject] as number,
      (record) => record.studentNo,
    );
    unifiedRanks.forEach((rank, record) => {
      record.subjectRanks![subject] = rank;
      record.subjectRankScopes![subject] = "cohort";
    });

    const separateByClass = new Map<string, GradeScoreRecord[]>();
    records.forEach((record) => {
      if (typeof record.assignedScores[subject] !== "number") return;
      const separateSubjects = classSettings.get(record.classId)?.separateRankSubjects || [];
      if (!separateSubjects.includes(subject)) return;
      const group = separateByClass.get(record.classId) || [];
      group.push(record);
      separateByClass.set(record.classId, group);
    });
    separateByClass.forEach((group) => {
      const ranks = competitionRanks(
        group,
        (record) => record.assignedScores[subject] as number,
        (record) => record.studentNo,
      );
      ranks.forEach((rank, record) => {
        record.subjectRanks![subject] = rank;
        record.subjectRankScopes![subject] = "class";
      });
    });
  });

  const nonUnifiedSubjects = new Set(
    settings.classSubjects.flatMap((item) => item.separateRankSubjects || []),
  );
  records.forEach((record) => {
    const configured = classSettings.get(record.classId)?.statisticSubjects || normalizedSubjects;
    const statisticSubjects = configured.filter((subject) =>
      normalizedSubjects.includes(subject) && !nonUnifiedSubjects.has(subject),
    );
    record.rawTotal = statisticSubjects.reduce((total, subject) => {
      const value = record.scores[subject];
      return total + (typeof value === "number" ? value : 0);
    }, 0);
    record.assignedTotal = statisticSubjects.reduce((total, subject) => {
      const value = record.assignedScores[subject];
      return total + (typeof value === "number" ? value : 0);
    }, 0);
    record.rawTotal = Math.round(record.rawTotal * 100) / 100;
    record.assignedTotal = Math.round(record.assignedTotal * 100) / 100;
  });

  const gradeRanks = competitionRanks(records, (record) => record.assignedTotal, (record) => record.studentNo);
  const classGroups = new Map<string, GradeScoreRecord[]>();
  records.forEach((record) => {
    const current = classGroups.get(record.classId) || [];
    current.push(record);
    classGroups.set(record.classId, current);
  });
  const classRanks = new Map<GradeScoreRecord, number>();
  for (const group of classGroups.values()) {
    const ranks = competitionRanks(group, (record) => record.assignedTotal, (record) => record.studentNo);
    ranks.forEach((rank, record) => classRanks.set(record, rank));
  }

  records.forEach((record) => {
    record.gradeRank = gradeRanks.get(record) || 0;
    record.classRank = classRanks.get(record) || 0;
  });
  return records.sort((left, right) => left.gradeRank - right.gradeRank || left.studentNo.localeCompare(right.studentNo));
}
