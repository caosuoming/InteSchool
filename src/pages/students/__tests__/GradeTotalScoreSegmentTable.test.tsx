import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GradeTotalScoreSegmentTable } from "@/pages/students/GradeTotalScoreSegmentTable";
import type {
  GradeExam,
  GradeImportContext,
  GradeStatisticsTemplate,
} from "@/types";

const classAverageTemplate: GradeStatisticsTemplate = {
  id: "class-average",
  kind: "classAverage",
  name: "班级平均分表",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["数学"],
};

const template: GradeStatisticsTemplate = {
  id: "total-score-segment",
  kind: "totalScoreSegment",
  name: "总分分数（赋分）",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["数学"],
  segmentMax: 100,
  segmentMin: 80,
  segmentSize: 10,
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
  records: [{
    id: "record-1",
    studentId: "student-1",
    studentName: "甲",
    studentNo: "001",
    classId: "class-1",
    className: "高三(1)班",
    scores: { 数学: 90 },
    assignedScores: { 数学: 90 },
    rawTotal: 90,
    assignedTotal: 90,
    gradeRank: 1,
    classRank: 1,
  }],
  settings: {
    subjectTeacherIds: {},
    assignmentRules: {},
    classSubjects: [],
    templates: [classAverageTemplate, template],
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
  teachers: [],
};

describe("GradeTotalScoreSegmentTable", () => {
  it("renders cumulative class counts and saves score range changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Harness() {
      const [settings, setSettings] = useState(exam.settings);
      return (
        <GradeTotalScoreSegmentTable
          exam={exam}
          settings={settings}
          template={template}
          classAverageTemplate={classAverageTemplate}
          context={context}
          onChange={(next) => {
            onChange(next);
            setSettings(next);
          }}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText("2026届高三期末考试总分分数段汇总表")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "1班" })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /100分以上/ })).getByRole("cell", { name: "0" })).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /90分以上/ })).getByRole("cell", { name: "1" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "调整分数段" }));
    const interval = screen.getByRole("spinbutton", { name: "分数间隔" });
    await user.clear(interval);
    await user.type(interval, "5");

    const changed = onChange.mock.lastCall?.[0];
    expect(changed.templates.find((item: GradeStatisticsTemplate) => item.id === template.id)?.segmentSize).toBe(5);
    expect(screen.getByText("85分以上")).toBeInTheDocument();
  });
});
