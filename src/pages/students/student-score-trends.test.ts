import { describe, expect, it } from "vitest";
import type { GradeQueryData, GradeQueryExam } from "@/types";
import { classRankTrend, studentScoreHistory, studentSubjectTrend } from "./student-score-trends";

const base: GradeQueryData = {
  scope: "homeroom", scopeLabel: "班主任", subject: "数学", roles: ["teacher"],
  teachingClassIds: ["c1"], homeroomClassIds: ["c1"], fullClassIds: ["c1"], grades: ["高一"], classes: [], exams: [],
};
const exam = (id: string, date: string, score: number, rank: number, average: number, other: number): GradeQueryExam => ({
  id, name: `${id}月考`, examDate: date, createdAt: `${date}T00:00:00Z`, cohortKey: "2029", cohortLabel: "高一",
  subjects: ["数学", "语文"], subjectAverages: { 数学: 80, 语文: 80 },
  classSummaries: [
    { classId: "c1", className: "一班", studentCount: 20, subjectAverages: { 数学: average }, rawTotalAverage: null, assignedTotalAverage: null },
    { classId: "c2", className: "二班", studentCount: 20, subjectAverages: { 数学: other }, rawTotalAverage: null, assignedTotalAverage: null },
  ],
  records: [{
    id, studentId: "s1", studentName: "张同学", studentNo: "1", classId: "c1", className: "一班", gradeRank: 18, classRank: 2,
    scores: { 数学: score - 2, 语文: 83 }, assignedScores: { 数学: score, 语文: 85 }, rawTotal: score + 81, assignedTotal: score + 85,
    subjectRanks: { 数学: rank, 语文: 4 }, subjectRankScopes: { 数学: "cohort", 语文: "separate" },
  }],
});

describe("student score trends", () => {
  const data: GradeQueryData = { ...base, exams: [
    exam("new", "2026-10-02", 95, 3, 85, 80),
    exam("old", "2026-09-01", 80, 9, 75, 90),
  ] };

  it("uses per-subject rank rather than the total grade rank, sorted oldest to newest", () => {
    const { points } = studentSubjectTrend(data, "s1");
    expect(points.map((point) => [point.examId, point.value, point.rank, point.rankLabel])).toEqual([
      ["old", 80, 9, "单科年级名次"],
      ["new", 95, 3, "单科年级名次"],
    ]);
  });

  it("does not replace a missing subject rank with the unrelated total-score grade rank", () => {
    const row = data.exams[0].records[0];
    const missingRank = { ...data, exams: [{ ...data.exams[0], records: [{ ...row, subjectRanks: { 数学: null } }] }] };
    expect(studentSubjectTrend(missingRank, "s1").points[0].rank).toBeNull();
  });

  it("calculates competition ranking of classes using comparable subject averages", () => {
    const { subject, points } = classRankTrend(data, "c1");
    expect(subject).toBe("数学");
    expect(points.map((point) => [point.examId, point.rank, point.comparisonCount])).toEqual([
      ["old", 2, 2], ["new", 1, 2],
    ]);
    const tied = { ...data, exams: [exam("tie", "2026-09-01", 80, 2, 90, 90)] };
    expect(classRankTrend(tied, "c1").points[0].rank).toBe(1);
  });

  it("does not invent rankings when there is only one comparable class", () => {
    const onlyClass = { ...data, exams: [{ ...data.exams[0], classSummaries: [data.exams[0].classSummaries[0]] }] };
    expect(classRankTrend(onlyClass, "c1").points).toEqual([]);
  });

  it("keeps all visible subjects and prefers assigned scores in full history", () => {
    const { subjects, exams } = studentScoreHistory(data, "s1");
    expect(subjects).toEqual(["数学", "语文"]);
    expect(exams.map((item) => item.id)).toEqual(["old", "new"]);
    expect(exams[0].scores).toEqual({ 数学: 80, 语文: 85 });
    expect(studentScoreHistory(data, "missing").exams).toEqual([]);
  });
});
