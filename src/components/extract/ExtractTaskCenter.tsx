import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Files,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ExtractReviewModal } from "@/components/extract/ExtractReviewModal";
import {
  MAX_CONCURRENT_EXTRACT_TASKS,
  useExtractTasksStore,
} from "@/stores/extractTasks";
import { cn } from "@/lib/utils";

export function ExtractTaskCenter() {
  const tasks = useExtractTasksStore((state) => state.tasks);
  const activeReviewTaskId = useExtractTasksStore((state) => state.activeReviewTaskId);
  const panelOpen = useExtractTasksStore((state) => state.panelOpen);
  const setPanelOpen = useExtractTasksStore((state) => state.setPanelOpen);
  const retryTask = useExtractTasksStore((state) => state.retryTask);
  const openReview = useExtractTasksStore((state) => state.openReview);
  const closeReview = useExtractTasksStore((state) => state.closeReview);
  const completeTask = useExtractTasksStore((state) => state.completeTask);
  const dismissTask = useExtractTasksStore((state) => state.dismissTask);

  if (tasks.length === 0) return null;

  const activeTask = tasks.find((task) => task.id === activeReviewTaskId) || null;
  const extractingCount = tasks.filter((task) => task.status === "extracting").length;
  const readyCount = tasks.filter((task) => task.status === "ready").length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;

  const handleConfirmed = () => {
    if (!activeTask) return;
    const detail = {
      resourceId: activeTask.resourceId,
      resourceType: activeTask.resourceType,
    };
    completeTask(activeTask.id);
    window.dispatchEvent(new CustomEvent("extract-task-confirmed", { detail }));
  };

  const handleCloseReview = () => {
    if (!activeTask) return;
    const taskStillExists = useExtractTasksStore
      .getState()
      .tasks
      .some((task) => task.id === activeTask.id);
    if (taskStillExists) closeReview();
  };

  return (
    <>
      <div className="no-print fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {panelOpen && (
          <div className="w-[380px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-ink-200 bg-paper shadow-xl">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <div>
                <div className="flex items-center gap-2 font-medium text-ink-900">
                  <Files className="h-4 w-4 text-gold-600" />
                  文档拆解任务
                </div>
                <div className="mt-0.5 text-xs text-ink-400">
                  处理中 {extractingCount}/{MAX_CONCURRENT_EXTRACT_TASKS}
                  {readyCount > 0 && ` · 待审阅 ${readyCount}`}
                  {failedCount > 0 && ` · 失败 ${failedCount}`}
                </div>
              </div>
              <button
                type="button"
                aria-label="收起拆解任务"
                className="rounded p-1 text-ink-400 hover:bg-mist hover:text-ink-700"
                onClick={() => setPanelOpen(false)}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[420px] space-y-2 overflow-y-auto p-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-lg border px-3 py-2.5",
                    task.status === "failed"
                      ? "border-red-200 bg-red-50/60"
                      : task.status === "ready"
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-ink-100 bg-mist/40",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex-shrink-0">
                      {task.status === "extracting" && <Loader2 className="h-4 w-4 animate-spin text-gold-600" />}
                      {task.status === "ready" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {task.status === "failed" && <AlertTriangle className="h-4 w-4 text-red-600" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-800" title={task.resourceTitle}>
                        {task.resourceTitle}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-500">
                        {task.resourceType === "examPaper" ? "试卷" : "讲义"} · {task.progressMessage}
                      </div>
                      {task.status === "extracting" && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className="h-full rounded-full bg-gold-500 transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      )}
                      {task.error && (
                        <div className="mt-1.5 line-clamp-2 text-xs text-red-600">{task.error}</div>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {task.status === "ready" && (
                        <Button size="sm" variant="outline" onClick={() => openReview(task.id)}>
                          审阅
                        </Button>
                      )}
                      {task.status === "failed" && (
                        <button
                          type="button"
                          aria-label={`重试 ${task.resourceTitle}`}
                          className="rounded p-1.5 text-ink-500 hover:bg-white hover:text-ink-800"
                          onClick={() => retryTask(task.id)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {task.status !== "extracting" && (
                        <button
                          type="button"
                          aria-label={`移除 ${task.resourceTitle}`}
                          className="rounded p-1.5 text-ink-400 hover:bg-white hover:text-red-600"
                          onClick={() => dismissTask(task.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-ink-200 bg-paper px-4 py-2.5 text-sm font-medium text-ink-800 shadow-lg transition hover:border-gold-300 hover:bg-gold-50"
          onClick={() => setPanelOpen(!panelOpen)}
          aria-label="打开文档拆解任务"
        >
          {extractingCount > 0 ? (
            <Loader2 className="h-4 w-4 animate-spin text-gold-600" />
          ) : (
            <Files className="h-4 w-4 text-gold-600" />
          )}
          拆解任务 {tasks.length}
          {readyCount > 0 && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-700">
              {readyCount} 待审阅
            </span>
          )}
          {panelOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {activeTask?.status === "ready" && (
        <ExtractReviewModal
          open
          onClose={handleCloseReview}
          resourceId={activeTask.resourceId}
          resourceType={activeTask.resourceType}
          resourceTitle={activeTask.resourceTitle}
          chapterIds={activeTask.chapterIds}
          knowledgePointIds={activeTask.knowledgePointIds}
          grade={activeTask.grade}
          schoolYear={activeTask.schoolYear}
          semester={activeTask.semester}
          questionSourceType={activeTask.questionSourceType}
          questionCategory={activeTask.questionCategory}
          initialBlocks={activeTask.blocks}
          onConfirmed={handleConfirmed}
        />
      )}
    </>
  );
}

export default ExtractTaskCenter;
