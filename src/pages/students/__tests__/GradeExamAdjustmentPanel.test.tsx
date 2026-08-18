import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    publishExamResults: vi.fn(),
    unpublishExamResults: vi.fn(),
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

  it("keeps subject score editors in one compact horizontally scrollable row", () => {
    const initial = buildExam();
    const subjects = ["语文", "数学", "英语", "物理"];
    const exam: GradeExam = {
      ...initial,
      subjects,
      records: initial.records.map((record) => ({
        ...record,
        scores: Object.fromEntries(subjects.map((subject) => [subject, record.scores.数学])),
        assignedScores: Object.fromEntries(subjects.map((subject) => [subject, record.assignedScores.数学])),
      })),
      settings: buildDefaultGradeSettings(subjects, ["class-1"]),
    };

    render(<Harness initial={exam} />);

    const scoreRow = screen.getByLabelText("各科成绩");
    expect(scoreRow).toHaveClass("flex", "overflow-x-auto");
    expect(scoreRow.children).toHaveLength(subjects.length);
    expect(screen.getByLabelText("语文成绩")).toHaveClass("w-fit", "shrink-0");
  });

  it("hides rule-generated assigned scores and only lets the raw score be edited", () => {
    const initial = buildExam();
    const exam: GradeExam = {
      ...initial,
      subjects: ["化学"],
      records: initial.records.map((record) => ({
        ...record,
        subjectSelection: "物化生",
        scores: { 化学: 88 },
        assignedScores: { 化学: 92 },
      })),
      settings: buildDefaultGradeSettings(["化学"], ["class-1"]),
    };

    render(<Harness initial={exam} />);

    const chemistry = screen.getByLabelText("化学成绩");
    expect(within(chemistry).getByRole("spinbutton", { name: "原始分" })).toHaveValue(88);
    expect(within(chemistry).queryByRole("spinbutton", { name: "赋分" })).not.toBeInTheDocument();
    expect(chemistry).toHaveClass("w-fit", "shrink-0");
  });

  it("shows only the student's exam subjects and only offers assigned scores for assignable subjects", () => {
    const initial = buildExam();
    const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];
    const scores = {
      语文: 120,
      数学: 149,
      英语: 138.5,
      物理: 96,
      化学: 88,
      生物: 82,
      政治: null,
      历史: null,
      地理: null,
    };
    const assignedScores = {
      ...scores,
      化学: 91,
      生物: 86,
    };
    const sourceAssignedScores = Object.fromEntries(subjects.map((subject) => [
      subject,
      subject === "化学" ? 91 : subject === "生物" ? 86 : null,
    ]));
    const exam: GradeExam = {
      ...initial,
      subjects,
      records: initial.records.map((record) => ({
        ...record,
        subjectSelection: "物化生",
        scores,
        sourceAssignedScores,
        assignedScores,
      })),
      settings: buildDefaultGradeSettings(subjects, ["class-1"]),
    };

    render(<Harness initial={exam} />);

    expect(screen.getByLabelText("各科成绩").children).toHaveLength(6);
    expect(screen.queryByLabelText("政治成绩")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("历史成绩")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("地理成绩")).not.toBeInTheDocument();

    const chinese = screen.getByLabelText("语文成绩");
    expect(within(chinese).getByRole("spinbutton", { name: "成绩" })).toHaveValue(120);
    expect(within(chinese).queryByRole("spinbutton", { name: "赋分" })).not.toBeInTheDocument();
    expect(chinese).toHaveClass("w-fit", "shrink-0");

    const physics = screen.getByLabelText("物理成绩");
    expect(within(physics).queryByRole("spinbutton", { name: "赋分" })).not.toBeInTheDocument();

    const chemistry = screen.getByLabelText("化学成绩");
    expect(within(chemistry).getByRole("spinbutton", { name: "原始分" })).toHaveValue(88);
    expect(within(chemistry).getByRole("spinbutton", { name: "赋分" })).toHaveValue(91);
    expect(chemistry).toHaveClass("w-fit", "shrink-0");
  });

  it("publishes, exposes a share link, locks editing, and withdraws publication", async () => {
    const user = userEvent.setup();
    const initial = buildExam();
    const published: GradeExam = {
      ...initial,
      publication: {
        shareToken: "public-token",
        publishedAt: "2026-08-13T10:00:00.000Z",
        publishedByTeacherId: "teacher-1",
        publishedByName: "年级组长",
      },
    };
    vi.mocked(gradeService.publishExamResults).mockResolvedValue(published);
    vi.mocked(gradeService.unpublishExamResults).mockResolvedValue(initial);

    render(<Harness initial={initial} />);
    await user.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => expect(gradeService.publishExamResults).toHaveBeenCalledWith("exam-1"));
    expect(await screen.findByText("成绩已发布")).toBeInTheDocument();
    expect(screen.getByLabelText("成绩分享链接")).toHaveValue(`${window.location.origin}/grade-reports/public-token`);
    expect(screen.getByRole("textbox", { name: "考试名称" })).toBeDisabled();
    expect(screen.getByRole("spinbutton", { name: "成绩" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "撤回发布" }));
    await waitFor(() => expect(gradeService.unpublishExamResults).toHaveBeenCalledWith("exam-1"));
    expect(await screen.findByText("成绩尚未发布")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "考试名称" })).toBeEnabled();
  });

  it("offers the combined report and class-statistics downloads in the publication area", async () => {
    const user = userEvent.setup();
    const downloadSummary = vi.fn().mockResolvedValue(undefined);
    const downloadClasses = vi.fn().mockResolvedValue(undefined);

    render(
      <GradeExamAdjustmentPanel
        exam={buildExam()}
        onExamUpdated={vi.fn()}
        onDownloadTablesOneToFive={downloadSummary}
        onDownloadClassStatistics={downloadClasses}
      />,
    );

    await user.click(screen.getByRole("button", { name: "一键下载表一-表五" }));
    await waitFor(() => expect(downloadSummary).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "下载表六、各班成绩统计" }));
    await waitFor(() => expect(downloadClasses).toHaveBeenCalledTimes(1));
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
