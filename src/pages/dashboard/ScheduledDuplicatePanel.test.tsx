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
