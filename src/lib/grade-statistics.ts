import type {
  GradeBandRule,
  GradeClassAverageOptions,
  GradeClassSubjectSetting,
  GradeExam,
  GradeExamSettings,
  GradeScoreRecord,
  GradeStatisticsTemplate,
  GradeTeacherOption,
  GradeTotalScoreSegmentOptions,
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

export type GradeClassSubjectAvailability = Record<string, string[]>;

const ELECTIVE_SELECTION_ALIASES: Record<string, string[]> = {
  物理: ["物理", "物"],
  化学: ["化学", "化"],
  生物: ["生物", "生"],
  政治: ["政治", "政"],
  历史: ["历史", "史"],
  地理: ["地理", "地"],
};

export function inferStatisticSubjectsFromSelections(
  subjects: string[],
  subjectSelections: string[],
): string[] | undefined {
  const normalizedSubjects = unique(subjects);
  const selections = subjectSelections.map((value) => value.trim()).filter(Boolean);
  if (selections.length === 0) return undefined;

  const parsedSelections = selections.map((selection) => new Set(
    normalizedSubjects.filter((subject) => {
      const aliases = ELECTIVE_SELECTION_ALIASES[subject];
      return aliases?.some((alias) => selection.includes(alias)) || false;
    }),
  )).filter((selection) => selection.size > 0);
  if (parsedSelections.length === 0) return undefined;

  const commonElectives = normalizedSubjects.filter((subject) =>
    parsedSelections.every((selection) => selection.has(subject)),
  );
  const coreSubjects = normalizedSubjects.filter((subject) =>
    CORE_GRADE_SUBJECTS.includes(subject as (typeof CORE_GRADE_SUBJECTS)[number]),
  );
  return unique([...coreSubjects, ...commonElectives]);
}

/** Rank all selected subjects in one cohort pool by default, even for mixed-selection classes. */
export function defaultClassRankingSubjects(
  subjects: string[],
  subjectSelections: string[] = [],
): string[] {
  const selected = new Set(subjectSelections.flatMap((selection) =>
    inferStatisticSubjectsFromSelections(subjects, [selection]) || [],
  ));
  if (selected.size > 0) return unique(subjects).filter((subject) => selected.has(subject));
  return unique(subjects);
}

export function expectedGradeSubjectCount(subjects: string[], records: GradeScoreRecord[]): number {
  const selectionCounts = records.flatMap((record) => {
    const selected = inferStatisticSubjectsFromSelections(subjects, [record.subjectSelection || ""]);
    return selected?.length ? [selected.length] : [];
  });
  const electiveCount = subjects.filter((subject) =>
    ELECTIVE_GRADE_SUBJECTS.includes(subject as (typeof ELECTIVE_GRADE_SUBJECTS)[number]),
  ).length;
  return Math.max(subjects.length - electiveCount + Math.min(3, electiveCount), ...selectionCounts);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Subjects included in this class's totals and ranking, including separate-ranking subjects. */
export function rankedClassSubjects(
  subjects: string[],
  settings: GradeExamSettings,
  classId: string,
): string[] {
  const classSetting = settings.classSubjects.find((item) => item.classId === classId);
  if (!classSetting) return unique(subjects);
  const ranked = new Set([...classSetting.statisticSubjects, ...(classSetting.separateRankSubjects || [])]);
  return unique(subjects).filter((subject) => ranked.has(subject));
}

/** Classes with the same separately ranked subjects share one total-score ranking pool. */
export function totalRankingGroupKey(settings: GradeExamSettings, classId: string): string {
  const separatelyRanked = settings.classSubjects.find((item) => item.classId === classId)?.separateRankSubjects || [];
  return JSON.stringify([...new Set(separatelyRanked)].sort());
}

export function inferClassSubjectAvailability(
  records: Array<{
    classId: string;
    scores: Record<string, number | null>;
    assignedScores?: Record<string, number | null>;
    sourceAssignedScores?: Record<string, number | null>;
  }>,
  subjects: string[],
): GradeClassSubjectAvailability {
  const normalizedSubjects = unique(subjects);
  const grouped = new Map<string, typeof records>();
  records.forEach((record) => {
    const current = grouped.get(record.classId) || [];
    current.push(record);
    grouped.set(record.classId, current);
  });
  return Object.fromEntries([...grouped.entries()].map(([classId, classRecords]) => [
    classId,
    normalizedSubjects.filter((subject) => classRecords.some((record) => {
      const values = [
        record.scores[subject],
        record.assignedScores?.[subject],
        record.sourceAssignedScores?.[subject],
      ];
      return values.some((value) => typeof value === "number" && Number.isFinite(value));
    })),
  ]));
}

function template(
  id: string,
  kind: GradeStatisticsTemplate["kind"],
  name: string,
  scoreMode: GradeStatisticsTemplate["scoreMode"],
  subjects: string[],
  extras: Pick<GradeStatisticsTemplate, "segmentSize" | "segmentMax" | "segmentMin" | "bestElectiveCount"> = {},
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
  _classSubjectAvailability: GradeClassSubjectAvailability = {},
  classSubjectSelections: Record<string, string[]> = {},
): GradeExamSettings {
  const normalizedSubjects = unique(subjects);
  const electiveSubjects = normalizedSubjects.filter((subject) =>
    ELECTIVE_GRADE_SUBJECTS.includes(subject as (typeof ELECTIVE_GRADE_SUBJECTS)[number]),
  );
  const assignableSubjects = normalizedSubjects.filter(isAssignableGradeSubject);
  const coreSubjects = normalizedSubjects.filter((subject) =>
    CORE_GRADE_SUBJECTS.includes(subject as (typeof CORE_GRADE_SUBJECTS)[number]),
  );
  const classSubjectTeacherIds = Object.fromEntries(
    unique(classIds).map((classId) => [
      classId,
      Object.fromEntries(normalizedSubjects.map((subject) => [
        subject,
        teachers
          .filter((teacher) => (
            teacher.subject === subject
            && teacher.teachingClassIds?.includes(classId)
          ))
          .map((teacher) => teacher.id),
      ])),
    ]),
  );
  const subjectTeacherIds = Object.fromEntries(normalizedSubjects.map((subject) => [
    subject,
    unique(Object.values(classSubjectTeacherIds).flatMap((classTeachers) => classTeachers[subject])),
  ]));
  const classSubjectTeacherNames = Object.fromEntries(
    unique(classIds).map((classId) => [
      classId,
      Object.fromEntries(normalizedSubjects.map((subject) => [subject, []])),
    ]),
  );
  const classHomeroomTeacherNames = Object.fromEntries(
    unique(classIds).flatMap((classId) => {
      const names = unique(teachers
        .filter((teacher) => teacher.homeroomClassIds?.includes(classId))
        .map((teacher) => teacher.name));
      return names.length > 0 ? [[classId, names]] : [];
    }),
  );
  const assignmentRules = Object.fromEntries(
    assignableSubjects.map((subject) => [
      subject,
      DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule })),
    ]),
  );
  const classSubjects: GradeClassSubjectSetting[] = unique(classIds).map((classId) => {
    const defaultSubjects = defaultClassRankingSubjects(
      normalizedSubjects, classSubjectSelections[classId],
    );
    return {
      classId,
      examSubjects: [...defaultSubjects],
      statisticSubjects: [...defaultSubjects],
      separateRankSubjects: [],
    };
  });

  return {
    subjectTeacherIds,
    classSubjectTeacherIds,
    classSubjectTeacherNames,
    classHomeroomTeacherNames,
    assignmentRules,
    classSubjects,
    templates: [
      template("student-ranking", "studentRanking", "学生名次表", "assigned", normalizedSubjects),
      template("class-average", "classAverage", "班级平均分表", "assigned", normalizedSubjects),
      template("total-score-segment", "totalScoreSegment", "总分分数段汇总表", "assigned", normalizedSubjects, {
        segmentSize: 10,
        segmentMax: 700,
        segmentMin: 400,
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

function normalizeClassAverageOptions(
  options: GradeClassAverageOptions,
  classSet: Set<string>,
  subjectSet: Set<string>,
): GradeClassAverageOptions {
  const knownClassIds = [...classSet];
  const requestedOrder = unique(options.classOrder || []).filter((classId) => classSet.has(classId));
  const normalizeLabels = (values: Record<string, string> | undefined, maxLength: number) => Object.fromEntries(
    Object.entries(values || {})
      .filter(([classId]) => classSet.has(classId))
      .map(([classId, value]) => [classId, value.trim().slice(0, maxLength)])
      .filter(([, value]) => Boolean(value)),
  );
  const optionalBoolean = (value: unknown): boolean | undefined => (
    typeof value === "boolean" ? value : undefined
  );
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(options.reportDate || "")
    ? options.reportDate
    : undefined;
  const subjectScoreModes = Object.fromEntries(
    Object.entries(options.subjectScoreModes || {})
      .filter(([classId]) => classSet.has(classId))
      .map(([classId, modes]) => [
        classId,
        Object.fromEntries(Object.entries(modes || {})
          .filter(([subject, mode]) =>
            subjectSet.has(subject) && (mode === "raw" || mode === "assigned" || mode === "both"),
          )
          .map(([subject, mode]) => [subject, isAssignableGradeSubject(subject) ? mode : "raw"])),
      ]),
  );
  const totalScoreMode = options.totalScoreMode === "raw" || options.totalScoreMode === "assigned"
    ? options.totalScoreMode
    : undefined;

  return {
    title: options.title?.trim().slice(0, 120) || undefined,
    reportDate,
    classOrder: [
      ...requestedOrder,
      ...knownClassIds.filter((classId) => !requestedOrder.includes(classId)),
    ],
    hiddenClassIds: unique(options.hiddenClassIds || []).filter((classId) => classSet.has(classId)),
    classCategories: normalizeLabels(options.classCategories, 30),
    classLabels: normalizeLabels(options.classLabels, 30),
    subjectScoreModes,
    totalScoreMode,
    customTotals: (options.customTotals || []).slice(0, 12).reduce<NonNullable<GradeClassAverageOptions["customTotals"]>>((totals, value) => {
      if (!value || typeof value !== "object") return totals;
      const id = typeof value.id === "string" ? value.id.trim().slice(0, 64) : "";
      const name = typeof value.name === "string" ? value.name.trim().slice(0, 30) : "";
      const subjects = Array.isArray(value.subjects)
        ? unique(value.subjects.filter((subject): subject is string => typeof subject === "string"))
          .filter((subject) => subjectSet.has(subject)) : [];
      if (!id || !name || subjects.length === 0 || totals.some((item) => item.id === id)) return totals;
      totals.push({ id, name, subjects, scoreMode: value.scoreMode === "raw" ? "raw" : "assigned" });
      return totals;
    }, []),
    scoreColumnOrder: unique(options.scoreColumnOrder || []).filter((key) => key === "total"
      || (key.startsWith("subject:") && subjectSet.has(key.slice(8)))
      || (key.startsWith("custom:") && (options.customTotals || []).some((total) => total.id === key.slice(7)))),
    showTeacherRows: optionalBoolean(options.showTeacherRows),
    showGroupDifference: optionalBoolean(options.showGroupDifference),
    showGroupAverage: optionalBoolean(options.showGroupAverage),
    showOverallAverage: optionalBoolean(options.showOverallAverage),
  };
}

function normalizeTotalScoreSegmentOptions(
  options: GradeTotalScoreSegmentOptions,
  classSet: Set<string>,
  subjectSet: Set<string>,
): GradeTotalScoreSegmentOptions {
  const normalizeThreshold = (value: number | undefined): number | undefined => (
    Number.isFinite(value) ? Math.max(0, Math.min(2000, Number(value))) : undefined
  );
  const normalizeTarget = (value: number | undefined): number | undefined => (
    Number.isFinite(value) ? Math.max(0, Math.min(10000, Math.round(Number(value)))) : undefined
  );
  const classTargets = Object.fromEntries(
    Object.entries(options.classTargets || {})
      .filter(([classId]) => classSet.has(classId))
      .map(([classId, targets]) => [classId, {
        highScore1: normalizeTarget(targets?.highScore1),
        highScore2: normalizeTarget(targets?.highScore2),
        firstTier: normalizeTarget(targets?.firstTier),
        undergraduate: normalizeTarget(targets?.undergraduate),
      }]),
  );
  const normalizeTrackThresholds = (
    values: GradeTotalScoreSegmentOptions["trackThresholds"],
  ) => Object.fromEntries((["science", "arts"] as const).flatMap((track) => {
    const source = values?.[track];
    if (!source) return [];
    return [[track, {
      highScore1: normalizeThreshold(source.highScore1),
      highScore2: normalizeThreshold(source.highScore2),
      firstTier: normalizeThreshold(source.firstTier),
      undergraduate: normalizeThreshold(source.undergraduate),
    }]];
  }));
  const separateRankThresholds = Object.fromEntries(
    Object.entries(options.separateRankThresholds || {}).flatMap(([groupKey, thresholds]) => {
      let subjects: unknown;
      try {
        subjects = JSON.parse(groupKey);
      } catch {
        return [];
      }
      if (!Array.isArray(subjects) || subjects.length === 0
        || subjects.some((subject) => typeof subject !== "string" || !subjectSet.has(subject))) return [];
      const key = JSON.stringify([...new Set(subjects)].sort());
      return [[key, {
        highScore1: normalizeThreshold(thresholds?.highScore1),
        highScore2: normalizeThreshold(thresholds?.highScore2),
        firstTier: normalizeThreshold(thresholds?.firstTier),
        undergraduate: normalizeThreshold(thresholds?.undergraduate),
      }]];
    }),
  );
  const subjectScoreSegmentThresholds = Object.fromEntries(
    Object.entries(options.subjectScoreSegmentThresholds || {})
      .filter(([subject]) => subjectSet.has(subject))
      .map(([subject, thresholds]) => [
        subject,
        [...new Set((thresholds || [])
          .filter((value) => Number.isFinite(value))
          .map((value) => Math.max(0, Math.min(1000, Math.round(Number(value))))))]
          .sort((left, right) => right - left)
          .slice(0, 40),
      ])
      .filter(([, thresholds]) => (thresholds as number[]).length > 0),
  );

  const normalizeSpecial = (values: number[] | undefined) => [...new Set((values || [])
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(0, Math.min(2000, Number(value)))))]
    .sort((a, b) => b - a).slice(0, 40);
  const customEntries = <T>(values: Record<string, T> | undefined) =>
    Object.entries(values || {}).filter(([id]) => id.length > 0 && id.length <= 64).slice(0, 12);
  const normalizeTotalStandards = (values: GradeTotalScoreSegmentOptions["generalThresholds"]) => ({
    highScore1: normalizeThreshold(values?.highScore1),
    highScore2: normalizeThreshold(values?.highScore2),
    firstTier: normalizeThreshold(values?.firstTier),
    undergraduate: normalizeThreshold(values?.undergraduate),
  });
  return {
    specialThresholds: normalizeSpecial(options.specialThresholds),
    customTotalSpecialThresholds: Object.fromEntries(customEntries(options.customTotalSpecialThresholds)
      .map(([id, values]) => [id, normalizeSpecial(values)])),
    customTotalRanges: Object.fromEntries(customEntries(options.customTotalRanges)
      .map(([id, range]) => [id, {
        segmentMax: normalizeThreshold(range?.segmentMax),
        segmentMin: normalizeThreshold(range?.segmentMin),
        segmentSize: Number.isFinite(range?.segmentSize)
          ? Math.max(1, Math.min(500, Math.round(Number(range.segmentSize)))) : undefined,
      }])),
    customTotalGeneralThresholds: Object.fromEntries(customEntries(options.customTotalGeneralThresholds)
      .map(([id, values]) => [id, normalizeTotalStandards(values)])),
    customTotalGeneralVisibility: Object.fromEntries(customEntries(options.customTotalGeneralVisibility)
      .map(([id, values]) => [id, Object.fromEntries(
        (["highScore1", "highScore2", "firstTier", "undergraduate"] as const)
          .flatMap((key) => typeof values?.[key] === "boolean" ? [[key, values[key]]] : []),
      )])),
    generalThresholds: {
      highScore1: normalizeThreshold(options.generalThresholds?.highScore1),
      highScore2: normalizeThreshold(options.generalThresholds?.highScore2),
      firstTier: normalizeThreshold(options.generalThresholds?.firstTier),
      undergraduate: normalizeThreshold(options.generalThresholds?.undergraduate),
    },
    generalStandardVisibility: Object.fromEntries((["highScore1", "highScore2", "firstTier", "undergraduate"] as const)
      .flatMap((key) => typeof options.generalStandardVisibility?.[key] === "boolean"
        ? [[key, options.generalStandardVisibility[key]]] : [])),
    trackStandardVisibility: Object.fromEntries((["science", "arts"] as const).map((track) => [
      track,
      Object.fromEntries((["highScore1", "highScore2", "firstTier", "undergraduate"] as const)
        .flatMap((key) => typeof options.trackStandardVisibility?.[track]?.[key] === "boolean"
          ? [[key, options.trackStandardVisibility[track]?.[key]]] : [])),
    ])),
    highScore1Threshold: normalizeThreshold(options.highScore1Threshold),
    highScore2Threshold: normalizeThreshold(options.highScore2Threshold),
    firstTierThreshold: normalizeThreshold(options.firstTierThreshold),
    undergraduateThreshold: normalizeThreshold(options.undergraduateThreshold),
    trackThresholds: normalizeTrackThresholds(options.trackThresholds),
    separateRankThresholds,
    subjectScoreSegmentThresholds,
    subjectScoreSegmentRanges: Object.fromEntries(Object.entries(options.subjectScoreSegmentRanges || {})
      .filter(([subject]) => subjectSet.has(subject))
      .map(([subject, range]) => [subject, {
        max: normalizeThreshold(range?.max),
        min: normalizeThreshold(range?.min),
        step: Number.isFinite(range?.step) ? Math.max(1, Math.min(500, Math.round(Number(range.step)))) : undefined,
      }])),
    subjectScoreSegmentSpecialThresholds: Object.fromEntries(Object.entries(options.subjectScoreSegmentSpecialThresholds || {})
      .filter(([subject]) => subjectSet.has(subject))
      .map(([subject, values]) => [subject, normalizeSpecial(values)])),
    classTargets,
    totalScoreTopN: Number.isFinite(options.totalScoreTopN)
      ? Math.max(1, Math.min(1000, Math.round(Number(options.totalScoreTopN))))
      : undefined,
    totalScoreSeparateTopN: Number.isFinite(options.totalScoreSeparateTopN)
      ? Math.max(1, Math.min(1000, Math.round(Number(options.totalScoreSeparateTopN))))
      : undefined,
    showSubjectRanks: options.showSubjectRanks === true,
    highlightLowestRankSubject: options.highlightLowestRankSubject === true,
  };
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
          settings.classSubjectTeacherIds?.[classId]?.[subject] || [],
        ).filter((id) => teacherSet.size === 0 || teacherSet.has(id)),
      ])),
    ]),
  );
  const classSubjectTeacherNames = Object.fromEntries(
    [...classSet].map((classId) => [
      classId,
      Object.fromEntries([...subjectSet].map((subject) => [
        subject,
        unique((settings.classSubjectTeacherNames?.[classId]?.[subject] || [])
          .map((name) => name.trim()))
          .filter(Boolean)
          .slice(0, 10),
      ])),
    ]),
  );
  const classHomeroomTeacherNames = Object.fromEntries(
    Object.entries(settings.classHomeroomTeacherNames || {})
      .filter(([classId]) => classSet.has(classId))
      .map(([classId, names]) => [
        classId,
        unique((names || []).map((name) => name.trim())).filter(Boolean).slice(0, 10),
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
    const classAverageOptions = item.kind === "classAverage" && item.classAverageOptions
      ? normalizeClassAverageOptions(item.classAverageOptions, classSet, subjectSet)
      : undefined;
    const totalScoreSegmentOptions = item.kind === "totalScoreSegment" && item.totalScoreSegmentOptions
      ? normalizeTotalScoreSegmentOptions(item.totalScoreSegmentOptions, classSet, subjectSet)
      : undefined;
    const isLegacyTotalScoreSegment = item.kind === "totalScoreSegment"
      && (!Number.isFinite(item.segmentMax) || !Number.isFinite(item.segmentMin));
    const segmentSize = item.kind === "totalScoreSegment" && isLegacyTotalScoreSegment
      ? 10
      : item.segmentSize && item.segmentSize > 0
        ? Math.max(1, Math.min(500, Number(item.segmentSize)))
        : undefined;
    const rawSegmentMax = item.kind === "totalScoreSegment"
      ? Number.isFinite(item.segmentMax)
        ? Math.max(0, Math.min(2000, Number(item.segmentMax)))
        : 700
      : undefined;
    const rawSegmentMin = item.kind === "totalScoreSegment"
      ? Number.isFinite(item.segmentMin)
        ? Math.max(0, Math.min(2000, Number(item.segmentMin)))
        : 400
      : undefined;
    const segmentMax = rawSegmentMax === undefined || rawSegmentMin === undefined
      ? undefined
      : Math.max(rawSegmentMax, rawSegmentMin);
    const segmentMin = rawSegmentMax === undefined || rawSegmentMin === undefined
      ? undefined
      : Math.min(rawSegmentMax, rawSegmentMin);
    return {
      ...item,
      id,
      name: item.name.trim() || `统计表 ${index + 1}`,
      subjects: unique(item.subjects || []).filter((subject) => subjectSet.has(subject)),
      segmentSize,
      segmentMax,
      segmentMin,
      bestElectiveCount: item.bestElectiveCount && item.bestElectiveCount > 0
        ? Math.floor(item.bestElectiveCount)
        : undefined,
      columns,
      classAverageOptions,
      totalScoreSegmentOptions,
    };
  });

  return {
    subjectTeacherIds,
    classSubjectTeacherIds,
    classSubjectTeacherNames,
    classHomeroomTeacherNames,
    assignmentRules,
    classSubjects,
    templates,
  };
}

/** Resolve the subjects a student actually sat. Non-selected electives are not absences. */
export function gradeAttendance(
  record: Pick<GradeScoreRecord, "classId" | "subjectSelection" | "scores">,
  subjects: string[],
  settings?: Pick<GradeExamSettings, "classSubjects">,
): { missingSubjects: string[]; missingElectiveCount: number; complete: boolean } {
  const examSubjects = unique(subjects);
  const electives = examSubjects.filter((subject) =>
    ELECTIVE_GRADE_SUBJECTS.includes(subject as (typeof ELECTIVE_GRADE_SUBJECTS)[number]));
  const core = examSubjects.filter((subject) => !electives.includes(subject));
  const studentSelection = inferStatisticSubjectsFromSelections(examSubjects, [record.subjectSelection || ""]);
  const selectedElectives = (studentSelection || []).filter((subject) => electives.includes(subject));
  const classSubjects = settings?.classSubjects.find((item) => item.classId === record.classId)?.examSubjects
    .filter((subject) => examSubjects.includes(subject));
  const classElectives = (classSubjects || []).filter((subject) => electives.includes(subject));
  const electiveTarget = Math.min(3, electives.length);
  // Prefer an explicit individual choice; use a fixed class choice only when
  // it does not encompass several alternative elective combinations.
  const individualComplete = selectedElectives.length >= electiveTarget;
  const fixedClassChoice = !individualComplete && classSubjects?.length
    && classElectives.length <= electiveTarget;
  const required = individualComplete
    ? unique([...core, ...selectedElectives])
    : fixedClassChoice ? unique([...core, ...classSubjects]) : core;
  const expectedCount = Math.max(required.length, core.length + electiveTarget);
  const attended = examSubjects.filter((subject) =>
    typeof record.scores[subject] === "number" && Number.isFinite(record.scores[subject]));
  const missingSubjects = required.filter((subject) => !attended.includes(subject));
  const attendedElectives = attended.filter((subject) => electives.includes(subject)).length;
  const missingElectiveCount = Math.max(0, electiveTarget - attendedElectives - missingSubjects.filter((subject) => electives.includes(subject)).length);
  return {
    missingSubjects,
    missingElectiveCount,
    complete: examSubjects.length > 0 && missingSubjects.length === 0
      && missingElectiveCount === 0 && attended.length >= expectedCount,
  };
}

export function participatingGradeRecords<T extends { includeInStatistics?: boolean }>(records: T[]): T[] {
  return records.filter((record) => record.includeInStatistics !== false);
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
  includeInStatistics?: boolean;
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

  const participating = participatingGradeRecords(records);
  const attendance = new Map(records.map((record) => [record, gradeAttendance(record, normalizedSubjects, settings)]));

  for (const [subject, rules] of Object.entries(settings.assignmentRules)) {
    if (!normalizedSubjects.includes(subject)) continue;
    // Assignment conversion is exam-wide. Ranking pools may be separate, but a
    // raw score must not convert to two different assigned scores by class.
    const assignmentParticipants = participating.filter((record) => {
      const classSetting = classSettings.get(record.classId);
      return !classSetting
        || classSetting.statisticSubjects.includes(subject)
        || (classSetting.separateRankSubjects || []).includes(subject);
    });
    assignSubjectScores(assignmentParticipants, subject, rules);
  }

  normalizedSubjects.forEach((subject) => {
    const unifiedRecords = participating.filter((record) => {
      if (typeof record.assignedScores[subject] !== "number") return false;
      const classSetting = classSettings.get(record.classId);
      return !classSetting || classSetting.statisticSubjects.includes(subject);
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

    const separateRecords = participating.filter((record) =>
      typeof record.assignedScores[subject] === "number"
      && (classSettings.get(record.classId)?.separateRankSubjects || []).includes(subject),
    );
    const separateRanks = competitionRanks(
      separateRecords,
      (record) => record.assignedScores[subject] as number,
      (record) => record.studentNo,
    );
    separateRanks.forEach((rank, record) => {
      record.subjectRanks![subject] = rank;
      record.subjectRankScopes![subject] = "separate";
    });
  });

  records.forEach((record) => {
    const classSetting = classSettings.get(record.classId);
    const configured = [
      ...(classSetting?.statisticSubjects || normalizedSubjects),
      ...(classSetting?.separateRankSubjects || []),
    ];
    const statisticSubjects = unique(configured).filter((subject) => normalizedSubjects.includes(subject));
    const complete = attendance.get(record)?.complete === true;
    const total = (mode: "raw" | "assigned"): number | null => {
      if (!complete) return null;
      const scores = mode === "raw" ? record.scores : record.assignedScores;
      const values = statisticSubjects.map((subject) => scores[subject]);
      // Missing an assigned score cannot silently become zero.
      if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
      return Math.round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) * 100) / 100;
    };
    record.rawTotal = total("raw");
    record.assignedTotal = total("assigned");
  });

  const gradeRanks = new Map<GradeScoreRecord, number>();
  const totalRankingGroups = new Map<string, GradeScoreRecord[]>();
  participating.filter((record) => record.assignedTotal !== null).forEach((record) => {
    const key = totalRankingGroupKey(settings, record.classId);
    const group = totalRankingGroups.get(key) || [];
    group.push(record);
    totalRankingGroups.set(key, group);
  });
  totalRankingGroups.forEach((group) => {
    competitionRanks(group, (record) => record.assignedTotal!, (record) => record.studentNo)
      .forEach((rank, record) => gradeRanks.set(record, rank));
  });
  const classGroups = new Map<string, GradeScoreRecord[]>();
  participating.filter((record) => record.assignedTotal !== null).forEach((record) => {
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
  return records.sort((left, right) => (left.gradeRank || Infinity) - (right.gradeRank || Infinity) || left.studentNo.localeCompare(right.studentNo));
}

/** Old persisted exams may contain partial totals. Recalculate only when needed. */
export function ensureExamAttendance(exam: GradeExam): GradeExam {
  const hasLegacyAbsence = exam.records.some((record) =>
    !gradeAttendance(record, exam.subjects, exam.settings).complete
    && (record.rawTotal !== null || record.assignedTotal !== null
      || record.gradeRank !== 0 || record.classRank !== 0));
  if (!hasLegacyAbsence) return exam;
  const base = exam.records.map((record) => ({
    id: record.id,
    studentId: record.studentId,
    studentName: record.studentName,
    studentNo: record.studentNo,
    classId: record.classId,
    className: record.className,
    subjectSelection: record.subjectSelection,
    classType: record.classType,
    includeInStatistics: record.includeInStatistics,
    scores: record.scores,
    sourceAssignedScores: record.sourceAssignedScores,
  }));
  return { ...exam, records: calculateGradeRecords(base, exam.subjects, exam.settings) };
}
