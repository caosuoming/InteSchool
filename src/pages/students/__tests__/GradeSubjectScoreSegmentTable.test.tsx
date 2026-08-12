import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GradeSubjectScoreSegmentTable } from "@/pages/students/GradeSubjectScoreSegmentTable";
import type { GradeExam, GradeImportContext, GradeStatisticsTemplate } from "@/types";

const template: GradeStatisticsTemplate = {
  id: "total-score-segment",
  kind: "totalScoreSegment",
  name: "总分分数段",
  enabled: true,
  scoreMode: "assigned",
  subjects: ["语文", "物理"],
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
  subjects: ["语文", "物理"],
  records: [{
    id: "record-1",
    studentId: "student-1",
    studentName: "甲",
    studentNo: "001",
    classId: "class-1",
    className: "高二(1)班",
    scores: { 语文: 120, 物理: 88 },
    assignedScores: { 语文: 120, 物理: 88 },
    rawTotal: 208,
    assignedTotal: 208,
    gradeRank: 1,
    classRank: 1,
  }],
  settings: {
    subjectTeacherIds: {},
    classSubjectTeacherIds: { "class-1": { 语文: ["teacher-chinese"], 物理: [] } },
    assignmentRules: {},
    classSubjects: [{ classId: "class-1", examSubjects: ["语文", "物理"], statisticSubjects: ["语文", "物理"] }],
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
  teachers: [{ id: "teacher-chinese", name: "周虹", subject: "语文", teachingClassIds: ["class-1"] }],
};

describe("GradeSubjectScoreSegmentTable", () => {
  it("renders subject tables and auto-saves adjusted thresholds", async () => {
    const user = userEvent.setup();
    const onAutoSave = vi.fn();

    function Harness() {
      const [settings, setSettings] = useState(exam.settings);
      return (
        <GradeSubjectScoreSegmentTable
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

    expect(screen.getByText("表三、各单科分数段")).toBeInTheDocument();
    expect(screen.getByText("2027届高二四校联合考试语文成绩情况统计表")).toBeInTheDocument();
    const chineseTable = screen.getByText("2027届高二四校联合考试语文成绩情况统计表")
      .closest("section")?.querySelector("table");
    expect(chineseTable).not.toBeNull();
    expect(within(chineseTable!).getByRole("columnheader", { name: "语文" })).toBeInTheDocument();
    expect(within(chineseTable!).getByText("周虹")).toBeInTheDocument();
    expect(within(chineseTable!).getByRole("columnheader", { name: "140分以上" })).toBeInTheDocument();
    expect(screen.getByText("2027届高二四校联合考试物理成绩情况统计表")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "调整分数段" }));
    const chineseThresholds = screen.getByLabelText("语文分数段");
    await user.clear(chineseThresholds);
    await user.type(chineseThresholds, "130，111，90");
    await user.tab();

    expect(onAutoSave).toHaveBeenCalled();
    const savedTemplate = onAutoSave.mock.lastCall?.[0].templates.find((item: GradeStatisticsTemplate) => item.id === template.id);
    expect(savedTemplate?.totalScoreSegmentOptions?.subjectScoreSegmentThresholds?.语文).toEqual([130, 111, 90]);
  });
});
