import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScannerReviewPanel } from "./ScannerReviewPanel";
import { scannerService } from "@/services/scanner";
import type { ScannerPageRecord } from "@/services/scanner";
import type { Student } from "@/types";

vi.mock("@/services/scanner", () => ({ scannerService: { listPages: vi.fn(), assignPage: vi.fn(), updatePage: vi.fn() } }));
const scanned: ScannerPageRecord = {
  id: "scan-1", schoolId: "sch-1", teacherId: "tch-1", sheetType: "paper", sheetId: "p-1",
  fileId: "file-1", qrPayload: null, verified: false, studentId: null, status: "pending", createdAt: "2026-10-20T03:00:00Z",
};
const students = [{ id: "student-1", schoolId: "sch-1", studentNo: "101", name: "王同学" }] as Student[];

describe("ScannerReviewPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scannerService.listPages).mockResolvedValue([scanned]);
    vi.mocked(scannerService.assignPage).mockResolvedValue({ ...scanned, studentId: "student-1", status: "assigned" });
    vi.mocked(scannerService.updatePage).mockResolvedValue({ ...scanned, studentId: "student-1", status: "assigned", reviewedAt: "2026-10-21T00:00:00Z" });
  });

  it("retains unreadable QR pages for later manual student matching", async () => {
    const user = userEvent.setup();
    render(<ScannerReviewPanel schoolId="sch-1" students={students} />);
    const panel = await screen.findByRole("region", { name: "扫描件处理" });
    expect(within(panel).getByText("二维码缺失，待核对")).toBeInTheDocument();
    expect(within(panel).getByText("尚未匹配学生（异常卷）")).toBeInTheDocument();
    const fileImage = within(panel).getByAltText("扫描卷原图");
    expect(fileImage).toHaveAttribute("src", "/api/files/file-1");
    await user.selectOptions(within(panel).getByLabelText("匹配学生 scan-1"), "student-1");
    await user.click(within(panel).getByRole("button", { name: "保存匹配" }));
    await waitFor(() => expect(scannerService.assignPage).toHaveBeenCalledWith("scan-1", "student-1"));
    expect(await within(panel).findByText("已关联：王同学")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "确认复查" }));
    await waitFor(() => expect(scannerService.updatePage).toHaveBeenCalledWith("scan-1", { studentId: "student-1", reviewed: true }));
    expect(within(panel).getByRole("button", { name: "撤销复查" })).toBeInTheDocument();
  });
});
