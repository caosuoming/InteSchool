import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileSpreadsheet,
  Link2,
  Settings2,
  TableProperties,
  Upload,
} from "lucide-react";
import type {
  GradeCohort,
  GradeCohortSettings,
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
  GradeImportRow,
} from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/stores/ui";
import { gradeService } from "@/services/grade";
import {
  GRADE_SUBJECT_OPTIONS,
  detectGradeSheet,
  gradeSubjectScoreAvailability,
  parseGradeRows,
  readGradeWorkbook,
  type GradeColumnMapping,
  type GradeSubjectScoreAvailability,
  type GradeWorkbookData,
} from "@/lib/grade-spreadsheet";
import {
  applyGradeRowBatchResolution,
  autoMatchGradeRows,
  createGradeStudentDraft,
  gradeRowResolutionError,
  orderGradeImportRows,
  unclaimedGradeStudents,
} from "@/lib/grade-matching";
import {
  buildDefaultGradeSettings,
  DEFAULT_ASSIGNMENT_RULES,
  inferClassSubjectAvailability,
  normalizeGradeSettings,
} from "@/lib/grade-statistics";
import {
  ASSIGNABLE_GRADE_SUBJECTS,
  isAssignableGradeSubject,
} from "@/lib/grade-subjects";
import { cn } from "@/lib/utils";
import { GradeSettingsEditor } from "./GradeSettingsEditor";

type WizardStep = 1 | 2 | 3 | 4;

interface GradeImportWizardProps {
  open: boolean;
  schoolId: string;
  teacherId: string;
  cohorts: GradeCohort[];
  onClose: () => void;
  onImported: (exam: GradeExam) => void;
}

const steps = [
  { step: 1 as const, label: "选择文件与字段", icon: Upload },
  { step: 2 as const, label: "匹配学生", icon: Link2 },
  { step: 3 as const, label: "核对设置", icon: Settings2 },
  { step: 4 as const, label: "统计模板", icon: TableProperties },
];

function mappedSubjects(mappings: GradeColumnMapping[]): string[] {
  return gradeSubjectScoreAvailability(mappings).map((item) => item.subject);
}

function deriveExamName(fileName: string): string {
  return fileName.replace(/\.(xlsx|xlsm)$/i, "").trim() || "成绩导入";
}

function roleLabel(role: GradeColumnMapping["role"]): string {
  if (role === "ignore") return "忽略此列";
  if (role === "className") return "班级";
  if (role === "studentName") return "姓名";
  if (role === "studentNo") return "学号/考号";
  if (role === "subjectSelection") return "选科";
  if (role === "classType") return "班型";
  if (role.startsWith("assignedSubject:")) return `赋分：${role.slice("assignedSubject:".length)}`;
  return `科目：${role.slice("subject:".length)}`;
}

function withoutImportedAssignmentRules(
  settings: GradeExamSettings,
  availability: GradeSubjectScoreAvailability[],
): GradeExamSettings {
  const assignmentRules = { ...settings.assignmentRules };
  availability.filter((item) => item.hasAssigned).forEach((item) => {
    delete assignmentRules[item.subject];
  });
  return { ...settings, assignmentRules };
}

function MatchStatus({ row }: { row: GradeImportRow }) {
  const error = gradeRowResolutionError(row);
  if (error) return <Badge variant="red">待处理</Badge>;
  if (row.createStudent) return <Badge variant="teal">新增学生</Badge>;
  if (row.updateStudentName) return <Badge variant="amber">改名匹配</Badge>;
  return <Badge variant="green">已匹配</Badge>;
}

export function GradeImportWizard({
  open,
  schoolId,
  teacherId,
  cohorts,
  onClose,
  onImported,
}: GradeImportWizardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [cohortKey, setCohortKey] = useState("");
  const [context, setContext] = useState<GradeImportContext | null>(null);
  const [cohortSettings, setCohortSettings] = useState<GradeCohortSettings | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [workbook, setWorkbook] = useState<GradeWorkbookData | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mappings, setMappings] = useState<GradeColumnMapping[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [rows, setRows] = useState<GradeImportRow[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<GradeExamSettings | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep(1);
    setCohortKey("");
    setContext(null);
    setCohortSettings(null);
    setWorkbook(null);
    setSheetIndex(0);
    setHeaderRowIndex(0);
    setMappings([]);
    setExamName("");
    setExamDate("");
    setRows([]);
    setSelectedRowKeys(new Set());
    setSettings(null);
    setSubmitting(false);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  useEffect(() => {
    if (!cohortKey) {
      setContext(null);
      setCohortSettings(null);
      return;
    }
    let active = true;
    setContextLoading(true);
    Promise.all([
      gradeService.getImportContext(schoolId, cohortKey),
      gradeService.getCohortSettings(schoolId, cohortKey),
    ])
      .then(([value, preset]) => {
        if (active) {
          setContext(value);
          setCohortSettings(preset);
        }
      })
      .catch((error) => {
        if (active) toast.error("加载年级学生失败", error instanceof Error ? error.message : undefined);
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cohortKey, schoolId]);

  const selectedSheet = workbook?.sheets[sheetIndex] || null;
  const subjects = useMemo(() => mappedSubjects(mappings), [mappings]);
  const scoreAvailability = useMemo(() => gradeSubjectScoreAvailability(mappings), [mappings]);
  const importedAssignedSubjects = useMemo(
    () => scoreAvailability.filter((item) => item.hasAssigned).map((item) => item.subject),
    [scoreAvailability],
  );
  const orderedRows = useMemo(() => orderGradeImportRows(rows), [rows]);
  const unresolvedRows = useMemo(
    () => orderedRows.filter((row) => gradeRowResolutionError(row)),
    [orderedRows],
  );
  const studentById = useMemo(
    () => new Map((context?.students || []).map((student) => [student.id, student])),
    [context],
  );
  const classNameById = useMemo(
    () => new Map((context?.classes || []).map((classItem) => [classItem.id, classItem.name])),
    [context],
  );
  const unclaimedStudents = useMemo(
    () => context ? unclaimedGradeStudents(rows, context.students) : [],
    [context, rows],
  );
  const unresolvedCount = unresolvedRows.length;
  const allUnresolvedSelected = unresolvedCount > 0
    && unresolvedRows.every((row) => selectedRowKeys.has(row.rowKey));
  const previewRows = selectedSheet?.rows.slice(headerRowIndex + 1, headerRowIndex + 7) || [];

  const applySheet = (nextWorkbook: GradeWorkbookData, nextSheetIndex: number) => {
    const sheet = nextWorkbook.sheets[nextSheetIndex];
    const detection = detectGradeSheet(sheet);
    setSheetIndex(nextSheetIndex);
    setHeaderRowIndex(detection.headerRowIndex);
    setMappings(detection.mappings);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileLoading(true);
    try {
      const next = await readGradeWorkbook(file);
      setWorkbook(next);
      setExamName((current) => current.trim() ? current : deriveExamName(file.name));
      applySheet(next, 0);
      toast.success(next.sheets.length === 1 ? "已识别成绩工作表" : `已读取 ${next.sheets.length} 张工作表`);
    } catch (error) {
      setWorkbook(null);
      setMappings([]);
      toast.error("读取 Excel 失败", error instanceof Error ? error.message : undefined);
    } finally {
      setFileLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const updateMapping = (columnIndex: number, role: GradeColumnMapping["role"]) => {
    setMappings((current) => current.map((item) => {
      if (item.columnIndex === columnIndex) return { ...item, role, confidence: "high" };
      if (role !== "ignore" && item.role === role) return { ...item, role: "ignore", confidence: "low" };
      return item;
    }));
  };

  const continueFromFile = () => {
    if (!context) {
      toast.error("请先选择学生年级");
      return;
    }
    if (!selectedSheet || !workbook) {
      toast.error("请选择 Excel 成绩文件");
      return;
    }
    if (!examName.trim()) {
      toast.error("请填写考试名称");
      return;
    }
    try {
      const parsed = parseGradeRows(selectedSheet, headerRowIndex, mappings);
      const matched = autoMatchGradeRows(parsed, context);
      setRows(matched);
      setSelectedRowKeys(new Set());
      const importedSubjects = mappedSubjects(mappings);
      const studentClassIds = new Map<string, string>(
        context.students.map((student): [string, string] => [student.id, student.classId]),
      );
      const classStudentCounts = Object.fromEntries(context.classes.map((classItem) => [
        classItem.id,
        context.students.filter((student) => student.classId === classItem.id).length
          + matched.filter((row) => row.createStudent?.classId === classItem.id).length,
      ]));
      const classSubjectAvailability = inferClassSubjectAvailability(
        matched.flatMap((row) => {
          const classId: string | undefined = row.createStudent?.classId
            || (row.studentId ? studentClassIds.get(row.studentId) : undefined);
          return classId ? [{ classId, scores: row.scores, assignedScores: row.assignedScores }] : [];
        }),
        importedSubjects,
        classStudentCounts,
      );
      const defaults = buildDefaultGradeSettings(
        importedSubjects,
        context.classes.map((item) => item.id),
        context.teachers,
        classSubjectAvailability,
      );
      const formulaDefaults = context.templateProfile
        ? { ...defaults, templates: structuredClone(context.templateProfile.templates) }
        : defaults;
      const preparedSettings = cohortSettings
        ? normalizeGradeSettings(
            context.templateProfile
              ? { ...cohortSettings.settings, templates: structuredClone(context.templateProfile.templates) }
              : cohortSettings.settings,
            importedSubjects,
            context.classes.map((item) => item.id),
            context.teachers.map((item) => item.id),
          )
        : formulaDefaults;
      setSettings(withoutImportedAssignmentRules(preparedSettings, scoreAvailability));
      setStep(2);
    } catch (error) {
      toast.error("字段映射不完整", error instanceof Error ? error.message : undefined);
    }
  };

  const setRowResolution = (rowKey: string, value: string) => {
    setRows((current) => current.map((row) => {
      if (row.rowKey !== rowKey) return row;
      if (value === "__new__") {
        if (!context) return row;
        return {
          ...row,
          studentId: undefined,
          updateStudentName: false,
          createStudent: createGradeStudentDraft(row, context),
        };
      }
      if (!value) {
        return { ...row, studentId: undefined, createStudent: undefined, updateStudentName: false };
      }
      const student = context?.students.find((item) => item.id === value);
      return {
        ...row,
        studentId: value,
        createStudent: undefined,
        updateStudentName: Boolean(student && student.name.trim() !== row.sourceName.trim()),
      };
    }));
  };

  const toggleRowSelection = (rowKey: string) => {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const toggleAllUnresolved = () => {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (allUnresolvedSelected) {
        unresolvedRows.forEach((row) => next.delete(row.rowKey));
      } else {
        unresolvedRows.forEach((row) => next.add(row.rowKey));
      }
      return next;
    });
  };

  const applyBatchResolution = (resolution: "create" | "clear") => {
    if (!context || selectedRowKeys.size === 0) return;
    setRows((current) => applyGradeRowBatchResolution(current, selectedRowKeys, resolution, context));
    toast.success(
      resolution === "create" ? "已批量设为新增学生" : "已清除所选处理结果",
      `共处理 ${selectedRowKeys.size} 行`,
    );
    setSelectedRowKeys(new Set());
  };

  const updateNewStudent = (
    rowKey: string,
    patch: Partial<NonNullable<GradeImportRow["createStudent"]>>,
  ) => {
    setRows((current) => current.map((row) => row.rowKey === rowKey && row.createStudent
      ? { ...row, createStudent: { ...row.createStudent, ...patch } }
      : row));
  };

  const continueFromMatching = () => {
    if (unresolvedCount > 0) {
      toast.error(`仍有 ${unresolvedCount} 行学生未完成匹配`);
      return;
    }
    const existingIds = rows.map((row) => row.studentId).filter(Boolean);
    if (new Set(existingIds).size !== existingIds.length) {
      toast.error("同一名已有学生不能匹配多行成绩");
      return;
    }
    const importedNos = rows
      .map((row) => row.createStudent?.studentNo.trim())
      .filter((value): value is string => Boolean(value));
    if (new Set(importedNos).size !== importedNos.length) {
      toast.error("新增学生学号存在重复");
      return;
    }
    setStep(3);
  };

  const setSubjectScoreHandling = (subject: string, mode: "raw" | "convert") => {
    if (!settings) return;
    const assignmentRules = { ...settings.assignmentRules };
    if (mode === "convert") {
      assignmentRules[subject] = DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule }));
    } else {
      delete assignmentRules[subject];
    }
    setSettings({ ...settings, assignmentRules });
  };

  const handleSubmit = async () => {
    if (!workbook || !selectedSheet || !settings || !context) return;
    setSubmitting(true);
    try {
      const exam = await gradeService.importExam(schoolId, teacherId, {
        cohortKey,
        name: examName.trim(),
        examDate: examDate || undefined,
        sourceFileName: workbook.fileName,
        sourceSheetName: selectedSheet.name,
        subjects,
        rows,
        settings,
      });
      toast.success("成绩导入完成", `已导入 ${exam.records.length} 名学生、${exam.subjects.length} 个科目`);
      onImported(exam);
      onClose();
    } catch (error) {
      toast.error("成绩导入失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="text-xs text-ink-400">
        {step === 2 && `${rows.length - unresolvedCount}/${rows.length} 行已完成匹配`}
        {step === 3 && "保存后仍可在统计设置中重新计算"}
        {step === 4 && "导入后自动生成成绩查询与统计表"}
      </div>
      <div className="flex gap-2">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep((step - 1) as WizardStep)} disabled={submitting}>
            <ArrowLeft className="h-4 w-4" />
            上一步
          </Button>
        )}
        {step === 1 && (
          <Button variant="gold" onClick={continueFromFile} disabled={fileLoading || contextLoading}>
            下一步：匹配学生
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {step === 2 && (
          <Button variant="gold" onClick={continueFromMatching} disabled={unresolvedCount > 0}>
            下一步：核对设置
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {step === 3 && (
          <Button variant="gold" onClick={() => setStep(4)}>
            下一步：统计模板
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {step === 4 && (
          <Button variant="gold" onClick={handleSubmit} loading={submitting}>
            <Check className="h-4 w-4" />
            完成导入
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      size="full"
      className="h-[94vh]"
      title="导入学生成绩"
      description="按年级读取 Excel，核对字段与学生名单，再生成可查询、可重算的成绩数据。"
      footer={footer}
    >
      <div className="mb-6 grid grid-cols-4 gap-2">
        {steps.map((item) => {
          const Icon = item.icon;
          const active = step === item.step;
          const finished = step > item.step;
          return (
            <div
              key={item.step}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5",
                active && "border-gold-300 bg-gold-50 text-gold-800",
                finished && "border-emerald-200 bg-emerald-50 text-emerald-700",
                !active && !finished && "border-ink-100 bg-ink-50 text-ink-400",
              )}
            >
              <span className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                active ? "bg-gold-500 text-white" : finished ? "bg-emerald-500 text-white" : "bg-ink-200 text-ink-500",
              )}>
                {finished ? <Check className="h-3.5 w-3.5" /> : item.step}
              </span>
              <Icon className="hidden h-4 w-4 sm:block" />
              <span className="hidden text-xs font-medium md:block">{item.label}</span>
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <Select
              label="学生年级"
              value={cohortKey}
              onChange={(event) => setCohortKey(event.target.value)}
              placeholder="选择本次成绩所属年级"
              options={cohorts.map((item) => ({
                value: item.key,
                label: `${item.label}（${item.studentCount} 人）`,
              }))}
            />
            <Input
              label="考试名称"
              value={examName}
              onChange={(event) => setExamName(event.target.value)}
              placeholder="例如：2026届高三第一次月考"
            />
            <Input
              label="考试日期（可选）"
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
            />
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={!cohortKey || fileLoading || contextLoading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleFile(event.dataTransfer.files[0]);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
              cohortKey
                ? "border-ink-200 bg-ink-50/50 hover:border-gold-300 hover:bg-gold-50/40"
                : "cursor-not-allowed border-ink-100 bg-ink-50 text-ink-300",
            )}
          >
            {fileLoading || contextLoading ? (
              <Spinner size={28} />
            ) : (
              <FileSpreadsheet className="mb-3 h-9 w-9 text-emerald-600" />
            )}
            <div className="text-sm font-medium text-ink-800">
              {workbook ? workbook.fileName : "点击或拖入 Excel 成绩文件"}
            </div>
            <div className="mt-1 text-xs text-ink-400">支持 .xlsx / .xlsm，单文件不超过 20MB；旧版 .xls 请先另存为 .xlsx。</div>
          </button>

          {workbook && selectedSheet && (
            <div className="rounded-xl border border-ink-200 overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-ink-100 bg-mist/50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-medium text-ink-800">字段识别与匹配</div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    系统识别第 {headerRowIndex + 1} 行为表头。请确认班级、姓名、学号和成绩科目。
                  </div>
                </div>
                {workbook.sheets.length > 1 && (
                  <Select
                    aria-label="选择工作表"
                    className="min-w-48"
                    value={String(sheetIndex)}
                    onChange={(event) => {
                      try {
                        applySheet(workbook, Number(event.target.value));
                      } catch (error) {
                        toast.error("工作表识别失败", error instanceof Error ? error.message : undefined);
                      }
                    }}
                    options={workbook.sheets.map((sheet, index) => ({ value: String(index), label: sheet.name }))}
                  />
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-xs">
                  <thead className="bg-ink-50 text-ink-600">
                    <tr>
                      {mappings.map((mapping) => (
                        <th key={mapping.columnIndex} className="min-w-36 border-r border-ink-100 px-2 py-2 text-left align-top last:border-r-0">
                          <div className="mb-1.5 truncate font-medium" title={mapping.header}>{mapping.header}</div>
                          <select
                            value={mapping.role}
                            onChange={(event) => updateMapping(mapping.columnIndex, event.target.value as GradeColumnMapping["role"])}
                            className={cn(
                              "w-full rounded border px-2 py-1.5 text-xs outline-none",
                              mapping.role === "ignore"
                                ? "border-ink-200 bg-paper text-ink-500"
                                : "border-gold-300 bg-gold-50 text-gold-800",
                            )}
                          >
                            <option value="ignore">忽略此列</option>
                            <option value="className">班级</option>
                            <option value="studentName">姓名</option>
                            <option value="studentNo">学号/考号</option>
                            <option value="subjectSelection">选科</option>
                            <option value="classType">班型</option>
                            <optgroup label="原始成绩">
                              {[...new Set([...GRADE_SUBJECT_OPTIONS, mapping.header])].map((subject) => (
                                <option key={subject} value={`subject:${subject}`}>原始分：{subject}</option>
                              ))}
                            </optgroup>
                            <optgroup label="表内赋分">
                              {ASSIGNABLE_GRADE_SUBJECTS.map((subject) => (
                                <option key={subject} value={`assignedSubject:${subject}`}>赋分：{subject}</option>
                              ))}
                            </optgroup>
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {previewRows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {mappings.map((mapping) => (
                          <td key={mapping.columnIndex} className="max-w-56 truncate border-r border-ink-100 px-2 py-2 text-ink-600 last:border-r-0">
                            {row[mapping.columnIndex] === null || row[mapping.columnIndex] === undefined
                              ? <span className="text-ink-300">—</span>
                              : String(row[mapping.columnIndex])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
                <span>当前映射：</span>
                {mappings.filter((item) => item.role !== "ignore").map((item) => (
                  <Badge
                    key={item.columnIndex}
                    variant={item.role.startsWith("assignedSubject:")
                      ? "teal"
                      : item.role.startsWith("subject:")
                        ? "gold"
                        : "ink"}
                  >
                    {item.header} → {roleLabel(item.role)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && context && (
        <div className="rounded-xl border border-ink-200 overflow-hidden">
          <div className="border-b border-ink-100 bg-mist/50 px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-ink-800">学生名单对应</div>
                <div className="mt-0.5 text-xs text-ink-400">待处理记录优先显示；系统按学号、班级和姓名自动匹配，剩余记录可逐行或批量处理。</div>
              </div>
              <div className="flex gap-2">
                <Badge variant="green">已完成 {rows.length - unresolvedCount}</Badge>
                {unresolvedCount > 0 && <Badge variant="red">待处理 {unresolvedCount}</Badge>}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={unresolvedCount === 0}
                onClick={toggleAllUnresolved}
              >
                {allUnresolvedSelected ? "取消选择待处理" : `选择全部待处理（${unresolvedCount}）`}
              </Button>
              <span className="text-xs text-ink-500">已选择 {selectedRowKeys.size} 行</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedRowKeys.size === 0}
                  onClick={() => applyBatchResolution("clear")}
                >
                  清除所选处理
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  disabled={selectedRowKeys.size === 0}
                  onClick={() => applyBatchResolution("create")}
                >
                  批量作为新增学生
                </Button>
              </div>
            </div>
          </div>
          <div className="max-h-[58vh] overflow-auto">
            <table className="min-w-[1100px] w-full text-xs">
              <thead className="sticky top-0 z-10 bg-ink-50 text-ink-500 shadow-sm">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-center font-medium">
                    <input
                      type="checkbox"
                      aria-label="选择全部待处理记录"
                      checked={allUnresolvedSelected}
                      disabled={unresolvedCount === 0}
                      onChange={toggleAllUnresolved}
                      className="h-4 w-4 accent-gold-500"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">Excel 行</th>
                  <th className="px-3 py-2.5 text-left font-medium">原班级</th>
                  <th className="px-3 py-2.5 text-left font-medium">姓名</th>
                  <th className="px-3 py-2.5 text-left font-medium">学号/考号</th>
                  <th className="px-3 py-2.5 text-left font-medium">选科</th>
                  <th className="px-3 py-2.5 text-left font-medium">班型</th>
                  <th className="px-3 py-2.5 text-left font-medium">处理方式</th>
                  <th className="px-3 py-2.5 text-left font-medium">匹配或新增信息</th>
                  <th className="px-3 py-2.5 text-left font-medium">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {orderedRows.map((row) => {
                  const selectedStudent = row.studentId ? studentById.get(row.studentId) : undefined;
                  const unresolved = Boolean(gradeRowResolutionError(row));
                  return (
                    <tr key={row.rowKey} className={unresolved ? "bg-red-50/40" : undefined}>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`选择 Excel 第 ${row.sourceRowNumber} 行`}
                          checked={selectedRowKeys.has(row.rowKey)}
                          onChange={() => toggleRowSelection(row.rowKey)}
                          className="h-4 w-4 accent-gold-500"
                        />
                      </td>
                      <td className="px-3 py-3 text-ink-400">{row.sourceRowNumber}</td>
                      <td className="px-3 py-3 text-ink-700">{row.sourceClassName || "未填写"}</td>
                      <td className="px-3 py-3 font-medium text-ink-900">{row.sourceName}</td>
                      <td className="px-3 py-3 text-ink-600">{row.sourceStudentNo || "未填写"}</td>
                      <td className="px-3 py-3 text-ink-600">{row.subjectSelection || "未填写"}</td>
                      <td className="px-3 py-3 text-ink-600">{row.classType || "未填写"}</td>
                      <td className="px-3 py-3">
                        <select
                          value={row.createStudent ? "__new__" : row.studentId || ""}
                          onChange={(event) => setRowResolution(row.rowKey, event.target.value)}
                          className="w-64 rounded border border-ink-200 bg-paper px-2 py-2 text-xs text-ink-700 outline-none focus:border-gold-400"
                        >
                          <option value="">请选择处理方式</option>
                          {selectedStudent && (
                            <option value={selectedStudent.id}>
                              当前匹配 · {classNameById.get(selectedStudent.classId) || "未分班"} · {selectedStudent.name} · {selectedStudent.studentNo}
                            </option>
                          )}
                          <optgroup label={`名单库中尚未匹配（${unclaimedStudents.length}）`}>
                            {unclaimedStudents.length > 0 ? unclaimedStudents.map((student) => (
                              <option key={student.id} value={student.id}>
                                {classNameById.get(student.classId) || "未分班"} · {student.name} · {student.studentNo}
                              </option>
                            )) : (
                              <option disabled>名单库学生均已匹配</option>
                            )}
                          </optgroup>
                          <option value="__new__">＋ 作为新增学生导入</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        {row.createStudent ? (
                          <div className="grid min-w-[360px] grid-cols-3 gap-2">
                            <input
                              aria-label={`${row.sourceName}新增姓名`}
                              value={row.createStudent.name}
                              onChange={(event) => updateNewStudent(row.rowKey, { name: event.target.value })}
                              placeholder="姓名"
                              className="rounded border border-ink-200 px-2 py-1.5 outline-none focus:border-gold-400"
                            />
                            <input
                              aria-label={`${row.sourceName}新增学号`}
                              value={row.createStudent.studentNo}
                              onChange={(event) => updateNewStudent(row.rowKey, { studentNo: event.target.value })}
                              placeholder="学号"
                              className="rounded border border-ink-200 px-2 py-1.5 outline-none focus:border-gold-400"
                            />
                            <select
                              aria-label={`${row.sourceName}新增班级`}
                              value={row.createStudent.classId}
                              onChange={(event) => updateNewStudent(row.rowKey, { classId: event.target.value })}
                              className="rounded border border-ink-200 px-2 py-1.5 outline-none focus:border-gold-400"
                            >
                              <option value="">选择班级</option>
                              {context.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                          </div>
                        ) : selectedStudent ? (
                          <div className="min-w-[260px]">
                            <div className="text-ink-700">
                              {classNameById.get(selectedStudent.classId) || "未分班"} · {selectedStudent.name}
                            </div>
                            {selectedStudent.name.trim() !== row.sourceName.trim() && (
                              <label className="mt-1.5 flex items-center gap-2 text-amber-700">
                                <input
                                  type="checkbox"
                                  checked={Boolean(row.updateStudentName)}
                                  onChange={(event) => setRows((current) => current.map((item) => item.rowKey === row.rowKey
                                    ? { ...item, updateStudentName: event.target.checked }
                                    : item))}
                                />
                                学生已改名，同步档案为“{row.sourceName}”
                              </label>
                            )}
                          </div>
                        ) : <span className="text-ink-300">—</span>}
                      </td>
                      <td className="px-3 py-3"><MatchStatus row={row} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 3 && context && settings && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-ink-200 bg-paper">
            <div className="border-b border-ink-100 bg-mist/50 px-5 py-4">
              <div className="font-medium text-ink-900">原始分与赋分处理</div>
              <div className="mt-0.5 text-xs text-ink-500">
                表格已有赋分时直接使用；只有原始分的化学、生物、政治、地理可选择保留原始分或按规则换算。
              </div>
            </div>
            <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
              {scoreAvailability.map((item) => {
                const canConvert = item.hasRaw && !item.hasAssigned && isAssignableGradeSubject(item.subject);
                const converting = Boolean(settings.assignmentRules[item.subject]);
                return (
                  <div key={item.subject} className="rounded-lg border border-ink-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink-900">{item.subject}</span>
                      {item.hasRaw && item.hasAssigned ? (
                        <Badge variant="teal">原始分 + 表内赋分</Badge>
                      ) : item.hasAssigned ? (
                        <Badge variant="teal">仅表内赋分</Badge>
                      ) : canConvert && converting ? (
                        <Badge variant="gold">规则换算赋分</Badge>
                      ) : (
                        <Badge variant="ink">仅原始分</Badge>
                      )}
                    </div>
                    {item.hasRaw && item.hasAssigned && (
                      <div className="mt-2 text-xs text-ink-500">原始分用于原始口径，表内赋分用于赋分口径。</div>
                    )}
                    {!item.hasRaw && item.hasAssigned && (
                      <div className="mt-2 text-xs text-ink-500">原始分留空，排名和默认统计直接引用表内赋分。</div>
                    )}
                    {canConvert && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSubjectScoreHandling(item.subject, "raw")}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-xs",
                            !converting
                              ? "border-ink-500 bg-ink-50 font-medium text-ink-800"
                              : "border-ink-200 text-ink-500 hover:border-ink-300",
                          )}
                        >
                          只用原始分
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubjectScoreHandling(item.subject, "convert")}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-xs",
                            converting
                              ? "border-gold-400 bg-gold-50 font-medium text-gold-800"
                              : "border-ink-200 text-ink-500 hover:border-gold-300",
                          )}
                        >
                          换算赋分
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <GradeSettingsEditor
            settings={settings}
            subjects={subjects}
            context={context}
            onChange={setSettings}
            section="settings"
            importedAssignedSubjects={importedAssignedSubjects}
          />
        </div>
      )}

      {step === 4 && context && settings && (
        <GradeSettingsEditor
          settings={settings}
          subjects={subjects}
          context={context}
          onChange={setSettings}
          section="templates"
        />
      )}
    </Modal>
  );
}
