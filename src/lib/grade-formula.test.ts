import { describe, expect, it } from "vitest";
import type { GradeScoreRecord } from "../types/index.js";
import {
  displayGradeFormulaValue,
  evaluateGradeFormula,
  validateGradeFormula,
} from "./grade-formula.js";

const record: GradeScoreRecord = {
  id: "score-1",
  studentId: "student-1",
  studentName: "张三",
  studentNo: "202601",
  classId: "class-1",
  className: "高三(1)班",
  subjectSelection: "物化生",
  classType: "强基班",
  scores: {
    语文: 110,
    数学: 125,
    英语: 118,
    物理: 80,
    化学: 72,
    生物: 68,
  },
  assignedScores: {
    语文: 110,
    数学: 125,
    英语: 118,
    物理: 91,
    化学: 84,
    生物: 79,
  },
  rawTotal: 573,
  assignedTotal: 607,
  gradeRank: 3,
  classRank: 1,
};

describe("grade formula engine", () => {
  it("evaluates fields, arrays, and best-subject aggregation", () => {
    expect(evaluateGradeFormula("=姓名", record)).toBe("张三");
    expect(evaluateGradeFormula("=CONCAT(班型, 选科)", record)).toBe("强基班物化生");
    expect(evaluateGradeFormula(
      '=SUM(SCORES("语文", "数学", "英语"), BEST(SCORES("物理", "化学", "生物"), 2))',
      record,
      "assigned",
    )).toBe(528);
  });

  it("supports raw and assigned score modes", () => {
    expect(evaluateGradeFormula('=SCORE("物理")', record, "raw")).toBe(80);
    expect(evaluateGradeFormula('=SCORE("物理")', record, "assigned")).toBe(91);
    expect(evaluateGradeFormula('=RAW("物理") + ASSIGNED("物理")', record)).toBe(171);
  });

  it("supports conditional and rounding functions", () => {
    expect(evaluateGradeFormula('=IF(年级名次 <= 10, CONCAT("前十-", 姓名), "其他")', record)).toBe("前十-张三");
    expect(evaluateGradeFormula("=ROUND(10 / 3, 2)", record)).toBe(3.33);
    expect(evaluateGradeFormula("=TRUE || FALSE", record)).toBe(true);
    expect(evaluateGradeFormula("=FALSE && TRUE", record)).toBe(false);
  });

  it("treats missing subjects as blank values for reusable cohort templates", () => {
    expect(evaluateGradeFormula('=SCORE("历史")', record)).toBeNull();
    expect(evaluateGradeFormula('=SUM(SCORES("历史", "数学"))', record)).toBe(125);
    expect(displayGradeFormulaValue(null)).toBe("—");
  });

  it("rejects arbitrary identifiers, member access, and invalid arithmetic", () => {
    expect(() => validateGradeFormula('=process("x")', ["数学"])).toThrow("不支持函数");
    expect(() => validateGradeFormula("=constructor.constructor()", ["数学"])).toThrow();
    expect(() => evaluateGradeFormula("=1 / 0", record)).toThrow("除以 0");
    expect(() => evaluateGradeFormula(`=${"1+".repeat(300)}1`, record)).toThrow("512");
  });
});
