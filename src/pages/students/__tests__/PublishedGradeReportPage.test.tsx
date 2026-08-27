import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublishedGradeReportPage from "@/pages/students/PublishedGradeReportPage";
import { buildGradePublishedReportBundle } from "@/lib/grade-published-report";
import { DEFAULT_ASSIGNMENT_RULES } from "@/lib/grade-statistics";
import { gradeService } from "@/services/grade";
import type { GradeExam, GradeImportContext, GradeStatisticsTemplate } from "@/types";

const classAverageTemplate: GradeStatisticsTemplate = {
  id: "class-average",
  kind: "classAverage",
  name: "班级平均分表",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["语文", "化学"],
  classAverageOptions: {
    classOrder: ["class-1", "class-2"],
    classLabels: { "class-1": "1班", "class-2": "2班" },
    classCategories: { "class-1": "实验班", "class-2": "实验班" },
    showTeacherRows: true,
    showGroupDifference: true,
    showGroupAverage: true,
    showOverallAverage: true,
  },
};

const totalScoreTemplate: GradeStatisticsTemplate = {
  id: "total-score-segment",
  kind: "totalScoreSegment",
  name: "总分分数段",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["语文", "化学"],
  segmentMax: 500,
  segmentMin: 500,
  segmentSize: 10,
  totalScoreSegmentOptions: {
    trackThresholds: {
      science: { highScore1: 300, highScore2: 280, firstTier: 260, undergraduate: 240 },
      arts: { highScore1: 290, highScore2: 270, firstTier: 250, undergraduate: 230 },
    },
    subjectScoreSegmentThresholds: {
      语文: [150],
      化学: [100],
    },
  },
};

const exam: GradeExam = {
  id: "exam-1",
  schoolId: "school-1",
  teacherId: "teacher-owner",
  cohortKey: "grad-2027",
  cohortLabel: "2027届高二",
  name: "期末考试",
  examDate: "2026-06-20",
  sourceFileName: "scores.xlsx",
  sourceSheetName: "成绩",
  subjects: ["语文", "化学"],
  records: [
    {
      id: "record-1",
      studentId: "student-1",
      studentName: "甲",
      studentNo: "001",
      classId: "class-1",
      className: "高二(1)班",
      subjectSelection: "物化生",
      scores: { 语文: 120, 化学: 95 },
      assignedScores: { 语文: 120, 化学: 92 },
      rawTotal: 215,
      assignedTotal: 212,
      gradeRank: 1,
      classRank: 1,
    },
    {
      id: "record-2",
      studentId: "student-2",
      studentName: "乙",
      studentNo: "002",
      classId: "class-2",
      className: "高二(2)班",
      subjectSelection: "历化政",
      scores: { 语文: 110, 化学: 70 },
      assignedScores: { 语文: 110, 化学: 60 },
      rawTotal: 180,
      assignedTotal: 170,
      gradeRank: 2,
      classRank: 1,
    },
  ],
  settings: {
    subjectTeacherIds: {
      语文: ["teacher-chinese-1", "teacher-chinese-2"],
      化学: ["teacher-chem-1", "teacher-chem-2"],
    },
    classSubjectTeacherIds: {
      "class-1": { 语文: ["teacher-chinese-1"], 化学: ["teacher-chem-1"] },
      "class-2": { 语文: ["teacher-chinese-2"], 化学: ["teacher-chem-2"] },
    },
    assignmentRules: { 化学: DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule })) },
    classSubjects: [
      { classId: "class-1", examSubjects: ["语文", "化学"], statisticSubjects: ["语文", "化学"] },
      { classId: "class-2", examSubjects: ["语文", "化学"], statisticSubjects: ["语文", "化学"] },
    ],
    templates: [classAverageTemplate, totalScoreTemplate],
  },
  createdAt: "2026-06-20T00:00:00.000Z",
  updatedAt: "2026-06-20T00:00:00.000Z",
};

const context: GradeImportContext = {
  cohort: {
    key: "grad-2027",
    label: "2027届高二",
    grade: "高二",
    gradYear: 2027,
    classIds: ["class-1", "class-2"],
    studentCount: 2,
  },
  classes: [
    {
      id: "class-1",
      type: "school",
      schoolId: "school-1",
      name: "高二(1)班",
      grade: "高二",
      studentCount: 1,
      createdBy: "teacher-owner",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "class-2",
      type: "school",
      schoolId: "school-1",
      name: "高二(2)班",
      grade: "高二",
      studentCount: 1,
      createdBy: "teacher-owner",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  students: [],
  teachers: [
    { id: "teacher-head-1", name: "张班主任", subject: "", homeroomClassIds: ["class-1"] },
    { id: "teacher-head-2", name: "李班主任", subject: "", homeroomClassIds: ["class-2"] },
    { id: "teacher-chinese-1", name: "周老师", subject: "语文", teachingClassIds: ["class-1"] },
    { id: "teacher-chinese-2", name: "赵老师", subject: "语文", teachingClassIds: ["class-2"] },
    { id: "teacher-chem-1", name: "陈老师", subject: "化学", teachingClassIds: ["class-1"] },
    { id: "teacher-chem-2", name: "林老师", subject: "化学", teachingClassIds: ["class-2"] },
  ],
  classProfiles: {
    "class-1": {
      classTypeName: "实验班",
      subjectSelections: ["物化生"],
      scoreSubjects: ["语文", "化学"],
      hasImportedScores: true,
    },
    "class-2": {
      classTypeName: "实验班",
      subjectSelections: ["历化政"],
      scoreSubjects: ["语文", "化学"],
      hasImportedScores: true,
    },
  },
};

const bundle = buildGradePublishedReportBundle(exam, context, "2026-06-21T08:00:00.000Z");

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/grades/public-token"]}>
      <Routes>
        <Route path="/grades/:token" element={<PublishedGradeReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PublishedGradeReportPage", () => {
  it("matches the platform tables for teachers, standards, zero counts, and summary rows", async () => {
    vi.spyOn(gradeService, "getPublishedReportByToken").mockResolvedValue(bundle);
    renderPage();

    expect(await screen.findByText("张班主任")).toBeInTheDocument();
    expect(screen.getByText("类别")).toBeInTheDocument();
    expect(screen.getByText("分差")).toBeInTheDocument();
    expect(screen.getByText("平均（1-2班）")).toBeInTheDocument();
    expect(screen.getByText("全校平均")).toBeInTheDocument();
    expect(screen.getAllByText("周老师").length).toBeGreaterThan(0);
    expect(screen.getAllByText("陈老师").length).toBeGreaterThan(0);

    const standardsRow = screen.getByTestId("track-standard-summary");
    expect(standardsRow).toHaveTextContent("理科标准：高分1 300分");
    expect(standardsRow).toHaveTextContent("文科标准：高分1 290分");
    expect(standardsRow.nextElementSibling).toHaveTextContent("考生人数");

    const zeroTotalRow = screen.getByRole("row", { name: /500分以上/ });
    expect(within(zeroTotalRow).queryByText("0")).not.toBeInTheDocument();

    const teacherCell = screen.getAllByText("赵老师")[0].closest("td");
    expect(teacherCell).toHaveClass("text-center");

    expect(screen.getAllByText("所占比例")).toHaveLength(2);

    const chemistryHeading = screen.getByText("2027届高二期末考试化学选修分数段统计表");
    const chemistryTable = chemistryHeading.parentElement?.nextElementSibling;
    expect(chemistryTable).not.toBeNull();
    const classTwoRow = within(chemistryTable as HTMLElement).getByRole("row", { name: /2班 林老师 1/ });
    expect(within(classTwoRow).queryByText("0")).not.toBeInTheDocument();
  });
});
