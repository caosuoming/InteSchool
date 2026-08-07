import { useMemo, useState } from "react";
import type { AnswerRecord, AnswerScore, Student } from "@/types";
import { inferScore } from "@/services/analytics";

const scoreOptions: Array<{ value: "none" | AnswerScore; label: string }> = [
  { value: "none", label: "未做" },
  { value: "done", label: "已做" },
  { value: "correct", label: "全对" },
  { value: "partial", label: "半对" },
  { value: "wrong", label: "做错" },
];

export function StudentAnswerStatusControl({
  students,
  answerRecords,
  questionId,
  onChange,
  className = "",
}: {
  students: Student[];
  answerRecords: AnswerRecord[];
  questionId: string;
  onChange: (studentId: string, questionId: string, score: AnswerScore | null) => Promise<void> | void;
  className?: string;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [saving, setSaving] = useState(false);

  const currentScore = useMemo(() => {
    if (!selectedStudentId) return null;
    const record = answerRecords.find(
      (item) => item.studentId === selectedStudentId && item.questionId === questionId,
    );
    return record ? inferScore(record) : null;
  }, [answerRecords, questionId, selectedStudentId]);

  const updateScore = async (value: string) => {
    if (!selectedStudentId) return;
    const score = value === "none" ? null : value as AnswerScore;
    setSaving(true);
    try {
      await onChange(selectedStudentId, questionId, score);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={className}>
      <div className="mb-1.5 text-[11px] font-medium text-ink-500">学生答题情况</div>
      {students.length === 0 ? (
        <div className="text-[11px] leading-5 text-ink-400">请先添加使用班级</div>
      ) : (
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
          <select
            aria-label="答题情况"
            value={currentScore || "none"}
            onChange={(event) => void updateScore(event.target.value)}
            disabled={!selectedStudentId || saving}
            className="min-w-0 rounded-md border border-ink-200 bg-paper px-2 py-1.5 text-xs text-ink-700 focus:border-gold-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scoreOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
