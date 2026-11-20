import type { ExamPaperQuestion, Student } from "../types/index.js";
import { alignGeographyQuestionAnswer, splitGeographyChoiceGroup } from "./geography-paper-layout";

export interface UsageQuestionSlot {
  number: number;
  questionIndex: number;
  paperQuestionId: string;
  part?: number;
  maxScore: number;
  answer?: string;
}

/** Geography choice groups occupy several printed numbers but one stored record. */
export function getUsageQuestionSlots(questions: ExamPaperQuestion[], subject?: string): UsageQuestionSlot[] {
  const slots: UsageQuestionSlot[] = [];
  for (const [questionIndex, question] of questions.entries()) {
    const group = subject?.trim() === "地理" && question.type === "single"
      ? splitGeographyChoiceGroup(question.stem) : null;
    const count = group?.questions.length ?? 1;
    const answers = new Map<number, string>();
    if (group) {
      const aligned = alignGeographyQuestionAnswer(question.stem, question.answer || "", question.type, subject);
      const markers = [...aligned.matchAll(/(?:^|\s)(\d+)[.．、]\s*/g)];
      if (markers.length === count && markers.every((match, index) => Number(match[1]) === group.originalNumbers[index])) {
        markers.forEach((match, index) => {
          const value = aligned.slice(match.index! + match[0].length, markers[index + 1]?.index ?? aligned.length).trim();
          if (/^[A-Za-z0-9]+$/.test(value)) answers.set(index + 1, value);
        });
      }
    }
    for (let part = 1; part <= count; part++) {
      slots.push({
        number: slots.length + 1,
        questionIndex,
        paperQuestionId: question.id,
        part: group ? part : undefined,
        maxScore: question.score / count,
        answer: group ? answers.get(part) : question.answer?.trim(),
      });
    }
  }
  return slots;
}

export type UsageCell = string | number | null;
export interface UsageSheet { name: string; rows: UsageCell[][] }
export type UsageColumnRole =
  | "ignore" | "studentName" | "studentNo"
  | `score:${number}` | `answer:${number}` | `subscore:${number}:${string}`;
export interface UsageColumn { index: number; header: string; role: UsageColumnRole }
export interface UsageMetadataConflict {
  column: string;
  questionNo: number;
  paperQuestionId: string;
  part?: number;
  attribute: "score" | "answer";
  excel: string;
  paper: string;
}
export interface UsageMetadataUpdate {
  paperQuestionId: string;
  attribute: "score" | "answer";
  expected: string;
  value: string;
}
export const usageConflictKey = (conflict: Pick<UsageMetadataConflict, "paperQuestionId" | "attribute" | "part">) =>
  conflict.paperQuestionId + ":" + conflict.attribute + (conflict.part ? ":" + conflict.part : "");
export interface UsageImportItem {
  studentId: string;
  paperQuestionId: string;
  earnedScore?: number;
  subScores?: Record<string, number>;
  studentAnswer?: string;
}
export interface UsagePreview {
  entries: UsageImportItem[];
  matchedStudents: number;
  unmatchedStudents: string[];
  warnings: string[];
  mappedColumns: number;
  conflicts?: UsageMetadataConflict[];
  firstStudent?: { name: string; values: { header: string; value: string }[] };
}

// Preserve the separator between question number and maximum score: "1 2分 答案B".
function parseEncodedHeader(header: string): RegExpMatchArray | null {
  return header.normalize("NFKC").trim().match(/^(?:第)?(\d+)(?:题|小题)?[\s:：、，,]+(\d+(?:\.\d+)?)\s*分(?:[\s,，、;；]*(?:正确|标准)?答案\s*[:：]?\s*[（(]?([A-Za-z0-9]+(?:[\s、,，/／]*[A-Za-z0-9]+)*)[）)]?)?$/i);
}

// Multiple-choice answers with the same selections are equivalent regardless of order or punctuation.
export function normalizeUsageAnswer(answer: string): string {
  const compact = answer.normalize("NFKC").toUpperCase().replace(/[\s、,，/／]/g, "");
  return /^[A-H]+$/.test(compact) ? [...compact].sort().join("") : compact;
}

const isBlank = (value: UsageCell | undefined) => value === undefined || value === null || String(value).trim() === "";
const clean = (value: UsageCell | undefined) => isBlank(value) ? "" : String(value).trim();
const headerText = (value: UsageCell | undefined) => clean(value)
  .normalize("NFKC").replace(/[\s：:【】]/g, "").split("[").join("").split("]").join("").toLowerCase();

function scoreCell(value: UsageCell | undefined): number | undefined {
  if (isBlank(value)) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const string = clean(value).replace(/[,，]/g, "").replace(/分$/, "");
  if (["-", "--", "/", "缺考", "未考", "免考"].includes(string)) return undefined;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(string)) return NaN;
  return Number(string);
}

function scoreOrAnswer(text: string, sample: UsageCell[]): "score" | "answer" {
  if (/得分|分数|成绩|评分|积分|分$/.test(text)) return "score";
  if (/答案|作答|选项|答题|学生答|解答|填空内容/.test(text)) return "answer";
  return sample.some((value) => !isBlank(value) && !Number.isFinite(scoreCell(value))) ? "answer" : "score";
}

export function detectUsageRole(header: string, sample: UsageCell[], questionCount: number): UsageColumnRole {
  const name = headerText(header);
  if (["姓名", "学生姓名", "考生姓名", "名字"].includes(name)) return "studentName";
  if (["学号", "学生学号", "考号", "准考证号", "学籍号", "考生号"].includes(name)) return "studentNo";
  if (/^(总分|合计|排名|序号|班级|考场|座号|备注|年级|性别)$/.test(name)) return "ignore";
  // 第3题第(2)小题得分 / 3-2得分 / 3.2分
  const sub = name.match(/^(?:第|q)?(\d+)(?:题)?(?:第|[-.])\(?([0-9]+)\)?(?:小题|问)?(?:得分|分数|分|评分)$/);
  if (sub) {
    const q = Number(sub[1]);
    if (q >= 1 && q <= questionCount) return `subscore:${q}:${Number(sub[2])}`;
  }
  // 第一层只自动映射明确的题目列，避免把班级、总分等列误识别为题目。
  // Some exported spreadsheets encode the question's full mark and key in one header:
  // "1 2分、答案B". This column contains the student's earned score.
  const encoded = parseEncodedHeader(header);
  if (encoded && Number(encoded[1]) >= 1 && Number(encoded[1]) <= questionCount)
    return `score:${Number(encoded[1])}`;
  const question = name.match(/^(?:第|题|q)?(\d+)(?:题|小题)?(?:的)?(得分|分数|分|评分|成绩|答案|作答|解答|选项|答题|学生答案)?$/)
    || name.match(/^(?:选择题|填空题|解答题)(\d+)(得分|分数|分|答案|作答|解答|选项)?$/);
  if (question) {
    const q = Number(question[1]);
    if (q >= 1 && q <= questionCount) {
      return `${scoreOrAnswer(question[2] || name, sample)}:${q}` as UsageColumnRole;
    }
  }
  return "ignore";
}

export function detectUsageHeader(sheet: UsageSheet, questionCount: number): { headerRow: number; columns: UsageColumn[] } {
  const rows = sheet.rows;
  let headerRow = 0;
  let best = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const score = (rows[i] || []).reduce<number>((total, value, index) => {
      const sample = rows.slice(i + 1, i + 8).map((row) => row[index]);
      const role = detectUsageRole(clean(value), sample, questionCount);
      return total + (role === "studentNo" || role === "studentName" ? 5 : role !== "ignore" ? 2 : 0);
    }, 0);
    if (score > best) { best = score; headerRow = i; }
  }
  const columns = (rows[headerRow] || []).map((cell, index) => ({
    index, header: clean(cell) || `第${index + 1}列`,
    role: detectUsageRole(clean(cell), rows.slice(headerRow + 1, headerRow + 8).map((row) => row[index]), questionCount),
  }));
  // An otherwise unnamed column immediately following an encoded score column
  // normally contains that question's answer. Do not override explicit mappings.
  columns.forEach((column, index) => {
    if (index === 0 || column.role !== "ignore") return;
    const previous = columns[index - 1];
    if (!parseEncodedHeader(previous.header)?.[3]) return;
    const match = /^score:(\d+)$/.exec(previous.role);
    if (match && !/总分|排名|班级|学号|姓名/.test(column.header)) column.role = `answer:${Number(match[1])}`;
  });
  return { headerRow, columns };
}

export async function readUsageWorkbook(file: File): Promise<UsageSheet[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "xlsx" && ext !== "xlsm") throw new Error("请上传 .xlsx 或 .xlsm 文件，旧版 .xls 请先另存为 .xlsx");
  if (file.size > 20 * 1024 * 1024) throw new Error("Excel 文件不能超过 20MB");
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  const result: UsageSheet[] = sheets.map((sheet) => ({
    name: sheet.sheet,
    rows: sheet.data.slice(0, 10001).map((row) => row.slice(0, 250).map((cell) =>
      cell === null || cell === undefined ? null : typeof cell === "number" || typeof cell === "string"
        ? cell : String(cell))),
  }));
  if (result.every((sheet) => sheet.rows.length === 0)) throw new Error("文件没有可读取的数据");
  return result;
}

/** Consolidate per-subquestion Excel decisions into atomic parent-question metadata updates. */
export function getUsageMetadataUpdates(
  questions: ExamPaperQuestion[],
  subject: string | undefined,
  conflicts: UsageMetadataConflict[],
  selectedSources: Record<string, "paper" | "excel">,
): UsageMetadataUpdate[] {
  const slots = getUsageQuestionSlots(questions, subject);
  const updates = new Map<string, UsageMetadataUpdate>();
  for (const conflict of conflicts) {
    if (selectedSources[usageConflictKey(conflict)] !== "excel") continue;
    const question = questions.find((item) => item.id === conflict.paperQuestionId);
    if (!question) continue;
    const key = question.id + ":" + conflict.attribute;
    if (!conflict.part) {
      updates.set(key, { paperQuestionId: question.id, attribute: conflict.attribute,
        expected: conflict.paper, value: conflict.excel });
      continue;
    }
    const previous = updates.get(key);
    if (conflict.attribute === "score") {
      const current = previous ? Number(previous.value) : question.score;
      updates.set(key, { paperQuestionId: question.id, attribute: "score",
        expected: String(question.score), value: String(current + Number(conflict.excel) - Number(conflict.paper)) });
      continue;
    }
    const group = splitGeographyChoiceGroup(question.stem);
    if (!group) continue;
    const groupSlots = slots.filter((slot) => slot.paperQuestionId === question.id);
    // Do not replace an unrecognized original key with incomplete inferred answers.
    if (question.answer?.trim() && groupSlots.some((slot) => !slot.answer)) continue;
    const selectedAnswers = new Map<number, string>();
    for (const slot of groupSlots) if (slot.answer)
      selectedAnswers.set(group.originalNumbers[slot.part! - 1], slot.answer);
    for (const other of conflicts) {
      if (other.paperQuestionId === question.id && other.attribute === "answer" && other.part
        && selectedSources[usageConflictKey(other)] === "excel")
        selectedAnswers.set(group.originalNumbers[other.part - 1], other.excel);
    }
    updates.set(key, {
      paperQuestionId: question.id, attribute: "answer", expected: question.answer?.trim() || "",
      value: [...selectedAnswers].sort(([a], [b]) => a - b)
        .map(([number, answer]) => String(number) + ". " + answer).join(" "),
    });
  }
  return [...updates.values()];
}

export function canAdoptUsageExcelAnswer(
  questions: ExamPaperQuestion[], subject: string | undefined, conflict: UsageMetadataConflict,
): boolean {
  if (conflict.attribute !== "answer" || !conflict.part) return true;
  const question = questions.find((item) => item.id === conflict.paperQuestionId);
  if (!question || !question.answer?.trim()) return true;
  return getUsageQuestionSlots([question], subject).every((slot) => Boolean(slot.answer));
}

export function prepareUsageImport(
  sheet: UsageSheet,
  headerRow: number,
  columns: UsageColumn[],
  paperQuestions: ExamPaperQuestion[],
  students: Student[],
  selectedSources: Record<string, "paper" | "excel"> = {},
  subject?: string,
): UsagePreview {
  const slots = getUsageQuestionSlots(paperQuestions, subject);
  const roles = columns.filter((column) => column.role !== "ignore");
  const warnings: string[] = [];
  const conflicts: UsageMetadataConflict[] = [];
  const effectiveScores = new Map<string, number>();
  columns.forEach((column) => {
    // Only an encoded *score* header carries the maximum score and answer key.
    if (!column.role.startsWith("score:")) return;
    const questionNo = Number(column.role.split(":")[1]);
    const slot = slots[questionNo - 1];
    const encoded = parseEncodedHeader(column.header);
    if (!slot || !encoded || Number(encoded[1]) !== questionNo) return;
    const question = paperQuestions[slot.questionIndex];
    const scoreConflict: UsageMetadataConflict = {
      column: column.header, questionNo, paperQuestionId: question.id,
      ...(slot.part ? { part: slot.part } : {}),
      attribute: "score", excel: encoded[2], paper: String(slot.maxScore),
    };
    if (Math.abs(Number(encoded[2]) - slot.maxScore) > 0.000001) {
      conflicts.push(scoreConflict);
      if (selectedSources[usageConflictKey(scoreConflict)] === "excel") {
        const previous = effectiveScores.get(question.id) ?? question.score;
        effectiveScores.set(question.id, previous + Number(encoded[2]) - slot.maxScore);
      }
    }
    if (encoded[3] && normalizeUsageAnswer(encoded[3]) !== normalizeUsageAnswer(slot.answer || ""))
      conflicts.push({
        column: column.header, questionNo, paperQuestionId: question.id,
        ...(slot.part ? { part: slot.part } : {}),
        attribute: "answer", excel: encoded[3], paper: slot.answer || "",
      });
  });
  if (!roles.some((column) => column.role === "studentNo" || column.role === "studentName"))
    return { entries: [], matchedStudents: 0, unmatchedStudents: [], warnings: ["请先映射学生姓名或学号列"], mappedColumns: 0 };

  const scores = roles.filter((col) => /^(score|answer|subscore):/.test(col.role));
  const duplicateRoles = scores.map((col) => col.role).filter((role, i, list) => list.indexOf(role) !== i);
  if (duplicateRoles.length) {
    return { entries: [], matchedStudents: 0, unmatchedStudents: [], warnings: ["同一题目的同一数据字段不能重复映射"], mappedColumns: scores.length };
  }
  if (!scores.length)
    return { entries: [], matchedStudents: 0, unmatchedStudents: [], warnings: ["至少需要映射一道题的得分、答案或小题得分"], mappedColumns: 0 };

  const numericStudentNo = (value: string) => /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, "") : value;
  const studentNumber = new Map<string, Student[]>();
  const normalizedStudentNumber = new Map<string, Student[]>();
  const studentName = new Map<string, Student[]>();
  for (const student of students) {
    const no = student.studentNo.trim();
    const name = student.name.trim();
    if (no) {
      studentNumber.set(no, [...studentNumber.get(no) || [], student]);
      const normalized = numericStudentNo(no);
      normalizedStudentNumber.set(normalized, [...normalizedStudentNumber.get(normalized) || [], student]);
    }
    if (name) studentName.set(name, [...studentName.get(name) || [], student]);
  }
  const noColumn = roles.find((column) => column.role === "studentNo")?.index;
  const nameColumn = roles.find((column) => column.role === "studentName")?.index;
  const entries: UsageImportItem[] = [];
  const seenStudents = new Set<string>();
  const unmatched: string[] = [];
  const seenKeys = new Set<string>();
  let matchedStudents = 0;
  let firstStudent: UsagePreview["firstStudent"];

  for (let i = headerRow + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    if (!row || row.every(isBlank)) continue;
    const no = noColumn === undefined ? "" : clean(row[noColumn]);
    const name = nameColumn === undefined ? "" : clean(row[nameColumn]);
    if (!no && !name) continue;
    const noMatches = no ? studentNumber.get(no)
      || normalizedStudentNumber.get(numericStudentNo(no)) || [] : [];
    const nameMatches = name ? studentName.get(name) || [] : [];
    const matches = (no ? noMatches : nameMatches).filter((student) => !name || student.name.trim() === name);
    const student = matches.length === 1 ? matches[0] : undefined;
    if (!student) {
      unmatched.push(`第${i + 1}行：${name || "(无姓名)"} ${no}`.trim());
      continue;
    }
    if (seenStudents.has(student.id)) {
      warnings.push(`第${i + 1}行：学生${student.name}重复出现，已跳过该行`);
      continue;
    }
    seenStudents.add(student.id);
    if (!firstStudent) firstStudent = { name: student.name, values: columns.map((column) => ({ header: column.header, value: clean(row[column.index]) })) };
    matchedStudents++;
    const byQuestion = new Map<number, UsageImportItem>();
    const groupAnswers = new Map<number, Map<number, string>>();
    for (const column of scores) {
      const [kind, noString, subNo] = column.role.split(":");
      const slot = kind === "subscore" ? undefined : slots[Number(noString) - 1];
      const questionIndex = kind === "subscore" ? Number(noString) - 1 : slot?.questionIndex ?? -1;
      const question = paperQuestions[questionIndex];
      if (!question) continue;
      const raw = row[column.index];
      if (isBlank(raw) || clean(raw) === "-") continue;
      let item = byQuestion.get(questionIndex);
      if (!item) {
        item = { studentId: student.id, paperQuestionId: question.id };
        byQuestion.set(questionIndex, item);
      }
      if (kind === "answer") {
        if (slot?.part) {
          const answers = groupAnswers.get(questionIndex) || new Map<number, string>();
          answers.set(slot.part, clean(raw));
          groupAnswers.set(questionIndex, answers);
        } else {
          item.studentAnswer = clean(raw).slice(0, 2048);
        }
      } else {
        const numeric = scoreCell(raw);
        if (numeric === undefined) continue;
        if (!Number.isFinite(numeric) || numeric < 0 || numeric > 10000) {
          warnings.push(`第${i + 1}行「${column.header}」得分无效，已跳过`);
          continue;
        }
        if (kind === "score" && !slot?.part) item.earnedScore = numeric;
        else item.subScores = { ...(item.subScores || {}), [kind === "subscore" ? subNo : slot!.part!]: numeric };
      }
    }
    for (const [questionIndex, answers] of groupAnswers) {
      const start = slots.find((slot) => slot.questionIndex === questionIndex)?.number ?? 1;
      byQuestion.get(questionIndex)!.studentAnswer = [...answers.entries()]
        .sort(([a], [b]) => a - b)
        .map(([part, value]) => String(start + part - 1) + ". " + value)
        .join("\n").slice(0, 2048);
    }
    for (const item of byQuestion.values()) {
      if (item.earnedScore === undefined && !item.subScores && !item.studentAnswer) continue;
      const key = `${item.studentId}:${item.paperQuestionId}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const max = effectiveScores.get(item.paperQuestionId) ?? paperQuestions.find((q) => q.id === item.paperQuestionId)?.score ?? 0;
      const earned = item.earnedScore ?? (item.subScores ? Object.values(item.subScores).reduce((a, b) => a + b, 0) : undefined);
      const subTotal = item.subScores ? Object.values(item.subScores).reduce((a, b) => a + b, 0) : undefined;
      if (max > 0 && (earned !== undefined && earned > max + 0.000001
        || subTotal !== undefined && subTotal > max + 0.000001
        || item.earnedScore !== undefined && subTotal !== undefined && subTotal > item.earnedScore + 0.000001)) {
        warnings.push(`第${i + 1}行「${paperQuestions.findIndex((q) => q.id === item.paperQuestionId) + 1}题」得分超过满分，已跳过`);
        continue;
      }
      entries.push(item);
    }
  }
  if (unmatched.length) warnings.unshift(`有${unmatched.length}行未匹配到使用班级中的学生，不会导入`);
  if (!entries.length) warnings.unshift("没有可导入的答题数据");
  return {
    entries, matchedStudents, unmatchedStudents: unmatched.slice(0, 50), warnings, mappedColumns: scores.length, conflicts, firstStudent,
  };
}
