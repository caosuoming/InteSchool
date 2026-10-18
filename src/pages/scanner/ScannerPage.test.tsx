import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScannerPage from "./ScannerPage";
import { schoolService } from "@/services/school";
import { SCANNER_SCHOOL_KEY, scannerService } from "@/services/scanner";

vi.mock("@/services/school", () => ({ schoolService: { listSchools: vi.fn() } }));
vi.mock("@/services/scanner", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/scanner")>();
  return { ...original, scannerService: { listPublishedAnswerSheets: vi.fn(), scan: vi.fn() } };
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
    vi.mocked(scannerService.scan).mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    let index = 0;
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:scan-${++index}`);
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const { unmount } = mount();
    await user.click(await screen.findByRole("button", { name: /函数试卷/ }));
    expect(await screen.findByAltText("扫描结果第 1 张")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "下载第 1 张" })).toHaveAttribute("href", "blob:scan-1");
    await user.click(screen.getByRole("button", { name: "再扫一张" }));
    expect(await screen.findByAltText("扫描结果第 2 张")).toBeInTheDocument();
    expect(scannerService.scan).toHaveBeenCalledTimes(2);
    unmount();
    await waitFor(() => expect(revoke).toHaveBeenCalled());
    create.mockRestore();
    revoke.mockRestore();
  });

  it("reports a missing scanner service instead of showing a false success", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    vi.mocked(scannerService.scan).mockRejectedValue(new Error("请启动本机扫描服务"));
    mount();
    await user.click(await screen.findByRole("button", { name: /函数试卷/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请启动本机扫描服务");
    expect(screen.queryByAltText(/扫描结果/)).not.toBeInTheDocument();
  });
});
