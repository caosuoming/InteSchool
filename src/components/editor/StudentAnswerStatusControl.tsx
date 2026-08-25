import { useMemo, useState } from "react";
import type { AnswerRecord, AnswerScore, Student } from "@/types";
import { inferScore } from "@/services/analytics";
import { cn } from "@/lib/utils";

const scoreLabels: Record<AnswerScore, string> = {
  done: "已做",
  correct: "全对",
  partial: "半对",
  wrong: "做错",
};

export function StudentAnswerStatusControl({
  students,
  answerRecords,
  questionId,
  onChange,
  showAnsweredList = false,
  unansweredLabel = "未做",
  className = "",
}: {
  students: Student[];
  answerRecords: AnswerRecord[];
  questionId: string;
  onChange: (studentId: string, questionId: string, score: AnswerScore | null) => Promise<void> | void;
  showAnsweredList?: boolean;
  unansweredLabel?: "未做" | "待做";
  className?: string;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [saving, setSaving] = useState(false);
  const activeStudentId = students.length === 1 ? students[0].id : selectedStudentId;

  const currentScore = useMemo(() => {
    if (!activeStudentId) return null;
    const record = answerRecords.find(
      (item) => item.studentId === activeStudentId && item.questionId === questionId,
    );
    return record ? inferScore(record) : null;
  }, [activeStudentId, answerRecords, questionId]);

  const answeredStudents = useMemo(() => {
    const recordsByStudentId = new Map(
      answerRecords
        .filter((record) => record.questionId === questionId)
        .map((record) => [record.studentId, record] as const),
    );
    return students.flatMap((student) => {
      const record = recordsByStudentId.get(student.id);
      return record ? [{ student, score: inferScore(record) }] : [];
    });
  }, [answerRecords, questionId, students]);

  const updateScore = async (value: string) => {
    if (!activeStudentId) return;
    const score = value === "none" ? null : value as AnswerScore;
    setSaving(true);
    try {
      await onChange(activeStudentId, questionId, score);
    } finally {
      setSaving(false);
    }
  };

  const scoreOptions: Array<{ value: "none" | AnswerScore; label: string }> = [
    { value: "none", label: unansweredLabel },
    { value: "done", label: "已做" },
    { value: "correct", label: "全对" },
    { value: "partial", label: "半对" },
    { value: "wrong", label: "做错" },
  ];

  const answerSelect = (
    <select
      aria-label="答题情况"
      value={currentScore || "none"}
      onChange={(event) => void updateScore(event.target.value)}
      disabled={!activeStudentId || saving}
      className="min-w-0 rounded-md border border-ink-200 bg-paper px-2 py-1.5 text-xs text-ink-700 focus:border-gold-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {scoreOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );

  return (
    <div className={className}>
      <div className="mb-1.5 text-[11px] font-medium text-ink-500">学生答题情况</div>
      {students.length === 0 ? (
        <div className="text-[11px] leading-5 text-ink-400">请先添加使用班级</div>
      ) : students.length === 1 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div
            aria-label="学生"
            className="min-w-0 rounded-md border border-ink-100 bg-ink-50 px-2 py-1.5 text-xs text-ink-700"
          >
            {students[0].name}{students[0].studentNo ? ` · ${students[0].studentNo}` : ""}
          </div>
          {answerSelect}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              aria-label="选择学生"
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              className="min-w-0 rounded-md border border-ink-200 bg-paper px-2 py-1.5 text-xs text-ink-700 focus:border-gold-400 focus:outline-none"
            >
              <option value="">选择学生</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}{student.studentNo ? ` · ${student.studentNo}` : ""}
                </option>
              ))}
            </select>
            {answerSelect}
          </div>

          {showAnsweredList && (
            <div className="mt-2 rounded-md border border-ink-100 bg-ink-50/60 p-2" data-testid="answered-student-list">
              <div className="mb-1.5 text-[10px] font-medium text-ink-400">已答题名单</div>
              {answeredStudents.length === 0 ? (
                <div className="text-[11px] text-ink-400">暂无已填写答题情况的学生</div>
              ) : (
                <div className="space-y-1">
                  {answeredStudents.map(({ student, score }) => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setSelectedStudentId(student.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11px] transition-colors",
                        selectedStudentId === student.id
                          ? "bg-gold-50 text-gold-700"
                          : "text-ink-600 hover:bg-paper",
                      )}
                      aria-label={`查看${student.name}答题情况`}
                    >
                      <span className="min-w-0 truncate">
                        {student.name}{student.studentNo ? ` · ${student.studentNo}` : ""}
                      </span>
                      <span className="shrink-0 font-medium">{scoreLabels[score]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
