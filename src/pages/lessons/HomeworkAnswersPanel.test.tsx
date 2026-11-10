import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HomeworkAnswersPanel } from "./HomeworkAnswersPanel";
import type { ClassroomHomeworkAnswer } from "@/types";

const answers: ClassroomHomeworkAnswer[] = [
  { id: "math-new", homeworkTitle: "周三作业汇总", subject: "数学", title: "周三数学作业", assignedDate: "2026-11-04",
    questions: [{ id: "q1", number: 1, answer: "B" }, { id: "q2", number: 2, answer: "" }] },
  { id: "math-old", subject: "数学", title: "周一数学作业", assignedDate: "2026-11-02",
    questions: [{ id: "q3", number: 1, answer: "42" }] },
  { id: "chinese", subject: "语文", title: "语文阅读", assignedDate: "2026-11-03",
    questions: [{ id: "q4", number: 1, answer: "借景抒情" }] },
];

describe("HomeworkAnswersPanel", () => {
  it("switches subjects and displays each paper's question answers in a scrollable region", async () => {
    const user = userEvent.setup();
    render(<HomeworkAnswersPanel answers={answers} />);
    const region = screen.getByRole("region", { name: "作业答案列表" });
    expect(region).toHaveClass("overflow-y-auto");
    await user.click(within(screen.getByRole("navigation", { name: "答案学科" })).getByRole("button", { name: "数学" }));
    expect(within(region).getByText("周三数学作业")).toBeInTheDocument();
    expect(within(region).getByText("作业：周三作业汇总")).toBeInTheDocument();
    expect(within(region).getByText("周一数学作业")).toBeInTheDocument();
    expect(within(region).getByText("暂无答案")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "语文" }));
    expect(within(region).getByText("语文阅读")).toBeInTheDocument();
    expect(within(region).getByText("借景抒情")).toBeInTheDocument();
    expect(within(region).queryByText("周三数学作业")).not.toBeInTheDocument();
  });

  it("zooms answer text with bounded controls and restores the default", async () => {
    const user = userEvent.setup();
    render(<HomeworkAnswersPanel answers={answers} />);
    const region = screen.getByRole("region", { name: "作业答案列表" });
    const answer = within(region).getByText("B");
    expect(answer.closest("li")).toHaveStyle({ fontSize: "18px" });
    await user.click(screen.getByRole("button", { name: "放大答案" }));
    expect(answer.closest("li")).toHaveStyle({ fontSize: "20px" });
    expect(screen.getByText("111%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "缩小答案" }));
    expect(answer.closest("li")).toHaveStyle({ fontSize: "18px" });
    await user.click(screen.getByRole("button", { name: "重置答案缩放" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
    for (let i = 0; i < 20; i += 1) await user.click(screen.getByRole("button", { name: "缩小答案" }));
    expect(screen.getByRole("button", { name: "缩小答案" })).toBeDisabled();
    expect(answer.closest("li")).toHaveStyle({ fontSize: "14px" });
  });

  it("provides a useful empty state", () => {
    render(<HomeworkAnswersPanel answers={[]} />);
    expect(screen.getByText("暂无可查看的作业答案")).toBeInTheDocument();
  });
});
