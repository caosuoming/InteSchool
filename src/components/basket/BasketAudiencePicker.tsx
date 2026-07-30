import { useMemo, useState } from "react";
import { Check, GraduationCap, User, Users } from "lucide-react";
import type { AnyClass, Student } from "@/types";
import { cn } from "@/lib/utils";

interface BasketAudiencePickerProps {
  classes: AnyClass[];
  students: Student[];
  classIds: string[];
  studentIds: string[];
  onChange: (value: { classIds: string[]; studentIds: string[] }) => void;
}

function studentsInClass(cls: AnyClass, students: Student[]): Student[] {
  if (cls.type === "personal") {
    const ids = new Set(cls.studentIds);
    return students.filter((student) => ids.has(student.id));
  }
  return students.filter((student) => student.classId === cls.id);
}

export function BasketAudiencePicker({
  classes,
  students,
  classIds,
  studentIds,
  onChange,
}: BasketAudiencePickerProps) {
  const [filterClassId, setFilterClassId] = useState("");
  const filteredStudents = useMemo(() => {
    if (!filterClassId) return students;
    const cls = classes.find((item) => item.id === filterClassId);
    return cls ? studentsInClass(cls, students) : [];
  }, [classes, filterClassId, students]);

  const toggleClass = (cls: AnyClass) => {
    const checked = classIds.includes(cls.id);
    const classStudentIds = new Set(studentsInClass(cls, students).map((student) => student.id));
    onChange({
      classIds: checked ? classIds.filter((id) => id !== cls.id) : [...classIds, cls.id],
      studentIds: checked
        ? studentIds
        : studentIds.filter((studentId) => !classStudentIds.has(studentId)),
    });
  };

  const toggleStudent = (studentId: string) => {
    onChange({
      classIds,
      studentIds: studentIds.includes(studentId)
        ? studentIds.filter((id) => id !== studentId)
        : [...studentIds, studentId],
    });
  };

  if (classes.length === 0 && students.length === 0) {
    return <div className="py-8 text-center text-sm text-ink-400">暂无可选班级或学生</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-medium text-ink-700 mb-2">
          <Users className="w-4 h-4 text-gold-600" />
          整班对象
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {classes.map((cls) => {
            const checked = classIds.includes(cls.id);
            const count = studentsInClass(cls, students).length;
            return (
              <button
                key={cls.id}
                type="button"
                aria-pressed={checked}
                aria-label={`选择班级 ${cls.name}`}
                onClick={() => toggleClass(cls)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                  checked
                    ? "border-gold-300 bg-gold-50/70"
                    : "border-ink-100 bg-paper hover:border-ink-200 hover:bg-mist/50",
                )}
              >
                <span className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                  checked ? "border-gold-500 bg-gold-500 text-white" : "border-ink-300",
                )}>
                  {checked && <Check className="w-3 h-3" />}
                </span>
                {cls.type === "school"
                  ? <GraduationCap className="w-4 h-4 text-ink-400 flex-shrink-0" />
                  : <User className="w-4 h-4 text-teal-500 flex-shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink-800 truncate">{cls.name}</span>
                  <span className="block text-[11px] text-ink-400">{count} 名学生</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink-700">
            <User className="w-4 h-4 text-teal-600" />
            具体学生
          </div>
          <span className="text-xs text-ink-400">已指定 {studentIds.length} 人</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setFilterClassId("")}
            className={cn(
              "px-2.5 py-1 rounded border text-xs",
              !filterClassId
                ? "border-gold-300 bg-gold-50 text-gold-700"
                : "border-ink-100 text-ink-500 hover:border-ink-200",
            )}
          >
            全部
          </button>
          {classes.map((cls) => (
            <button
              key={cls.id}
              type="button"
              aria-label={`筛选班级 ${cls.name}`}
              onClick={() => setFilterClassId(cls.id)}
              className={cn(
                "px-2.5 py-1 rounded border text-xs",
                filterClassId === cls.id
                  ? "border-gold-300 bg-gold-50 text-gold-700"
                  : "border-ink-100 text-ink-500 hover:border-ink-200",
              )}
            >
              {cls.name}
            </button>
          ))}
        </div>
        <div className="max-h-56 overflow-y-auto rounded-md border border-ink-100 divide-y divide-ink-50">
          {filteredStudents.length === 0 ? (
            <div className="py-6 text-center text-sm text-ink-400">该范围暂无学生</div>
          ) : filteredStudents.map((student) => {
            const checked = studentIds.includes(student.id);
            const coveredByClass = classIds.some((classId) => {
              const cls = classes.find((item) => item.id === classId);
              return cls ? studentsInClass(cls, students).some((item) => item.id === student.id) : false;
            });
            return (
              <button
                key={student.id}
                type="button"
                role="checkbox"
                aria-checked={checked || coveredByClass}
                disabled={coveredByClass}
                onClick={() => toggleStudent(student.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                  checked ? "bg-teal-50/60" : "hover:bg-mist/60",
                  coveredByClass && "opacity-60 cursor-not-allowed bg-mist/40",
                )}
              >
                <span className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                  checked || coveredByClass
                    ? "border-teal-500 bg-teal-500 text-white"
                    : "border-ink-300",
                )}>
                  {(checked || coveredByClass) && <Check className="w-3 h-3" />}
                </span>
                <span className="w-7 h-7 rounded-full bg-ink-100 text-ink-600 flex items-center justify-center text-xs font-medium flex-shrink-0">
                  {student.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink-800 truncate">{student.name}</span>
                  <span className="block text-[11px] text-ink-400 truncate">{student.studentNo}</span>
                </span>
                {coveredByClass && <span className="text-[10px] text-ink-400">已随班级选择</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
