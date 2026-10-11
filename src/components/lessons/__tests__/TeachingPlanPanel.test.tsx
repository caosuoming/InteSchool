import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeachingPlanPanel } from "@/components/lessons/TeachingPlanPanel";
import type { TeacherTeachingPlan, TeacherTeachingPlanEntry } from "@/types";

function offsetDate(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function makePlan(lastDayPlan = ""): TeacherTeachingPlan {
  const entries: TeacherTeachingPlanEntry[] = [
    { date: offsetDate(0), note: "今日备注", plan: "代数", teachingLog: "今日教学日志" },
    { date: offsetDate(1), note: "明日备注", plan: "几何", teachingLog: "明日教学日志" },
    { date: offsetDate(2), note: "后日备注", plan: "概率", teachingLog: "后日教学日志" },
    { date: offsetDate(3), note: "末日备注", plan: lastDayPlan, teachingLog: "末日教学日志" },
  ];
  return {
    current: {
      id: "semester",
      startDate: offsetDate(0),
      endDate: offsetDate(3),
      entries,
      createdAt: "2026-10-10T00:00:00.000Z",
      updatedAt: "2026-10-10T00:00:00.000Z",
    },
    history: [],
    actualRecords: [{
      date: offsetDate(1),
      coursewareId: "courseware",
      coursewareTitle: "已授课件",
      classId: "class",
      startedAt: "2026-10-10T00:00:00.000Z",
      completedAt: "2026-10-10T01:00:00.000Z",
    }],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TeachingPlanPanel 行操作", () => {
  it("插入空计划时后续计划顺延，其他日期关联内容不变并自动保存", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<TeachingPlanPanel plan={makePlan()} homeworks={[]} loading={false} saving={false} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: `在 ${offsetDate(1)} 插入教学计划` }));

    expect(screen.getByLabelText(`教学计划 ${offsetDate(0)}`)).toHaveValue("代数");
    expect(screen.getByLabelText(`教学计划 ${offsetDate(1)}`)).toHaveValue("");
    expect(screen.getByLabelText(`教学计划 ${offsetDate(2)}`)).toHaveValue("几何");
    expect(screen.getByLabelText(`教学计划 ${offsetDate(3)}`)).toHaveValue("概率");
    expect(screen.getByLabelText(`备注 ${offsetDate(1)}`)).toHaveValue("明日备注");
    expect(screen.getByLabelText(`教学日志 ${offsetDate(1)}`)).toHaveValue("明日教学日志");
    expect(within(screen.getByLabelText(`教学计划 ${offsetDate(1)}`).closest("tr")!).getByText("已授课件")).toBeInTheDocument();

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      offsetDate(0), offsetDate(3), expect.arrayContaining([
        expect.objectContaining({ date: offsetDate(1), plan: "", note: "明日备注", teachingLog: "明日教学日志" }),
        expect.objectContaining({ date: offsetDate(2), plan: "几何", note: "后日备注" }),
        expect.objectContaining({ date: offsetDate(3), plan: "概率", note: "末日备注" }),
      ]),
    ), { timeout: 2500 });
  });

  it("删除计划时后续计划前移，且取消删除时内容不变", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TeachingPlanPanel plan={makePlan()} homeworks={[]} loading={false} saving={false} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: `删除 ${offsetDate(1)} 教学计划` }));
    expect(screen.getByLabelText(`教学计划 ${offsetDate(1)}`)).toHaveValue("几何");

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: `删除 ${offsetDate(1)} 教学计划` }));
    expect(screen.getByLabelText(`教学计划 ${offsetDate(0)}`)).toHaveValue("代数");
    expect(screen.getByLabelText(`教学计划 ${offsetDate(1)}`)).toHaveValue("概率");
    expect(screen.getByLabelText(`教学计划 ${offsetDate(2)}`)).toHaveValue("");
    expect(screen.getByLabelText(`备注 ${offsetDate(1)}`)).toHaveValue("明日备注");
    expect(screen.getByLabelText(`教学日志 ${offsetDate(1)}`)).toHaveValue("明日教学日志");
  });

  it("最后一天已有计划时禁止插入，以免丢失末尾计划", () => {
    render(<TeachingPlanPanel plan={makePlan("期末复习")} homeworks={[]} loading={false} saving={false} onSave={vi.fn()} />);

    expect(screen.getByText("学期最后一天已有计划，请先延长结束日期再插入新计划。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `在 ${offsetDate(1)} 插入教学计划` })).toBeDisabled();
    expect(screen.getByLabelText(`教学计划 ${offsetDate(3)}`)).toHaveValue("期末复习");
  });
});
