import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  Calculator,
  Check,
  Plus,
  SlidersHorizontal,
  Table2,
  Trash2,
  UsersRound,
} from "lucide-react";
import type {
  GradeExamSettings,
  GradeImportContext,
  GradeScoreRecord,
  GradeStatisticsTemplate,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  buildDefaultCustomGradeColumns,
  displayGradeFormulaValue,
  evaluateGradeFormula,
} from "@/lib/grade-formula";
import {
  ASSIGNMENT_GRADE_SUBJECTS,
  calculateGradeRecords,
  DEFAULT_ASSIGNMENT_RULES,
} from "@/lib/grade-statistics";

interface GradeSettingsEditorProps {
  settings: GradeExamSettings;
  subjects: string[];
  context: GradeImportContext;
  onChange: (settings: GradeExamSettings) => void;
  section?: "all" | "settings" | "templates";
  /** 已由成绩表直接提供赋分的科目，不再重复执行规则换算。 */
  importedAssignedSubjects?: string[];
  /** 当前统计数据来源的完整成绩，用于展示原始分与当前赋分规则的实际对照。 */
  records?: GradeScoreRecord[];
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function CheckboxPill({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
        checked
          ? "border-gold-300 bg-gold-50 text-gold-800"
          : "border-ink-200 bg-paper text-ink-500 hover:border-ink-300",
      )}
    >
      <span className={cn(
        "flex h-3.5 w-3.5 items-center justify-center rounded border",
        checked ? "border-gold-500 bg-gold-500 text-white" : "border-ink-300",
      )}>
        {checked && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </button>
  );
}

function orderedClasses(context: GradeImportContext) {
  return [...context.classes].sort((left, right) =>
    left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" }),
  );
}

function ClassSummary({
  classItem,
  context,
}: {
  classItem: GradeImportContext["classes"][number];
  context: GradeImportContext;
}) {
  const profile = context.classProfiles?.[classItem.id];
  return (
    <div className="min-w-40">
      <div className="font-medium text-ink-800">{classItem.name}</div>
      <div className="mt-1 flex flex-wrap gap-1 text-[11px] font-normal text-ink-500">
        <span className="rounded bg-ink-50 px-1.5 py-0.5">
          班型：{profile?.classTypeName || "未设置"}
        </span>
        <span className="rounded bg-ink-50 px-1.5 py-0.5">
          选科：{profile?.subjectSelections.length ? profile.subjectSelections.join("、") : "未设置"}
        </span>
      </div>
      <div className="mt-1 text-[11px] font-normal text-ink-400">{classItem.studentCount} 人</div>
    </div>
  );
}

function parseTeacherNames(value: string): string[] {
  return [...new Set(value
    .split(/[、,，;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean))]
    .slice(0, 10);
}

function ManualTeacherInput({
  names,
  label,
  hasLinkedTeacher,
  onCommit,
}: {
  names: string[];
  label: string;
  hasLinkedTeacher: boolean;
  onCommit: (names: string[]) => void;
}) {
  const normalized = names.join("、");
  const [value, setValue] = useState(normalized);

  useEffect(() => {
    setValue(normalized);
  }, [normalized]);

  const commit = () => {
    const next = parseTeacherNames(value);
    setValue(next.join("、"));
    onCommit(next);
  };

  return (
    <input
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      placeholder={hasLinkedTeacher ? "可补充其他教师" : "手动输入教师姓名"}
      className="mt-2 w-full min-w-40 rounded border border-ink-200 bg-paper px-2 py-1.5 text-xs text-ink-800 outline-none focus:border-teal-400"
    />
  );
}

function updateClassTeacherSelection(
  settings: GradeExamSettings,
  classId: string,
  subject: string,
  teacherIds: string[],
): GradeExamSettings {
  const classSubjectTeacherIds = {
    ...settings.classSubjectTeacherIds,
    [classId]: {
      ...settings.classSubjectTeacherIds?.[classId],
      [subject]: teacherIds,
    },
  };
  const subjectTeacherIds = [
    ...new Set(
      Object.values(classSubjectTeacherIds)
        .flatMap((classTeachers) => classTeachers[subject] || []),
    ),
  ];
  return {
    ...settings,
    classSubjectTeacherIds,
    subjectTeacherIds: {
      ...settings.subjectTeacherIds,
      [subject]: subjectTeacherIds,
    },
  };
}

function updateClassTeacherNames(
  settings: GradeExamSettings,
  classId: string,
  subject: string,
  teacherNames: string[],
): GradeExamSettings {
  return {
    ...settings,
    classSubjectTeacherNames: {
      ...settings.classSubjectTeacherNames,
      [classId]: {
        ...settings.classSubjectTeacherNames?.[classId],
        [subject]: teacherNames,
      },
    },
  };
}

function TeacherSettings({
  settings,
  subjects,
  context,
  onChange,
}: GradeSettingsEditorProps) {
  const classes = useMemo(() => orderedClasses(context), [context]);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
          <UsersRound className="h-4 w-4" />
        </div>
        <div>
          <div className="font-medium text-ink-900">配置1、班级任课教师</div>
          <div className="mt-0.5 text-xs text-ink-500">已维护教学关系的教师可直接勾选；未关联账号时可在对应单元格手动输入姓名，多个姓名使用顿号分隔。</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-max w-full text-xs">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="sticky left-0 z-10 min-w-28 border-r border-ink-100 bg-ink-50 px-4 py-2.5 text-left font-medium">班级</th>
              {subjects.map((subject) => (
                <th key={subject} className="min-w-44 px-4 py-2.5 text-left font-medium">{subject}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {classes.map((classItem) => (
              <tr key={classItem.id} className="align-top">
                <td className="sticky left-0 z-10 border-r border-ink-100 bg-paper px-4 py-3 font-medium text-ink-800">
                  <ClassSummary classItem={classItem} context={context} />
                </td>
                {subjects.map((subject) => {
                  const teachers = context.teachers.filter((teacher) => teacher.subject === subject);
                  const selected = settings.classSubjectTeacherIds?.[classItem.id]?.[subject]
                    || settings.subjectTeacherIds[subject]
                    || [];
                  const manualNames = settings.classSubjectTeacherNames?.[classItem.id]?.[subject] || [];
                  return (
                    <td key={subject} className="px-4 py-3">
                      <div className="flex max-w-64 flex-wrap gap-1.5">
                        {teachers.length === 0 ? (
                          <span className="text-ink-400">暂无该科教师</span>
                        ) : teachers.map((teacher) => (
                          <CheckboxPill
                            key={teacher.id}
                            checked={selected.includes(teacher.id)}
                            label={teacher.name}
                            onChange={() => onChange(updateClassTeacherSelection(
                              settings,
                              classItem.id,
                              subject,
                              toggleValue(selected, teacher.id),
                            ))}
                          />
                        ))}
                      </div>
                      <ManualTeacherInput
                        names={manualNames}
                        label={`${classItem.name}${subject}手动任课教师`}
                        hasLinkedTeacher={selected.length > 0}
                        onCommit={(teacherNames) => onChange(updateClassTeacherNames(
                          settings,
                          classItem.id,
                          subject,
                          teacherNames,
                        ))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AssignmentSettings({
  settings,
  subjects,
  onChange,
  importedAssignedSubjects = [],
  records = [],
}: GradeSettingsEditorProps) {
  const eligibleSubjects = subjects.filter((subject) =>
    ASSIGNMENT_GRADE_SUBJECTS.includes(subject as (typeof ASSIGNMENT_GRADE_SUBJECTS)[number]),
  );
  const assignedSubjects = eligibleSubjects.filter((subject) => settings.assignmentRules[subject]);
  const importedAssignedSet = new Set(importedAssignedSubjects);
  const unassignedSubjects = eligibleSubjects.filter((subject) =>
    !settings.assignmentRules[subject]
    && !importedAssignedSet.has(subject),
  );
  const recalculatedRecords = useMemo(() => (
    records.length > 0
      ? calculateGradeRecords(records, subjects, settings)
      : []
  ), [records, settings, subjects]);
  const scoreComparisons = useMemo(() => Object.fromEntries(eligibleSubjects.map((subject) => {
    const values = new Map<number, Set<number>>();
    recalculatedRecords.forEach((record) => {
      const raw = record.scores[subject];
      const assigned = record.assignedScores[subject];
      if (typeof raw !== "number" || !Number.isFinite(raw)) return;
      if (typeof assigned !== "number" || !Number.isFinite(assigned)) return;
      const assignedValues = values.get(raw) || new Set<number>();
      assignedValues.add(assigned);
      values.set(raw, assignedValues);
    });
    return [subject, [...values.entries()]
      .sort(([left], [right]) => right - left)
      .map(([raw, assigned]) => ({
        raw,
        assigned: [...assigned].sort((left, right) => right - left),
      }))];
  })), [eligibleSubjects, recalculatedRecords]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-gold-50 p-2 text-gold-700">
            <Calculator className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-ink-900">配置2、赋分对照表</div>
            <div className="mt-0.5 text-xs text-ink-500">仅化学、生物、政治、地理使用赋分；按年级原始分排名划分等级后线性换算。</div>
          </div>
        </div>
        {unassignedSubjects.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {unassignedSubjects.map((subject) => (
              <button
                key={subject}
                type="button"
                onClick={() => onChange({
                  ...settings,
                  assignmentRules: {
                    ...settings.assignmentRules,
                    [subject]: DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule })),
                  },
                })}
                className="rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600 hover:border-gold-300 hover:text-gold-700"
              >
                + {subject}赋分
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-5 p-5">
        {importedAssignedSubjects.length > 0 && (
          <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3">
            <div className="text-sm font-medium text-teal-900">使用成绩表中的赋分</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {importedAssignedSubjects.map((subject) => (
                <Badge key={subject} variant="teal">{subject}：表内赋分</Badge>
              ))}
            </div>
            <div className="mt-2 text-xs text-teal-700">这些科目的赋分会原样保留，修改年级换算规则时不会被覆盖。</div>
          </div>
        )}
        {assignedSubjects.length === 0 && unassignedSubjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 py-8 text-center text-sm text-ink-400">
            {importedAssignedSubjects.length > 0
              ? "当前没有需要按规则换算的科目。"
              : "当前成绩科目不需要等级赋分。"}
          </div>
        ) : assignedSubjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 py-8 text-center text-sm text-ink-400">
            当前所有科目均使用原始分。需要赋分时，从右上角添加科目。
          </div>
        ) : assignedSubjects.map((subject) => {
          const rules = settings.assignmentRules[subject];
          const comparison = scoreComparisons[subject] || [];
          return (
            <div key={subject} className="rounded-lg border border-ink-200 overflow-hidden">
              <div className="flex items-center justify-between bg-mist/70 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-ink-800">{subject}</span>
                  <Badge variant="gold">{rules.length} 个等级</Badge>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...settings.assignmentRules };
                    delete next[subject];
                    onChange({ ...settings, assignmentRules: next });
                  }}
                  className="text-xs text-ink-400 hover:text-red-600"
                >
                  改用原始分
                </button>
              </div>
              <div className="grid xl:grid-cols-2">
                <div className="overflow-x-auto border-b border-ink-100 xl:border-b-0 xl:border-r">
                  <div className="border-b border-ink-100 bg-paper px-3 py-2 text-xs font-medium text-ink-600">赋分规则</div>
                  <table className="min-w-[680px] w-full text-xs">
                    <thead className="bg-ink-50 text-ink-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">等级</th>
                        <th className="px-3 py-2 text-left font-medium">累计百分位起点</th>
                        <th className="px-3 py-2 text-left font-medium">累计百分位终点</th>
                        <th className="px-3 py-2 text-left font-medium">赋分下限</th>
                        <th className="px-3 py-2 text-left font-medium">赋分上限</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {rules.map((rule, ruleIndex) => (
                        <tr key={`${subject}-${ruleIndex}`}>
                          {([
                            ["label", "text"],
                            ["percentileFrom", "number"],
                            ["percentileTo", "number"],
                            ["assignedMin", "number"],
                            ["assignedMax", "number"],
                          ] as const).map(([key, type]) => (
                            <td key={key} className="px-3 py-2">
                              <input
                                type={type}
                                min={type === "number" ? 0 : undefined}
                                max={type === "number" ? 100 : undefined}
                                value={rule[key]}
                                onChange={(event) => {
                                  const updated = rules.map((item, index) => index === ruleIndex
                                    ? { ...item, [key]: type === "number" ? Number(event.target.value) : event.target.value }
                                    : item);
                                  onChange({
                                    ...settings,
                                    assignmentRules: { ...settings.assignmentRules, [subject]: updated },
                                  });
                                }}
                                className="w-full min-w-[5rem] rounded border border-ink-200 bg-paper px-2 py-1.5 text-ink-800 outline-none focus:border-gold-400"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto">
                  <div className="border-b border-ink-100 bg-paper px-3 py-2 text-xs font-medium text-ink-600">本次成绩原始分—赋分对照</div>
                  {comparison.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-ink-400">
                      暂无已上传成绩可生成对照。
                    </div>
                  ) : (
                    <table className="w-full min-w-[320px] text-xs">
                      <thead className="bg-ink-50 text-ink-500">
                        <tr>
                          <th className="px-4 py-2 text-right font-medium">原始分</th>
                          <th className="px-4 py-2 text-right font-medium">赋分</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {comparison.map(({ raw, assigned }) => (
                          <tr key={`${subject}-comparison-${raw}`}>
                            <td className="px-4 py-2 text-right font-medium tabular-nums text-ink-800">{raw}</td>
                            <td className="px-4 py-2 text-right font-semibold tabular-nums text-gold-800">
                              {assigned.join(" / ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ClassSubjectSettings({
  settings,
  subjects,
  context,
  onChange,
}: GradeSettingsEditorProps) {
  const classes = useMemo(() => orderedClasses(context), [context]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
        <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <div>
          <div className="font-medium text-ink-900">配置3、各班统一排名与单独排名科目</div>
          <div className="mt-0.5 text-xs text-ink-500">
            每个科目最多选择一列；切换列时会自动取消另一列。尚未保存配置时，系统按最近一次导入成绩中整班均有分数的科目默认勾选。
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[840px] w-full text-xs">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="w-64 px-4 py-2.5 text-left font-medium">班级</th>
              <th className="px-4 py-2.5 text-left font-medium">纳入统一排名</th>
              <th className="px-4 py-2.5 text-left font-medium">单独排名科目</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {classes.map((classItem) => {
              const profile = context.classProfiles?.[classItem.id];
              const inferredSubjects = profile?.hasImportedScores
                ? subjects.filter((subject) => profile.scoreSubjects.includes(subject))
                : subjects;
              const current = settings.classSubjects.find((item) => item.classId === classItem.id) || {
                classId: classItem.id,
                examSubjects: inferredSubjects,
                statisticSubjects: inferredSubjects,
                separateRankSubjects: [],
              };
              const replace = (patch: Partial<typeof current>) => {
                const next = { ...current, ...patch };
                onChange({
                  ...settings,
                  classSubjects: settings.classSubjects.some((item) => item.classId === classItem.id)
                    ? settings.classSubjects.map((item) => item.classId === classItem.id ? next : item)
                    : [...settings.classSubjects, next],
                });
              };
              const setMode = (subject: string, mode: "cohort" | "class" | "none") => {
                const statisticSubjects = current.statisticSubjects.filter((item) => item !== subject);
                const separateRankSubjects = (current.separateRankSubjects || []).filter((item) => item !== subject);
                if (mode === "cohort") statisticSubjects.push(subject);
                if (mode === "class") separateRankSubjects.push(subject);
                replace({
                  examSubjects: [...new Set([...statisticSubjects, ...separateRankSubjects])],
                  statisticSubjects,
                  separateRankSubjects,
                });
              };

              return (
                <tr key={classItem.id} className="align-top">
                  <td className="px-4 py-3">
                    <ClassSummary classItem={classItem} context={context} />
                    {profile?.hasImportedScores && (
                      <div className="mt-1.5 text-[11px] text-blue-600">已参考最近一次整班成绩</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-2xl flex-wrap gap-1.5">
                      {subjects.map((subject) => {
                        const checked = current.statisticSubjects.includes(subject);
                        return (
                          <CheckboxPill
                            key={subject}
                            checked={checked}
                            label={subject}
                            onChange={() => setMode(subject, checked ? "none" : "cohort")}
                          />
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-2xl flex-wrap gap-1.5">
                      {subjects.map((subject) => {
                        const checked = (current.separateRankSubjects || []).includes(subject);
                        return (
                          <CheckboxPill
                            key={subject}
                            checked={checked}
                            label={subject}
                            onChange={() => setMode(subject, checked ? "none" : "class")}
                          />
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function updateTemplate(
  settings: GradeExamSettings,
  id: string,
  patch: Partial<GradeStatisticsTemplate>,
): GradeExamSettings {
  return {
    ...settings,
    templates: settings.templates.map((item) => item.id === id ? { ...item, ...patch } : item),
  };
}

function addCustomTemplate(settings: GradeExamSettings, subjects: string[]): GradeExamSettings {
  const id = `custom-${Date.now().toString(36)}`;
  return {
    ...settings,
    templates: [
      ...settings.templates,
      {
        id,
        kind: "customTable",
        name: "自定义成绩表",
        enabled: true,
        scoreMode: "assigned",
        subjects: [...subjects],
        columns: buildDefaultCustomGradeColumns(subjects),
      },
    ],
  };
}

const templateKindLabels: Record<GradeStatisticsTemplate["kind"], string> = {
  studentRanking: "学生名次表",
  classAverage: "班级平均分表",
  totalScoreSegment: "总分分数段汇总表",
  coreAndBestElectiveSegment: "语数外分数段表",
  electiveGradeSegment: "选修等级表",
  customTable: "公式自定义表",
};

function FormulaColumnEditor({
  settings,
  template,
  subjects,
  context,
  onChange,
}: {
  settings: GradeExamSettings;
  template: GradeStatisticsTemplate;
  subjects: string[];
  context: GradeImportContext;
  onChange: (settings: GradeExamSettings) => void;
}) {
  const columns = template.columns || [];
  const previewRecords = context.sampleRecords || [];
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-ink-200">
      <div className="flex flex-col gap-2 border-b border-ink-100 bg-purple-50/50 px-3 py-2.5 text-xs text-ink-600 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1.5 font-medium text-purple-800">
          <Braces className="h-3.5 w-3.5" />
          公式列编辑器
        </div>
        <div className="text-ink-500">
          字段：姓名、学号、班级、选科、班型、年级名次、班级名次、原始总分、赋分总分；函数：RAW、SCORE、SCORES、SUM、AVERAGE、BEST、IF、ROUND
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-xs">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="w-12 px-3 py-2 text-center font-medium">列</th>
              <th className="w-44 px-3 py-2 text-left font-medium">表头</th>
              <th className="px-3 py-2 text-left font-medium">公式</th>
              <th className="w-24 px-3 py-2 text-left font-medium">宽度</th>
              <th className="w-14 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {columns.map((column, columnIndex) => {
              const updateColumn = (patch: Partial<typeof column>) => onChange(updateTemplate(settings, template.id, {
                columns: columns.map((candidate) => candidate.id === column.id
                  ? { ...candidate, ...patch }
                  : candidate),
              }));
              return (
                <tr key={column.id}>
                  <td className="px-3 py-2 text-center font-mono text-ink-400">
                    {String.fromCharCode(65 + columnIndex)}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={column.name}
                      onChange={(event) => updateColumn({ name: event.target.value })}
                      className="w-full rounded border border-ink-200 bg-paper px-2 py-1.5 text-ink-800 outline-none focus:border-purple-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={column.formula}
                      onChange={(event) => updateColumn({ formula: event.target.value })}
                      spellCheck={false}
                      className="w-full rounded border border-ink-200 bg-paper px-2 py-1.5 font-mono text-[11px] text-ink-800 outline-none focus:border-purple-400"
                      placeholder={'=SUM(SCORES("语文", "数学", "英语"))'}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={8}
                      max={40}
                      value={column.width || 14}
                      onChange={(event) => updateColumn({ width: Number(event.target.value) })}
                      className="w-full rounded border border-ink-200 bg-paper px-2 py-1.5 text-ink-800 outline-none focus:border-purple-400"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      aria-label={`删除${column.name}列`}
                      disabled={columns.length <= 1}
                      onClick={() => onChange(updateTemplate(settings, template.id, {
                        columns: columns.filter((candidate) => candidate.id !== column.id),
                      }))}
                      className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onChange(updateTemplate(settings, template.id, {
          columns: [
            ...columns,
            {
              id: `column-${Date.now().toString(36)}`,
              name: `新列 ${columns.length + 1}`,
              formula: "=赋分总分",
              width: 14,
            },
          ],
        }))}
        className="flex w-full items-center justify-center gap-1.5 border-t border-ink-100 bg-ink-50/50 px-3 py-2 text-xs text-ink-500 hover:bg-purple-50 hover:text-purple-700"
      >
        <Plus className="h-3.5 w-3.5" />
        添加一列
      </button>
      <div className="border-t border-ink-100">
        <div className="flex items-center justify-between bg-ink-50/70 px-3 py-2 text-xs">
          <div className="font-medium text-ink-700">在线表格实时预览</div>
          <div className="text-ink-400">列公式会自动填充整列；SCORES、BEST 等数组函数可直接参与计算</div>
        </div>
        {previewRecords.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-ink-400">
            导入一次成绩后，这里会使用最近成绩实时预览公式结果。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-max w-full border-collapse text-xs">
              <thead>
                <tr className="bg-paper text-ink-500">
                  <th className="w-12 border-b border-r border-ink-100 px-2 py-2 text-center font-mono font-normal">#</th>
                  {columns.map((column, index) => (
                    <th key={column.id} className="min-w-32 border-b border-r border-ink-100 px-3 py-2 text-left font-medium last:border-r-0">
                      <span className="mr-2 font-mono text-ink-300">{String.fromCharCode(65 + index)}</span>
                      {column.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRecords.map((record, rowIndex) => (
                  <tr key={record.id} className="odd:bg-paper even:bg-ink-50/40">
                    <td className="border-b border-r border-ink-100 px-2 py-2 text-center font-mono text-ink-300">{rowIndex + 1}</td>
                    {columns.map((column) => {
                      let value: string | number;
                      let failed = false;
                      try {
                        value = displayGradeFormulaValue(evaluateGradeFormula(
                          column.formula,
                          record,
                          template.scoreMode,
                          subjects,
                        ));
                      } catch (error) {
                        failed = true;
                        value = error instanceof Error ? error.message : "公式错误";
                      }
                      return (
                        <td
                          key={column.id}
                          title={String(value)}
                          className={cn(
                            "max-w-64 truncate border-b border-r border-ink-100 px-3 py-2 last:border-r-0",
                            failed ? "bg-red-50 text-red-600" : "text-ink-700",
                          )}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateSettings({
  settings,
  subjects,
  context,
  onChange,
}: GradeSettingsEditorProps) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-purple-50 p-2 text-purple-700">
            <Table2 className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-ink-900">统计模板与算法</div>
            <div className="mt-0.5 text-xs text-ink-500">模板决定查询和导出时生成哪些在线表格，可使用安全公式和数组函数定制列。</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(addCustomTemplate(settings, subjects))}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 hover:border-purple-300"
        >
          <Plus className="h-3.5 w-3.5" />
          新增公式表
        </button>
      </div>
      <div className="space-y-3 p-5">
        {settings.templates.map((item) => (
          <div key={item.id} className={cn(
            "rounded-lg border p-4 transition-colors",
            item.enabled ? "border-ink-200 bg-paper" : "border-ink-100 bg-ink-50/50 opacity-70",
          )}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={`${item.enabled ? "停用" : "启用"}${item.name}`}
                  onClick={() => onChange(updateTemplate(settings, item.id, { enabled: !item.enabled }))}
                  className={cn(
                    "mt-1 flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
                    item.enabled ? "bg-gold-500" : "bg-ink-300",
                  )}
                >
                  <span className={cn(
                    "h-4 w-4 rounded-full bg-white shadow transition-transform",
                    item.enabled && "translate-x-4",
                  )} />
                </button>
                <div>
                  <input
                    value={item.name}
                    onChange={(event) => onChange(updateTemplate(settings, item.id, { name: event.target.value }))}
                    className="w-full max-w-sm border-0 bg-transparent p-0 font-medium text-ink-900 outline-none focus:ring-0"
                  />
                  <div className="mt-1 text-xs text-ink-400">{templateKindLabels[item.kind]}</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="grid gap-2 sm:grid-cols-2 lg:w-[22rem]">
                  <Select
                    aria-label={`${item.name}分值口径`}
                    value={item.scoreMode}
                    onChange={(event) => onChange(updateTemplate(settings, item.id, {
                      scoreMode: event.target.value as GradeStatisticsTemplate["scoreMode"],
                    }))}
                    options={[
                      { value: "assigned", label: "赋分口径" },
                      { value: "raw", label: "原始分口径" },
                    ]}
                  />
                  {item.kind.includes("Segment") && item.kind !== "electiveGradeSegment" ? (
                    <Input
                      type="number"
                      min={1}
                      value={item.segmentSize || 10}
                      onChange={(event) => onChange(updateTemplate(settings, item.id, {
                        segmentSize: Number(event.target.value),
                      }))}
                      aria-label={`${item.name}分段宽度`}
                    />
                  ) : (
                    <div />
                  )}
                </div>
                {item.kind === "customTable" && (
                  <button
                    type="button"
                    aria-label={`删除${item.name}`}
                    onClick={() => onChange({
                      ...settings,
                      templates: settings.templates.filter((template) => template.id !== item.id),
                    })}
                    className="rounded-md border border-ink-200 p-2 text-ink-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {item.kind !== "customTable" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {subjects.map((subject) => (
                  <CheckboxPill
                    key={subject}
                    checked={item.subjects.includes(subject)}
                    label={subject}
                    onChange={() => onChange(updateTemplate(settings, item.id, {
                      subjects: toggleValue(item.subjects, subject),
                    }))}
                  />
                ))}
                {(item.kind === "coreAndBestElectiveSegment" || item.kind === "electiveGradeSegment") && (
                  <label className="ml-2 inline-flex items-center gap-2 text-xs text-ink-500">
                    取最高选修
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={item.bestElectiveCount || 1}
                      onChange={(event) => onChange(updateTemplate(settings, item.id, {
                        bestElectiveCount: Number(event.target.value),
                      }))}
                      className="w-14 rounded border border-ink-200 px-2 py-1.5 text-ink-800"
                    />
                    门
                  </label>
                )}
              </div>
            )}

            {item.kind === "customTable" && (
              <FormulaColumnEditor
                settings={settings}
                template={item}
                subjects={subjects}
                context={context}
                onChange={onChange}
              />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export function GradeSettingsEditor(props: GradeSettingsEditorProps) {
  const section = props.section || "all";
  return (
    <div className="space-y-4">
      {(section === "all" || section === "settings") && (
        <>
          <TeacherSettings {...props} />
          <AssignmentSettings {...props} />
          <ClassSubjectSettings {...props} />
        </>
      )}
      {(section === "all" || section === "templates") && <TemplateSettings {...props} />}
    </div>
  );
}
