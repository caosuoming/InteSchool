import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GradeElectiveScoreSegmentTable } from "@/pages/students/GradeElectiveScoreSegmentTable";
import { DEFAULT_ASSIGNMENT_RULES } from "@/lib/grade-statistics";
import type { GradeExam, GradeImportContext, GradeStatisticsTemplate } from "@/types";

const template: GradeStatisticsTemplate = {
  id: "total-score-segment",
  kind: "totalScoreSegment",
  name: "总分分数段",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["化学"],
};

const exam: GradeExam = {
  id: "exam-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: "grad-2027",
  cohortLabel: "2027届高二",
  name: "四校联合考试",
  examDate: "2026-05-26",
  sourceFileName: "scores.xlsx",
  sourceSheetName: "成绩",
  subjects: ["化学"],
  records: [{
    id: "record-1",
    studentId: "student-1",
    studentName: "甲",
    studentNo: "001",
    classId: "class-1",
    className: "高二(1)班",
    scores: { 化学: 95 },
    assignedScores: { 化学: 92 },
    rawTotal: 95,
    assignedTotal: 92,
    gradeRank: 1,
    classRank: 1,
  }],
  settings: {
    subjectTeacherIds: { 化学: ["teacher-chem"] },
    classSubjectTeacherIds: { "class-1": { 化学: ["teacher-chem"] } },
    assignmentRules: { 化学: DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule })) },
    classSubjects: [{ classId: "class-1", examSubjects: ["化学"], statisticSubjects: ["化学"] }],
    templates: [template],
  },
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
};

const context: GradeImportContext = {
  cohort: { key: "grad-2027", label: "2027届高二", grade: "高二", gradYear: 2027, classIds: ["class-1"], studentCount: 1 },
  classes: [{
    id: "class-1",
    type: "school",
    schoolId: "school-1",
    name: "高二(1)班",
    grade: "高二",
    studentCount: 1,
    createdBy: "teacher-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  }],
  students: [],
  teachers: [{ id: "teacher-chem", name: "陈老师", subject: "化学", teachingClassIds: ["class-1"] }],
};

describe("GradeElectiveScoreSegmentTable", () => {
  it("renders table four and auto-saves adjusted thresholds", async () => {
    const user = userEvent.setup();
    const onAutoSave = vi.fn();

    function Harness() {
      const [settings, setSettings] = useState(exam.settings);
      return (
        <GradeElectiveScoreSegmentTable
          exam={exam}
          settings={settings}
          template={template}
          context={context}
          onChange={setSettings}
          onAutoSave={onAutoSave}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText("表四、选修分数段")).toBeInTheDocument();
    expect(screen.getByText("2027届高二四校联合考试化学选修分数段统计表")).toBeInTheDocument();
    const chemistryTable = screen.getByText("2027届高二四校联合考试化学选修分数段统计表")
      .closest("section")?.querySelector("table");
    expect(chemistryTable).not.toBeNull();
    expect(within(chemistryTable!).getByRole("columnheader", { name: "任课教师" })).toBeInTheDocument();
    expect(within(chemistryTable!).getByRole("columnheader", { name: "实际考试人数" })).toBeInTheDocument();
    for (const label of ["A", "B", "C", "D", "E"]) {
      expect(within(chemistryTable!).getByRole("columnheader", { name: label })).toBeInTheDocument();
    }
    expect(within(chemistryTable!).getByRole("columnheader", { name: "90分以上" })).toBeInTheDocument();
    expect(within(chemistryTable!).getByText("陈老师")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "调整表四分数段" }));
    const chemistryThresholds = screen.getByLabelText("化学分数段");
    await user.clear(chemistryThresholds);
    await user.type(chemistryThresholds, "95，85，75");
    await user.tab();

    expect(onAutoSave).toHaveBeenCalled();
    const savedTemplate = onAutoSave.mock.lastCall?.[0].templates.find((item: GradeStatisticsTemplate) => item.id === template.id);
    expect(savedTemplate?.totalScoreSegmentOptions?.subjectScoreSegmentThresholds?.化学).toEqual([95, 85, 75]);
  });

  it("hides grade-band columns when table one uses raw scores only", () => {
    const classAverageTemplate: GradeStatisticsTemplate = {
      id: "class-average",
      kind: "classAverage",
      name: "班级平均分表",
      enabled: true,
      scoreMode: "raw",
      subjects: ["化学"],
      classAverageOptions: {
        classOrder: ["class-1"],
        subjectScoreModes: {
          "class-1": { 化学: "raw" },
        },
        totalScoreMode: "raw",
      },
    };

    render(
      <GradeElectiveScoreSegmentTable
        exam={exam}
        settings={{ ...exam.settings, templates: [classAverageTemplate, template] }}
        template={template}
        classAverageTemplate={classAverageTemplate}
        context={context}
        onChange={vi.fn()}
      />,
    );

    const chemistryTable = screen.getByText("2027届高二四校联合考试化学选修分数段统计表")
      .closest("section")?.querySelector("table");
    expect(chemistryTable).not.toBeNull();
    for (const label of ["A", "B", "C", "D", "E"]) {
      expect(within(chemistryTable!).queryByRole("columnheader", { name: label })).not.toBeInTheDocument();
    }
    expect(within(chemistryTable!).getByRole("columnheader", { name: "90分以上" })).toBeInTheDocument();
    expect(screen.getByText(/表一仅使用原始分时不显示等级人数/)).toBeInTheDocument();
  });
});
