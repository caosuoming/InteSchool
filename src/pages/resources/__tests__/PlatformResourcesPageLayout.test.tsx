import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlatformResourcesPage from "@/pages/resources/PlatformResourcesPage";
import { useAuthStore } from "@/stores/auth";
import { shareService } from "@/services/share";
import type { Material, Question, ShareRecord, Teacher, TreeNode } from "@/types";

vi.mock("@/hooks/useSchoolResourceOptions", () => ({
  includeCurrentOption: (options: Array<{ value: string; label: string }>) => options,
  useSchoolResourceOptions: () => ({
    gradeOptions: [],
    schoolYearOptions: [],
    semesterOptions: [
      { value: "上学期", label: "上学期" },
      { value: "下学期", label: "下学期" },
    ],
  }),
}));

vi.mock("@/components/tree/SearchableTree", () => ({
  SearchableTree: () => <div data-testid="platform-tree" />,
}));

vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children, className }: { children: string; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock("@/services/share", () => ({
  shareService: {
    listPublicDonations: vi.fn(),
    listDonationStatus: vi.fn(),
    listDonationContributors: vi.fn(),
    getDonationPrivileges: vi.fn(),
    getPlatformDirectoryTree: vi.fn(),
    listPlatformResourceSettings: vi.fn(),
    listDonationCorrections: vi.fn(),
    createDonationCorrection: vi.fn(),
    resolveDonationCorrection: vi.fn(),
    updateDonationResource: vi.fn(),
    setSubjectModerator: vi.fn(),
    updateDonationOrder: vi.fn(),
    deleteDonationResource: vi.fn(),
  },
}));

vi.mock("@/services/donation", () => ({
  donationService: {
    checkSaveAsOwnResource: vi.fn(),
    saveAsOwnResource: vi.fn(),
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

const emptyTree: TreeNode = {
  id: "root",
  name: "全部",
  type: "chapter",
  count: 0,
  children: [],
};

const singleQuestion: Question = {
  id: "question-single",
  teacherId: "teacher-self",
  schoolId: "school-1",
  type: "single",
  stem: "单选题资源",
  options: ["A", "B"],
  answer: "A",
  analysis: "解析一",
  chapterIds: [],
  knowledgePointIds: [],
  difficulty: 2,
  recommendation: 5,
  usageCount: 0,
  remark: "",
  sourceType: "manual",
  category: "practice",
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  isShared: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const essayQuestion: Question = {
  ...singleQuestion,
  id: "question-essay",
  teacherId: "teacher-other",
  type: "essay",
  stem: "解答题资源",
  options: undefined,
  difficulty: 4,
  recommendation: 3,
  category: "exam",
  sourceType: "imported",
  grade: "高二",
};

const material: Material = {
  id: "material-1",
  teacherId: "teacher-other",
  schoolId: "school-1",
  title: "函数图像素材",
  description: "课堂图片",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  type: "image",
  content: "图像内容",
  tags: ["函数", "图像"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function donationRecord(
  id: string,
  fromTeacherId: string,
  resourceType: ShareRecord["resourceType"],
  snapshot: ShareRecord["resourceSnapshot"],
): ShareRecord {
  return {
    id,
    fromTeacherId,
    fromSchoolId: "school-1",
    scope: "public",
    kind: "donation",
    resourceType,
    resourceId: snapshot!.id,
    sourceResourceId: snapshot!.id,
    resourceTitle: resourceType === "question" ? (snapshot as Question).stem : (snapshot as Material).title,
    resourceSnapshot: snapshot,
    directorySnapshot: { chapters: [], knowledgePoints: [] },
    platformSubject: "数学",
    platformOrder: id === "donation-self" ? 1 : id === "donation-other" ? 2 : 3,
    status: "pending",
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

const donations = [
  donationRecord("donation-self", "teacher-self", "question", singleQuestion),
  donationRecord("donation-other", "teacher-other", "question", essayQuestion),
  donationRecord("donation-material", "teacher-other", "material", material),
];

function renderPage() {
  return render(
    <MemoryRouter>
      <PlatformResourcesPage />
    </MemoryRouter>,
  );
}

describe("PlatformResourcesPage layout and filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      teacher: {
        id: "teacher-self",
        schoolId: "school-1",
        subject: "数学",
        role: "teacher",
        affiliations: [],
      } as Teacher,
      loading: false,
      error: null,
    });

    vi.mocked(shareService.listPublicDonations).mockResolvedValue(donations);
    vi.mocked(shareService.listDonationStatus).mockResolvedValue([donations[0]]);
    vi.mocked(shareService.listDonationContributors).mockResolvedValue([
      { teacherId: "teacher-self", nickname: "本人", donationCount: 1, rank: 1, isTopContributor: true, subjects: ["数学"], moderatorSubjects: [] },
      { teacherId: "teacher-other", nickname: "其他教师", donationCount: 2, rank: 2, isTopContributor: true, subjects: ["数学"], moderatorSubjects: [] },
    ]);
    vi.mocked(shareService.getDonationPrivileges).mockResolvedValue({
      donationCount: 1,
      rank: 1,
      isTopContributor: false,
      canManagePlatformSettings: false,
      canManageAllSubjects: false,
      moderatedSubjects: [],
    });
    vi.mocked(shareService.getPlatformDirectoryTree).mockImplementation(async (type) => ({
      ...emptyTree,
      type,
    }));
    vi.mocked(shareService.listDonationCorrections).mockResolvedValue([]);
  });

  it("removes standalone settings and keeps actions on the donor row", async () => {
    renderPage();

    await screen.findByText("单选题资源");
    expect(screen.queryByText("属性选项设置")).not.toBeInTheDocument();
    expect(shareService.listPlatformResourceSettings).not.toHaveBeenCalled();

    const donor = screen.getByText("捐赠者：本人");
    const headerRow = donor.parentElement?.parentElement;
    expect(headerRow).toBeTruthy();
    expect(within(headerRow as HTMLElement).getByRole("button", { name: /修改属性/ })).toBeInTheDocument();
    expect(within(headerRow as HTMLElement).getByRole("button", { name: /本人捐赠/ })).toBeInTheDocument();
  });

  it("derives type-specific filter choices from donated resources", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("单选题资源");
    await user.click(screen.getByRole("button", { name: "题目" }));

    expect(screen.getByLabelText("题型筛选")).toBeInTheDocument();
    expect(screen.getByLabelText("难度筛选")).toBeInTheDocument();
    expect(screen.getByLabelText("推荐筛选")).toBeInTheDocument();
    expect(screen.getByLabelText("题类筛选")).toBeInTheDocument();
    expect(screen.getByLabelText("来源筛选")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("题型筛选"), "single");
    expect(screen.getByText("单选题资源")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("解答题资源")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "素材" }));
    expect(screen.getByLabelText("素材类型筛选")).toBeInTheDocument();
    expect(screen.getByLabelText("标签筛选")).toBeInTheDocument();
    expect(screen.getByText("函数图像素材")).toBeInTheDocument();
  });

  it("submits text corrections for a platform resource", async () => {
    const user = userEvent.setup();
    vi.mocked(shareService.createDonationCorrection).mockResolvedValue({
      id: "correction-1",
      donationId: "donation-other",
      resourceType: "question",
      resourceTitle: "解答题资源",
      reporterTeacherId: "teacher-self",
      reporterNickname: "本人",
      recipientTeacherId: "teacher-other",
      message: "题干中的条件有误。",
      attachments: [],
      status: "pending",
      createdAt: "2026-08-02T00:00:00.000Z",
    });
    renderPage();

    const resourceTitle = await screen.findByText("解答题资源");
    const resourceCard = resourceTitle.closest(".card-base");
    expect(resourceCard).toBeTruthy();
    await user.click(within(resourceCard as HTMLElement).getByRole("button", { name: "纠错" }));
    const correctionInput = await screen.findByPlaceholderText("请说明错误位置、正确内容或修改建议。可只上传图片。");
    await user.type(correctionInput, "题干中的条件有误。");
    await user.click(screen.getByRole("button", { name: "提交纠错" }));

    await waitFor(() => expect(shareService.createDonationCorrection).toHaveBeenCalledWith(
      "teacher-self",
      {
        donationId: "donation-other",
        message: "题干中的条件有误。",
        attachments: [],
      },
    ));
  });
});
