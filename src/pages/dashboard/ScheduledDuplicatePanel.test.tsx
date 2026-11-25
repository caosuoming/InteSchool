import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rpcCall } from "@/services/api";
import { ScheduledDuplicatePanel } from "./ScheduledDuplicatePanel";

vi.mock("@/services/api", () => ({ rpcCall: vi.fn() }));

const candidate = {
  id: "candidate", kind: "library", similarity: 0.98,
  leftQuestion: {
    id: "left", stem: "求 $x^2$ 的值", options: ["$x=1$", "$x=2$"],
    answer: "A", analysis: "左侧解析", summary: "左侧总结",
    sources: ["试卷：试卷一"],
  },
  rightQuestion: {
    id: "right", stem: "求 $x^3$ 的值", options: ["$x=2$", "$x=3$"],
    answer: "B", analysis: "右侧解析", summary: "右侧总结",
    sources: ["讲义：讲义二"],
  },
};

describe("ScheduledDuplicatePanel", () => {
  beforeEach(() => {
    vi.mocked(rpcCall).mockReset().mockImplementation(async (_service, method) => {
      if (method === "listSchedules") return [];
      if (method === "listCandidates") return [candidate];
      return undefined;
    });
  });

  it("collapses completed schedules but keeps queued and failed schedules visible", async () => {
    vi.mocked(rpcCall).mockImplementation(async (_service, method) => {
      if (method === "listSchedules") return [
        { id: "done", kind: "library", repeat: "once", enabled: false, nextRunAt: null, lastRunAt: "2026-11-24T00:00:00Z" },
        { id: "failed", kind: "student", repeat: "once", enabled: false, nextRunAt: null, lastRunAt: "2026-11-24T00:00:00Z", runStatus: "failed" },
      ];
      return [];
    });
    const user = userEvent.setup();
    render(<ScheduledDuplicatePanel teacherId="teacher" />);
    await user.click(await screen.findByRole("button", { name: /管理任务/ }));
    const summary = screen.getByText("已完成任务（1）");
    const group = summary.closest("details")!;
    expect(group).not.toHaveAttribute("open");
    expect(screen.getByText("检索失败，可重试")).toBeVisible();
    await user.click(summary);
    expect(group).toHaveAttribute("open");
  });

  it("can cancel only the remaining review after confirming a higher-ranked duplicate", async () => {
    const user = userEvent.setup();
    let pending = [
      { ...candidate, id: "lower", similarity: 0.85 },
      { ...candidate, id: "higher", similarity: 0.98 },
    ];
    vi.mocked(rpcCall).mockImplementation(async (_service, method, args) => {
      if (method === "listSchedules") return [];
      if (method === "listCandidates") return [...pending];
      if (method === "resolveCandidate") {
        pending = pending.filter((item) => item.id !== args?.[1]);
        return undefined;
      }
      if (method === "cancelPendingCandidates") {
        const count = pending.length;
        pending = [];
        return count;
      }
      return undefined;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      render(<ScheduledDuplicatePanel teacherId="teacher" />);
      await user.click(await screen.findByRole("button", { name: /管理任务/ }));
      await screen.findByText(/相似度 98%/);
      expect(screen.getAllByText(/本库重题搜索 · 相似度/).map((el) => el.textContent))
        .toEqual(["本库重题搜索 · 相似度 98% ", "本库重题搜索 · 相似度 85% "]);
      await user.click(screen.getAllByRole("button", { name: "保留" })[0]);
      await waitFor(() => expect(screen.getAllByText(/本库重题搜索 · 相似度/)).toHaveLength(1));
      await user.click(screen.getByRole("button", { name: "取消剩余确认" }));
      expect(confirm).toHaveBeenCalledOnce();
      await waitFor(() => expect(screen.getByText("暂无待确认题目")).toBeInTheDocument());
      expect(rpcCall).toHaveBeenCalledWith("scheduledDuplicate", "resolveCandidate", ["teacher", "higher", "keep"]);
      expect(rpcCall).toHaveBeenCalledWith("scheduledDuplicate", "cancelPendingCandidates", ["teacher"]);
    } finally {
      confirm.mockRestore();
    }
  });
  it("renders formulas and choice options, reveals both sources, and submits field-specific merge choices", async () => {
    const user = userEvent.setup();
    render(<ScheduledDuplicatePanel teacherId="teacher" />);
    await user.click(await screen.findByRole("button", { name: /管理任务/ }));
    expect(screen.getAllByText("A.")).toHaveLength(2);
    expect(screen.getAllByText("B.")).toHaveLength(2);
    expect(document.querySelectorAll(".katex").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "展开来源、答案、解析和总结" }));
    expect(screen.getByText("试卷：试卷一")).toBeInTheDocument();
    expect(screen.getByText("讲义：讲义二")).toBeInTheDocument();
    expect(screen.getByText("右侧总结")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "合并" }));
    await user.click(screen.getByRole("radio", { name: "相似题 1 选择上传题题干" }));
    await user.click(screen.getByRole("button", { name: "相似题 1 点击上传题题干展开详情" }));
    await user.click(screen.getByRole("checkbox", { name: "相似题 1 保留上传题答案" }));
    await user.click(screen.getByRole("button", { name: "确认合并" }));
    await waitFor(() => expect(rpcCall).toHaveBeenCalledWith(
      "scheduledDuplicate", "resolveCandidate", [
        "teacher", "candidate", "merge",
        { stem: "incoming", answer: "both", analysis: "existing", summary: "existing" },
      ],
    ));
  });
});
