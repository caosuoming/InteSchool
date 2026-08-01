import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gradeService } from "@/services/grade";
import type { GradeQueryData, GradeQueryExam } from "@/types";
import StudentGradesPage from "../StudentGradesPage";

vi.mock("@/services/grade", () => ({
  gradeService: {
    getQueryData: vi.fn(),
  },
}));

const exam: GradeQueryExam = {
  id: "exam-1",
  cohortKey: "grad-2028",
  cohortLabel: "2028届高一",
  name: "期中考试",
  examDate: "2026-11-10",
  subjects: ["数学", "化学"],
  subjectAverages: { 数学: 110, 化学: 82 },
  classSummaries: [
    {
      classId: "class-1",
      className: "高一(1)班",
      studentCount: 1,
      subjectAverages: { 数学: 120, 化学: 78 },
      rawTotalAverage: 198,
      assignedTotalAverage: 198,
    },
    {
      classId: "class-2",
      className: "高一(2)班",
      studentCount: 1,
      subjectAverages: { 数学: 100, 化学: 86 },
      rawTotalAverage: 186,
      assignedTotalAverage: 186,
    },
  ],
  records: [
    {
      id: "record-1",
      studentId: "student-1",
      studentName: "张同学",
      studentNo: "202801",
      classId: "class-1",
      className: "高一(1)班",
      scores: { 数学: 120, 化学: 78 },
      assignedScores: { 数学: 120, 化学: 78 },
      rawTotal: 198,
      assignedTotal: 198,
      gradeRank: 3,
      classRank: 1,
    },
  ],
  createdAt: "2026-11-10T08:00:00.000Z",
};

function queryData(scope: GradeQueryData["scope"]): GradeQueryData {
  const homeroom = scope === "homeroom";
  return {
    scope,
    scopeLabel: homeroom ? "班主任班级" : "任教班级",
    subject: "数学",
    roles: homeroom ? ["teacher", "headTeacher"] : ["teacher"],
    teachingClassIds: ["class-1"],
    homeroomClassIds: homeroom ? ["class-1"] : [],
    fullClassIds: homeroom ? ["class-1"] : [],
    grades: ["高一"],
    classes: [
      { id: "class-1", name: "高一(1)班", grade: "高一", cohortKey: "grad-2028", access: homeroom ? "all" : "subject" },
      { id: "class-2", name: "高一(2)班", grade: "高一", cohortKey: "grad-2028", access: "aggregate" },
    ],
    exams: [{ ...exam, subjects: homeroom ? [...exam.subjects] : ["数学"] }],
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/my-students/grades"]}>
      <StudentGradesPage />
    </MemoryRouter>,
  );
}

describe("StudentGradesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a read-only score query without legacy management actions", async () => {
    vi.mocked(gradeService.getQueryData).mockResolvedValue(queryData("teacher"));
    renderPage();

    expect(await screen.findByRole("heading", { name: "成绩查询" })).toBeInTheDocument();
    expect(screen.getAllByText("成绩查询").length).toBeGreaterThan(1);
    expect(screen.getByText("班级学科对比")).toBeInTheDocument();
    expect(screen.getByText("学生名次趋势")).toBeInTheDocument();
    expect(screen.queryByText("导入成绩")).not.toBeInTheDocument();
    expect(screen.queryByText("导出成绩")).not.toBeInTheDocument();
    expect(screen.queryByText("统计设置")).not.toBeInTheDocument();
    expect(screen.queryByText("删除记录")).not.toBeInTheDocument();
  });

  it("shows full-subject analysis for a homeroom teacher", async () => {
    vi.mocked(gradeService.getQueryData).mockResolvedValue(queryData("homeroom"));
    renderPage();

    const tab = await screen.findByRole("button", { name: /班级全科分析/ });
    await userEvent.click(tab);

    await waitFor(() => {
      expect(screen.getByText("班级各学科整体情况")).toBeInTheDocument();
      expect(screen.getByText("学生薄弱学科")).toBeInTheDocument();
    });
  });
});
