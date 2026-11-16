import { useMemo, useState } from "react";
import type { ExamPaperQuestion, Student } from "@/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  detectUsageHeader, prepareUsageImport, readUsageWorkbook,
  type UsageColumn, type UsageColumnRole, type UsageImportItem, type UsageSheet,
} from "@/lib/exam-usage-spreadsheet";

interface Props {
  open: boolean;
  onClose: () => void;
  questions: ExamPaperQuestion[];
  students: Student[];
  onImport: (items: UsageImportItem[]) => Promise<void>;
}

function field(role: UsageColumnRole) {
  return role.split(":")[0];
}

function changeRole(column: UsageColumn, part: "field" | "question" | "sub", value: string): UsageColumnRole {
  const pieces = column.role.split(":");
  const kind = part === "field" ? value : pieces[0];
  if (kind === "ignore" || kind === "studentName" || kind === "studentNo") return kind;
  const question = part === "question" ? value : pieces[1] || "1";
  if (kind === "subscore") {
    const sub = part === "sub" ? value : pieces[2] || "1";
    return `subscore:${Number(question)}:${Number(sub) || 1}`;
  }
  return `${kind}:${Number(question)}` as UsageColumnRole;
}

export function ExamPaperUsageImportModal({ open, onClose, questions, students, onImport }: Props) {
  const [sheets, setSheets] = useState<UsageSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [columns, setColumns] = useState<UsageColumn[]>([]);
  const [filename, setFilename] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const sheet = sheets[selectedSheet];
  const preview = useMemo(() => sheet
    ? prepareUsageImport(sheet, headerRow, columns, questions, students)
    : null, [sheet, headerRow, columns, questions, students]);

  function activateSheet(workbook: UsageSheet[], index: number, row?: number) {
    const chosen = workbook[index];
    if (!chosen) return;
    const detected = detectUsageHeader(chosen, questions.length);
    setSelectedSheet(index);
    setHeaderRow(row ?? detected.headerRow);
    setColumns(row === undefined ? detected.columns : (chosen.rows[row] || []).map((cell, i) => ({
      index: i, header: String(cell ?? `第${i + 1}列`),
      role: "ignore" as const,
    })));
  }

  async function loadFile(file: File) {
    setWorking(true);
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
    if (!preview?.entries.length) return;
    setWorking(true);
    setError("");
    try {
      await onImport(preview.entries);
      setSheets([]);
      setFilename("");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "数据导入失败");
    } finally {
      setWorking(false);
    }
  }

  const questionOptions = questions.map((question, index) => (
    <option key={question.id} value={index + 1}>第{index + 1}题（{question.score}分）</option>
  ));

  return (
    <Modal
      open={open}
      onClose={() => { if (!working) onClose(); }}
      title="上传试卷使用数据"
      size="xl"
      description="按学生学号或姓名匹配使用班级，按卷面题号保存得分、选择题作答与小题得分。"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={working}>取消</Button>
          <Button variant="gold" onClick={() => void submit()}
            disabled={working || !preview?.entries.length || students.length === 0} loading={working}>
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
                    const update = (part: "field" | "question" | "sub", value: string) =>
                      setColumns((current) => current.map((item) => item.index === column.index
                        ? { ...item, role: changeRole(item, part, value) } : item));
                    return <tr key={column.index} className="border-t border-ink-100">
                      <td className="p-2 text-ink-700">{column.header}</td>
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
                            {questionOptions}
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
