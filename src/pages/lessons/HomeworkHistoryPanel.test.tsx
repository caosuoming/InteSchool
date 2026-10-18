import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HomeworkClassOverviewRecord } from "@/types";
import { HomeworkHistoryPanel } from "./HomeworkHistoryPanel";

function overview(id: string, date: string, absent: string[] = []): HomeworkClassOverviewRecord {
  return {
    id, classId: "class-1", schoolId: "school-1", teacherId: "teacher-1",
    homeworkDate: date, summary: "函数练习", studentIds: ["student-1", "student-2"],
    submittedStudentIds: ["student-2"], absentStudentIds: absent, attendanceTaken: true,
    studentNames: { "student-1": "原姓名" },
    images: [{ id: "img-1", name: "批改.png", url: "/api/files/img-1", mimeType: "image/png", size: 20 }],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("HomeworkHistoryPanel", () => {
  it("displays previous days with counts, recorded names and enlargeable images", () => {
    render(<HomeworkHistoryPanel records={[
      overview("1", "2026-08-01"), overview("2", "2026-08-02"), overview("3", "2026-08-03", ["student-1"]),
    ]} students={[{ id: "student-1", name: "新姓名" }]} />);
    expect(screen.getAllByText(/原姓名（2次）/)).toHaveLength(2);
    expect(screen.getAllByText(/作业概况：函数练习/)).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: "批改.png" })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: "批改.png" })[0]).toHaveAttribute("href", "/api/files/img-1");
  });
});
