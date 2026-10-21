import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  type ResourceSelectOption,
} from "@/hooks/useSchoolResourceOptions";
import { useQuestionMetadataOptions } from "@/hooks/useQuestionMetadataOptions";
import { DEFAULT_QUESTION_TYPE_OPTIONS } from "@/lib/question-types";
import type { Question, QuestionType, ResourceSemester } from "@/types";

type AttributeKey = "grade" | "schoolYear" | "semester" | "type" | "difficulty" | "sourceType" | "category";
export type QuestionAttributePatch = Pick<Partial<Question>, AttributeKey>;

const fields: { key: AttributeKey; label: string }[] = [
  { key: "grade", label: "年级" },
  { key: "schoolYear", label: "学年" },
  { key: "semester", label: "学期" },
  { key: "type", label: "题型" },
  { key: "difficulty", label: "难度" },
  { key: "sourceType", label: "来源" },
  { key: "category", label: "题类" },
];

const difficultyOptions = [
  { value: "1", label: "1 - 简单" },
  { value: "2", label: "2 - 较易" },
  { value: "3", label: "3 - 中等" },
  { value: "4", label: "4 - 较难" },
  { value: "5", label: "5 - 困难" },
];
const CLEAR_VALUE = "__clear__";

interface BatchQuestionAttributesModalProps {
  schoolId?: string;
  count: number;
  saving: boolean;
  gradeOptions: ResourceSelectOption[];
  schoolYearOptions: ResourceSelectOption[];
  semesterOptions: ResourceSelectOption[];
  questionTypeOptions: ResourceSelectOption[];
  onClose: () => void;
  onApply: (patch: QuestionAttributePatch) => void;
}

export function BatchQuestionAttributesModal({
  schoolId,
  count,
  saving,
  gradeOptions,
  schoolYearOptions,
  semesterOptions,
  questionTypeOptions,
  onClose,
  onApply,
}: BatchQuestionAttributesModalProps) {
  const { sourceOptions, categoryOptions } = useQuestionMetadataOptions(schoolId);
  const [enabled, setEnabled] = useState<Set<AttributeKey>>(new Set());
  const [values, setValues] = useState<Record<AttributeKey, string>>({
    grade: "", schoolYear: "", semester: "", type: "", difficulty: "", sourceType: "", category: "",
  });

  const options: Record<AttributeKey, ResourceSelectOption[]> = {
    grade: [{ value: CLEAR_VALUE, label: "未指定" }, ...gradeOptions],
    schoolYear: [{ value: CLEAR_VALUE, label: "未指定" }, ...schoolYearOptions],
    semester: semesterOptions,
    type: questionTypeOptions.length ? questionTypeOptions : DEFAULT_QUESTION_TYPE_OPTIONS,
    difficulty: difficultyOptions,
    sourceType: [{ value: CLEAR_VALUE, label: "未指定" }, ...sourceOptions],
    category: [{ value: CLEAR_VALUE, label: "未指定" }, ...categoryOptions],
  };

  const canApply = enabled.size > 0 && [...enabled].every((key) => values[key] !== "");
  const apply = () => {
    if (!canApply || saving) return;
    const patch: QuestionAttributePatch = {};
    for (const key of enabled) {
      const value = values[key] === CLEAR_VALUE ? "" : values[key];
      switch (key) {
        case "difficulty": patch.difficulty = Number(value) as Question["difficulty"]; break;
        case "type": patch.type = value as QuestionType; break;
        case "semester": patch.semester = value as ResourceSemester; break;
        case "grade": patch.grade = value; break;
        case "schoolYear": patch.schoolYear = value; break;
        case "sourceType": patch.sourceType = value; break;
        case "category": patch.category = value; break;
      }
    }
    onApply(patch);
  };

  return (
    <Modal
      open
      onClose={() => { if (!saving) onClose(); }}
      title="批量修改属性"
      description={`将勾选的属性统一应用到 ${count} 道题目；未勾选的属性保持原值。`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button variant="gold" onClick={apply} disabled={!canApply} loading={saving}>确认修改</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {fields.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3">
            <label className="flex w-24 shrink-0 cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                aria-label={`修改${label}`}
                checked={enabled.has(key)}
                disabled={saving}
                onChange={(event) => {
                  setEnabled((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(key);
                    else next.delete(key);
                    return next;
                  });
                }}
              />
              {label}
            </label>
            <select
              aria-label={`${label}新值`}
              className="h-9 min-w-0 flex-1 rounded-md border border-ink-200 bg-paper px-3 text-sm text-ink-700 focus:border-gold-400 focus:outline-none disabled:opacity-60"
              value={values[key]}
              disabled={saving}
              onChange={(event) => {
                setValues((current) => ({ ...current, [key]: event.target.value }));
                setEnabled((current) => new Set(current).add(key));
              }}
            >
              <option value="" disabled>请选择{label}</option>
              {options[key].map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </Modal>
  );
}
