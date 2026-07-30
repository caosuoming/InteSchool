import { useEffect, useMemo, useState } from "react";
import { settingsService } from "@/services/settings";
import type { ResourceSemester } from "@/types";

export interface ResourceSelectOption {
  value: string;
  label: string;
}

const FALLBACK_GRADES: ResourceSelectOption[] = [
  "高一", "高二", "高三", "初一", "初二", "初三",
].map((value) => ({ value, label: value }));

function fallbackSchoolYears(): ResourceSelectOption[] {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return [startYear, startYear - 1, startYear + 1].map((year) => ({
    value: `${year}-${year + 1}`,
    label: `${year}-${year + 1}`,
  }));
}

export const SEMESTER_OPTIONS: Array<{ value: ResourceSemester; label: string }> = [
  { value: "上学期", label: "上学期" },
  { value: "下学期", label: "下学期" },
  { value: "寒假", label: "寒假" },
  { value: "暑假", label: "暑假" },
];

export function includeCurrentOption(
  options: ResourceSelectOption[],
  currentValue?: string,
): ResourceSelectOption[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) return options;
  return [{ value: currentValue, label: currentValue }, ...options];
}

export function useSchoolResourceOptions(schoolId?: string | null) {
  const [gradeOptions, setGradeOptions] = useState<ResourceSelectOption[]>([]);
  const [schoolYearOptions, setSchoolYearOptions] = useState<ResourceSelectOption[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!schoolId) {
      setGradeOptions(FALLBACK_GRADES);
      setSchoolYearOptions(fallbackSchoolYears());
      setReady(true);
      return () => { cancelled = true; };
    }
    Promise.all([
      settingsService.listSettings(schoolId, "grade"),
      settingsService.listSettings(schoolId, "schoolYear"),
    ]).then(([grades, schoolYears]) => {
      if (cancelled) return;
      const enabledGrades = grades
        .filter((item) => item.enabled)
        .map((item) => ({ value: item.name, label: item.name }));
      const enabledSchoolYears = schoolYears
        .filter((item) => item.enabled)
        .map((item) => ({ value: item.name, label: item.name }));
      setGradeOptions(enabledGrades.length > 0 ? enabledGrades : FALLBACK_GRADES);
      setSchoolYearOptions(enabledSchoolYears.length > 0 ? enabledSchoolYears : fallbackSchoolYears());
      setReady(true);
    }).catch(() => {
      if (cancelled) return;
      setGradeOptions(FALLBACK_GRADES);
      setSchoolYearOptions(fallbackSchoolYears());
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [schoolId]);

  return useMemo(() => ({
    gradeOptions,
    schoolYearOptions,
    semesterOptions: SEMESTER_OPTIONS,
    defaultGrade: gradeOptions[0]?.value || "",
    defaultSchoolYear: schoolYearOptions[0]?.value || "",
    defaultSemester: "上学期" as ResourceSemester,
    ready,
  }), [gradeOptions, schoolYearOptions, ready]);
}
