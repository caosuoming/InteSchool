import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScannerPage from "./ScannerPage";
import { useAuthStore } from "@/stores/auth";
import type { Teacher } from "@/types";
import { schoolService } from "@/services/school";
import { SCANNER_SCHOOL_KEY, scannerService } from "@/services/scanner";
import { readAnswerSheetQr } from "@/lib/scanner-qr";

vi.mock("@/lib/scanner-qr", () => ({ readAnswerSheetQr: vi.fn() }));
vi.mock("@/services/school", () => ({ schoolService: { listSchools: vi.fn() } }));
vi.mock("@/services/scanner", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/scanner")>();
  return { ...original, scannerService: { listPublishedAnswerSheets: vi.fn(), listDevices: vi.fn(), scan: vi.fn(), uploadPage: vi.fn(), saveThirdPartyCard: vi.fn() } };
});

function mount() {
  return render(<MemoryRouter initialEntries={["/scanner"]}><Routes>
    <Route path="/scanner" element={<ScannerPage />} />
    <Route path="/login" element={<div>登录页</div>} />
  </Routes></MemoryRouter>);
}

const sheets = [{ id: "p1", type: "paper" as const, title: "函数试卷", grade: "高一", schoolYear: "2026-2027", publishedAt: "2026-10-18T00:00:00Z", subject: "数学", classes: [{ id: "c1", name: "高一 · 一班" }] }];

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
    await user.click(await screen.findByRole("button", { name: "使用扫描仪采集函数试卷" }));
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

  it("uses single-sided capture for WIA and updates the scan mode when switching devices", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    vi.mocked(scannerService.listDevices).mockResolvedValue({ devices: [
      { id: "wia:640", name: "阅卷仪640 WIA", driver: "WIA", duplex: false },
      { id: "twain:640", name: "阅卷仪640 TWAIN", driver: "TWAIN", duplex: true },
    ], diagnostics: [] });
    vi.mocked(scannerService.scan).mockResolvedValue([new Blob(["image"], { type: "image/png" })]);
    let imageIndex = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:mode-test-${++imageIndex}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    mount();
    await screen.findByRole("option", { name: /阅卷仪640 TWAIN/ });
    await user.selectOptions(screen.getByLabelText("扫描仪"), "wia:640");
    expect(screen.getByRole("checkbox", { name: /双面自动进纸/ })).toBeDisabled();
    await user.click(await screen.findByRole("button", { name: "使用扫描仪采集函数试卷" }));
    expect(scannerService.scan).toHaveBeenLastCalledWith("wia:640", false);
    await user.selectOptions(screen.getByLabelText("扫描仪"), "twain:640");
    expect(screen.getByRole("checkbox", { name: /双面自动进纸/ })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /双面自动进纸/ }));
    await user.click(screen.getByRole("button", { name: "刷新设备" }));
    expect(screen.getByRole("checkbox", { name: /双面自动进纸/ })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: /双面自动进纸/ }));
    await user.click(screen.getByRole("button", { name: "继续扫描" }));
    expect(scannerService.scan).toHaveBeenLastCalledWith("twain:640", true);
    vi.restoreAllMocks();
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
    await user.click(await screen.findByRole("button", { name: "使用扫描仪采集函数试卷" }));
    await user.click(await screen.findByRole("button", { name: /确认试卷并上传 1 页/ }));
    await waitFor(() => expect(scannerService.uploadPage).toHaveBeenCalledWith(expect.any(Blob), "school-1", sheets[0], "intes://answer-sheet/v1/exam-paper/p1"));
    expect(await screen.findByText("第 1 页 · 已上传")).toBeInTheDocument();
    vi.mocked(readAnswerSheetQr).mockResolvedValue("intes://answer-sheet/v1/exam-paper/wrong");
    await user.click(screen.getByRole("button", { name: "继续扫描" }));
    expect(await screen.findByText("第 2 页 · 二维码与选定试卷不符")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认试卷并上传 0 页/ })).toBeDisabled();
    vi.restoreAllMocks();
  });

  it("accepts only the current sheet revision QR in the scanner UI", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    useAuthStore.setState({ teacher: { id: "t1", schoolId: "school-1" } as Teacher });
    vi.mocked(scannerService.listPublishedAnswerSheets).mockResolvedValue([{ ...sheets[0], answerSheetRevisionId: "revision-new" }]);
    vi.mocked(scannerService.scan).mockResolvedValue([new Blob(["image"], { type: "image/png" })]);
    vi.mocked(readAnswerSheetQr).mockResolvedValue("intes://answer-sheet/v1/exam-paper/p1");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:old-card");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    mount();
    await user.click(await screen.findByRole("button", { name: "使用扫描仪采集函数试卷" }));
    expect(await screen.findByText("第 1 页 · 二维码与选定试卷不符")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认试卷并上传 0 页/ })).toBeDisabled();
    vi.restoreAllMocks();
  });

  it("filters published sheets by grade, subject and class", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    vi.mocked(scannerService.listPublishedAnswerSheets).mockResolvedValue([
      ...sheets,
      { ...sheets[0], id: "p2", title: "语文试卷", grade: "高二", subject: "语文", classes: [{ id: "c2", name: "高二 · 二班" }] },
    ]);
    mount();
    expect(await screen.findByText("语文试卷")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("筛选年级"), "高一");
    expect(screen.getByText("函数试卷")).toBeInTheDocument();
    expect(screen.queryByText("语文试卷")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("筛选学科"), "语文");
    expect(screen.getByText("没有符合筛选条件的答题卡")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("筛选年级"), "");
    await user.selectOptions(screen.getByLabelText("筛选班级"), "c2");
    expect(screen.getByText("语文试卷")).toBeInTheDocument();
  });

  it("scans a third-party card and saves the named image", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    useAuthStore.setState({ teacher: { id: "t1", schoolId: "school-1" } as Teacher });
    vi.mocked(scannerService.scan).mockResolvedValue([new Blob(["image"], { type: "image/png" })]);
    vi.mocked(scannerService.saveThirdPartyCard).mockResolvedValue({ id: "card-1", fileName: "scan.png" } as never);
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:external");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    mount();
    await user.click(await screen.findByRole("button", { name: "扫描第三方卡" }));
    expect(await screen.findByAltText("第三方答题卡预览")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("第三方卡文件名"));
    await user.type(screen.getByLabelText("第三方卡文件名"), "scan");
    await user.click(screen.getByRole("button", { name: "保存到作业管理" }));
    await waitFor(() => expect(scannerService.saveThirdPartyCard).toHaveBeenCalledWith(expect.any(Blob), "scan"));
    expect(await screen.findByRole("link", { name: "前往作业管理编辑标注" })).toHaveAttribute("href", "/homework-exams/homework");
    create.mockRestore();
    revoke.mockRestore();
  });

  it("prevents unauthenticated third-party scans", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    mount();
    await user.click(await screen.findByRole("button", { name: "扫描第三方卡" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请先以当前学校的教师账号登录");
    expect(scannerService.scan).not.toHaveBeenCalled();
  });

  it("offers Windows installer and explicit site pairing only when the bridge is unavailable", async () => {
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    vi.mocked(scannerService.listDevices).mockRejectedValueOnce(new Error("无法连接本机扫描服务"));
    mount();
    const download = await screen.findByRole("link", { name: /下载 Windows 安装包/ });
    expect(download).toHaveAttribute("href", "https://github.com/caosuoming/InteSchool/releases/download/scanner-bridge-latest/InteSchool-Scanner-Setup.exe");
    expect(screen.getByRole("link", { name: "授权连接本站" })).toHaveAttribute("href",
      `inteschool-scanner://connect?origin=${encodeURIComponent(window.location.origin)}`);
    await userEvent.setup().click(screen.getByRole("button", { name: "刷新设备" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: /下载 Windows 安装包/ })).not.toBeInTheDocument());
  });

  it("imports scanned pages without a local bridge and preserves QR confirmation and teacher authorization", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    useAuthStore.setState({ teacher: { id: "t1", schoolId: "school-1" } as Teacher });
    vi.mocked(scannerService.listDevices).mockRejectedValue(new Error("无法连接本机扫描服务"));
    vi.mocked(scannerService.uploadPage).mockResolvedValue({ id: "page-1" } as never);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:imported");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    mount();
    expect(await screen.findByRole("link", { name: /下载 Windows 安装包/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "使用扫描仪采集函数试卷" })).toBeDisabled();
    await user.click(await screen.findByRole("button", { name: "导入函数试卷的扫描图片" }));
    const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "scan.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("选择扫描图片"), png);
    expect(await screen.findByAltText("扫描结果第 1 张")).toBeInTheDocument();
    expect(screen.getByText("第 1 页 · 二维码已匹配")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /确认试卷并上传 1 页/ }));
    await waitFor(() => expect(scannerService.uploadPage).toHaveBeenCalledWith(expect.any(Blob), "school-1", sheets[0], "intes://answer-sheet/v1/exam-paper/p1"));
    vi.restoreAllMocks();
  });

  it("keeps mismatched imported QR codes blocked and rejects malformed images", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    useAuthStore.setState({ teacher: { id: "t1", schoolId: "school-1" } as Teacher });
    vi.mocked(scannerService.listDevices).mockRejectedValue(new Error("无法连接本机扫描服务"));
    vi.mocked(readAnswerSheetQr).mockResolvedValue("intes://answer-sheet/v1/exam-paper/other");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mismatch");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    mount();
    await screen.findByRole("link", { name: /下载 Windows 安装包/ });
    await user.click(await screen.findByRole("button", { name: "导入函数试卷的扫描图片" }));
    await user.upload(screen.getByLabelText("选择扫描图片"), new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "scan.png", { type: "image/png" }));
    expect(await screen.findByText("第 1 页 · 二维码与选定试卷不符")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认试卷并上传 0 页/ })).toBeDisabled();
    await user.upload(screen.getByLabelText("选择扫描图片"), new File(["bad"], "bad.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("不是有效的 PNG/JPEG");
    expect(screen.getByText("第 1 页 · 二维码与选定试卷不符")).toBeInTheDocument();
    expect(scannerService.uploadPage).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("imports a third-party card without a bridge for a logged-in teacher", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    useAuthStore.setState({ teacher: { id: "t1", schoolId: "school-1" } as Teacher });
    vi.mocked(scannerService.listDevices).mockRejectedValue(new Error("无法连接本机扫描服务"));
    vi.mocked(scannerService.saveThirdPartyCard).mockResolvedValue({ id: "card-1", fileName: "third-party.png" } as never);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:third-party");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    mount();
    expect(await screen.findByRole("button", { name: "导入第三方卡图片" })).toBeEnabled();
    const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "third-party.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("选择第三方卡图片"), png);
    expect(await screen.findByAltText("第三方答题卡预览")).toBeInTheDocument();
    expect(screen.getByLabelText("第三方卡文件名")).toHaveValue("third-party");
    await user.click(screen.getByRole("button", { name: "保存到作业管理" }));
    await waitFor(() => expect(scannerService.saveThirdPartyCard).toHaveBeenCalledWith(expect.any(Blob), "third-party"));
    vi.restoreAllMocks();
  });

  it("reports a missing scanner service instead of showing a false success", async () => {
    const user = userEvent.setup();
    localStorage.setItem(SCANNER_SCHOOL_KEY, "school-1");
    vi.mocked(scannerService.scan).mockRejectedValue(new Error("请启动本机扫描服务"));
    mount();
    await screen.findByRole("option", { name: /虹光640/ });
    await user.click(await screen.findByRole("button", { name: "使用扫描仪采集函数试卷" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("请启动本机扫描服务");
    expect(screen.queryByAltText(/扫描结果/)).not.toBeInTheDocument();
  });
});
