import { useMemo, useState } from "react";
import type { ExamPaperQuestion, Student } from "@/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MathHtml } from "@/components/ui/MathHtml";
import {
  canAdoptUsageExcelAnswer, detectUsageHeader, getUsageMetadataUpdates, getUsageQuestionSlots, prepareUsageImport, readUsageWorkbook, usageConflictKey,
  type UsageColumn, type UsageColumnRole, type UsageImportItem, type UsageMetadataUpdate, type UsageSheet,
} from "@/lib/exam-usage-spreadsheet";

interface Props {
  open: boolean;
  onClose: () => void;
  questions: ExamPaperQuestion[];
  subject?: string;
  students: Student[];
  onImport: (items: UsageImportItem[], metadataUpdates: UsageMetadataUpdate[]) => Promise<void>;
}

function field(role: UsageColumnRole) {
  return role.split(":")[0];
}

function changeRole(column: UsageColumn, part: "field" | "question" | "sub", value: string, slots: ReturnType<typeof getUsageQuestionSlots>): UsageColumnRole {
  const pieces = column.role.split(":");
  const kind = part === "field" ? value : pieces[0];
  if (kind === "ignore" || kind === "studentName" || kind === "studentNo") return kind;
  const previous = pieces[0];
  const question = part === "question" ? value
    : part === "field" && kind === "subscore" && previous !== "subscore"
      ? String((slots[Number(pieces[1]) - 1]?.questionIndex ?? 0) + 1)
      : part === "field" && previous === "subscore" && kind !== "subscore"
        ? String(slots.find((slot) => slot.questionIndex === Number(pieces[1]) - 1)?.number ?? 1)
        : pieces[1] || "1";
  if (kind === "subscore") {
    const sub = part === "sub" ? value : pieces[2] || "1";
    return `subscore:${Number(question)}:${Number(sub) || 1}`;
  }
  return `${kind}:${Number(question)}` as UsageColumnRole;
}

export function ExamPaperUsageImportModal({ open, onClose, questions, subject, students, onImport }: Props) {
  const slots = useMemo(() => getUsageQuestionSlots(questions, subject), [questions, subject]);
  const [sheets, setSheets] = useState<UsageSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState<UsageColumn[]>([]);
  const [filename, setFilename] = useState("");
  const [working, setWorking] = useState(false);
  const [sources, setSources] = useState<Record<string, "paper" | "excel">>({});
  const [error, setError] = useState("");
  const sheet = sheets[selectedSheet];
  const preview = useMemo(() => sheet
    ? prepareUsageImport(sheet, headerRow, columns, questions, students, sources, subject)
    : null, [sheet, headerRow, columns, questions, students, sources, subject]);
  const conflictsResolved = preview?.conflicts?.every((conflict) => Boolean(sources[usageConflictKey(conflict)])) ?? true;

  function activateSheet(workbook: UsageSheet[], index: number, row?: number) {
    const chosen = workbook[index];
    if (!chosen) return;
    const detected = detectUsageHeader(chosen, slots.length);
    setSources({});
    setSelectedSheet(index);
    setHeaderRow(row ?? detected.headerRow);
    setColumns(row === undefined ? detected.columns : (chosen.rows[row] || []).map((cell, i) => ({
      index: i, header: String(cell ?? `第${i + 1}列`),
      role: "ignore" as const,
    })));
  }

  async function loadFile(file: File) {
    setWorking(true);
    setSources({});
    setError("");
    try {
      const workbook = await readUsageWorkbook(file);
      setSheets(workbook);
      setFilename(file.name);
      activateSheet(workbook, 0);
    } catch (cause) {
      setSheets([]);
      setFilename("");
      setError(cause instanceof Error ? cause.message : "Excel 解析失败");
    } finally {
      setWorking(false);
    }
  }

  async function submit() {
    if (!preview?.entries.length || !conflictsResolved) return;
    setWorking(true);
    setError("");
    try {
      const metadataUpdates: UsageMetadataUpdate[] = getUsageMetadataUpdates(
        questions, subject, preview.conflicts || [], sources,
      );
      await onImport(preview.entries, metadataUpdates);
      setSheets([]);
      setFilename("");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "数据导入失败");
    } finally {
      setWorking(false);
    }
  }

  const questionOptions = slots.map((slot) => (
    <option key={slot.number} value={slot.number}>
      第{slot.number}题{slot.part ? "（题组第" + slot.part + "小题）" : ""}（{slot.maxScore}分，答案：{slot.answer?.slice(0, 30) || "未设置"}）
    </option>
  ));
  const parentOptions = questions.map((question, index) => (
    <option key={question.id} value={index + 1}>第{index + 1}个试卷题目（{question.score}分）</option>
  ));

  return (
    <Modal
      open={open}
      onClose={() => { if (!working) onClose(); }}
      title="上传试卷使用数据"
      size="xl"
      description="按学生学号或姓名匹配使用班级；地理选择题组按卷面每道小题逐题匹配，成绩汇总保存到所属题组。"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={working}>取消</Button>
          <Button variant="gold" onClick={() => void submit()}
            disabled={working || !preview?.entries.length || students.length === 0 || !conflictsResolved} loading={working}>
            确认导入 {preview?.entries.length || 0} 条
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {students.length === 0 && <p className="rounded-md bg-amber-50 p-3 text-amber-800">
          请先在试卷预览中添加使用班级，并确保班级下已有学生。
        </p>}
        <label className="block font-medium text-ink-700">
          Excel 文件（.xlsx / .xlsm，最大 20MB）
          <input type="file" accept=".xlsx,.xlsm"
            aria-label="答题数据 Excel"
            className="mt-1 block w-full rounded-md border border-ink-200 bg-paper p-2 text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
              event.target.value = "";
            }} />
        </label>
        {filename && sheet && <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>工作表
              <select aria-label="工作表" className="input-base mt-1 w-full" value={selectedSheet}
                onChange={(event) => activateSheet(sheets, Number(event.target.value))}>
                {sheets.map((item, i) => <option value={i} key={i}>{item.name}</option>)}
              </select>
            </label>
            <label>表头所在行
              <select aria-label="表头所在行" className="input-base mt-1 w-full" value={headerRow}
                onChange={(event) => activateSheet(sheets, selectedSheet, Number(event.target.value))}>
                {sheet.rows.slice(0, 20).map((row, i) =>
                  <option key={i} value={i}>第{i + 1}行：{row.slice(0, 3).map((v) => String(v ?? "")).join(" / ")}</option>)}
              </select>
            </label>
          </div>
          <div>
            <p className="mb-2 font-medium text-ink-700">字段与试卷题号匹配（可修改自动识别结果）</p>
            <div className="max-h-72 overflow-auto rounded-lg border border-ink-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-mist text-ink-600">
                  <tr><th className="p-2">Excel 列</th><th className="p-2">字段类型</th><th className="p-2">试卷题号</th><th className="p-2">小题号</th></tr>
                </thead>
                <tbody>
                  {columns.map((column) => {
                    const parts = column.role.split(":");
                    const kind = field(column.role);
                    const currentSlot = kind === "subscore" ? undefined : slots[Number(parts[1]) - 1];
                    const update = (part: "field" | "question" | "sub", value: string) => {
                      setSources({});
                      setColumns((current) => current.map((item) => item.index === column.index
                        ? { ...item, role: changeRole(item, part, value, slots) } : item));
                    };
                    return <tr key={column.index} className="border-t border-ink-100">
                      <td className="p-2 text-ink-700">{column.header}{currentSlot?.part ? "（题组第" + currentSlot.part + "小题）" : ""}</td>
                      <td className="p-2">
                        <select aria-label={`${column.header}字段类型`} className="input-base w-full min-w-24"
                          value={kind} onChange={(event) => update("field", event.target.value)}>
                          <option value="ignore">忽略</option>
                          <option value="studentName">学生姓名</option>
                          <option value="studentNo">学生学号</option>
                          <option value="score">题目得分</option>
                          <option value="answer">学生作答</option>
                          <option value="subscore">小题得分</option>
                        </select>
                      </td>
                      <td className="p-2">
                        {["score", "answer", "subscore"].includes(kind) &&
                          <select aria-label={`${column.header}题号`} className="input-base w-full min-w-24"
                            value={parts[1] || "1"} onChange={(event) => update("question", event.target.value)}>
                            {kind === "subscore" ? parentOptions : questionOptions}
                          </select>}
                      </td>
                      <td className="p-2">
                        {kind === "subscore" && <input type="number" min="1" max="999"
                          aria-label={`${column.header}小题号`}
                          className="input-base w-20" value={parts[2] || "1"}
                          onChange={(event) => update("sub", event.target.value)} />}
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {preview && <div className="space-y-2 rounded-lg border border-ink-200 p-3">
            {Boolean(preview.conflicts?.length) && <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
              <p className="font-semibold">Excel 标注与试卷数据存在差异，请人工确认</p>
              <p className="mb-2 text-xs">请逐项选择采用的数据来源；选择 Excel 会同步修改试卷题目信息。</p>
              {preview.conflicts?.map((conflict) => {
                const question = questions.find((item) => item.id === conflict.paperQuestionId);
                const key = usageConflictKey(conflict);
                return <fieldset key={key} className="my-2 rounded-md border border-amber-200 bg-white p-3">
                  <legend className="px-1 text-xs font-semibold">第{conflict.questionNo}题{conflict.attribute === "score" ? "分值" : "标准答案"}不同</legend>
                  {conflict.attribute === "answer" && question && <div className="mb-2 max-h-52 overflow-auto text-xs text-ink-800">
                    <MathHtml>{question.stem || "（无题干）"}</MathHtml>
                    {question.options?.map((option, index) => <div key={index} className="mt-1 flex gap-1">
                      <span>{String.fromCharCode(65 + index)}.</span><MathHtml>{option}</MathHtml>
                    </div>)}
                  </div>}
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name={key} checked={sources[key] === "paper"}
                        onChange={() => setSources((current) => ({ ...current, [key]: "paper" }))} />
                      采用试卷（{conflict.paper || "未设置"}{conflict.attribute === "score" ? "分" : ""}）
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="radio" name={key} checked={sources[key] === "excel"}
                        disabled={!canAdoptUsageExcelAnswer(questions, subject, conflict)}
                        onChange={() => setSources((current) => ({ ...current, [key]: "excel" }))} />
                      采用 Excel（{conflict.excel}{conflict.attribute === "score" ? "分" : ""}）
                    </label>
                  </div>
                </fieldset>;
              })}
            </div>}
            {preview.firstStudent && <details open className="text-xs text-ink-700"><summary>首位匹配学生：{preview.firstStudent.name}（Excel 原始数据）</summary>
              <div className="mt-1 max-h-24 overflow-auto">{preview.firstStudent.values.map((cell, index) =>
                <p key={index}>{cell.header}：{cell.value || "—"}</p>)}</div>
            </details>}
            <p className="font-medium text-ink-900">导入预览：匹配 {preview.matchedStudents} 名学生、{preview.mappedColumns} 列题目数据、{preview.entries.length} 条答题记录</p>
            <p className="text-xs text-ink-500">空白单元格不覆盖已有记录；相同学生和题目的有效字段会合并保存。导入会覆盖对应题目的既有得分。</p>
            {preview.warnings.length > 0 && <div className="max-h-24 overflow-y-auto text-xs text-amber-700">
              {preview.warnings.slice(0, 12).map((message, i) => <p key={i}>{message}</p>)}
              {preview.warnings.length > 12 && <p>另有 {preview.warnings.length - 12} 条提示</p>}
            </div>}
            {preview.unmatchedStudents.length > 0 && <details className="text-xs text-ink-600">
              <summary>查看未匹配的学生行</summary>
              <div className="max-h-24 overflow-y-auto">{preview.unmatchedStudents.map((name, i) => <p key={i}>{name}</p>)}</div>
            </details>}
            <div className="max-h-32 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead><tr><th>学生</th><th>题号</th><th>得分</th><th>作答</th><th>小题</th></tr></thead>
                <tbody>{preview.entries.slice(0, 12).map((item, i) => <tr key={i} className="border-t border-ink-100">
                  <td>{students.find((s) => s.id === item.studentId)?.name}</td>
                  <td>{questions.findIndex((q) => q.id === item.paperQuestionId) + 1}</td>
                  <td>{item.earnedScore ?? "—"}</td>
                  <td>{item.studentAnswer || "—"}</td>
                  <td>{item.subScores ? Object.entries(item.subScores).map(([part, score]) => `${part}：${score}`).join("、") : "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>}
        </>}
        {error && <p role="alert" className="rounded-md bg-red-50 p-2 text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
