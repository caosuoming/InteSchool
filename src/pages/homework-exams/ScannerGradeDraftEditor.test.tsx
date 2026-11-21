import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScannerGradeDraftEditor } from "./ScannerGradeDraftEditor";
import { scannerService, type ScannerPageRecord } from "@/services/scanner";

vi.mock("@/services/scanner", () => ({
  scannerService: { gradingQuestions: vi.fn(), saveGradingDraft: vi.fn() },
}));

const record: ScannerPageRecord = {
  id: "scan-1", schoolId: "school-1", teacherId: "teacher-1",
  sheetType: "paper", sheetId: "paper-1", fileId: "file-1",
  qrPayload: null, verified: false, studentId: null, status: "pending",
  createdAt: "2026-11-20T00:00:00Z",
};

describe("ScannerGradeDraftEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scannerService.gradingQuestions).mockResolvedValue([
      { id: "choice-1", number: 1, kind: "choice", fullScore: 4 },
      { id: "essay-1", number: 2, kind: "essay", fullScore: 10 },
    ]);
    vi.mocked(scannerService.saveGradingDraft).mockResolvedValue({
      ...record, gradingEntries: [{
        questionId: "essay-1", observedMark: "-2", observedBox: "6",
        suggestedScore: 6, reason: "分数框优先", confirmedScore: 6,
      }],
    });
  });

  it("allows teacher transcription while retaining scores as a non-published draft", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    render(<ScannerGradeDraftEditor record={record} onUpdated={onUpdated} />);
    expect(await screen.findByText(/第 2 题 · 解答 · 满分 10/)).toBeInTheDocument();
    expect(screen.getByText(/不会写入正式成绩/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("第2题红笔或选项"), "-2");
    await user.type(screen.getByLabelText("第2题右下角分数"), "6");
    await user.type(screen.getByLabelText("第2题人工核定分数"), "6");
    await user.click(screen.getByRole("button", { name: "保存复核草稿" }));
    await waitFor(() => expect(scannerService.saveGradingDraft).toHaveBeenCalledWith("scan-1", [{
      questionId: "essay-1", observedMark: "-2", observedBox: "6", confirmedScore: 6,
    }]));
    expect(onUpdated).toHaveBeenCalledOnce();
  });
});
