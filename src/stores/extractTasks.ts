import { create } from "zustand";
import { examPaperService } from "@/services/examPaper";
import { lectureService } from "@/services/lecture";
import { extractStoredFile } from "@/services/api";
import {
  parseDocumentBlocks,
  type DocumentBlock,
  type DocumentParseConfig,
} from "@/lib/document-block-parser";
import { useExtractConfigStore } from "@/stores/extractConfig";
import { toast } from "@/stores/ui";
import type { ResourceSemester } from "@/types";

export const MAX_CONCURRENT_EXTRACT_TASKS = 2;

export type ExtractTaskStatus = "extracting" | "ready" | "failed";

export interface ExtractTaskInput {
  resourceId: string;
  resourceType: "examPaper" | "lecture";
  resourceTitle: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester: ResourceSemester;
  questionSourceType?: string;
  questionCategory?: string;
}

export interface ExtractTask extends ExtractTaskInput {
  id: string;
  status: ExtractTaskStatus;
  progress: number;
  progressMessage: string;
  blocks: DocumentBlock[];
  error?: string;
  createdAt: number;
  presented: boolean;
}

interface ExtractTaskState {
  tasks: ExtractTask[];
  activeReviewTaskId: string | null;
  panelOpen: boolean;
  startTask: (input: ExtractTaskInput) => boolean;
  retryTask: (taskId: string) => boolean;
  openReview: (taskId: string) => void;
  closeReview: () => void;
  completeTask: (taskId: string) => void;
  dismissTask: (taskId: string) => void;
  setPanelOpen: (open: boolean) => void;
  reset: () => void;
}

function taskId(input: Pick<ExtractTaskInput, "resourceId" | "resourceType">): string {
  return `${input.resourceType}:${input.resourceId}`;
}

export function currentParseConfig(): DocumentParseConfig {
  const config = useExtractConfigStore.getState();
  return {
    headingKeywords: [...config.headingKeywords],
    questionKeywords: [...config.questionKeywords],
    answerKeywords: [...config.answerKeywords],
    analysisKeywords: [...config.analysisKeywords],
    summaryKeywords: [...config.summaryKeywords],
    singleChoiceKeywords: [...config.singleChoiceKeywords],
    multipleChoiceKeywords: [...config.multipleChoiceKeywords],
    fillBlankKeywords: [...config.fillBlankKeywords],
    essayKeywords: [...config.essayKeywords],
  };
}

export const useExtractTasksStore = create<ExtractTaskState>((set, get) => {
  const updateTask = (id: string, patch: Partial<ExtractTask>) => {
    set((state) => ({
      tasks: state.tasks.map((task) => task.id === id ? { ...task, ...patch } : task),
    }));
  };

  const executeTask = async (id: string) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task) return;

    try {
      updateTask(id, {
        status: "extracting",
        progress: 10,
        progressMessage: "正在获取文档信息...",
        blocks: [],
        error: undefined,
        presented: false,
      });

      const resource = task.resourceType === "lecture"
        ? await lectureService.getLecture(task.resourceId)
        : await examPaperService.getPaper(task.resourceId);

      if (!resource?.originalFileUrl) throw new Error("文档文件不存在");
      const fileName = resource.originalFileName || "";
      if (!/\.(docx|pdf|txt|md)$/i.test(fileName)) {
        throw new Error("暂不支持该格式文档的文档拆解");
      }

      updateTask(id, {
        progress: 35,
        progressMessage: "正在由服务端解析文档...",
      });
      const extracted = await extractStoredFile(resource.originalFileUrl, { textOnly: true });

      updateTask(id, {
        progress: 75,
        progressMessage: "正在分析文档结构...",
      });
      let blocks = parseDocumentBlocks(extracted.text, currentParseConfig());
      if (blocks.length === 0) {
        blocks = parseDocumentBlocks(
          "文档内容为空，请检查文档是否包含题目或知识块内容。",
          currentParseConfig(),
        );
      }

      set((state) => {
        const shouldPresent = state.activeReviewTaskId === null;
        return {
          tasks: state.tasks.map((item) => item.id === id
            ? {
                ...item,
                status: "ready",
                progress: 100,
                progressMessage: "拆解完成，等待审阅",
                blocks,
                error: undefined,
                presented: shouldPresent,
              }
            : item),
          activeReviewTaskId: shouldPresent ? id : state.activeReviewTaskId,
        };
      });
      toast.success("文档拆解完成", `${task.resourceTitle} 已完成，等待审阅`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "文档拆解失败，请稍后重试";
      updateTask(id, {
        status: "failed",
        progress: 0,
        progressMessage: "拆解失败",
        error: message,
        presented: true,
      });
      toast.error("文档拆解失败", `${task.resourceTitle}：${message}`);
    }
  };

  const revealNextReady = (state: ExtractTaskState, excludedId?: string) => {
    const next = state.tasks.find((task) => (
      task.id !== excludedId && task.status === "ready" && !task.presented
    ));
    if (!next) return { tasks: state.tasks, activeReviewTaskId: null };
    return {
      tasks: state.tasks.map((task) => task.id === next.id ? { ...task, presented: true } : task),
      activeReviewTaskId: next.id,
    };
  };

  return {
    tasks: [],
    activeReviewTaskId: null,
    panelOpen: false,

    startTask: (input) => {
      const id = taskId(input);
      const existing = get().tasks.find((task) => task.id === id);
      if (existing) {
        if (existing.status === "ready") get().openReview(id);
        toast.info(
          existing.status === "ready" ? "拆解结果等待审阅" : "该文档已有拆解任务",
          input.resourceTitle,
        );
        return false;
      }

      const activeCount = get().tasks.filter((task) => task.status === "extracting").length;
      if (activeCount >= MAX_CONCURRENT_EXTRACT_TASKS) {
        toast.warning(
          "并行拆解任务已达上限",
          `最多同时处理 ${MAX_CONCURRENT_EXTRACT_TASKS} 个文档，请等待已有任务完成`,
        );
        return false;
      }

      const task: ExtractTask = {
        ...input,
        id,
        status: "extracting",
        progress: 0,
        progressMessage: "正在初始化...",
        blocks: [],
        createdAt: Date.now(),
        presented: false,
      };
      set((state) => ({ tasks: [...state.tasks, task] }));
      toast.info("已转入后台拆解", `${input.resourceTitle} 正在处理中`);
      void executeTask(id);
      return true;
    },

    retryTask: (id) => {
      const task = get().tasks.find((item) => item.id === id);
      if (!task || task.status !== "failed") return false;
      const activeCount = get().tasks.filter((item) => item.status === "extracting").length;
      if (activeCount >= MAX_CONCURRENT_EXTRACT_TASKS) {
        toast.warning("并行拆解任务已达上限");
        return false;
      }
      void executeTask(id);
      return true;
    },

    openReview: (id) => {
      set((state) => {
        const task = state.tasks.find((item) => item.id === id);
        if (!task || task.status !== "ready") return state;
        return {
          tasks: state.tasks.map((item) => item.id === id ? { ...item, presented: true } : item),
          activeReviewTaskId: id,
          panelOpen: false,
        };
      });
    },

    closeReview: () => {
      set((state) => revealNextReady(state, state.activeReviewTaskId || undefined));
    },

    completeTask: (id) => {
      set((state) => {
        const remaining = state.tasks.filter((task) => task.id !== id);
        const nextState = { ...state, tasks: remaining, activeReviewTaskId: null };
        return revealNextReady(nextState, id);
      });
    },

    dismissTask: (id) => {
      set((state) => {
        const task = state.tasks.find((item) => item.id === id);
        if (!task || task.status === "extracting") return state;
        const remaining = state.tasks.filter((item) => item.id !== id);
        if (state.activeReviewTaskId !== id) return { tasks: remaining };
        const nextState = { ...state, tasks: remaining, activeReviewTaskId: null };
        return revealNextReady(nextState, id);
      });
    },

    setPanelOpen: (open) => set({ panelOpen: open }),
    reset: () => set({ tasks: [], activeReviewTaskId: null, panelOpen: false }),
  };
});

export function isExtractTaskRunning(
  tasks: ExtractTask[],
  resourceId: string,
  resourceType: "examPaper" | "lecture",
): boolean {
  return tasks.some((task) => (
    task.resourceId === resourceId
    && task.resourceType === resourceType
    && task.status === "extracting"
  ));
}
