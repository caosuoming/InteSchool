import type {
  GradeScoreMode,
  GradeScoreRecord,
  GradeTemplateColumn,
} from "../types/index.js";

export type GradeFormulaScalar = string | number | boolean | null;
export type GradeFormulaValue = GradeFormulaScalar | GradeFormulaValue[];

interface FormulaContext {
  record: GradeScoreRecord;
  scoreMode: GradeScoreMode;
  subjects?: Set<string>;
}

type TokenKind = "number" | "string" | "identifier" | "operator" | "punctuation" | "eof";

interface Token {
  kind: TokenKind;
  value: string;
  position: number;
}

const IDENTIFIER_START = /[\p{L}_]/u;
const IDENTIFIER_PART = /[\p{L}\p{N}_]/u;
const TWO_CHARACTER_OPERATORS = new Set(["&&", "||", "==", "!=", ">=", "<="]);
const ONE_CHARACTER_OPERATORS = new Set(["+", "-", "*", "/", "%", ">", "<", "!"]);

function tokenize(input: string): Token[] {
  const source = input.trim().replace(/^=/, "").trim();
  if (!source) throw new Error("公式不能为空");
  if (source.length > 512) throw new Error("公式长度不能超过 512 个字符");
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const two = source.slice(index, index + 2);
    if (TWO_CHARACTER_OPERATORS.has(two)) {
      tokens.push({ kind: "operator", value: two, position: index });
      index += 2;
      continue;
    }
    if (ONE_CHARACTER_OPERATORS.has(char)) {
      tokens.push({ kind: "operator", value: char, position: index });
      index += 1;
      continue;
    }
    if (["(", ")", ","].includes(char)) {
      tokens.push({ kind: "punctuation", value: char, position: index });
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      const start = index;
      index += 1;
      let value = "";
      let closed = false;
      while (index < source.length) {
        const current = source[index];
        if (current === "\\") {
          const next = source[index + 1];
          if (next === undefined) break;
          const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t" };
          value += escapes[next] ?? next;
          index += 2;
          continue;
        }
        if (current === quote) {
          closed = true;
          index += 1;
          break;
        }
        value += current;
        index += 1;
      }
      if (!closed) throw new Error(`公式第 ${start + 1} 个字符后的字符串未闭合`);
      tokens.push({ kind: "string", value, position: start });
      continue;
    }
    if (/\d|\./.test(char)) {
      const start = index;
      let value = "";
      let dotCount = 0;
      while (index < source.length && /[\d.]/.test(source[index])) {
        if (source[index] === ".") dotCount += 1;
        value += source[index];
        index += 1;
      }
      if (dotCount > 1 || value === "." || !Number.isFinite(Number(value))) {
        throw new Error(`公式第 ${start + 1} 个字符处的数字无效`);
      }
      tokens.push({ kind: "number", value, position: start });
      continue;
    }
    if (IDENTIFIER_START.test(char)) {
      const start = index;
      let value = char;
      index += 1;
      while (index < source.length && IDENTIFIER_PART.test(source[index])) {
        value += source[index];
        index += 1;
      }
      tokens.push({ kind: "identifier", value, position: start });
      continue;
    }
    throw new Error(`公式第 ${index + 1} 个字符“${char}”不受支持`);
  }

  tokens.push({ kind: "eof", value: "", position: source.length });
  return tokens;
}

function flatten(values: GradeFormulaValue[]): GradeFormulaScalar[] {
  return values.flatMap((value): GradeFormulaScalar[] => Array.isArray(value) ? flatten(value) : [value]);
}

function numericValues(values: GradeFormulaValue[]): number[] {
  return flatten(values)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function numberValue(value: GradeFormulaValue): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === "") return 0;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  throw new Error("该运算需要数字参数");
}

function booleanValue(value: GradeFormulaValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

function stringValue(value: GradeFormulaValue): string {
  if (Array.isArray(value)) return value.map(stringValue).join("、");
  if (value === null) return "";
  return String(value);
}

function requireSubject(value: GradeFormulaValue, context: FormulaContext): string {
  const subject = stringValue(value).trim();
  if (!subject) throw new Error("科目名称不能为空");
  if (context.subjects && !context.subjects.has(subject)) throw new Error(`考试中不存在科目“${subject}”`);
  return subject;
}

function score(record: GradeScoreRecord, subject: string, mode: GradeScoreMode): number | null {
  const value = mode === "raw" ? record.scores[subject] : record.assignedScores[subject];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function callFunction(name: string, args: GradeFormulaValue[], context: FormulaContext): GradeFormulaValue {
  const upper = name.toUpperCase();
  switch (upper) {
    case "RAW": {
      if (args.length !== 1) throw new Error("RAW 需要 1 个科目参数");
      return score(context.record, requireSubject(args[0], context), "raw");
    }
    case "SCORE":
    case "ASSIGNED": {
      if (args.length !== 1) throw new Error(`${upper} 需要 1 个科目参数`);
      return score(context.record, requireSubject(args[0], context), upper === "SCORE" ? context.scoreMode : "assigned");
    }
    case "SCORES":
    case "RAW_SCORES":
    case "ASSIGNED_SCORES": {
      if (args.length === 0) throw new Error(`${upper} 至少需要 1 个科目参数`);
      const mode = upper === "RAW_SCORES" ? "raw" : upper === "ASSIGNED_SCORES" ? "assigned" : context.scoreMode;
      return args.map((item) => score(context.record, requireSubject(item, context), mode));
    }
    case "SUM":
      return numericValues(args).reduce((total, value) => total + value, 0);
    case "AVERAGE":
    case "AVG": {
      const values = numericValues(args);
      return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;
    }
    case "MAX": {
      const values = numericValues(args);
      return values.length === 0 ? null : Math.max(...values);
    }
    case "MIN": {
      const values = numericValues(args);
      return values.length === 0 ? null : Math.min(...values);
    }
    case "COUNT":
      return flatten(args).filter((value) => value !== null && value !== "").length;
    case "BEST": {
      if (args.length !== 2) throw new Error("BEST 需要数组和数量两个参数");
      const values = numericValues([args[0]]).sort((left, right) => right - left);
      const count = Math.max(0, Math.floor(numberValue(args[1])));
      return values.slice(0, count);
    }
    case "ROUND": {
      if (args.length < 1 || args.length > 2) throw new Error("ROUND 需要数值和可选小数位参数");
      const digits = args.length === 2 ? Math.max(0, Math.min(10, Math.floor(numberValue(args[1])))) : 0;
      const factor = 10 ** digits;
      return Math.round(numberValue(args[0]) * factor) / factor;
    }
    case "IF": {
      if (args.length !== 3) throw new Error("IF 需要条件、成立值和不成立值三个参数");
      return booleanValue(args[0]) ? args[1] : args[2];
    }
    case "CONCAT":
      return args.map(stringValue).join("");
    default:
      throw new Error(`不支持函数“${name}”`);
  }
}

function variableValue(name: string, context: FormulaContext): GradeFormulaValue {
  const key = name.toLowerCase();
  const aliases: Record<string, GradeFormulaValue> = {
    studentname: context.record.studentName,
    姓名: context.record.studentName,
    studentno: context.record.studentNo,
    学号: context.record.studentNo,
    classname: context.record.className,
    班级: context.record.className,
    subjectselection: context.record.subjectSelection || "",
    选科: context.record.subjectSelection || "",
    classtype: context.record.classType || "",
    班型: context.record.classType || "",
    graderank: context.record.gradeRank,
    年级名次: context.record.gradeRank,
    classrank: context.record.classRank,
    班级名次: context.record.classRank,
    rawtotal: context.record.rawTotal,
    原始总分: context.record.rawTotal,
    assignedtotal: context.record.assignedTotal,
    赋分总分: context.record.assignedTotal,
    true: true,
    false: false,
    null: null,
  };
  if (Object.prototype.hasOwnProperty.call(aliases, key)) return aliases[key];
  throw new Error(`不支持字段“${name}”`);
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly context: FormulaContext,
  ) {}

  parse(): GradeFormulaValue {
    const value = this.parseOr();
    const token = this.current();
    if (token.kind !== "eof") throw new Error(`公式第 ${token.position + 1} 个字符附近存在多余内容`);
    return value;
  }

  private current(): Token {
    return this.tokens[this.index];
  }

  private take(): Token {
    const token = this.current();
    this.index += 1;
    return token;
  }

  private match(value: string): boolean {
    if (this.current().value !== value) return false;
    this.index += 1;
    return true;
  }

  private expect(value: string): void {
    const token = this.current();
    if (!this.match(value)) throw new Error(`公式第 ${token.position + 1} 个字符处应为“${value}”`);
  }

  private parseOr(): GradeFormulaValue {
    let value = this.parseAnd();
    while (this.match("||")) {
      const right = this.parseAnd();
      value = booleanValue(value) || booleanValue(right);
    }
    return value;
  }

  private parseAnd(): GradeFormulaValue {
    let value = this.parseEquality();
    while (this.match("&&")) {
      const right = this.parseEquality();
      value = booleanValue(value) && booleanValue(right);
    }
    return value;
  }

  private parseEquality(): GradeFormulaValue {
    let value = this.parseComparison();
    while (["==", "!="].includes(this.current().value)) {
      const operator = this.take().value;
      const right = this.parseComparison();
      const equal = stringValue(value) === stringValue(right);
      value = operator === "==" ? equal : !equal;
    }
    return value;
  }

  private parseComparison(): GradeFormulaValue {
    let value = this.parseTerm();
    while ([">", ">=", "<", "<="].includes(this.current().value)) {
      const operator = this.take().value;
      const right = this.parseTerm();
      const leftNumber = numberValue(value);
      const rightNumber = numberValue(right);
      value = operator === ">" ? leftNumber > rightNumber
        : operator === ">=" ? leftNumber >= rightNumber
          : operator === "<" ? leftNumber < rightNumber
            : leftNumber <= rightNumber;
    }
    return value;
  }

  private parseTerm(): GradeFormulaValue {
    let value = this.parseFactor();
    while (["+", "-"].includes(this.current().value)) {
      const operator = this.take().value;
      const right = this.parseFactor();
      if (operator === "+" && (typeof value === "string" || typeof right === "string")) {
        value = stringValue(value) + stringValue(right);
      } else {
        value = operator === "+" ? numberValue(value) + numberValue(right) : numberValue(value) - numberValue(right);
      }
    }
    return value;
  }

  private parseFactor(): GradeFormulaValue {
    let value = this.parseUnary();
    while (["*", "/", "%"].includes(this.current().value)) {
      const operator = this.take().value;
      const right = numberValue(this.parseUnary());
      const left = numberValue(value);
      if ((operator === "/" || operator === "%") && right === 0) throw new Error("公式不能除以 0");
      value = operator === "*" ? left * right : operator === "/" ? left / right : left % right;
    }
    return value;
  }

  private parseUnary(): GradeFormulaValue {
    if (this.match("!")) return !booleanValue(this.parseUnary());
    if (this.match("-")) return -numberValue(this.parseUnary());
    if (this.match("+")) return numberValue(this.parseUnary());
    return this.parsePrimary();
  }

  private parsePrimary(): GradeFormulaValue {
    const token = this.take();
    if (token.kind === "number") return Number(token.value);
    if (token.kind === "string") return token.value;
    if (token.value === "(") {
      const value = this.parseOr();
      this.expect(")");
      return value;
    }
    if (token.kind === "identifier") {
      if (!this.match("(")) return variableValue(token.value, this.context);
      const args: GradeFormulaValue[] = [];
      if (!this.match(")")) {
        do {
          args.push(this.parseOr());
        } while (this.match(","));
        this.expect(")");
      }
      return callFunction(token.value, args, this.context);
    }
    throw new Error(`公式第 ${token.position + 1} 个字符处缺少值`);
  }
}

export function evaluateGradeFormula(
  formula: string,
  record: GradeScoreRecord,
  scoreMode: GradeScoreMode = "assigned",
  subjects?: string[],
): GradeFormulaValue {
  const parser = new Parser(tokenize(formula), {
    record,
    scoreMode,
    subjects: subjects ? new Set(subjects) : undefined,
  });
  const value = parser.parse();
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 10000) / 10000;
  return value;
}

export function validateGradeFormula(formula: string, subjects: string[]): void {
  const scores = Object.fromEntries(subjects.map((subject) => [subject, 80]));
  evaluateGradeFormula(formula, {
    id: "preview",
    studentId: "preview",
    studentName: "示例学生",
    studentNo: "20260001",
    classId: "preview-class",
    className: "高三(1)班",
    scores,
    assignedScores: scores,
    rawTotal: subjects.length * 80,
    assignedTotal: subjects.length * 80,
    gradeRank: 1,
    classRank: 1,
  }, "assigned");
}

export function displayGradeFormulaValue(value: GradeFormulaValue): string | number {
  if (Array.isArray(value)) return value.map((item) => displayGradeFormulaValue(item)).join("、");
  if (value === null || value === false) return value === false ? "否" : "—";
  if (value === true) return "是";
  if (typeof value === "number") return Math.round(value * 100) / 100;
  return value;
}

export const DEFAULT_CUSTOM_GRADE_COLUMNS: GradeTemplateColumn[] = [
  { id: "class", name: "班级", formula: "=班级", width: 14 },
  { id: "student-no", name: "学号", formula: "=学号", width: 16 },
  { id: "student-name", name: "姓名", formula: "=姓名", width: 12 },
  { id: "core-total", name: "语数外总分", formula: '=SUM(SCORES("语文", "数学", "英语"))', width: 14 },
  {
    id: "best-two-electives",
    name: "选科最高两门",
    formula: '=SUM(BEST(SCORES("物理", "化学", "生物", "政治", "历史", "地理"), 2))',
    width: 16,
  },
  {
    id: "custom-total",
    name: "模板总分",
    formula: '=SUM(SCORES("语文", "数学", "英语"), BEST(SCORES("物理", "化学", "生物", "政治", "历史", "地理"), 2))',
    width: 14,
  },
];

function formulaSubjectList(subjects: string[]): string {
  return subjects.map((subject) => JSON.stringify(subject)).join(", ");
}

export function buildDefaultCustomGradeColumns(subjects: string[]): GradeTemplateColumn[] {
  const available = new Set(subjects);
  const core = ["语文", "数学", "英语"].filter((subject) => available.has(subject));
  const electives = ["物理", "化学", "生物", "政治", "历史", "地理"]
    .filter((subject) => available.has(subject));
  const totalParts = [
    ...(core.length > 0 ? [`SCORES(${formulaSubjectList(core)})`] : []),
    ...(electives.length > 0 ? [`BEST(SCORES(${formulaSubjectList(electives)}), ${Math.min(2, electives.length)})`] : []),
  ];
  if (totalParts.length === 0) totalParts.push(`SCORES(${formulaSubjectList(subjects)})`);

  return [
    { id: "class", name: "班级", formula: "=班级", width: 14 },
    { id: "student-no", name: "学号", formula: "=学号", width: 16 },
    { id: "student-name", name: "姓名", formula: "=姓名", width: 12 },
    ...(core.length > 0 ? [{
      id: "core-total",
      name: "语数外总分",
      formula: `=SUM(SCORES(${formulaSubjectList(core)}))`,
      width: 14,
    }] : []),
    ...(electives.length > 0 ? [{
      id: "best-two-electives",
      name: `选科最高${Math.min(2, electives.length)}门`,
      formula: `=SUM(BEST(SCORES(${formulaSubjectList(electives)}), ${Math.min(2, electives.length)}))`,
      width: 16,
    }] : []),
    {
      id: "custom-total",
      name: "模板总分",
      formula: `=SUM(${totalParts.join(", ")})`,
      width: 14,
    },
  ];
}
