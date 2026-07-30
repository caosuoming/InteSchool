import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractReviewModal } from "../ExtractReviewModal";

const mocks = vi.hoisted(() => ({
  getLecture: vi.fn(),
  extractStoredFile: vi.fn(),
  parseDocumentBlocks: vi.fn(),
  confirmExtract: vi.fn(),
  createExtractCopy: vi.fn(),
  authState: {
    teacher: { id: "teacher-1", schoolId: "school-1" },
  },
  extractConfig: {
    questionKeywords: [],
    answerKeywords: [],
    analysisKeywords: [],
    summaryKeywords: [],
    singleChoiceKeywords: [],
    multipleChoiceKeywords: [],
    fillBlankKeywords: [],
    essayKeywords: [],
    resetToDefault: vi.fn(),
    addQuestionKeyword: vi.fn(),
    removeQuestionKeyword: vi.fn(),
    addAnswerKeyword: vi.fn(),
    removeAnswerKeyword: vi.fn(),
    addAnalysisKeyword: vi.fn(),
    removeAnalysisKeyword: vi.fn(),
    addSummaryKeyword: vi.fn(),
    removeSummaryKeyword: vi.fn(),
    addSingleChoiceKeyword: vi.fn(),
    removeSingleChoiceKeyword: vi.fn(),
    addMultipleChoiceKeyword: vi.fn(),
    removeMultipleChoiceKeyword: vi.fn(),
    addFillBlankKeyword: vi.fn(),
    removeFillBlankKeyword: vi.fn(),
    addEssayKeyword: vi.fn(),
    removeEssayKeyword: vi.fn(),
  },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => mocks.authState,
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/stores/extractConfig", () => ({
  useExtractConfigStore: () => mocks.extractConfig,
}));

vi.mock("@/services/lecture", () => ({
  lectureService: {
    getLecture: mocks.getLecture,
    createExtractCopy: mocks.createExtractCopy,
  },
}));

vi.mock("@/services/examPaper", () => ({
  examPaperService: {
    getPaper: vi.fn(),
    createExtractCopy: vi.fn(),
  },
}));

vi.mock("@/services/extract", () => ({
  extractService: {
    confirmExtract: mocks.confirmExtract,
  },
}));

vi.mock("@/services/api", () => ({
  extractStoredFile: mocks.extractStoredFile,
}));

vi.mock("@/lib/document-block-parser", () => ({
  parseDocumentBlocks: mocks.parseDocumentBlocks,
}));

describe("ExtractReviewModal", () => {
  beforeEach(() => {
    mocks.getLecture.mockResolvedValue({
      id: "lecture-1",
      originalFileUrl: "/uploads/lecture.docx",
      originalFileName: "lecture.docx",
    });
    mocks.extractStoredFile.mockResolvedValue({ text: "mock document" });
    mocks.confirmExtract.mockResolvedValue({ createdQuestions: [], createdMaterials: [] });
    mocks.createExtractCopy.mockResolvedValue({ id: "lecture-copy" });
    mocks.parseDocumentBlocks.mockReturnValue([
      {
        id: "block-question",
        type: "question",
        content: "示例题目",
        order: 0,
        status: "new",
        questionType: "single",
        options: ["选项 A", "选项 B"],
        answer: "A",
        analysis: "示例解析",
        difficulty: 3,
      },
      {
        id: "block-knowledge",
        type: "knowledge",
        content: "示例知识内容",
        knowledgeTitle: "示例知识",
        order: 1,
        status: "new",
      },
    ]);
  });

  it("uses one block column with controls inside each block", async () => {
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="测试讲义"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByLabelText("调整区域属性")).toHaveLength(2);
    });

    expect(screen.queryByText("切块列表")).not.toBeInTheDocument();
    expect(screen.getByText("知识库 1")).toBeInTheDocument();
    expect(screen.getByText("未分类 0")).toBeInTheDocument();

    const questionTypeSelect = screen.getByLabelText("题型选择");
    for (const label of ["单选题", "多选题", "判断题", "填空题", "解答题"]) {
      expect(within(questionTypeSelect).getByRole("option", { name: label })).toBeInTheDocument();
    }

    expect(screen.getAllByRole("button", { name: /关键字与重新拆解/ })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /与上一块合并/ })).toHaveLength(2);
  });

  it("moves and swaps answer, analysis, and summary content without overwriting it", async () => {
    const user = userEvent.setup();

    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="测试讲义"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("将解析内容转换为")).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText("将解析内容转换为"), "summary");

    expect(screen.queryByLabelText("将解析内容转换为")).not.toBeInTheDocument();
    const summarySelect = screen.getByLabelText("将总结内容转换为");
    expect(summarySelect.closest("div.rounded")).toHaveTextContent("示例解析");

    await user.selectOptions(screen.getByLabelText("将答案内容转换为"), "summary");

    const answerSelect = screen.getByLabelText("将答案内容转换为");
    const swappedSummarySelect = screen.getByLabelText("将总结内容转换为");
    expect(answerSelect.closest("div.rounded")).toHaveTextContent("示例解析");
    expect(swappedSummarySelect.closest("div.rounded")).toHaveTextContent("A");
  });

  it("filters a detected score label by default and lets the user keep it", async () => {
    const user = userEvent.setup();
    mocks.parseDocumentBlocks.mockReturnValue([
      {
        id: "block-question",
        type: "question",
        content: "（本小题12分）示例题目",
        order: 0,
        status: "new",
        questionType: "single",
        options: ["选项 A", "选项 B"],
        answer: "A",
        analysis: "示例解析",
        difficulty: 3,
      },
    ]);

    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="测试讲义"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
      />,
    );

    const cleanupToggle = await screen.findByRole("checkbox", { name: /入库时过滤分值说明/ });
    expect(cleanupToggle).toBeChecked();

    await user.click(screen.getByRole("button", { name: "确认入库" }));
    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0].stem).toBe("示例题目");

    mocks.confirmExtract.mockClear();
    await user.click(cleanupToggle);
    await user.click(screen.getByRole("button", { name: "确认入库" }));
    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0].stem).toBe("（本小题12分）示例题目");
  });
});
