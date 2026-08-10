import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GradeClassAverageTable } from "@/pages/students/GradeClassAverageTable";
import type {
  GradeExam,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "@/types";

const template: GradeStatisticsTemplate = {
  id: "class-average",
  kind: "classAverage",
  name: "班级平均分表",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["数学"],
};

const exam: GradeExam = {
  id: "exam-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: "grad-2026",
  cohortLabel: "2026届高三",
  name: "期末考试",
  examDate: "2026-01-27",
  sourceFileName: "scores.xlsx",
  sourceSheetName: "成绩",
  subjects: ["数学"],
  records: [
    {
      id: "record-1",
      studentId: "student-1",
      studentName: "甲",
      studentNo: "001",
      classId: "class-1",
      className: "高三(1)班",
      scores: { 数学: 90 },
      assignedScores: { 数学: 96 },
      rawTotal: 90,
      assignedTotal: 96,
      gradeRank: 1,
      classRank: 1,
    },
  ],
  settings: {
    subjectTeacherIds: {},
    classSubjectTeacherIds: { "class-1": { 数学: ["teacher-math"] } },
    assignmentRules: {},
    classSubjects: [],
    templates: [template],
  },
  createdAt: "2026-01-27T00:00:00.000Z",
  updatedAt: "2026-01-27T00:00:00.000Z",
};

const context: GradeImportContext = {
  cohort: {
    key: "grad-2026",
    label: "2026届高三",
    grade: "高三",
    gradYear: 2026,
    classIds: ["class-1"],
    studentCount: 1,
  },
  classes: [{
    id: "class-1",
    type: "school",
    schoolId: "school-1",
    name: "高三(1)班",
    grade: "高三",
    studentCount: 1,
    createdBy: "teacher-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  }],
  students: [],
  teachers: [{
    id: "teacher-math",
    name: "数学教师",
    subject: "数学",
    teachingClassIds: ["class-1"],
    homeroomClassIds: ["class-1"],
  }],
  classProfiles: {
    "class-1": {
      classTypeName: "强基班",
      subjectSelections: ["物化生"],
      scoreSubjects: ["数学"],
      hasImportedScores: true,
    },
  },
};

describe("GradeClassAverageTable", () => {
  it("renders uploaded scores and persists user layout adjustments", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Harness() {
      const [settings, setSettings] = useState(exam.settings);
      return (
        <GradeClassAverageTable
          exam={exam}
          settings={settings}
          template={template}
          context={context}
          onChange={(next) => {
            onChange(next);
            setSettings(next);
          }}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText("2026届高三期末考试班级平均分统计表")).toBeInTheDocument();
    expect(screen.getAllByText("数学教师").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("cell", { name: "96.00" }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "调整表格" }));
    const rawCheckbox = screen.getByRole("checkbox", { name: "高三(1)班数学原始分" });
    const assignedCheckbox = screen.getByRole("checkbox", { name: "高三(1)班数学赋分" });
    expect(rawCheckbox).not.toBeChecked();
    expect(assignedCheckbox).toBeChecked();

    await user.click(rawCheckbox);
    expect(screen.getAllByRole("cell", { name: "90.00|96.00" }).length).toBeGreaterThan(0);
    const scoreModeSettings = onChange.mock.lastCall?.[0];
    expect(scoreModeSettings.templates[0].classAverageOptions.subjectScoreModes["class-1"].数学)
      .toBe("both");

    await user.click(screen.getByRole("radio", { name: "原始总分" }));
    const totalModeSettings = onChange.mock.lastCall?.[0];
    expect(totalModeSettings.templates[0].classAverageOptions.totalScoreMode).toBe("raw");
    expect(screen.getAllByRole("cell", { name: "90.00" }).length).toBeGreaterThan(0);

    const categoryInput = screen.getByRole("textbox", { name: "高三(1)班类别" });
    await user.clear(categoryInput);
    await user.type(categoryInput, "物化实验");

    const categorySettings = onChange.mock.lastCall?.[0];
    expect(categorySettings.templates[0].classAverageOptions.classCategories["class-1"])
      .toBe("物化实验");

    await user.click(screen.getByRole("checkbox", { name: "显示高三(1)班" }));
    const hiddenSettings = onChange.mock.lastCall?.[0];
    expect(hiddenSettings.templates[0].classAverageOptions.hiddenClassIds).toContain("class-1");
  });
});
