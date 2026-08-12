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
    scores: { 化学: 92 },
    assignedScores: { 化学: 92 },
    rawTotal: 92,
    assignedTotal: 92,
    gradeRank: 1,
    classRank: 1,
  }],
  settings: {
    subjectTeacherIds: {},
    classSubjectTeacherIds: { "class-1": { 化学: ["teacher-chemistry"] } },
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
  teachers: [{ id: "teacher-chemistry", name: "屈春芸", subject: "化学", teachingClassIds: ["class-1"] }],
};

describe("GradeElectiveScoreSegmentTable", () => {
  it("renders A-E columns and auto-saves adjusted score thresholds", async () => {
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
    const chemistryTable = screen.getByText("2027届高二四校联合考试化学选修分数段统计表")
      .closest("section")?.querySelector("table");
    expect(chemistryTable).not.toBeNull();
    expect(within(chemistryTable!).getByRole("columnheader", { name: "任课教师" })).toBeInTheDocument();
    expect(within(chemistryTable!).getByRole("columnheader", { name: "A" })).toBeInTheDocument();
    expect(within(chemistryTable!).getByRole("columnheader", { name: "E" })).toBeInTheDocument();
    expect(within(chemistryTable!).getByRole("columnheader", { name: "90分以上" })).toBeInTheDocument();
    expect(within(chemistryTable!).getByText("屈春芸")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "调整分数段" }));
    const thresholds = screen.getByLabelText("化学分数段");
    await user.clear(thresholds);
    await user.type(thresholds, "95，85，75");
    await user.tab();

    expect(onAutoSave).toHaveBeenCalled();
    const savedTemplate = onAutoSave.mock.lastCall?.[0].templates.find((item: GradeStatisticsTemplate) => item.id === template.id);
    expect(savedTemplate?.totalScoreSegmentOptions?.subjectScoreSegmentThresholds?.化学).toEqual([95, 85, 75]);
  });
});
