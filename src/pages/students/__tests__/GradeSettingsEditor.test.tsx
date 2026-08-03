import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GradeSettingsEditor } from "@/pages/students/GradeSettingsEditor";
import { buildDefaultGradeSettings } from "@/lib/grade-statistics";
import type { GradeImportContext, GradeScoreRecord } from "@/types";

const classes: GradeImportContext["classes"] = [
  {
    id: "class-10",
    type: "school",
    schoolId: "school-1",
    name: "高三(10)班",
    grade: "高三",
    classTypeId: "type-1",
    studentCount: 40,
    createdBy: "teacher-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "class-2",
    type: "school",
    schoolId: "school-1",
    name: "高三(2)班",
    grade: "高三",
    classTypeId: "type-2",
    studentCount: 42,
    createdBy: "teacher-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const sampleRecord: GradeScoreRecord = {
  id: "score-1",
  studentId: "student-1",
  studentName: "示例学生",
  studentNo: "20260001",
  classId: "class-2",
  className: "高三(2)班",
  subjectSelection: "物化生",
  classType: "实验班",
  scores: { 数学: 90, 化学: 80 },
  assignedScores: { 数学: 90, 化学: 80 },
  rawTotal: 170,
  assignedTotal: 170,
  gradeRank: 1,
  classRank: 1,
};

const context: GradeImportContext = {
  cohort: {
    key: "grad-2026",
    label: "2026届高三",
    grade: "高三",
    gradYear: 2026,
    classIds: ["class-10", "class-2"],
    studentCount: 82,
  },
  classes,
  students: [],
  teachers: [],
  classProfiles: {
    "class-2": {
      classTypeName: "实验班",
      subjectSelections: ["物化生"],
      scoreSubjects: ["数学", "化学"],
      hasImportedScores: true,
    },
    "class-10": {
      classTypeName: "平行班",
      subjectSelections: ["物史地"],
      scoreSubjects: ["数学"],
      hasImportedScores: true,
    },
  },
  sampleRecords: [sampleRecord],
};

describe("GradeSettingsEditor", () => {
  it("sorts classes naturally and keeps ranking columns mutually exclusive", async () => {
    const user = userEvent.setup();
    const settings = buildDefaultGradeSettings(
      ["数学", "化学"],
      classes.map((item) => item.id),
      [],
      {
        "class-2": ["数学", "化学"],
        "class-10": ["数学"],
      },
    );
    const onChange = vi.fn();

    render(
      <GradeSettingsEditor
        settings={settings}
        subjects={["数学", "化学"]}
        context={context}
        onChange={onChange}
        section="settings"
      />,
    );

    const rankingTable = screen.getByRole("columnheader", { name: "纳入统一排名" }).closest("table")!;
    const rows = within(rankingTable).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getByText(/高三\(\d+\)班/).textContent)).toEqual([
      "高三(2)班",
      "高三(10)班",
    ]);
    expect(within(rows[0]).getByText("班型：实验班")).toBeInTheDocument();
    expect(within(rows[0]).getByText("选科：物化生")).toBeInTheDocument();

    const mathButtons = within(rows[0]).getAllByRole("button", { name: "数学" });
    await user.click(mathButtons[1]);

    const next = onChange.mock.lastCall?.[0];
    const classSetting = next.classSubjects.find((item: { classId: string }) => item.classId === "class-2");
    expect(classSetting.statisticSubjects).not.toContain("数学");
    expect(classSetting.separateRankSubjects).toContain("数学");
    expect(classSetting.examSubjects).toContain("数学");
  });

  it("accepts manually entered teachers when no linked account exists", async () => {
    const user = userEvent.setup();
    const settings = buildDefaultGradeSettings(["数学"], classes.map((item) => item.id));
    const onChange = vi.fn();

    render(
      <GradeSettingsEditor
        settings={settings}
        subjects={["数学"]}
        context={context}
        onChange={onChange}
        section="settings"
      />,
    );

    const input = screen.getByRole("textbox", { name: "高三(2)班数学手动任课教师" });
    await user.type(input, "张老师、李老师");
    await user.tab();

    expect(onChange.mock.lastCall?.[0].classSubjectTeacherNames).toMatchObject({
      "class-2": { 数学: ["张老师", "李老师"] },
    });
  });

  it("previews formula columns with recently imported scores", () => {
    const settings = buildDefaultGradeSettings(["数学", "化学"], classes.map((item) => item.id));
    const custom = settings.templates.find((item) => item.kind === "customTable")!;
    custom.columns = [{
      id: "sum",
      name: "数学化学合计",
      formula: '=SUM(SCORES("数学", "化学"))',
      width: 14,
    }];

    render(
      <GradeSettingsEditor
        settings={settings}
        subjects={["数学", "化学"]}
        context={context}
        onChange={vi.fn()}
        section="templates"
      />,
    );

    expect(screen.getByText("在线表格实时预览")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /数学化学合计/ })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "170" })).toBeInTheDocument();
  });
});
