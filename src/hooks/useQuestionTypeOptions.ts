import { useCallback, useEffect, useMemo, useState } from "react";
import { settingsService } from "@/services/settings";
import type { QuestionType } from "@/types";
import {
  DEFAULT_QUESTION_TYPE_OPTIONS,
  getDefaultQuestionTypeLabel,
  type QuestionTypeOption,
} from "@/lib/question-types";

export { DEFAULT_QUESTION_TYPE_OPTIONS } from "@/lib/question-types";
export type { QuestionTypeOption } from "@/lib/question-types";

const pendingLoads = new Map<string, Promise<QuestionTypeOption[]>>();

function loadQuestionTypeOptions(schoolId: string): Promise<QuestionTypeOption[]> {
  const pending = pendingLoads.get(schoolId);
  if (pending) return pending;

  const request = settingsService.listSettings(schoolId, "questionType")
    .then((settings) => {
      const enabled = settings
        .filter((item) => item.enabled)
        .map((item) => ({ value: item.value as QuestionType, label: item.name }));
      return enabled.length > 0 ? enabled : DEFAULT_QUESTION_TYPE_OPTIONS;
    })
    .finally(() => pendingLoads.delete(schoolId));
  pendingLoads.set(schoolId, request);
  return request;
}

export function includeCurrentQuestionType(
  options: QuestionTypeOption[],
  currentValue?: QuestionType,
): QuestionTypeOption[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) return options;
  return [{ value: currentValue, label: getDefaultQuestionTypeLabel(currentValue) }, ...options];
}

export function useQuestionTypeOptions(schoolId?: string | null) {
  const [options, setOptions] = useState<QuestionTypeOption[]>(DEFAULT_QUESTION_TYPE_OPTIONS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

    if (!schoolId) {
      setOptions(DEFAULT_QUESTION_TYPE_OPTIONS);
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    loadQuestionTypeOptions(schoolId)
      .then((loadedOptions) => {
        if (cancelled) return;
        setOptions(loadedOptions);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setOptions(DEFAULT_QUESTION_TYPE_OPTIONS);
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  const labels = useMemo(() => {
    const entries = [
      ...DEFAULT_QUESTION_TYPE_OPTIONS,
      ...options,
    ].map((option) => [option.value, option.label] as const);
    return new Map<QuestionType, string>(entries);
  }, [options]);

  const getLabel = useCallback(
    (value: QuestionType) => labels.get(value) || value,
    [labels],
  );

  return useMemo(() => ({
    options,
    getLabel,
    defaultType: options[0]?.value || "single",
    ready,
  }), [options, getLabel, ready]);
}
