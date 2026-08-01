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
  GradeStatisticsTemplate,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { buildDefaultCustomGradeColumns } from "@/lib/grade-formula";
import { ASSIGNMENT_GRADE_SUBJECTS, DEFAULT_ASSIGNMENT_RULES } from "@/lib/grade-statistics";

interface GradeSettingsEditorProps {
  settings: GradeExamSettings;
  subjects: string[];
  context: GradeImportContext;
  onChange: (settings: GradeExamSettings) => void;
  section?: "all" | "settings" | "templates";
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

function TeacherSettings({
  settings,
  subjects,
  context,
  onChange,
}: GradeSettingsEditorProps) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
        <div className="rounded-lg bg-teal-50 p-2 text-teal-700">
          <UsersRound className="h-4 w-4" />
        </div>
        <div>
          <div className="font-medium text-ink-900">班级任课教师</div>
          <div className="mt-0.5 text-xs text-ink-500">按班级和科目维护任课教师，可为同一班级同一科目选择多人。</div>
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
            {context.classes.map((classItem) => (
              <tr key={classItem.id} className="align-top">
                <td className="sticky left-0 z-10 border-r border-ink-100 bg-paper px-4 py-3 font-medium text-ink-800">
                  {classItem.name}
                </td>
                {subjects.map((subject) => {
                  const teachers = context.teachers.filter((teacher) => teacher.subject === subject);
                  const selected = settings.classSubjectTeacherIds?.[classItem.id]?.[subject]
                    || settings.subjectTeacherIds[subject]
                    || [];
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
}: GradeSettingsEditorProps) {
  const eligibleSubjects = subjects.filter((subject) =>
    ASSIGNMENT_GRADE_SUBJECTS.includes(subject as (typeof ASSIGNMENT_GRADE_SUBJECTS)[number]),
  );
  const assignedSubjects = eligibleSubjects.filter((subject) => settings.assignmentRules[subject]);
  const unassignedSubjects = eligibleSubjects.filter((subject) => !settings.assignmentRules[subject]);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-gold-50 p-2 text-gold-700">
            <Calculator className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-ink-900">赋分对照表</div>
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
        {assignedSubjects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 py-8 text-center text-sm text-ink-400">
            当前所有科目均使用原始分。需要赋分时，从右上角添加科目。
          </div>
        ) : assignedSubjects.map((subject) => {
          const rules = settings.assignmentRules[subject];
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
              <div className="overflow-x-auto">
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
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
        <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
          <SlidersHorizontal className="h-4 w-4" />
        </div>
        <div>
          <div className="font-medium text-ink-900">各班统考与单独排名科目</div>
          <div className="mt-0.5 text-xs text-ink-500">非统考科目使用本班试卷，自动退出年级统一总分与科目排名，并在班内单独排名。</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-xs">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">班级</th>
              <th className="px-4 py-2.5 text-left font-medium">考试科目</th>
              <th className="px-4 py-2.5 text-left font-medium">非统考（班内单独排名）</th>
              <th className="px-4 py-2.5 text-left font-medium">纳入统一总分</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {context.classes.map((classItem) => {
              const current = settings.classSubjects.find((item) => item.classId === classItem.id) || {
                classId: classItem.id,
                examSubjects: subjects,
                statisticSubjects: subjects,
                separateRankSubjects: [],
              };
              const replace = (patch: Partial<typeof current>) => onChange({
                ...settings,
                classSubjects: settings.classSubjects.map((item) => item.classId === classItem.id
                  ? { ...item, ...patch }
                  : item),
              });
              return (
                <tr key={classItem.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-800">{classItem.name}</div>
                    <div className="mt-0.5 text-ink-400">{classItem.studentCount} 人</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-xl flex-wrap gap-1.5">
                      {subjects.map((subject) => (
                        <CheckboxPill
                          key={subject}
                          checked={current.examSubjects.includes(subject)}
                          label={subject}
                          onChange={() => {
                            const examSubjects = toggleValue(current.examSubjects, subject);
                            replace({
                              examSubjects,
                              statisticSubjects: current.statisticSubjects.filter((item) => examSubjects.includes(item)),
                              separateRankSubjects: (current.separateRankSubjects || []).filter((item) => examSubjects.includes(item)),
                            });
                          }}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-xl flex-wrap gap-1.5">
                      {subjects.map((subject) => (
                        <CheckboxPill
                          key={subject}
                          checked={(current.separateRankSubjects || []).includes(subject)}
                          label={subject}
                          onChange={() => {
                            if (!current.examSubjects.includes(subject)) return;
                            const separateRankSubjects = toggleValue(current.separateRankSubjects || [], subject);
                            replace({
                              separateRankSubjects,
                              statisticSubjects: separateRankSubjects.includes(subject)
                                ? current.statisticSubjects.filter((item) => item !== subject)
                                : current.statisticSubjects,
                            });
                          }}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-xl flex-wrap gap-1.5">
                      {subjects.map((subject) => (
                        <CheckboxPill
                          key={subject}
                          checked={current.statisticSubjects.includes(subject)}
                          label={subject}
                          onChange={() => {
                            if (!current.examSubjects.includes(subject)) return;
                            if ((current.separateRankSubjects || []).includes(subject)) return;
                            replace({ statisticSubjects: toggleValue(current.statisticSubjects, subject) });
                          }}
                        />
                      ))}
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
  totalScoreSegment: "总分汇总表",
  coreAndBestElectiveSegment: "语数外分数段表",
  electiveGradeSegment: "选修等级表",
  customTable: "公式自定义表",
};

function FormulaColumnEditor({
  settings,
  template,
  onChange,
}: {
  settings: GradeExamSettings;
  template: GradeStatisticsTemplate;
  onChange: (settings: GradeExamSettings) => void;
}) {
  const columns = template.columns || [];
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-ink-200">
      <div className="flex flex-col gap-2 border-b border-ink-100 bg-purple-50/50 px-3 py-2.5 text-xs text-ink-600 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1.5 font-medium text-purple-800">
          <Braces className="h-3.5 w-3.5" />
          公式列编辑器
        </div>
        <div className="text-ink-500">
          字段：姓名、学号、班级、年级名次、班级名次、原始总分、赋分总分；函数：RAW、SCORE、SCORES、SUM、AVERAGE、BEST、IF、ROUND
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
    </div>
  );
}

function TemplateSettings({
  settings,
  subjects,
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
              <FormulaColumnEditor settings={settings} template={item} onChange={onChange} />
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
