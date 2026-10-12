import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Courseware } from "@/types";

const mocks = vi.hoisted(() => ({
  loadGeoGebra: vi.fn(),
  exportGeoGebraFile: vi.fn(),
  uploadFile: vi.fn(),
  createCourseware: vi.fn(),
  updateCourseware: vi.fn(),
  getCourseware: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/geogebra", () => ({
  loadGeoGebra: mocks.loadGeoGebra,
  exportGeoGebraFile: mocks.exportGeoGebraFile,
}));
vi.mock("@/services/api", () => ({ uploadFile: mocks.uploadFile }));
vi.mock("@/services/courseware", () => ({
  coursewareService: {
    createCourseware: mocks.createCourseware,
    updateCourseware: mocks.updateCourseware,
    getCourseware: mocks.getCourseware,
  },
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ teacher: { id: "teacher-1", schoolId: "school-1" } }),
}));
vi.mock("@/stores/ui", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, warning: vi.fn() },
}));
vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  useSchoolResourceOptions: () => ({
    gradeOptions: [{ value: "高一", label: "高一" }],
    schoolYearOptions: [{ value: "2026-2027", label: "2026-2027" }],
    semesterOptions: [{ value: "上学期", label: "上学期" }],
    defaultGrade: "高一",
    defaultSchoolYear: "2026-2027",
  }),
  includeCurrentOption: (options: unknown[]) => options,
}));

import GeoGebraEditorPage from "../GeoGebraEditorPage";

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/geogebra/new" element={<GeoGebraEditorPage />} />
        <Route path="/geogebra/:id/edit" element={<GeoGebraEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const saved = {
  id: "ggb-1", teacherId: "teacher-1", schoolId: "school-1", type: "ggb",
  title: "圆的切线", grade: "高一", schoolYear: "2026-2027", semester: "上学期",
  tags: ["几何画板"], fileUrl: "/api/files/ggb",
} as Courseware;

describe("GeoGebraEditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadGeoGebra.mockResolvedValue(class {
      constructor(private readonly params: Record<string, unknown>) {}
      inject() {
        const ready = this.params.appletOnLoad as (api: object) => void;
        ready({ getBase64: vi.fn(), remove: vi.fn() });
      }
    });
    mocks.exportGeoGebraFile.mockResolvedValue(new File(["ggb"], "圆的切线.ggb"));
    mocks.uploadFile.mockResolvedValue({ url: "/api/files/ggb" });
    mocks.createCourseware.mockResolvedValue(saved);
    mocks.updateCourseware.mockResolvedValue(saved);
    mocks.getCourseware.mockResolvedValue(saved);
  });

  it("creates a new geometry-board file in the courseware library", async () => {
    renderPage("/geogebra/new?mode=geometry");
    expect(screen.getByRole("heading", { name: "制作几何画板" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("课件名称"), { target: { value: "圆的切线" } });
    const button = await screen.findByRole("button", { name: "保存到课件库" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(mocks.createCourseware).toHaveBeenCalledTimes(1));
    expect(mocks.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: "圆的切线.ggb" }));
    expect(mocks.createCourseware).toHaveBeenCalledWith("teacher-1", "school-1",
      expect.objectContaining({
        title: "圆的切线", type: "ggb", grade: "高一",
        fileUrl: "/api/files/ggb", tags: ["几何画板"],
      }));
  });

  it("loads an existing GGB and updates the same resource", async () => {
    renderPage("/geogebra/ggb-1/edit");
    const button = await screen.findByRole("button", { name: "保存到课件库" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(mocks.updateCourseware).toHaveBeenCalledWith("ggb-1",
      expect.objectContaining({ title: "圆的切线", fileUrl: "/api/files/ggb" })));
    expect(mocks.createCourseware).not.toHaveBeenCalled();
  });

  it("rejects editing a resource owned by another teacher", async () => {
    mocks.getCourseware.mockResolvedValue({ ...saved, teacherId: "another" });
    renderPage("/geogebra/ggb-1/edit");
    expect(await screen.findByRole("alert")).toHaveTextContent("无权编辑");
    expect(screen.getByRole("button", { name: "保存到课件库" })).toBeDisabled();
  });
});
