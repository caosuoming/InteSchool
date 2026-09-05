import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GradeTotalScoreRankingTable } from "@/pages/students/GradeTotalScoreRankingTable";
import type { GradeExam, GradeImportContext, GradeStatisticsTemplate } from "@/types";

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
  name: "总分分数段",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["数学"],
  totalScoreSegmentOptions: { totalScoreTopN: 1 },
};

const exam: GradeExam = {
  id: "exam-1",
  schoolId: "school-1",
  teacherId: "teacher-1",
  cohortKey: "grad-2027",
  cohortLabel: "2027届高三",
  name: "期末考试",
  examDate: "2026-06-30",
  sourceFileName: "scores.xlsx",
  sourceSheetName: "成绩",
  subjects: ["数学"],
  records: [
    { id: "r1", studentId: "s1", studentName: "甲", studentNo: "001", classId: "c1", className: "高三(1)班", scores: { 数学: 90 }, assignedScores: { 数学: 95 }, rawTotal: 90, assignedTotal: 95, gradeRank: 1, classRank: 1 },
    { id: "r2", studentId: "s2", studentName: "乙", studentNo: "002", classId: "c1", className: "高三(1)班", scores: { 数学: 95 }, assignedScores: { 数学: 90 }, rawTotal: 95, assignedTotal: 90, gradeRank: 2, classRank: 2 },
  ],
  settings: {
    subjectTeacherIds: {},
    assignmentRules: {},
    classSubjects: [],
    templates: [classAverageTemplate, template],
  },
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
};

const context: GradeImportContext = {
  cohort: { key: "grad-2027", label: "2027届高三", grade: "高三", gradYear: 2027, classIds: ["c1"], studentCount: 2 },
  classes: [{ id: "c1", type: "school", schoolId: "school-1", name: "高三(1)班", grade: "高三", studentCount: 2, createdBy: "teacher-1", createdAt: "2026-01-01T00:00:00.000Z" }],
  students: [],
  teachers: [],
};

describe("GradeTotalScoreRankingTable", () => {
  it("renders table five and auto-saves the top-N setting", async () => {
    const user = userEvent.setup();
    const onAutoSave = vi.fn();

    function Harness() {
      const [settings, setSettings] = useState(exam.settings);
      return (
        <GradeTotalScoreRankingTable
          exam={exam}
          settings={settings}
          template={template}
          classAverageTemplate={classAverageTemplate}
          context={context}
          onChange={setSettings}
          onAutoSave={onAutoSave}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText("表五、总分前1名（赋分）")).toBeInTheDocument();
    expect(screen.getByText("期末考试总分前1名（赋分）")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "数学" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "总分（赋分）" })).toBeInTheDocument();
    expect(screen.getByText("甲")).toBeInTheDocument();
    expect(screen.getAllByText("95")).toHaveLength(2);
    expect(screen.queryByText("乙")).not.toBeInTheDocument();

    const topN = screen.getByRole("spinbutton", { name: "表五前多少名" });
    await user.clear(topN);
    await user.type(topN, "2");
    await user.tab();

    expect(screen.getByText("表五、总分前2名（赋分）")).toBeInTheDocument();
    expect(screen.getByText("乙")).toBeInTheDocument();
    expect(onAutoSave).toHaveBeenCalled();
    expect(onAutoSave.mock.lastCall?.[0].templates.find((item: GradeStatisticsTemplate) => item.id === template.id)
      ?.totalScoreSegmentOptions?.totalScoreTopN).toBe(2);
  });
});
