import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadPage } from "@/pages/resources/UploadPage";
import { useAuthStore } from "@/stores/auth";
import type { Teacher, TreeNode } from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  useSchoolResourceOptions: () => ({
    gradeOptions: [{ value: "高一", label: "高一" }],
    schoolYearOptions: [{ value: "2026-2027", label: "2026-2027" }],
    semesterOptions: [{ value: "上学期", label: "上学期" }],
    defaultGrade: "高一",
    defaultSchoolYear: "2026-2027",
    defaultSemester: "上学期",
  }),
}));

vi.mock("@/hooks/useDocumentTypeOptions", () => ({
  useDocumentTypeOptions: () => ({
    examPaperTypeOptions: [{ value: "exam", label: "考试试卷" }],
    lectureTypeOptions: [{ value: "lecture", label: "未分类讲义" }],
    defaultExamPaperTypeId: "exam",
    defaultLectureTypeId: "lecture",
    ready: true,
  }),
}));

vi.mock("@/hooks/useQuestionMetadataOptions", () => ({
  useQuestionMetadataOptions: () => ({
    sourceOptions: [{ value: "textbook", label: "教材真题" }],
    categoryOptions: [{ value: "classic", label: "典型题" }],
    defaultSource: "textbook",
    defaultCategory: "classic",
    ready: true,
  }),
}));

vi.mock("@/hooks/useQuestionTypeOptions", () => ({
  useQuestionTypeOptions: () => ({ getLabel: (value: string) => value }),
}));

vi.mock("@/components/tree/SearchableTree", () => ({
  SearchableTree: ({ title }: { title: string }) => <div>{title}</div>,
}));

const emptyTree: TreeNode = {
  id: "root",
  name: "全部",
  type: "chapter",
  count: 0,
  children: [],
};

vi.mock("@/services/knowledge", () => ({
  knowledgeService: {
    getChapterTree: vi.fn(async () => emptyTree),
    getKnowledgeTree: vi.fn(async () => ({ ...emptyTree, type: "knowledge" })),
  },
}));

vi.mock("@/services/share", () => ({
  shareService: {
    listIncomingShares: vi.fn(async () => []),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

function renderPage(type: string) {
  return render(
    <MemoryRouter initialEntries={[`/resources/upload?type=${type}`]}>
      <UploadPage />
    </MemoryRouter>,
  );
}

describe("UploadPage public attributes layout", () => {
  beforeEach(() => {
    useAuthStore.setState({
      teacher: {
        id: "teacher-1",
        schoolId: "school-1",
        subject: "数学",
        role: "teacher",
        affiliations: [],
      } as Teacher,
      loading: false,
      error: null,
    });
  });

  it("keeps all lecture public attributes in one six-column desktop grid", () => {
    renderPage("lecture");

    const grid = screen.getByRole("group", { name: "公共属性" });
    expect(grid).toHaveClass("grid", "md:grid-cols-3", "xl:grid-cols-6");

    for (const label of ["年级", "学年", "学期", "讲义类型", "来源", "题类"]) {
      expect(within(grid).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("keeps the courseware type with the common attributes in one row", () => {
    renderPage("courseware");

    const grid = screen.getByRole("group", { name: "公共属性" });
    expect(grid).toHaveClass("grid", "md:grid-cols-2", "lg:grid-cols-4");

    for (const label of ["年级", "学年", "学期", "课件类型（默认）"]) {
      expect(within(grid).getByLabelText(label)).toBeInTheDocument();
    }
  });
});
