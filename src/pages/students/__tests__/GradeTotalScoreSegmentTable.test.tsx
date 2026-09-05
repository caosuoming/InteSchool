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
  totalScoreSegmentOptions: {
    highScore1Threshold: 90,
    highScore2Threshold: 85,
    firstTierThreshold: 80,
    undergraduateThreshold: 70,
    trackThresholds: {
      science: { highScore1: 90, highScore2: 85, firstTier: 80, undergraduate: 70 },
      arts: { highScore1: 88, highScore2: 83, firstTier: 78, undergraduate: 68 },
    },
    classTargets: {
      "class-1": { highScore1: 1, highScore2: 1, firstTier: 1, undergraduate: 1 },
    },
  },
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
  classProfiles: {
    "class-1": { subjectSelections: ["物化生"], scoreSubjects: ["数学"], hasImportedScores: true },
  },
};

describe("GradeTotalScoreSegmentTable", () => {
  it("renders cumulative class counts and saves score range changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onAutoSave = vi.fn();

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
          onAutoSave={onAutoSave}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByText("表二、总分分数段汇总表（赋分）")).toBeInTheDocument();
    expect(screen.getByText("期末考试总分分数段汇总表（赋分）")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "1班" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "理科小计" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "总计" })).toBeInTheDocument();
    const emptyCountCells = within(screen.getByRole("row", { name: /100分以上/ })).getAllByRole("cell");
    expect(emptyCountCells).toHaveLength(3);
    emptyCountCells.forEach((cell) => expect(cell).toBeEmptyDOMElement());
    expect(within(screen.getByRole("row", { name: /90分以上/ })).getAllByRole("cell", { name: "1" })).toHaveLength(3);
    expect(within(screen.getByRole("row", { name: /考生人数/ })).getAllByRole("cell", { name: "1" })).toHaveLength(3);
    expect(within(screen.getByRole("row", { name: /高分1达线数/ })).getAllByRole("cell", { name: "1" })).toHaveLength(3);
    expect(within(screen.getByRole("row", { name: /完成情况/ })).getAllByRole("cell", { name: "完成（+0）" })).toHaveLength(3);
    expect(screen.getByTestId("track-standard-summary")).toHaveTextContent(
      "理科标准：高分1 90分|高分2 85分|一本 80分|二本 70分",
    );
    expect(screen.getByTestId("track-standard-summary")).toHaveTextContent(
      "文科标准：高分1 88分|高分2 83分|一本 78分|二本 68分",
    );
    expect(screen.getByTestId("track-standard-summary").querySelector("td")).toHaveAttribute("colspan", "4");

    const scoreMode = screen.getByRole("combobox", { name: "表二总分类型" });
    await user.selectOptions(scoreMode, "raw");
    expect(screen.getByText("表二、总分分数段汇总表（原始分）")).toBeInTheDocument();
    expect(screen.getByText("期末考试总分分数段汇总表（原始分）")).toBeInTheDocument();
    expect(onAutoSave.mock.lastCall?.[0].templates.find((item: GradeStatisticsTemplate) => item.id === template.id)?.scoreMode).toBe("raw");

    const target = screen.getByRole("spinbutton", { name: "1班高分1目标" });
    await user.clear(target);
    await user.type(target, "2");
    await user.tab();
    expect(onAutoSave).toHaveBeenCalled();
    expect(onAutoSave.mock.lastCall?.[0].templates.find((item: GradeStatisticsTemplate) => item.id === template.id)
      ?.totalScoreSegmentOptions?.classTargets?.["class-1"]?.highScore1).toBe(2);

    await user.click(screen.getByRole("button", { name: "调整分数段" }));
    expect(screen.getByTestId("total-score-settings")).toHaveClass("sticky", "top-0");
    const settingsRow = screen.getByTestId("total-score-settings-row");
    expect(within(settingsRow).getAllByRole("spinbutton")).toHaveLength(11);
    expect(screen.getByRole("spinbutton", { name: "理科高分1标准" })).toHaveValue(90);
    expect(screen.getByRole("spinbutton", { name: "文科高分1标准" })).toHaveValue(88);
    const interval = screen.getByRole("spinbutton", { name: "分数间隔" });
    await user.clear(interval);
    await user.type(interval, "5");

    const changed = onChange.mock.lastCall?.[0];
    expect(changed.templates.find((item: GradeStatisticsTemplate) => item.id === template.id)?.segmentSize).toBe(5);
    expect(screen.getByText("85分以上")).toBeInTheDocument();
  });
});
