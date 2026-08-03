import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getLecture: vi.fn(),
  getPaper: vi.fn(),
  extractStoredFile: vi.fn(),
  parseDocumentBlocks: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/services/lecture", () => ({
  lectureService: { getLecture: mocks.getLecture },
}));

vi.mock("@/services/examPaper", () => ({
  examPaperService: { getPaper: mocks.getPaper },
}));

vi.mock("@/services/api", () => ({
  extractStoredFile: mocks.extractStoredFile,
}));

vi.mock("@/lib/document-block-parser", () => ({
  parseDocumentBlocks: mocks.parseDocumentBlocks,
}));

vi.mock("@/stores/extractConfig", () => ({
  useExtractConfigStore: {
    getState: () => ({
      headingKeywords: ["一"],
      questionKeywords: ["题目"],
      answerKeywords: ["答案"],
      analysisKeywords: ["解析"],
      summaryKeywords: ["总结"],
      singleChoiceKeywords: ["单选"],
      multipleChoiceKeywords: ["多选"],
      fillBlankKeywords: ["填空"],
      essayKeywords: ["解答"],
    }),
  },
}));

vi.mock("@/stores/ui", () => ({
  toast: {
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
    error: mocks.toastError,
  },
}));

import {
  MAX_CONCURRENT_EXTRACT_TASKS,
  useExtractTasksStore,
} from "./extractTasks";

function taskInput(index: number, resourceType: "lecture" | "examPaper" = "lecture") {
  return {
    resourceId: `resource-${index}`,
    resourceType,
    resourceTitle: `文档 ${index}`,
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2026-2027",
    semester: "上学期" as const,
  };
}

describe("extract task store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExtractTasksStore.getState().reset();
    mocks.getLecture.mockResolvedValue({
      originalFileUrl: "/api/files/lecture-1",
      originalFileName: "lecture.docx",
    });
    mocks.getPaper.mockResolvedValue({
      originalFileUrl: "/api/files/paper-1",
      originalFileName: "paper.pdf",
    });
    mocks.extractStoredFile.mockResolvedValue({ text: "题目：示例" });
    mocks.parseDocumentBlocks.mockReturnValue([
      {
        id: "block-1",
        type: "question",
        content: "示例",
        order: 0,
        status: "new",
      },
    ]);
  });

  it("limits active background extraction to two documents", () => {
    mocks.getLecture.mockImplementation(() => new Promise(() => undefined));

    for (let index = 0; index < MAX_CONCURRENT_EXTRACT_TASKS; index += 1) {
      expect(useExtractTasksStore.getState().startTask(taskInput(index))).toBe(true);
    }

    expect(useExtractTasksStore.getState().startTask(taskInput(99))).toBe(false);
    expect(useExtractTasksStore.getState().tasks).toHaveLength(MAX_CONCURRENT_EXTRACT_TASKS);
    expect(mocks.toastWarning).toHaveBeenCalledWith(
      "并行拆解任务已达上限",
      expect.stringContaining("最多同时处理 2 个文档"),
    );
  });

  it("completes extraction in the background and opens the review result", async () => {
    expect(useExtractTasksStore.getState().startTask(taskInput(1))).toBe(true);

    await waitFor(() => {
      expect(useExtractTasksStore.getState().tasks[0]?.status).toBe("ready");
    });

    const state = useExtractTasksStore.getState();
    expect(state.tasks[0]).toMatchObject({
      progress: 100,
      progressMessage: "拆解完成，等待审阅",
      blocks: [{ id: "block-1" }],
    });
    expect(state.activeReviewTaskId).toBe("lecture:resource-1");
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "文档拆解完成",
      "文档 1 已完成，等待审阅",
    );
  });

  it("queues completed reviews and presents the next document after closing", async () => {
    useExtractTasksStore.getState().startTask(taskInput(1));
    useExtractTasksStore.getState().startTask(taskInput(2));

    await waitFor(() => {
      expect(useExtractTasksStore.getState().tasks.every((task) => task.status === "ready")).toBe(true);
    });

    const firstReviewId = useExtractTasksStore.getState().activeReviewTaskId;
    expect(firstReviewId).not.toBeNull();
    useExtractTasksStore.getState().closeReview();

    const secondReviewId = useExtractTasksStore.getState().activeReviewTaskId;
    expect(secondReviewId).not.toBeNull();
    expect(secondReviewId).not.toBe(firstReviewId);
  });

  it("prevents duplicate tasks for the same resource", () => {
    mocks.getLecture.mockImplementation(() => new Promise(() => undefined));

    expect(useExtractTasksStore.getState().startTask(taskInput(1))).toBe(true);
    expect(useExtractTasksStore.getState().startTask(taskInput(1))).toBe(false);
    expect(useExtractTasksStore.getState().tasks).toHaveLength(1);
  });
});
