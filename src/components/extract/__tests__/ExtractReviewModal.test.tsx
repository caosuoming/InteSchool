import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtractReviewModal } from "../ExtractReviewModal";

const mocks = vi.hoisted(() => ({
  getLecture: vi.fn(),
  getPaper: vi.fn(),
  extractStoredFile: vi.fn(),
  parseDocumentBlocks: vi.fn(),
  findMathQuestionNumberGaps: vi.fn(),
  findSuspectedMathQuestionNumbers: vi.fn(),
  reparseMathQuestionBlock: vi.fn(),
  findSimilarQuestionsBatch: vi.fn(),
  confirmExtract: vi.fn(),
  createLectureExtractCopy: vi.fn(),
  createExamExtractCopy: vi.fn(),
  authState: {
    teacher: { id: "teacher-1", schoolId: "school-1", subject: "物理" },
  },
  extractConfig: {
    questionKeywords: ["题目"],
    answerKeywords: ["答案"],
    analysisKeywords: ["解析"],
    summaryKeywords: [],
    projectTypeKeywords: ["知识梳理"],
    singleChoiceKeywords: [],
    multipleChoiceKeywords: [],
    fillBlankKeywords: [],
    essayKeywords: [],
    resetToDefault: vi.fn(),
    addQuestionKeyword: vi.fn(),
    addProjectTypeKeyword: vi.fn(),
    removeProjectTypeKeyword: vi.fn(),
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
    createExtractCopy: mocks.createLectureExtractCopy,
  },
}));

vi.mock("@/services/examPaper", () => ({
  examPaperService: {
    getPaper: mocks.getPaper,
    createExtractCopy: mocks.createExamExtractCopy,
  },
}));

vi.mock("@/services/extract", () => ({
  extractService: {
    confirmExtract: mocks.confirmExtract,
  },
}));

vi.mock("@/services/question", () => ({
  questionService: {
    findSimilarQuestionsBatch: mocks.findSimilarQuestionsBatch,
  },
}));

vi.mock("@/services/api", () => ({
  extractStoredFile: mocks.extractStoredFile,
}));

vi.mock("@/lib/document-block-parser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-block-parser")>()),
  parseDocumentBlocks: mocks.parseDocumentBlocks,
  findMathQuestionNumberGaps: mocks.findMathQuestionNumberGaps,
  findSuspectedMathQuestionNumbers: mocks.findSuspectedMathQuestionNumbers,
  reparseMathQuestionBlock: mocks.reparseMathQuestionBlock,
}));

vi.mock("@/lib/math-html", () => ({
  renderMathHtml: (text: string) => text,
}));

vi.mock("@/lib/extract-text-renderer", () => ({
  renderExtractText: (text: string) => text,
}));

describe("ExtractReviewModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authState.teacher.subject = "物理";
    mocks.extractConfig.questionKeywords = ["题目"];
    mocks.getPaper.mockResolvedValue({
      id: "paper-1",
      originalFileUrl: "/uploads/paper.docx",
      originalFileName: "paper.docx",
    });
    mocks.getLecture.mockResolvedValue({
      id: "lecture-1",
      originalFileUrl: "/uploads/lecture.docx",
      originalFileName: "lecture.docx",
    });
    mocks.extractStoredFile.mockResolvedValue({ text: "mock document" });
    mocks.findSimilarQuestionsBatch.mockImplementation(async (stems: string[]) => stems.map(() => []));
    mocks.confirmExtract.mockResolvedValue({
      createdQuestions: [{ id: "question-created" }],
      mergedQuestions: [],
      createdMaterials: [{ id: "material-created" }],
      questionIdByItemId: { "block-question": "question-created" },
      materialIdByItemId: { "block-knowledge": "material-created" },
    });
    mocks.createLectureExtractCopy.mockResolvedValue({ id: "lecture-copy" });
    mocks.createExamExtractCopy.mockResolvedValue({ id: "paper-copy" });
    mocks.findMathQuestionNumberGaps.mockReturnValue([]);
    mocks.findSuspectedMathQuestionNumbers.mockReturnValue([]);
    mocks.reparseMathQuestionBlock.mockReturnValue(null);
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

  it("highlights detected categories, allows rejecting a suggestion and persists the confirmed selection", async () => {
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
        questionCategory="practice"
        initialBlocks={[{
          id: "block-question",
          type: "question",
          content: "（1）计算（2）证明（3）讨论",
          order: 0,
          status: "new",
          questionType: "essay",
          answer: "答案略",
          analysis: "解法一：代入计算。解法二：构造辅助线。",
          difficulty: 3,
        }]}
      />,
    );
    const multiSolution = screen.getByRole("checkbox", { name: "第1题：一题多解" });
    const multiPart = screen.getByRole("checkbox", { name: "第1题：一题多问" });
    expect(multiSolution).toBeChecked();
    expect(multiPart).toBeChecked();
    expect(screen.getAllByText("自动识别")).toHaveLength(2);
    await user.click(multiPart);
    expect(multiPart).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: /确认入库/ }));
    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0].categories).toEqual(["一题多解"]);
    expect(mocks.confirmExtract.mock.calls[0][10]).toBe("practice");
  });

  it.each(["lecture", "examPaper"] as const)(
    "requires at least four math subquestions when extracting a %s",
    async (resourceType) => {
      mocks.authState.teacher.subject = "数学";
      const user = userEvent.setup();
      render(
        <ExtractReviewModal
          open
          onClose={vi.fn()}
          resourceId="resource-1"
          resourceType={resourceType}
          resourceTitle="数学试题"
          chapterIds={[]}
          knowledgePointIds={[]}
          grade="高一"
          schoolYear="2026-2027"
          semester="上学期"
          initialBlocks={[
            {
              id: "question-three", type: "question", content: "（1）求值（2）化简（3）证明",
              questionType: "essay", order: 0, status: "new", analysis: "方法一：计算。",
            },
            {
              id: "question-four", type: "question", content: "（1）求值（2）化简（3）证明（4）讨论",
              questionType: "essay", order: 1, status: "new",
            },
          ]}
        />,
      );

      expect(screen.getByRole("checkbox", { name: "第1题：一题多问" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "第2题：一题多问" })).toBeChecked();
      await user.click(screen.getByRole("button", { name: "确认入库" }));
      await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
      const questions = mocks.confirmExtract.mock.calls[0][2].questions;
      expect(questions[0].categories).not.toContain("一题多问");
      expect(questions[1].categories).toContain("一题多问");
    },
  );

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
    expect(screen.getByText("文档标题 0")).toBeInTheDocument();
    expect(screen.getByText("文档信息 0")).toBeInTheDocument();
    expect(screen.getByText("知识块 1")).toBeInTheDocument();
    expect(screen.getByText("题型或项目名 0")).toBeInTheDocument();

    const regionTypeSelect = screen.getAllByLabelText("调整区域属性")[0];
    for (const label of ["文档标题", "文档信息", "知识块", "题型或项目名", "题目"]) {
      expect(within(regionTypeSelect).getByRole("option", { name: label })).toBeInTheDocument();
    }

    const questionTypeSelect = screen.getByLabelText("题型选择");
    for (const label of ["单选题", "多选题", "判断题", "填空题", "解答题", "综合题"]) {
      expect(within(questionTypeSelect).getByRole("option", { name: label })).toBeInTheDocument();
    }

    expect(screen.getAllByRole("button", { name: /关键字与重新拆解/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /与上一块合并/ })).toHaveLength(2);
  });

  it("adds and removes project-type keywords from the keyword settings", async () => {
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
        questionCategory="practice"
      />,
    );

    await screen.findByRole("button", { name: "关键字与重新拆解" });
    await user.click(screen.getByRole("button", { name: "关键字与重新拆解" }));
    await user.click(screen.getByRole("button", { name: "项目类型关键字" }));
    await user.type(screen.getByPlaceholderText("新增项目类型关键字"), "专题闯关{enter}");
    expect(mocks.extractConfig.addProjectTypeKeyword).toHaveBeenCalledWith("专题闯关");
    await user.click(screen.getByRole("button", { name: "删除知识梳理" }));
    expect(mocks.extractConfig.removeProjectTypeKeyword).toHaveBeenCalledWith(0);
  });

  it("reviews and saves the geography question subtype", async () => {
    mocks.authState.teacher.subject = "地理";
    const user = userEvent.setup();
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="地理试卷"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
        initialBlocks={[{
          id: "block-question", type: "question", content: "1. 阅读材料回答问题。",
          questionType: "single", categories: ["单选题·2个小题"], order: 0, status: "new",
          answer: "A", analysis: "解析", difficulty: 3,
        }]}
      />,
    );

    const subtype = screen.getByLabelText("地理细分题型");
    expect(subtype).toHaveValue("单选题·2个小题");
    await user.selectOptions(subtype, "单选题·3个小题");
    await user.click(screen.getByRole("button", { name: "确认入库" }));
    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0].categories).toContain("单选题·3个小题");
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0].categories).not.toContain("单选题·2个小题");
  });

  it("restores original math blanks when a parsed fill-in question becomes an essay", async () => {
    mocks.authState.teacher.subject = "数学";
    const user = userEvent.setup();
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="数学试题"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
        initialBlocks={[{
          id: "block-question", type: "question",
          content: "计算 $a_1$ 后填____，再填______。",
          fillBlankOriginalContent: "计算 $a_1$ 后填   ，再填____。",
          questionType: "short", order: 0, status: "new", answer: "12；123456",
        }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑内容" }));
    const stem = screen.getByRole("textbox", { name: "题干" });
    await user.type(stem, "请给出步骤");
    await user.selectOptions(screen.getByLabelText("题型选择"), "essay");
    expect(stem).toHaveValue("计算 $a_1$ 后填   ，再填____。请给出步骤");

    await user.click(screen.getByRole("button", { name: "确认入库" }));
    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0]).toMatchObject({
      type: "essay",
      stem: "计算 $a_1$ 后填   ，再填____。请给出步骤",
    });
  });

  it("restores whitespace after manually switching an essay to fill-in and back", async () => {
    mocks.authState.teacher.subject = "数学";
    const user = userEvent.setup();
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="数学试题"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
        initialBlocks={[{
          id: "block-question", type: "question", content: "计算得   。",
          questionType: "essay", order: 0, status: "new", answer: "2",
        }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑内容" }));
    const stem = screen.getByRole("textbox", { name: "题干" });
    await user.selectOptions(screen.getByLabelText("题型选择"), "short");
    expect(stem).toHaveValue("计算得____。");
    await user.selectOptions(screen.getByLabelText("题型选择"), "essay");
    expect(stem).toHaveValue("计算得   。");
  });

  it("does not offer or save comprehensive for a math document", async () => {
    mocks.authState.teacher.subject = "数学";
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="数学试题"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
        initialBlocks={[{
          id: "block-question", type: "question", content: "例题",
          questionType: "comprehensive", order: 0, status: "new",
        }]}
      />,
    );

    const questionTypeSelect = screen.getByLabelText("题型选择");
    expect(questionTypeSelect).toHaveValue("essay");
    expect(within(questionTypeSelect).queryByRole("option", { name: "综合题" })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "确认入库" }));
    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0].type).toBe("essay");
  });

  it.each([
    {
      target: "content",
      expected: { stem: "原题干\n\n补充内容", analysis: "已有解析", summary: "已有总结" },
    },
    {
      target: "analysis",
      expected: { stem: "原题干", analysis: "已有解析\n\n补充内容", summary: "已有总结" },
    },
    {
      target: "summary",
      expected: { stem: "原题干", analysis: "已有解析", summary: "已有总结\n\n补充内容" },
    },
  ])("merges a block into the previous question's $target field", async ({ target, expected }) => {
    const user = userEvent.setup();
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="合并测试"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
        initialBlocks={[
          {
            id: "block-question",
            type: "question",
            content: "原题干",
            order: 0,
            status: "new",
            questionType: "essay",
            answer: "A",
            analysis: "已有解析",
            summary: "已有总结",
          },
          {
            id: "block-info",
            type: "documentInfo",
            content: "补充内容",
            order: 1,
            status: "new",
          },
        ]}
      />,
    );

    const targetSelect = screen.getByRole("combobox", { name: "第2块合并到上一题的部分" });
    expect(targetSelect).toHaveValue("content");
    if (target !== "content") await user.selectOptions(targetSelect, target);
    await user.click(screen.getAllByRole("button", { name: "与上一块合并" })[1]);

    expect(screen.queryByText("文档信息 1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "确认入库" }));
    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0]).toMatchObject(expected);
    expect(mocks.createLectureExtractCopy).not.toHaveBeenCalled();
    expect(mocks.confirmExtract.mock.calls[0][12]).toEqual([
      expect.objectContaining({ id: "block-question", type: "question", content: expected.stem }),
    ]);
  });

  it("keeps ordinary block merging unchanged when the previous block is not a question", async () => {
    const user = userEvent.setup();
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="普通合并"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
        initialBlocks={[
          { id: "block-knowledge", type: "knowledge", content: "知识开头", order: 0, status: "new" },
          { id: "block-info", type: "documentInfo", content: "知识结尾", order: 1, status: "new" },
        ]}
      />,
    );

    expect(screen.queryByRole("combobox", { name: /合并到上一题的部分/ })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "与上一块合并" })[1]);
    await user.click(screen.getByRole("button", { name: "确认入库" }));
    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].knowledgeBlocks[0].content)
      .toBe("知识开头\n\n知识结尾");
  });

  it("reviews background extraction blocks without parsing the file again", async () => {
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="后台讲义"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
        initialBlocks={[
          {
            id: "background-block",
            type: "knowledge",
            content: "后台拆解结果",
            knowledgeTitle: "后台知识块",
            order: 0,
            status: "new",
          },
        ]}
      />,
    );

    expect(await screen.findByText("后台拆解结果")).toBeInTheDocument();
    expect(mocks.getLecture).not.toHaveBeenCalled();
    expect(mocks.extractStoredFile).not.toHaveBeenCalled();
    expect(mocks.parseDocumentBlocks).not.toHaveBeenCalled();
  });

  it("adds an answer area when review changes a question to fill-in-the-blank", async () => {
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="填空题审阅"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
        initialBlocks={[
          {
            id: "fill-blank-review",
            type: "question",
            content: "方程的根为。",
            order: 0,
            status: "new",
            questionType: "single",
            options: ["1", "2"],
            answer: "123456",
            analysis: "代入可得。",
            difficulty: 3,
          },
        ]}
      />,
    );

    const questionType = await screen.findByLabelText("题型选择");
    fireEvent.change(questionType, { target: { value: "short" } });

    expect(await screen.findByText("方程的根为______。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /确认入库/ }));
    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][12]).toContainEqual(
      expect.objectContaining({
        id: "fill-blank-review",
        type: "question",
        content: "方程的根为______。",
        questionType: "short",
      }),
    );
  });

  it("renders script markup in review titles instead of showing literal tags", async () => {
    render(
      <ExtractReviewModal
        open
        onClose={vi.fn()}
        resourceId="lecture-1"
        resourceType="lecture"
        resourceTitle="上下标讲义"
        chapterIds={[]}
        knowledgePointIds={[]}
        grade="高一"
        schoolYear="2026-2027"
        semester="上学期"
        initialBlocks={[
          {
            id: "group-title-script",
            type: "groupTitle",
            content: "热点一 a<sub>n</sub><sub>＋</sub><sub>1</sub>＋a<sub>n</sub>＝f(n)型",
            order: 0,
            status: "new",
          },
        ]}
      />,
    );

    expect(await screen.findByText(/热点一/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("<sub>");
    expect(Array.from(document.body.querySelectorAll("sub")).map((node) => node.textContent))
      .toEqual(["n", "＋", "1", "n"]);
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

  it("preserves semantic keyword text while removing real structural labels", async () => {
    const user = userEvent.setup();
    mocks.extractConfig.questionKeywords = ["第", "例", "训练"];
    mocks.parseDocumentBlocks.mockReturnValue([
      {
        id: "block-question",
        type: "question",
        content: "第一象限内的点满足什么条件？",
        order: 0,
        status: "new",
        questionType: "single",
        options: ["第一象限", "第二象限", "第三象限", "第四象限"],
        answer: "A",
        analysis: "示例解析",
        difficulty: 3,
      },
      {
        id: "block-question-labelled",
        type: "question",
        content: "例题1 第一象限内点的横纵坐标符号是什么？",
        order: 1,
        status: "new",
        questionType: "single",
        options: ["例函数", "第二象限"],
        answer: "A",
        analysis: "示例解析",
        difficulty: 3,
      },
      {
        id: "block-knowledge",
        type: "knowledge",
        content: "训练方法用于巩固知识。\n第一象限内点的横纵坐标均为正。",
        order: 2,
        status: "new",
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

    await user.click(await screen.findByRole("button", { name: "确认入库" }));

    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    const payload = mocks.confirmExtract.mock.calls[0][2];

    expect(payload.questions[0]).toMatchObject({
      stem: "第一象限内的点满足什么条件？",
      options: ["第一象限", "第二象限", "第三象限", "第四象限"],
    });
    expect(payload.questions[1]).toMatchObject({
      stem: "第一象限内点的横纵坐标符号是什么？",
      options: ["例函数", "第二象限"],
    });
    expect(payload.knowledgeBlocks[0]).toMatchObject({
      title: "训练方法用于巩固知识。\n第一象限内点的横...",
      content: "训练方法用于巩固知识。\n第一象限内点的横纵坐标均为正。",
    });
  });

  it("fills missing answer, analysis, and summary with 略 before ingestion", async () => {
    const user = userEvent.setup();
    mocks.parseDocumentBlocks.mockReturnValue([
      {
        id: "block-question",
        type: "question",
        content: "没有配套答案的题目",
        order: 0,
        status: "new",
        questionType: "essay",
        answer: "答案：",
        analysis: "待教师补充解析",
        summary: "   ",
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

    await screen.findByText("题目 1");
    await user.click(screen.getByRole("button", { name: "确认入库" }));

    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0]).toMatchObject({
      answer: "略",
      analysis: "略",
      summary: "略",
    });
  });

  it("opens duplicate review and submits field-level merge choices", async () => {
    const user = userEvent.setup();
    const duplicateQuestion = {
      id: "question-existing",
      teacherId: "teacher-1",
      schoolId: "school-1",
      stem: "示例题目",
      answer: "A",
      analysis: "已有解析",
    };
    mocks.findSimilarQuestionsBatch.mockResolvedValue([[
      { question: duplicateQuestion, similarity: 0.96 },
    ]]);

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

    await screen.findByText("题目 1");
    await user.click(screen.getByRole("button", { name: "确认入库" }));

    expect(mocks.confirmExtract).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "重题处理" })).toBeInTheDocument();
    expect(await screen.findByText(/相似度 96\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/question-existing/)).toBeInTheDocument();
    expect(screen.queryByLabelText("相似题 1 保留上传题答案")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "相似题 1 点击上传题题干展开详情" }));
    await user.click(screen.getByLabelText("相似题 1 选择上传题题干"));
    await user.click(screen.getByLabelText("相似题 1 保留上传题答案"));
    await user.click(screen.getByRole("button", { name: "相似题 1 合并" }));
    await user.click(screen.getByRole("button", { name: "完成重题处理并入库" }));

    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0]).toMatchObject({
      status: "duplicate",
      duplicateAction: "merge",
      duplicateTargetId: "question-existing",
      duplicateFields: {
        stem: "incoming",
        answer: "both",
        analysis: "existing",
        summary: "existing",
      },
    });
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0].duplicateOf).toBeUndefined();
  });

  it("disables merging another teacher's question and allows adding a new one", async () => {
    const user = userEvent.setup();
    mocks.findSimilarQuestionsBatch.mockResolvedValue([[{
      question: {
        id: "question-shared",
        teacherId: "teacher-2",
        schoolId: "school-1",
        stem: "示例题目",
        answer: "A",
        analysis: "共享解析",
      },
      similarity: 0.93,
    }]]);

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

    await screen.findByText("题目 1");
    await user.click(screen.getByRole("button", { name: "确认入库" }));

    const mergeButton = await screen.findByRole("button", { name: "相似题 1 合并" });
    expect(mergeButton).toBeDisabled();
    expect(mergeButton).toHaveAttribute("title", "只能合并到自己的题目");

    await user.click(screen.getByRole("button", { name: "相似题 1 新增" }));
    await user.click(screen.getByRole("button", { name: "完成重题处理并入库" }));

    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][2].questions[0]).toMatchObject({
      status: "confirmed",
      duplicateAction: "add",
    });
  });

  it("creates the lecture manuscript from all reviewed blocks in their original order", async () => {
    mocks.extractConfig.questionKeywords = ["例", "练习", "拓展"];
    mocks.parseDocumentBlocks.mockReturnValue([
      {
        id: "block-title",
        type: "documentTitle",
        content: "测试讲义标题",
        order: 0,
        status: "new",
      },
      {
        id: "block-info",
        type: "documentInfo",
        content: "适用年级：高一",
        order: 1,
        status: "new",
      },
      {
        id: "block-group",
        type: "groupTitle",
        content: "一、选择题",
        order: 2,
        status: "new",
      },
      {
        id: "block-question",
        type: "question",
        content: "拓展题1 示例题目",
        order: 3,
        status: "new",
        questionType: "single",
        options: ["选项 A", "选项 B"],
        answer: "答案：A",
        analysis: "解析：示例解析",
        difficulty: 3,
      },
      {
        id: "block-knowledge",
        type: "knowledge",
        content: "示例知识内容",
        knowledgeTitle: "示例知识",
        order: 4,
        status: "new",
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

    await screen.findByText("文档标题 1");
    fireEvent.click(screen.getByRole("button", { name: /确认入库/ }));

    await waitFor(() => expect(mocks.confirmExtract).toHaveBeenCalledTimes(1));
    expect(mocks.confirmExtract.mock.calls[0][11]).toBe("lecture");
    expect(mocks.createLectureExtractCopy).not.toHaveBeenCalled();
    expect(mocks.confirmExtract.mock.calls[0][12]).toEqual([
      {
        id: "block-title",
        type: "documentTitle",
        content: "测试讲义标题",
      },
      {
        id: "block-info",
        type: "documentInfo",
        content: "适用年级：高一",
      },
      {
        id: "block-group",
        type: "groupTitle",
        content: "一、选择题",
      },
      {
        id: "block-question",
        type: "question",
        content: "拓展题1 示例题目",
        customLabel: "拓展题1",
        questionType: "single",
      },
      {
        id: "block-knowledge",
        type: "knowledge",
        title: "示例知识",
        content: "示例知识内容",
      },
    ]);
  });

  it("asks for confirmation of missing math numbers and reparses them on request", async () => {
    const user = userEvent.setup();
    mocks.authState.teacher.subject = "数学";
    const first = { id: "math-1", type: "question" as const, content: "1. 第一题\n2? 第二题", questionType: "essay" as const, status: "new" as const, order: 0 };
    const third = { id: "math-3", type: "question" as const, content: "3. 第三题", questionType: "essay" as const, status: "new" as const, order: 1 };
    mocks.extractStoredFile.mockResolvedValue({ text: "1. 第一题\n2? 第二题\n3. 第三题" });
    mocks.parseDocumentBlocks.mockImplementation((_text, parseConfig) =>
      parseConfig.confirmedMathQuestionNumbers?.includes(2)
        ? [{ ...first, content: "1. 第一题" }, { ...first, id: "math-2", content: "2? 第二题", order: 1 }, { ...third, order: 2 }]
        : [first, third]);
    render(
      <ExtractReviewModal
        open onClose={vi.fn()} resourceId="paper-1" resourceType="examPaper"
        resourceTitle="数学试卷" chapterIds={[]} knowledgePointIds={[]}
        grade="高一" schoolYear="2026-2027" semester="上学期"
        initialBlocks={[first, third]}
      />,
    );
    expect(screen.getByText("数学试卷题号可能不连续，请确认")).toBeInTheDocument();
    expect(screen.getByText("1 → 3（缺 2）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认入库" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "按确认题号重新拆解" }));
    await waitFor(() => expect(mocks.parseDocumentBlocks).toHaveBeenCalledWith(
      expect.any(String), expect.objectContaining({ confirmedMathQuestionNumbers: [2], subject: "数学" }),
    ));
    await waitFor(() => expect(screen.queryByText("数学试卷题号可能不连续，请确认")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "确认入库" })).toBeEnabled();
    expect(mocks.getPaper).toHaveBeenCalledWith("paper-1");
  });

  it("allows explicit acceptance of a genuine gap without inventing a question", async () => {
    const user = userEvent.setup();
    mocks.authState.teacher.subject = "数学";
    render(
      <ExtractReviewModal
        open onClose={vi.fn()} resourceId="paper-1" resourceType="examPaper"
        resourceTitle="数学试卷" chapterIds={[]} knowledgePointIds={[]}
        grade="高一" schoolYear="2026-2027" semester="上学期"
        initialBlocks={[
          { id: "math-1", type: "question", content: "1. 第一题", questionType: "essay", status: "new", order: 0 },
          { id: "math-3", type: "question", content: "3. 第三题", questionType: "essay", status: "new", order: 1 },
        ]}
      />,
    );
    const confirm = screen.getByRole("button", { name: "确认入库" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "确认原稿确实跳号" }));
    expect(confirm).toBeEnabled();
    expect(screen.getByText("已确认原稿编号，允许继续入库。")).toBeInTheDocument();
  });

});


describe("math numbering review", () => {
  const question = (id: string, content: string) => ({
    id, type: "question" as const, content, order: 0, status: "new" as const,
    questionType: "essay" as const, difficulty: 3,
  });
  const props = {
    open: true, onClose: vi.fn(), resourceId: "lecture-1", resourceType: "lecture" as const,
    resourceTitle: "数学试卷", chapterIds: [], knowledgePointIds: [],
    grade: "高一", schoolYear: "2026-2027", semester: "上学期" as const,
  };

  it("requires confirmation before storing an observed question-number gap", async () => {
    mocks.authState.teacher.subject = "数学";
    mocks.findMathQuestionNumberGaps.mockReturnValue([{
      afterBlockId: "question-11", previousNumber: 11, nextNumber: 13,
    }]);
    const user = userEvent.setup();
    render(<ExtractReviewModal {...props} initialBlocks={[
      question("question-11", "11. 已知函数，求解。"),
      { ...question("question-13", "13. 判断命题。"), order: 1 },
    ]} />);
    expect(screen.getByText("数学试卷题号可能不连续，请确认原文")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认入库" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "确认原文题号无需补拆" }));
    expect(screen.getByRole("button", { name: "确认入库" })).toBeEnabled();
  });

  it("reparses only the selected math block after entering confirmed consecutive numbers", async () => {
    mocks.authState.teacher.subject = "数学";
    mocks.reparseMathQuestionBlock.mockReturnValue([
      { ...question("question-12", "12. 判断命题。"), summary: "判断时应明确条件。", status: "edited" },
      question("question-13", "13指出下列命题的条件。"),
    ]);
    const user = userEvent.setup();
    render(<ExtractReviewModal {...props} initialBlocks={[
      { ...question("question-12", "12. 判断命题。"), summary: "判断时应明确条件。\n13指出下列命题的条件。" },
      { ...question("question-14", "14. 求函数定义域。"), order: 1 },
    ]} />);
    await user.click(screen.getAllByRole("button", { name: "按题号补拆" })[0]);
    await user.type(screen.getByLabelText("需要补拆的连续题号"), "13");
    await user.click(screen.getByRole("button", { name: "确认并局部重拆" }));
    expect(mocks.reparseMathQuestionBlock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "question-12" }),
      expect.objectContaining({ subject: "数学" }),
      [13],
    );
    expect(screen.getByText("题目 3")).toBeInTheDocument();
    expect(screen.getByText(/14. 求函数定义域/)).toBeInTheDocument();
  });
});
