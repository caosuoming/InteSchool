import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
  type GradeClassStatisticsOptions,
} from "@/lib/grade-class-statistics";
import { GradeClassStatisticsTable } from "@/pages/students/GradeClassStatisticsTable";
import type { GradeExam, GradeScoreRecord } from "@/types";

function scoreRecord(
  studentId: string,
  classId: string,
  className: string,
  studentName: string,
  studentNo: string,
  score: number,
): GradeScoreRecord {
  return {
    id: `record-${studentId}`,
    studentId,
    classId,
    className,
    studentName,
    studentNo,
    scores: { 语文: score },
    assignedScores: { 语文: score },
    rawTotal: score,
    assignedTotal: score,
    gradeRank: 1,
    classRank: 1,
  };
}

function buildExam(id: string, name: string, examDate: string, records: GradeScoreRecord[]): GradeExam {
  return {
    id,
    schoolId: "school-1",
    teacherId: "teacher-1",
    cohortKey: "cohort-1",
    cohortLabel: "2027届高三",
    name,
    examDate,
    sourceFileName: `${name}.xlsx`,
    sourceSheetName: "成绩",
    subjects: ["语文"],
    records,
    settings: {
      subjectTeacherIds: {},
      assignmentRules: {},
      classSubjects: [],
      templates: [],
    },
    createdAt: `${examDate}T00:00:00.000Z`,
    updatedAt: `${examDate}T00:00:00.000Z`,
  };
}

const current = buildExam("current", "期末考试", "2026-07-01", [
  scoreRecord("s1", "c1", "高三（1）班", "张三", "001", 120),
  scoreRecord("s2", "c2", "高三（2）班", "李四", "002", 110),
]);
const previous = buildExam("previous", "期中考试", "2026-05-01", [
  scoreRecord("s1", "c1", "高三（1）班", "张三", "001", 100),
]);

function Harness() {
  const [options, setOptions] = useState<GradeClassStatisticsOptions>({
    ...DEFAULT_GRADE_CLASS_STATISTICS_OPTIONS,
    comparisonExamIds: [],
  });
  return (
    <GradeClassStatisticsTable
      exam={current}
      comparisonExams={[previous]}
      options={options}
      onOptionsChange={setOptions}
    />
  );
}

describe("GradeClassStatisticsTable", () => {
  it("switches classes and exposes only required fields by default", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByText("表六、各班成绩统计")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "班级" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "姓名" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "语文" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "总分（原始）" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "总分（赋分）" })).not.toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "查看班级" }), "c2");
    expect(screen.getByText("李四")).toBeInTheDocument();
    expect(screen.queryByText("张三")).not.toBeInTheDocument();
  });

  it("adds subject ranks and selected previous exam columns", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("checkbox", { name: "各科班级排名" }));
    await user.click(screen.getByRole("checkbox", { name: "各科年级排名" }));
    await user.click(screen.getByRole("checkbox", { name: "总分（原始）及排名" }));
    await user.click(screen.getByRole("checkbox", { name: "总分（赋分）及排名" }));
    await user.click(screen.getByRole("checkbox", { name: /期中考试/ }));

    expect(screen.getByRole("columnheader", { name: "语文班级排名" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "语文年级排名" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "总分（原始）班级排名" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "总分（赋分）年级排名" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "期中考试·语文" })).toBeInTheDocument();
    const row = screen.getByText("张三").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getAllByText("100").length).toBeGreaterThan(0);
  });
});
