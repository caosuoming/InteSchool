import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultGradeSettings } from "@/lib/grade-statistics";
import { GradeExamAdjustmentPanel } from "@/pages/students/GradeExamAdjustmentPanel";
import { gradeService } from "@/services/grade";
import type { GradeExam } from "@/types";

vi.mock("@/services/grade", () => ({
  gradeService: {
    updateExamMetadata: vi.fn(),
    adjustExamScore: vi.fn(),
  },
}));

function buildExam(): GradeExam {
  return {
    id: "exam-1",
    schoolId: "school-1",
    teacherId: "teacher-1",
    cohortKey: "grad-2026",
    cohortLabel: "2026届高三",
    name: "期中考试",
    examDate: "2026-08-01",
    sourceFileName: "scores.xlsx",
    sourceSheetName: "成绩",
    subjects: ["数学"],
    records: [
      {
        id: "score-1",
        studentId: "student-1",
        studentName: "张同学",
        studentNo: "202601",
        classId: "class-1",
        className: "高三(1)班",
        scores: { 数学: 100 },
        assignedScores: { 数学: 100 },
        rawTotal: 100,
        assignedTotal: 100,
        gradeRank: 1,
        classRank: 1,
      },
      {
        id: "score-2",
        studentId: "student-2",
        studentName: "李同学",
        studentNo: "202602",
        classId: "class-1",
        className: "高三(1)班",
        scores: { 数学: 90 },
        assignedScores: { 数学: 90 },
        rawTotal: 90,
        assignedTotal: 90,
        gradeRank: 2,
        classRank: 2,
      },
    ],
    settings: buildDefaultGradeSettings(["数学"], ["class-1"]),
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
  };
}

function Harness({ initial }: { initial: GradeExam }) {
  const [exam, setExam] = useState(initial);
  return <GradeExamAdjustmentPanel exam={exam} onExamUpdated={setExam} />;
}

describe("GradeExamAdjustmentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("edits exam metadata used by report headers", async () => {
    const user = userEvent.setup();
    const initial = buildExam();
    const updated = { ...initial, name: "八月联考", examDate: "2026-08-12" };
    vi.mocked(gradeService.updateExamMetadata).mockResolvedValue(updated);

    render(<Harness initial={initial} />);

    const name = screen.getByRole("textbox", { name: "考试名称" });
    await user.clear(name);
    await user.type(name, "八月联考");
    const date = screen.getByLabelText("考试时间");
    await user.clear(date);
    await user.type(date, "2026-08-12");
    await user.click(screen.getByRole("button", { name: "保存考试信息" }));

    await waitFor(() => {
      expect(gradeService.updateExamMetadata).toHaveBeenCalledWith("exam-1", {
        name: "八月联考",
        examDate: "2026-08-12",
      });
    });
  });

  it("searches students, saves a subject score adjustment, and shows modifier history", async () => {
    const user = userEvent.setup();
    const initial = buildExam();
    const updated: GradeExam = {
      ...initial,
      records: initial.records.map((record) => record.studentId === "student-2"
        ? { ...record, scores: { 数学: 88 }, assignedScores: { 数学: 88 }, rawTotal: 88, assignedTotal: 88 }
        : record),
      scoreAdjustments: [{
        id: "adjustment-1",
        studentId: "student-2",
        studentName: "李同学",
        studentNo: "202602",
        classId: "class-1",
        className: "高三(1)班",
        subject: "数学",
        kind: "raw",
        previousValue: 90,
        nextValue: 88,
        changedByTeacherId: "teacher-1",
        changedByName: "年级组长",
        changedAt: "2026-08-13T09:00:00.000Z",
      }],
    };
    vi.mocked(gradeService.adjustExamScore).mockResolvedValue(updated);

    render(<Harness initial={initial} />);

    await user.type(screen.getByRole("textbox", { name: "搜索学生" }), "李同学");
    await user.click(screen.getByRole("button", { name: /李同学/ }));

    const score = screen.getByRole("spinbutton", { name: "成绩" });
    expect(score).toHaveValue(90);
    await user.clear(score);
    await user.type(score, "88");
    await user.tab();

    await waitFor(() => {
      expect(gradeService.adjustExamScore).toHaveBeenCalledWith("exam-1", "student-2", "数学", "raw", 88);
    });
    expect(await screen.findByText("年级组长")).toBeInTheDocument();
    expect(screen.getByText("修改记录")).toBeInTheDocument();
    expect(screen.getByText("原始分")).toBeInTheDocument();
  });
});
