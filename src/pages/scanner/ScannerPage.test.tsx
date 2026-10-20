import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScannerPage from "./ScannerPage";
import { schoolService } from "@/services/school";
import { SCANNER_SCHOOL_KEY, scannerService } from "@/services/scanner";
import { readAnswerSheetQr } from "@/lib/scanner-qr";
import { useAuthStore } from "@/stores/auth";

vi.mock("@/lib/scanner-qr", () => ({ readAnswerSheetQr: vi.fn() }));
vi.mock("@/services/school", () => ({ schoolService: { listSchools: vi.fn() } }));
vi.mock("@/services/scanner", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/scanner")>();
  return { ...original, scannerService: { listPublishedAnswerSheets: vi.fn(), listDevices: vi.fn(), scan: vi.fn(), uploadPage: vi.fn() } };
});

function mount() {
  return render(<MemoryRouter initialEntries={["/scanner"]}><Routes>
    <Route path="/scanner" element={<ScannerPage />} />
    <Route path="/login" element={<div>登录页</div>} />
  </Routes></MemoryRouter>);
}

const sheets = [{ id: "p1", type: "paper" as const, title: "函数试卷", grade: "高一", schoolYear: "2026-2027", publishedAt: "2026-10-18T00:00:00Z" }];

describe("ScannerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ teacher: null });
    vi.mocked(readAnswerSheetQr).mockResolvedValue("intes://answer-sheet/v1/exam-paper/p1");
    vi.mocked(scannerService.listDevices).mockResolvedValue({ devices: [{ id: "twain:AV640", name: "虹光640", driver: "TWAIN", duplex: true }], diagnostics: [] });
    vi.mocked(schoolService.listSchools).mockResolvedValue([{
      id: "school-1", name: "测试中学", city: "南京", code: "TEST", logo: "测",
      description: "", teacherCount: 0, studentCount: 0,
    }]);
    vi.mocked(scannerService.listPublishedAnswerSheets).mockResolvedValue(sheets);
  });

  it("binds a school once and loads its published sheets on subsequent visits", async () => {
    const user = userEvent.setup();
    const { unmount } = mount();
    expect(await screen.findByRole("heading", { name: "绑定学校" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("学校"), "school-1");
    await user.click(screen.getByRole("button", { name: "确认绑定" }));
    expect(await screen.findByText("函数试卷")).toBeInTheDocument();
    expect(localStorage.getItem(SCANNER_SCHOOL_KEY)).toBe("school-1");
    unmount();
    mount();
    expect(await screen.findByText("函数试卷")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "绑定学校" })).not.toBeInTheDocument();
    expect(scannerService.listPublishedAnswerSheets).toHaveBeenCalledWith("school-1");
  });

  it("triggers the local scanner and shows a downloadable image", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    vi.mocked(scannerService.scan).mockResolvedValue([new Blob(["image"], { type: "image/png" })]);
    let index = 0;
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:scan-${++index}`);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const { unmount } = mount();
    await screen.findByRole("option", { name: /虹光640/ });
    await user.click(await screen.findByRole("button", { name: /函数试卷/ }));
    expect(await screen.findByAltText("扫描结果第 1 张")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下载第 1 张" })).toHaveAttribute("href", "blob:scan-1");
    await user.click(screen.getByRole("button", { name: "继续扫描" }));
    expect(await screen.findByAltText("扫描结果第 2 张")).toBeInTheDocument();
    expect(scannerService.scan).toHaveBeenCalledTimes(2);
    unmount();
    await waitFor(() => expect(revoke).toHaveBeenCalled());
    create.mockRestore();
    revoke.mockRestore();
  });

  it("requires QR confirmation, blocks mismatches and uploads verified scans for logged-in teachers", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    useAuthStore.setState({ teacher: { id: "t1", schoolId: "school-1", name: "教师" } as never });
    vi.mocked(scannerService.scan).mockResolvedValue([new Blob(["image"], { type: "image/png" })]);
    vi.mocked(scannerService.uploadPage).mockResolvedValue({ id: "page-1" } as never);
    let nextUrl = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:img-${++nextUrl}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    mount();
    await screen.findByRole("option", { name: /虹光640/ });
    await user.click(await screen.findByRole("button", { name: /函数试卷/ }));
    await user.click(await screen.findByRole("button", { name: /确认试卷并上传 1 页/ }));
    await waitFor(() => expect(scannerService.uploadPage).toHaveBeenCalledWith(expect.any(Blob), "school-1", sheets[0], "intes://answer-sheet/v1/exam-paper/p1"));
    expect(await screen.findByText("第 1 页 · 已上传")).toBeInTheDocument();
    vi.mocked(readAnswerSheetQr).mockResolvedValue("intes://answer-sheet/v1/exam-paper/wrong");
    await user.click(screen.getByRole("button", { name: "继续扫描" }));
    expect(await screen.findByText("第 2 页 · 二维码与选定试卷不符")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认试卷并上传 0 页/ })).toBeDisabled();
    vi.restoreAllMocks();
  });

  it("reports a missing scanner service instead of showing a false success", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    vi.mocked(scannerService.scan).mockRejectedValue(new Error("请启动本机扫描服务"));
    mount();
    await screen.findByRole("option", { name: /虹光640/ });
    await user.click(await screen.findByRole("button", { name: /函数试卷/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请启动本机扫描服务");
    expect(screen.queryByAltText(/扫描结果/)).not.toBeInTheDocument();
  });
});
