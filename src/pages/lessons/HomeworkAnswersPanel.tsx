import { useEffect, useMemo, useState } from "react";
import { BookOpen, Minus, Plus, RotateCcw } from "lucide-react";
import type { ClassroomHomeworkAnswer } from "@/types";
import { cn } from "@/lib/utils";

const DEFAULT_ANSWER_SIZE = 18;
const MIN_ANSWER_SIZE = 14;
const MAX_ANSWER_SIZE = 40;

export function HomeworkAnswersPanel({ answers }: { answers: ClassroomHomeworkAnswer[] }) {
  const subjects = useMemo(() => [...new Set(answers.map((item) => item.subject))]
    .sort((a, b) => a.localeCompare(b, "zh-CN")), [answers]);
  const [subject, setSubject] = useState("");
  const [fontSize, setFontSize] = useState(DEFAULT_ANSWER_SIZE);
  useEffect(() => {
    if (!subjects.includes(subject)) setSubject(subjects[0] || "");
  }, [subject, subjects]);
  const selected = answers.filter((item) => item.subject === subject);
  const percentage = Math.round(fontSize / DEFAULT_ANSWER_SIZE * 100);

  if (!answers.length) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center text-neutral-500">
        <BookOpen className="h-10 w-10 text-neutral-700" />
        <div className="text-sm">暂无可查看的作业答案</div>
        <div className="text-xs">保存对应日期的作业记录后，已布置试卷的参考答案会显示在这里。</div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="toolbar" aria-label="答案缩放" className="flex shrink-0 items-center justify-end gap-2 border-b border-neutral-800 px-4 py-2">
        <button type="button" aria-label="缩小答案" title="缩小答案"
          disabled={fontSize <= MIN_ANSWER_SIZE} onClick={() => setFontSize((size) => Math.max(MIN_ANSWER_SIZE, size - 2))}
          className="rounded-lg border border-neutral-700 p-2 text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30">
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-14 text-center text-sm tabular-nums text-white" aria-live="polite">{percentage}%</span>
        <button type="button" aria-label="放大答案" title="放大答案"
          disabled={fontSize >= MAX_ANSWER_SIZE} onClick={() => setFontSize((size) => Math.min(MAX_ANSWER_SIZE, size + 2))}
          className="rounded-lg border border-neutral-700 p-2 text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-30">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" aria-label="重置答案缩放" title="恢复原始大小" onClick={() => setFontSize(DEFAULT_ANSWER_SIZE)}
          className="rounded-lg border border-neutral-700 p-2 text-neutral-200 hover:bg-neutral-800">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav aria-label="答案学科" className="flex max-h-28 shrink-0 gap-2 overflow-auto border-b border-neutral-800 bg-neutral-950 p-3 sm:max-h-none sm:w-40 sm:flex-col sm:border-b-0 sm:border-r">
          {subjects.map((name) => (
            <button key={name} type="button" onClick={() => setSubject(name)}
              aria-pressed={subject === name}
              className={cn(
                "shrink-0 rounded-lg px-4 py-2.5 text-left text-xs font-semibold transition-colors",
                subject === name ? "bg-amber-400 text-neutral-950" : "bg-neutral-900 text-neutral-300 hover:text-white",
              )}>
              {name}
            </button>
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" role="region" tabIndex={0} aria-label="作业答案列表">
          <div className="space-y-5">
            {selected.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/50">
                <header className="border-b border-neutral-800 px-4 py-3">
                  <div className="text-xs text-amber-300">{item.assignedDate}</div>
                  {item.homeworkTitle && <div className="mt-1 text-sm text-neutral-300">作业：{item.homeworkTitle}</div>}
                  <h3 className="mt-1 font-semibold text-white" style={{ fontSize: `${fontSize + 2}px` }}>{item.title}</h3>
                </header>
                <ol className="divide-y divide-neutral-800">
                  {item.questions.map((question) => (
                    <li key={question.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-5" style={{ fontSize: `${fontSize}px` }}>
                      <span className="shrink-0 text-neutral-400 sm:min-w-[5.5em]">第 {question.number} 题</span>
                      <span className={cn("min-w-0 whitespace-pre-wrap break-words text-neutral-100", !question.answer && "text-neutral-500")}>
                        {question.answer || "暂无答案"}
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
