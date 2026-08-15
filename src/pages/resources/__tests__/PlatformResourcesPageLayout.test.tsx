import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlatformResourcesPage from "@/pages/resources/PlatformResourcesPage";
import { useAuthStore } from "@/stores/auth";
import { shareService } from "@/services/share";
import { donationService } from "@/services/donation";
import type { ExamPaper, Material, Question, ShareRecord, Teacher, TreeNode } from "@/types";

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
    renameDonationAlbum: vi.fn(),
    setDonationAlbumPinned: vi.fn(),
    mergeDonationAlbums: vi.fn(),
    setDonationAlbum: vi.fn(),
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

const albumPaper: ExamPaper = {
  id: "paper-album",
  teacherId: "teacher-other",
  schoolId: "school-1",
  title: "函数专题试卷",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  duration: 60,
  totalScore: 100,
  questions: [],
  status: "draft",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
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

  it("shows a collapsed album category with type icons and moderator document management", async () => {
    const user = userEvent.setup();
    const albumDonation = donationRecord("donation-album", "teacher-other", "examPaper", albumPaper);
    albumDonation.donationAlbum = {
      id: "album-1",
      name: "函数专题",
      resourceType: "examPaper",
      libraryLabel: "试卷库",
    };
    const freePaper: ExamPaper = {
      ...albumPaper,
      id: "paper-free",
      title: "待加入专辑试卷",
    };
    const freeDonation = donationRecord("donation-free", "teacher-other", "examPaper", freePaper);
    vi.mocked(shareService.listPublicDonations).mockResolvedValue([albumDonation, freeDonation]);
    vi.mocked(shareService.getDonationPrivileges).mockResolvedValue({
      donationCount: 1,
      rank: 1,
      isTopContributor: false,
      canManagePlatformSettings: false,
      canManageAllSubjects: false,
      moderatedSubjects: ["数学"],
    });
    vi.mocked(shareService.setDonationAlbum).mockResolvedValue(albumDonation);

    renderPage();
    await user.click(await screen.findByRole("button", { name: "专辑" }));

    expect(screen.getByRole("group", { name: "平台专辑：函数专题" })).toBeInTheDocument();
    expect(screen.queryByText("函数专题试卷")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重命名" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开专辑：函数专题" }));
    expect(await screen.findByText("函数专题试卷")).toBeInTheDocument();
    expect(screen.getByLabelText("试卷标识")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移出专辑" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "函数专题试卷" }));
    expect(screen.getByText("试卷 · 平台资源预览")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.queryByText("试卷 · 平台资源预览")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "函数专题试卷" })).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText("添加文档到专辑：函数专题"),
      "donation-free",
    );
    await waitFor(() => {
      expect(shareService.setDonationAlbum).toHaveBeenCalledWith(
        "teacher-self",
        "数学",
        "donation-free",
        "album-1",
      );
    });
  });

  it("groups donated album documents in the regular list with their source library", async () => {
    const user = userEvent.setup();
    const albumDonation = donationRecord("donation-album", "teacher-other", "examPaper", albumPaper);
    albumDonation.donationAlbum = {
      id: "album-1",
      name: "函数专题",
      resourceType: "examPaper",
      libraryLabel: "试卷库",
    };
    vi.mocked(shareService.listPublicDonations).mockResolvedValue([albumDonation]);

    renderPage();

    expect(await screen.findByRole("group", { name: "平台专辑：函数专题" })).toBeInTheDocument();
    expect(screen.getByText("试卷库 · 1 个文档")).toBeInTheDocument();
    expect(screen.queryByText("函数专题试卷")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开专辑：函数专题" }));
    expect(await screen.findByText("函数专题试卷")).toBeInTheDocument();
    expect(screen.getByLabelText("试卷标识")).toBeInTheDocument();
  });

  it("mixes unpinned albums with standalone resources by platform order", async () => {
    const albumDonation = donationRecord("donation-album", "teacher-other", "examPaper", albumPaper);
    albumDonation.platformOrder = 2;
    albumDonation.donationAlbum = {
      id: "album-1",
      name: "函数专题",
      resourceType: "examPaper",
      libraryLabel: "试卷库",
    };
    const freePaper: ExamPaper = {
      ...albumPaper,
      id: "paper-free-first",
      title: "平台顺序更靠前的试卷",
    };
    const freeDonation = donationRecord("donation-free-first", "teacher-other", "examPaper", freePaper);
    freeDonation.platformOrder = 1;
    vi.mocked(shareService.listPublicDonations).mockResolvedValue([albumDonation, freeDonation]);

    renderPage();

    const standalone = await screen.findByText("平台顺序更靠前的试卷");
    const album = screen.getByRole("group", { name: "平台专辑：函数专题" });
    expect(standalone.compareDocumentPosition(album) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps a pinned platform album ahead of standalone resources", async () => {
    const albumDonation = donationRecord("donation-album", "teacher-other", "examPaper", albumPaper);
    albumDonation.platformOrder = 2;
    albumDonation.donationAlbum = {
      id: "album-1",
      name: "函数专题",
      resourceType: "examPaper",
      libraryLabel: "试卷库",
      pinned: true,
    };
    const freePaper: ExamPaper = {
      ...albumPaper,
      id: "paper-free-first",
      title: "平台顺序更靠前的试卷",
    };
    const freeDonation = donationRecord("donation-free-first", "teacher-other", "examPaper", freePaper);
    freeDonation.platformOrder = 1;
    vi.mocked(shareService.listPublicDonations).mockResolvedValue([albumDonation, freeDonation]);

    renderPage();

    const album = await screen.findByRole("group", { name: "平台专辑：函数专题" });
    const standalone = screen.getByText("平台顺序更靠前的试卷");
    expect(album.compareDocumentPosition(standalone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText("已置顶")).toBeInTheDocument();
  });

  it("previews platform documents and saves a copy from the preview", async () => {
    const user = userEvent.setup();
    const paperDonation = donationRecord("donation-paper", "teacher-other", "examPaper", albumPaper);
    vi.mocked(shareService.listPublicDonations).mockResolvedValue([paperDonation]);
    vi.mocked(donationService.checkSaveAsOwnResource).mockResolvedValue({
      donationId: "donation-paper",
      resourceType: "examPaper",
      canSave: true,
      alreadySaved: false,
    });
    vi.mocked(donationService.saveAsOwnResource).mockResolvedValue({
      resourceType: "examPaper",
      resourceId: "paper-copy",
      merged: false,
    });

    renderPage();

    await user.click(await screen.findByRole("button", { name: "函数专题试卷" }));
    expect(screen.getByText("试卷 · 平台资源预览")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "另存" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "另存" }));
    await waitFor(() => expect(donationService.checkSaveAsOwnResource).toHaveBeenCalledWith(
      "donation-paper",
      "teacher-self",
      "school-1",
    ));
    await waitFor(() => expect(donationService.saveAsOwnResource).toHaveBeenCalledWith(
      "donation-paper",
      "teacher-self",
      "school-1",
      undefined,
    ));
    expect(await screen.findByRole("button", { name: "已另存" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "返回" }));
    expect(screen.queryByText("试卷 · 平台资源预览")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "函数专题试卷" })).toBeInTheDocument();
  });

  it("does not offer save in preview for the document donor", async () => {
    const user = userEvent.setup();
    const ownPaperDonation = donationRecord("donation-own-paper", "teacher-self", "examPaper", {
      ...albumPaper,
      id: "paper-own",
      teacherId: "teacher-self",
      title: "本人捐赠试卷",
    });
    vi.mocked(shareService.listPublicDonations).mockResolvedValue([ownPaperDonation]);
    vi.mocked(shareService.listDonationStatus).mockResolvedValue([ownPaperDonation]);

    renderPage();

    await user.click(await screen.findByRole("button", { name: "本人捐赠试卷" }));
    expect(screen.getByText("试卷 · 平台资源预览")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "另存" })).not.toBeInTheDocument();
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
