import { useCallback, useEffect, useMemo, useState } from "react";
import { settingsService } from "@/services/settings";
import type { ResourceSelectOption } from "@/hooks/useSchoolResourceOptions";

export const DEFAULT_SOURCE_OPTIONS: ResourceSelectOption[] = [
  { value: "manual", label: "手动录入" },
  { value: "imported", label: "文档导入" },
  { value: "shared", label: "共享题库" },
];

export const DEFAULT_CATEGORY_OPTIONS: ResourceSelectOption[] = [
  { value: "practice", label: "课堂练习" },
  { value: "exam", label: "考试测验" },
  { value: "homework", label: "家庭作业" },
  { value: "review", label: "复习巩固" },
];

function configuredOptions(
  settings: Awaited<ReturnType<typeof settingsService.listSettings>>,
  fallback: ResourceSelectOption[],
): ResourceSelectOption[] {
  const enabled = settings
    .filter((item) => item.enabled)
    .map((item) => ({ value: item.value, label: item.name }));
  return enabled.length > 0 ? enabled : fallback;
}

export function includeCurrentMetadataOption(
  options: ResourceSelectOption[],
  currentValue?: string,
  currentLabel?: string,
): ResourceSelectOption[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) return options;
  return [{ value: currentValue, label: currentLabel || currentValue }, ...options];
}

export function useQuestionMetadataOptions(schoolId?: string | null) {
  const [sourceOptions, setSourceOptions] = useState<ResourceSelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<ResourceSelectOption[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!schoolId) {
      setSourceOptions(DEFAULT_SOURCE_OPTIONS);
      setCategoryOptions(DEFAULT_CATEGORY_OPTIONS);
      setReady(true);
      return () => { cancelled = true; };
    }

    setSourceOptions([]);
    setCategoryOptions([]);

    Promise.all([
      settingsService.listSettings(schoolId, "source"),
      settingsService.listSettings(schoolId, "category"),
    ]).then(([sources, categories]) => {
      if (cancelled) return;
      setSourceOptions(configuredOptions(sources, DEFAULT_SOURCE_OPTIONS));
      setCategoryOptions(configuredOptions(categories, DEFAULT_CATEGORY_OPTIONS));
      setReady(true);
    }).catch(() => {
      if (cancelled) return;
      setSourceOptions(DEFAULT_SOURCE_OPTIONS);
      setCategoryOptions(DEFAULT_CATEGORY_OPTIONS);
      setReady(true);
    });

    return () => { cancelled = true; };
  }, [schoolId]);

  const sourceLabels = useMemo(
    () => new Map([...DEFAULT_SOURCE_OPTIONS, ...sourceOptions].map((item) => [item.value, item.label])),
    [sourceOptions],
  );
  const categoryLabels = useMemo(
    () => new Map([...DEFAULT_CATEGORY_OPTIONS, ...categoryOptions].map((item) => [item.value, item.label])),
    [categoryOptions],
  );
  const getSourceLabel = useCallback(
    (value?: string) => value ? sourceLabels.get(value) || value : "未指定",
    [sourceLabels],
  );
  const getCategoryLabel = useCallback(
    (value?: string) => value ? categoryLabels.get(value) || value : "未指定",
    [categoryLabels],
  );

  return useMemo(() => ({
    sourceOptions,
    categoryOptions,
    defaultSource: ready ? sourceOptions[0]?.value || "manual" : "",
    defaultCategory: ready ? categoryOptions[0]?.value || "practice" : "",
    getSourceLabel,
    getCategoryLabel,
    ready,
  }), [sourceOptions, categoryOptions, getSourceLabel, getCategoryLabel, ready]);
}
