import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import type { AnyClass, Student } from "@/types";

interface StudentPickerModalProps {
  open: boolean;
  onClose: () => void;
  selectedStudentIds: string[];
  onChange: (studentIds: string[]) => void;
  students: Student[];
  classes: AnyClass[];
  description?: string;
}

export function StudentPickerModal({
  open, onClose, selectedStudentIds, onChange, students, classes,
  description = "选择学生后，可按训练状态筛选题目，并依据知识点掌握情况优化排序",
}: StudentPickerModalProps) {
  const [selectedClassId, setSelectedClassId] = useState("");
  const schoolClasses = classes.filter((item) => item.type === "school");
  const personalClasses = classes.filter((item) => item.type === "personal");
  const filteredStudents = useMemo(() => {
    if (!selectedClassId) return students;
    const personalClass = personalClasses.find((item) => item.id === selectedClassId);
    return personalClass
      ? students.filter((student) => personalClass.studentIds.includes(student.id))
      : students.filter((student) => student.classId === selectedClassId);
  }, [selectedClassId, students, personalClasses]);

  return (
    <Modal
        open={open}
        onClose={() => onClose()}
        size="lg"
        title="选择学生"
        description={description}
        footer={
          <div className="flex items-center justify-between w-full">
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>
              清空选择
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onClose()}>
                取消
              </Button>
              <Button variant="gold" size="sm" onClick={() => onClose()}>
                确定（{selectedStudentIds.length} 人）
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-ink-600 mb-2">按班级筛选</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedClassId("")}
                className={cn(
                  "px-2.5 py-1 rounded text-xs border transition-all",
                  !selectedClassId
                    ? "bg-gold-400 border-gold-400 text-ink-900"
                    : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                )}
              >
                全部学生
              </button>
              {schoolClasses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all",
                    selectedClassId === c.id
                      ? "bg-gold-400 border-gold-400 text-ink-900"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                >
                  {c.name}
                </button>
              ))}
              {personalClasses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all",
                    selectedClassId === c.id
                      ? "bg-teal-400 border-teal-400 text-ink-900"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-ink-600">
                学生列表（{filteredStudents.length} 人）
              </div>
              <button
                onClick={() => {
                  const ids = filteredStudents.map((s) => s.id);
                  onChange(Array.from(new Set([...selectedStudentIds, ...ids])));
                }}
                className="text-xs text-gold-600 hover:text-gold-800"
              >
                全选
              </button>
            </div>
            <div className="max-h-[340px] overflow-y-auto border border-ink-100 rounded-md">
              {filteredStudents.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-400">暂无学生</div>
              ) : (
                <div className="divide-y divide-ink-50">
                  {filteredStudents.map((s) => {
                    const checked = selectedStudentIds.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() =>
                          onChange(selectedStudentIds.includes(s.id)
                            ? selectedStudentIds.filter((x) => x !== s.id)
                            : [...selectedStudentIds, s.id])
                        }
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors",
                          checked ? "bg-gold-50/50" : "hover:bg-mist",
                        )}
                      >
                        <span
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                            checked ? "bg-gold-400 border-gold-400 text-ink-900" : "border-ink-300 bg-white",
                          )}
                        >
                          {checked && (
                            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor">
                              <path d="M10 3L4.5 8.5 2 6l-.7.7L4.5 9.9 10.7 3.7z" />
                            </svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-ink-900 truncate">{s.name}</div>
                          <div className="text-xs text-ink-400 truncate">
                            学号 {s.studentNo} · {s.grade || "未设置年级"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
    </Modal>
  );
}
