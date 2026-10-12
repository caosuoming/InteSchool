import { describe, expect, it } from "vitest";
import type { GradeExam, GradeScoreRecord } from "../types/index.js";
import {
  buildGradeClassStatisticsReport,
  DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
} from "./grade-class-statistics.js";

function record(
  id: string,
  classId: string,
  className: string,
  studentNo: string,
  studentName: string,
  chinese: number,
  chemistryRaw: number,
  chemistryAssigned: number,
  rawTotal: number,
  assignedTotal: number,
): GradeScoreRecord {
  return {
    id: `record-${id}`,
    studentId: id,
    studentName,
    studentNo,
    classId,
    className,
    scores: { 语文: chinese, 化学: chemistryRaw },
    assignedScores: { 语文: chinese, 化学: chemistryAssigned },
    rawTotal,
    assignedTotal,
    gradeRank: 0,
    classRank: 0,
  };
}

function exam(id: string, name: string, examDate: string, records: GradeScoreRecord[]): GradeExam {
  return {
    id,
    schoolId: "school-1",
    teacherId: "teacher-1",
    cohortKey: "cohort-1",
    cohortLabel: "2027届高三",
    name,
    examDate,
    sourceFileName: `${name}.xlsx`,
    sourceSheetName: "成绩",
    subjects: ["语文", "化学"],
    records,
    settings: {
      subjectTeacherIds: {},
      assignmentRules: {},
      classSubjects: [],
      templates: [],
    },
    createdAt: `${examDate}T00:00:00.000Z`,
    updatedAt: `${examDate}T00:00:00.000Z`,
  };
}

const current = exam("current", "期末考试", "2026-07-01", [
  record("s1", "c1", "高三（1）班", "001", "张三", 120, 80, 90, 200, 210),
  record("s2", "c1", "高三（1）班", "002", "李四", 115, 85, 90, 200, 205),
  record("s3", "c2", "高三（2）班", "003", "王五", 125, 75, 88, 198, 213),
]);

const previous = exam("previous", "期中考试", "2026-05-01", [
  record("s1", "c1", "高三（1）班", "001", "张三", 110, 70, 82, 180, 192),
  record("s2", "c1", "高三（1）班", "002", "李四", 118, 76, 84, 194, 202),
]);

describe("grade class statistics", () => {
  it("always includes class, name and current subject scores", () => {
    const report = buildGradeClassStatisticsReport(current, [], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showRawTotal: false,
      showAssignedTotal: false,
    });

    expect(report.title).toBe("期末考试各班成绩统计");
    expect(report.classes.map((item) => item.className)).toEqual(["高三（1）班", "高三（2）班"]);
    expect(report.columns.map((column) => column.label)).toEqual(["班级", "姓名", "语文", "化学"]);
    expect(report.classes[0].rows[0].values["current:subject:化学"]).toBe(90);
  });

  it("calculates subject, raw-total and assigned-total class/grade competition ranks", () => {
    const report = buildGradeClassStatisticsReport(current, [], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showSubjectClassRanks: true,
      showSubjectGradeRanks: true,
      showRawTotal: true,
      showAssignedTotal: true,
    });
    const zhang = report.classes[0].rows.find((row) => row.studentId === "s1")!;
    const li = report.classes[0].rows.find((row) => row.studentId === "s2")!;

    expect(zhang.values["current:subjectClassRank:化学"]).toBe(1);
    expect(li.values["current:subjectClassRank:化学"]).toBe(1);
    expect(zhang.values["current:subjectGradeRank:化学"]).toBe(1);
    expect(zhang.values["current:rawTotalClassRank"]).toBe(1);
    expect(li.values["current:rawTotalClassRank"]).toBe(1);
    expect(zhang.values["current:rawTotalGradeRank"]).toBe(1);
    expect(zhang.values["current:assignedTotalGradeRank"]).toBe(2);
  });

  it("uses shared separated and unified pools for subject and total grade ranks", () => {
    const tested = exam("grouped", "分组测试", "2026-07-01", [
      record("s1", "c1", "1班", "001", "甲", 60, 50, 50, 110, 110),
      record("s2", "c2", "2班", "002", "乙", 70, 80, 80, 150, 150),
      record("s3", "c3", "3班", "003", "丙", 80, 90, 90, 170, 170),
      record("s4", "c4", "4班", "004", "丁", 90, 60, 60, 150, 150),
    ]);
    tested.settings.classSubjects = ["c1", "c2", "c3", "c4"].map((classId) => ({
      classId, examSubjects: ["语文", "化学"], statisticSubjects: ["语文", "化学"],
      separateRankSubjects: ["c1", "c2"].includes(classId) ? ["化学"] : [],
    }));
    const report = buildGradeClassStatisticsReport(tested, [], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showSubjectGradeRanks: true, showRawTotal: true, showAssignedTotal: true,
    });
    const values = Object.fromEntries(report.classes.flatMap((item) => item.rows).map((row) => [row.studentId, row.values]));
    expect(["s1", "s2", "s3", "s4"].map((id) => values[id]["grouped:subjectGradeRank:化学"]))
      .toEqual([2, 1, 1, 2]);
    expect(["s1", "s2", "s3", "s4"].map((id) => values[id]["grouped:rawTotalGradeRank"]))
      .toEqual([2, 1, 1, 2]);
    expect(["s1", "s2", "s3", "s4"].map((id) => values[id]["grouped:assignedTotalGradeRank"]))
      .toEqual([2, 1, 1, 2]);
  });

  it("adds selected previous exams side by side and leaves missing students blank", () => {
    const report = buildGradeClassStatisticsReport(current, [previous], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showAssignedTotal: true,
      comparisonExamIds: ["previous"],
    });
    const wang = report.classes[1].rows[0];

    expect(report.includedExams.map((item) => item.name)).toEqual(["期末考试", "期中考试"]);
    expect(report.columns.some((column) => column.label === "期中考试·语文")).toBe(true);
    expect(report.classes[0].rows[0].values["previous:subject:语文"]).toBe(110);
    expect(wang.values["previous:subject:语文"]).toBeNull();
    expect(report.columns.some((column) => column.label === "期中考试·总分（赋分）年级排名")).toBe(true);
  });
  it("totals every examined subject, omits absentees, and ranks only complete scores", () => {
    const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "地理"];
    const makeRecord = (id: string, classId: string, scores: Record<string, number | null>, assignedScores = scores) => ({
      ...record(id, classId, classId, id, id, 0, 0, 0, 0, 0),
      scores,
      assignedScores,
      rawTotal: 270,
      assignedTotal: 270,
    });
    const complete = makeRecord("a", "c1", { 语文: 100, 数学: 90, 英语: 80, 物理: 70, 化学: 60, 生物: 50, 地理: null },
      { 语文: 100, 数学: 90, 英语: 80, 物理: 70, 化学: 85, 生物: 75, 地理: null });
    const absent = makeRecord("b", "c1", { 语文: 110, 数学: 100, 英语: 90, 物理: 80, 化学: null, 生物: 100, 地理: null });
    const zero = makeRecord("c", "c1", { 语文: 100, 数学: 90, 英语: 80, 物理: 70, 化学: 60, 生物: 0, 地理: null });
    const otherClass = {
      ...makeRecord("d", "c2", { 语文: 100, 数学: 90, 英语: 80, 物理: 70, 化学: 60, 生物: null, 地理: 50 }),
      subjectSelection: "物化地",
    };
    const testedExam: GradeExam = {
      ...current,
      subjects,
      records: [complete, absent, zero, otherClass],
      settings: {
        ...current.settings,
        classSubjects: [
          { classId: "c1", examSubjects: ["语文", "数学", "英语", "物理", "生物"], statisticSubjects: ["语文", "数学", "英语"], separateRankSubjects: ["生物"] },
          { classId: "c2", examSubjects: ["语文", "数学", "英语", "物理", "化学", "地理"], statisticSubjects: ["语文", "数学", "英语"] },
        ],
      },
    };
    const report = buildGradeClassStatisticsReport(testedExam, [], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showSubjectClassRanks: true,
      showRawTotal: true,
      showAssignedTotal: true,
    });
    const rows = new Map(report.classes.flatMap((table) => table.rows).map((row) => [row.studentId, row.values]));

    expect(rows.get("a")).toMatchObject({
      "current:rawTotal": 450,
      "current:assignedTotal": 500,
      "current:rawTotalClassRank": 1,
      "current:assignedTotalClassRank": 1,
      "current:rawTotalGradeRank": 1,
    });
    expect(rows.get("b")).toMatchObject({
      "current:rawTotal": null,
      "current:assignedTotal": null,
      "current:rawTotalClassRank": null,
      "current:assignedTotalGradeRank": null,
      "current:subjectClassRank:语文": 1,
    });
    expect(rows.get("c")).toMatchObject({
      "current:rawTotal": 400,
      "current:assignedTotal": 400,
      "current:rawTotalClassRank": 2,
    });
    expect(rows.get("d")).toMatchObject({
      "current:rawTotal": 450,
      "current:assignedTotal": 450,
      "current:rawTotalGradeRank": 1,
      "current:assignedTotalGradeRank": 1,
    });
  });

  it("uses each comparison exam's own subjects for absence and totals", () => {
    const comparison = {
      ...previous,
      records: [
        { ...previous.records[0], scores: { 语文: 100, 化学: null }, assignedScores: { 语文: 100, 化学: null } },
        previous.records[1],
      ],
    };
    const report = buildGradeClassStatisticsReport(current, [comparison], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showRawTotal: true,
      showAssignedTotal: true,
      comparisonExamIds: ["previous"],
    });
    const values = report.classes[0].rows[0].values;
    expect(values["current:rawTotal"]).toBe(200);
    expect(values["previous:rawTotal"]).toBeNull();
    expect(values["previous:assignedTotal"]).toBeNull();
    expect(values["previous:rawTotalClassRank"]).toBeNull();
    expect(values["previous:assignedTotalGradeRank"]).toBeNull();
  });

  it("counts comparison-only subjects instead of reusing the current exam's subject list", () => {
    const comparison: GradeExam = {
      ...previous,
      subjects: ["语文", "化学", "历史"],
      records: previous.records.map((item) => ({
        ...item,
        scores: { ...item.scores, 历史: 70 },
        assignedScores: { ...item.assignedScores, 历史: 80 },
      })),
    };
    const report = buildGradeClassStatisticsReport(current, [comparison], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showRawTotal: true,
      showAssignedTotal: true,
      comparisonExamIds: ["previous"],
    });
    const values = report.classes[0].rows[0].values;
    expect(values["previous:rawTotal"]).toBe(250);
    expect(values["previous:assignedTotal"]).toBe(272);
  });

  it("counts different elective combinations without subject selections, preserving zeros and absence", () => {
    const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];
    const makeScores = (electives: string[], missing?: string) => Object.fromEntries(subjects.map((subject) => [
      subject,
      ["语文", "数学", "英语", ...electives].includes(subject) && subject !== missing ? 80 : null,
    ]));
    const first = makeScores(["物理", "化学", "生物"]);
    const second = makeScores(["历史", "政治", "地理"]);
    const third = makeScores(["物理", "化学", "生物"], "化学");
    const zero = { ...makeScores(["物理", "化学", "生物"]), 生物: 0 };
    const reportExam: GradeExam = {
      ...current,
      subjects,
      records: [first, second, third, zero].map((scores, index) => ({
        ...record(String(index), "c1", "一班", String(index), String(index), 0, 0, 0, 0, 0),
        scores,
        assignedScores: index === 0 ? { ...scores, 化学: 92 } : scores,
      })),
      settings: { ...current.settings, classSubjects: [{ classId: "c1", examSubjects: subjects, statisticSubjects: subjects }] },
    };
    const options = { ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS, showRawTotal: true, showAssignedTotal: true };
    const rows = buildGradeClassStatisticsReport(reportExam, [], options).classes[0].rows;
    expect(rows[0].values).toMatchObject({ "current:rawTotal": 480, "current:assignedTotal": 492, "current:rawTotalClassRank": 1 });
    expect(rows[1].values).toMatchObject({ "current:rawTotal": 480, "current:assignedTotal": 480 });
    expect(rows[2].values).toMatchObject({ "current:rawTotal": null, "current:assignedTotal": null, "current:rawTotalGradeRank": null });
    expect(rows[3].values).toMatchObject({ "current:rawTotal": 400, "current:assignedTotal": 400 });

    const allAbsent = {
      ...reportExam,
      records: reportExam.records.map((item) => ({
        ...item,
        scores: { ...item.scores, 语文: null },
        assignedScores: { ...item.assignedScores, 语文: null },
      })),
    };
    buildGradeClassStatisticsReport(allAbsent, [], options).classes[0].rows.forEach((row) => {
      expect(row.values["current:rawTotal"]).toBeNull();
      expect(row.values["current:assignedTotal"]).toBeNull();
    });
  });

  it("does not count an imported assigned-only subject as an attended raw exam", () => {
    const reportExam = { ...current, records: [{
      ...current.records[0],
      scores: { 语文: 100, 化学: null },
      assignedScores: { 语文: 100, 化学: 95 },
    }] };
    const values = buildGradeClassStatisticsReport(reportExam, [], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showRawTotal: true,
      showAssignedTotal: true,
    }).classes[0].rows[0].values;
    expect(values["current:rawTotal"]).toBeNull();
    expect(values["current:assignedTotal"]).toBeNull();
  });

  it("uses each student's six selected subjects in a mixed-elective class", () => {
    const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "政治", "地理"];
    const makeMixed = (id: string, subjectSelection: string, electives: string[]) => {
      const scores = Object.fromEntries(subjects.map((subject) => [
        subject, ["语文", "数学", "英语", ...electives].includes(subject) ? 80 : null,
      ]));
      return { ...record(id, "c1", "一班", id, id, 0, 0, 0, 240, 240), subjectSelection, scores, assignedScores: scores };
    };
    const mixedExam: GradeExam = {
      ...current,
      subjects,
      records: [
        makeMixed("a", "物化生", ["物理", "化学", "生物"]),
        makeMixed("b", "史政地", ["历史", "政治", "地理"]),
      ],
      settings: {
        ...current.settings,
        classSubjects: [{ classId: "c1", examSubjects: subjects, statisticSubjects: ["语文", "数学", "英语"] }],
      },
    };
    const report = buildGradeClassStatisticsReport(mixedExam, [], {
      ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
      showRawTotal: true,
      showAssignedTotal: true,
    });
    report.classes[0].rows.forEach((row) => {
      expect(row.values["current:rawTotal"]).toBe(480);
      expect(row.values["current:assignedTotal"]).toBe(480);
      expect(row.values["current:rawTotalGradeRank"]).toBe(1);
      expect(row.values["current:assignedTotalClassRank"]).toBe(1);
    });
  });

  it("ranks physics and history exam totals separately within each total-rank pool", () => {
    const subjects = ["语文", "数学", "英语", "物理", "历史", "化学", "政治", "生物", "地理"];
    const mixedRecord = (id: string, classId: string, physics: boolean, primary: number, assigned: number) => {
      const scores = { 语文: 80, 数学: 80, 英语: 80, 物理: physics ? primary : null,
        历史: physics ? null : primary, 化学: physics ? 80 : null, 政治: physics ? null : 80,
        生物: physics ? 80 : null, 地理: physics ? null : 80 };
      const assignedScores = { ...scores, 物理: physics ? assigned : null, 历史: physics ? null : assigned };
      return { ...record(id, classId, classId, id, id, 0, 0, 0, 0, 0), scores, assignedScores };
    };
    const mixed = {
      ...current,
      subjects,
      records: [
        mixedRecord("s1", "c1", true, 90, 85),
        mixedRecord("a1", "c1", false, 100, 95),
        mixedRecord("s2", "c2", true, 70, 105),
        mixedRecord("a2", "c2", false, 60, 110),
      ],
    };
    const options = { ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS, showRawTotal: true, showAssignedTotal: true };
    const rows = new Map(buildGradeClassStatisticsReport(mixed, [], options).classes.flatMap((table) => table.rows)
      .map((row) => [row.studentId, row.values]));
    expect(rows.get("s1")).toMatchObject({ "current:rawTotalGradeRank": 1, "current:rawTotalClassRank": 1,
      "current:assignedTotalGradeRank": 2, "current:assignedTotalClassRank": 1 });
    expect(rows.get("s2")).toMatchObject({ "current:rawTotalGradeRank": 2, "current:assignedTotalGradeRank": 1 });
    expect(rows.get("a1")).toMatchObject({ "current:rawTotalGradeRank": 1, "current:rawTotalClassRank": 1,
      "current:assignedTotalGradeRank": 2, "current:assignedTotalClassRank": 1 });
    expect(rows.get("a2")).toMatchObject({ "current:rawTotalGradeRank": 2, "current:assignedTotalGradeRank": 1 });

    // A uniform-subject exam must retain the ordinary combined ranking.
    const ordinary = { ...mixed, subjects: ["语文", "数学"], records: mixed.records.map((item) => ({
      ...item, scores: { 语文: item.scores.语文, 数学: item.scores.数学 },
      assignedScores: { 语文: item.assignedScores.语文, 数学: item.assignedScores.数学 },
    })) };
    const ordinaryRows = buildGradeClassStatisticsReport(ordinary, [], options).classes.flatMap((table) => table.rows);
    ordinaryRows.forEach((row) => expect(row.values["current:rawTotalGradeRank"]).toBe(1));
  });

});
