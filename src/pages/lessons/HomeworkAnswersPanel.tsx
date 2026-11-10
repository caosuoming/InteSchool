import { useEffect, useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import type { ClassroomHomeworkAnswer } from "@/types";
import { cn } from "@/lib/utils";

export function HomeworkAnswersPanel({ answers }: { answers: ClassroomHomeworkAnswer[] }) {
  const subjects = useMemo(() => [...new Set(answers.map((item) => item.subject))]
    .sort((a, b) => a.localeCompare(b, "zh-CN")), [answers]);
  const [subject, setSubject] = useState("");
  useEffect(() => {
    if (!subjects.includes(subject)) setSubject(subjects[0] || "");
  }, [subject, subjects]);
  const selected = answers.filter((item) => item.subject === subject);

  if (!answers.length) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center text-neutral-500">
        <BookOpen className="h-10 w-10 text-neutral-700" />
        <div className="text-sm">暂无可查看的作业答案</div>
        <div className="text-xs">完成对应日期的作业批改或扫描复查后，有答案的题目会显示在这里。</div>
      </div>
    );
  }
  return (
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
                <h3 className="mt-1 text-base font-semibold text-white">{item.title}</h3>
              </header>
              <ol className="divide-y divide-neutral-800">
                {item.questions.map((question) => (
                  <li key={question.id} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 px-4 py-3 text-sm">
                    <span className="text-neutral-400">第 {question.number} 题</span>
                    <span className={cn("whitespace-pre-wrap break-words text-neutral-100", !question.answer && "text-neutral-500")}>
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
  );
}
